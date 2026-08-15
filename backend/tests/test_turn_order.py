import unittest

from backend.poker_logic.deck import Deck
from backend.poker_logic.game import PokerEngine
from backend.poker_logic.game_state import GamePhase, GameState, Player


def make_state(player_count: int) -> GameState:
    return GameState(
        players=[
            Player(id=f"p{index}", name=f"P{index}", chips=2000)
            for index in range(player_count)
        ],
        button_index=player_count - 1,
    )


class TurnOrderTests(unittest.TestCase):
    def test_position_names_for_two_through_eight_players(self):
        expected_positions = {
            2: ["BTN/SB", "BB"],
            3: ["BTN", "SB", "BB"],
            4: ["BTN", "SB", "BB", "CO"],
            5: ["BTN", "SB", "BB", "UTG", "CO"],
            6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
            7: ["BTN", "SB", "BB", "UTG", "MP", "HJ", "CO"],
            8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
        }

        for player_count, expected in expected_positions.items():
            with self.subTest(player_count=player_count):
                state = make_state(player_count)
                PokerEngine._start_new_hand(state, Deck())
                self.assertEqual(
                    [player.position for player in state.players],
                    expected,
                )

    def test_three_handed_uses_separate_button_small_and_big_blinds(self):
        state = make_state(3)

        PokerEngine._start_new_hand(state, Deck())

        self.assertEqual(state.button_index, 0)
        self.assertEqual(state.players[1].current_bet, state.small_blind)
        self.assertEqual(state.players[2].current_bet, state.big_blind)
        self.assertEqual(state.current_turn_index, 0)

        PokerEngine._next_phase(state, Deck())

        self.assertEqual(state.phase, GamePhase.FLOP)
        self.assertEqual(state.current_turn_index, 1)

    def test_heads_up_button_is_small_blind_and_acts_last_postflop(self):
        state = make_state(2)

        PokerEngine._start_new_hand(state, Deck())

        self.assertEqual(state.button_index, 0)
        self.assertEqual(state.players[0].current_bet, state.small_blind)
        self.assertEqual(state.players[1].current_bet, state.big_blind)
        self.assertEqual(state.current_turn_index, 0)

        PokerEngine._next_phase(state, Deck())

        self.assertEqual(state.current_turn_index, 1)

    def test_eight_handed_preflop_and_postflop_openers(self):
        state = make_state(8)

        PokerEngine._start_new_hand(state, Deck())

        self.assertEqual(state.button_index, 0)
        self.assertEqual(state.current_turn_index, 3)

        PokerEngine._next_phase(state, Deck())

        self.assertEqual(state.current_turn_index, 1)

    def test_blinds_and_action_skip_players_without_chips(self):
        state = make_state(5)
        state.players[1].chips = 0

        PokerEngine._start_new_hand(state, Deck())

        self.assertEqual(state.button_index, 0)
        self.assertEqual(state.players[2].current_bet, state.small_blind)
        self.assertEqual(state.players[3].current_bet, state.big_blind)
        self.assertEqual(state.current_turn_index, 4)
        self.assertEqual(
            [player.position for player in state.players],
            ["BTN", "", "SB", "BB", "CO"],
        )

        PokerEngine._next_phase(state, Deck())

        self.assertEqual(state.current_turn_index, 2)

    def test_normal_showdown_hides_folded_hands_only(self):
        state = make_state(3)
        state.pot = 60
        state.community_cards = ["♣2", "♦3", "♣4", "♦5", "♣9"]
        state.players[0].hole_cards = ["♠A", "♥A"]
        state.players[1].hole_cards = ["♠K", "♥K"]
        state.players[2].hole_cards = ["♠Q", "♥Q"]
        state.players[2].is_active = False

        PokerEngine._execute_showdown(state)

        self.assertEqual(state.players[0].hole_cards, ["♠A", "♥A"])
        self.assertEqual(state.players[1].hole_cards, ["♠K", "♥K"])
        self.assertEqual(state.players[2].hole_cards, [])

class BettingRoundOrderTests(unittest.IsolatedAsyncioTestCase):
    async def test_showdown_results_remain_until_every_player_is_ready(self):
        state = make_state(3)
        deck = Deck()
        state.phase = GamePhase.SHOWDOWN
        state.showdown_results = [{"name": "P0", "won": 30, "reason": "一对"}]

        await PokerEngine.process_action(state, deck, "p0", "ready")

        self.assertEqual(state.phase, GamePhase.SHOWDOWN)
        self.assertEqual(state.showdown_results[0]["name"], "P0")
        self.assertTrue(state.players[0].is_ready)
        self.assertFalse(state.players[1].is_ready)

        await PokerEngine.process_action(state, deck, "p0", "start")

        self.assertEqual(state.phase, GamePhase.SHOWDOWN)
        self.assertEqual(len(state.showdown_results), 1)

        await PokerEngine.process_action(state, deck, "p1", "ready")
        await PokerEngine.process_action(state, deck, "p2", "ready")
        await PokerEngine.process_action(state, deck, "p0", "start")

        self.assertEqual(state.phase, GamePhase.PREFLOP)
        self.assertEqual(state.showdown_results, [])

    async def test_three_handed_order_advances_correctly_across_streets(self):
        state = make_state(3)
        deck = Deck()
        PokerEngine._start_new_hand(state, deck)

        self.assertEqual(state.players[state.current_turn_index].id, "p0")
        await PokerEngine.process_action(state, deck, "p0", "call")
        self.assertEqual(state.players[state.current_turn_index].id, "p1")
        await PokerEngine.process_action(state, deck, "p1", "call")
        self.assertEqual(state.players[state.current_turn_index].id, "p2")
        await PokerEngine.process_action(state, deck, "p2", "check")

        self.assertEqual(state.phase, GamePhase.FLOP)
        self.assertEqual(state.players[state.current_turn_index].id, "p1")
        await PokerEngine.process_action(state, deck, "p1", "check")
        self.assertEqual(state.players[state.current_turn_index].id, "p2")
        await PokerEngine.process_action(state, deck, "p2", "check")
        self.assertEqual(state.players[state.current_turn_index].id, "p0")
        await PokerEngine.process_action(state, deck, "p0", "check")

        self.assertEqual(state.phase, GamePhase.TURN)
        self.assertEqual(state.players[state.current_turn_index].id, "p1")

    async def test_heads_up_order_switches_after_preflop(self):
        state = make_state(2)
        deck = Deck()
        PokerEngine._start_new_hand(state, deck)

        self.assertEqual(state.players[state.current_turn_index].position, "BTN/SB")
        await PokerEngine.process_action(state, deck, "p0", "call")
        await PokerEngine.process_action(state, deck, "p1", "check")

        self.assertEqual(state.phase, GamePhase.FLOP)
        self.assertEqual(state.players[state.current_turn_index].position, "BB")
        await PokerEngine.process_action(state, deck, "p1", "check")
        self.assertEqual(state.players[state.current_turn_index].position, "BTN/SB")

    async def test_fold_win_hides_folded_hand_and_limits_optional_reveal_to_winner(self):
        state = make_state(2)
        deck = Deck()
        PokerEngine._start_new_hand(state, deck)
        folded_cards = list(state.players[0].hole_cards)
        winner_cards = list(state.players[1].hole_cards)

        await PokerEngine.process_action(state, deck, "p0", "fold")

        self.assertEqual(state.phase, GamePhase.SHOWDOWN)
        self.assertEqual(state.players[0].hole_cards, [])
        self.assertEqual(state.players[1].hole_cards, [])

        await PokerEngine.process_action(state, deck, "p0", "show_cards")
        self.assertEqual(state.players[0].hole_cards, [])

        await PokerEngine.process_action(state, deck, "p1", "show_cards")
        self.assertEqual(state.players[1].hole_cards, winner_cards)
        self.assertNotEqual(state.players[1].hole_cards, folded_cards)


if __name__ == "__main__":
    unittest.main()
