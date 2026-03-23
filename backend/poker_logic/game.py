from .game_state import GameState, GamePhase, Player
from .deck import Deck
import asyncio

class PokerEngine:
    @staticmethod
    async def process_action(state: GameState, deck: Deck, player_id: str, action: str, amount: int = 0, broadcast_cb=None):
        if action == "revive":
            for p in state.players:
                if p.id == player_id and p.chips == 0 and getattr(p, "revives_used", 0) < 3:
                    p.chips = 1000
                    p.revives_used += 1
            return
        
        if action == "show_cards":
            if state.phase == GamePhase.SHOWDOWN:
                for p in state.players:
                    if p.id == player_id and hasattr(p, '_saved_hole_cards') and p._saved_hole_cards:
                        p.hole_cards = list(p._saved_hole_cards)
            return
        
        if action == "hide_cards":
            if state.phase == GamePhase.SHOWDOWN:
                for p in state.players:
                    if p.id == player_id and hasattr(p, '_saved_hole_cards') and p._saved_hole_cards:
                        p.hole_cards = []
            return

        # Run-it-twice decision actions
        if action == "run_once":
            if state.awaiting_run_twice and state.first_allin_player_id == player_id:
                state.awaiting_run_twice = False
                state.run_it_twice = 1
                await PokerEngine._fast_forward_to_showdown(state, deck, broadcast_cb)
            return

        if action == "run_twice":
            if state.awaiting_run_twice and state.first_allin_player_id == player_id:
                state.awaiting_run_twice = False
                state.run_it_twice = 2
                await PokerEngine._fast_forward_to_showdown_twice(state, deck, broadcast_cb)
            return
            
        if state.phase in (GamePhase.WAITING, GamePhase.SHOWDOWN):
            if action == "start":
                PokerEngine._start_new_hand(state, deck)
            return

        # Block actions while awaiting run-twice decision
        if state.awaiting_run_twice:
            return

        if state.current_turn_index >= len(state.players) or state.current_turn_index < 0:
            return
            
        current_p = state.players[state.current_turn_index]
        if current_p.id != player_id:
            return

        if action == "fold":
            current_p.is_active = False
            current_p.has_acted = True
        
        elif action == "check":
            if current_p.current_bet == state.current_highest_bet:
                current_p.has_acted = True
                
        elif action == "call":
            call_amount = state.current_highest_bet - current_p.current_bet
            if call_amount >= current_p.chips:
                call_amount = current_p.chips
            current_p.chips -= call_amount
            current_p.current_bet += call_amount
            current_p.total_investment += call_amount
            state.pot += call_amount
            current_p.has_acted = True
            if current_p.current_bet > state.current_highest_bet:
               state.current_highest_bet = current_p.current_bet
               
        elif action == "raise" or action == "all-in":
            if action == "all-in":
                raise_amount = current_p.chips
            else:
                raise_amount = amount
                
            if raise_amount > current_p.chips:
                raise_amount = current_p.chips
                
            new_bet = current_p.current_bet + raise_amount
            
            if new_bet >= state.current_highest_bet + state.min_raise or raise_amount == current_p.chips:
                if new_bet > state.current_highest_bet:
                    diff = new_bet - state.current_highest_bet
                    if diff > state.min_raise:
                        state.min_raise = diff
                    state.current_highest_bet = new_bet
                    for p in state.players:
                        if p.is_active and p.chips > 0 and p.id != current_p.id:
                            p.has_acted = False
                            
                current_p.chips -= raise_amount
                current_p.current_bet += raise_amount
                current_p.total_investment += raise_amount
                state.pot += raise_amount
                current_p.has_acted = True

                # Track first all-in player
                if current_p.chips == 0 and not state.first_allin_player_id:
                    state.first_allin_player_id = current_p.id
            
        else:
            return

        await PokerEngine._advance_turn_or_phase(state, deck, broadcast_cb)

    @staticmethod
    def _start_new_hand(state: GameState, deck: Deck):
        active_candidates = [p for p in state.players if p.chips > 0]
        if len(active_candidates) < 2:
            return

        deck.__init__()
        state.community_cards = []
        state.showdown_results = []
        state.pot = 0
        state.current_highest_bet = state.big_blind 
        state.min_raise = state.big_blind
        # Reset run-it-twice state
        state.first_allin_player_id = ""
        state.awaiting_run_twice = False
        state.run_it_twice = 0
        state.run_twice_boards = []
        
        for p in state.players:
            p.current_bet = 0
            p.total_investment = 0
            p.has_acted = False
            if p.chips > 0:
                p.is_active = True
                p.hole_cards = [str(c) for c in deck.deal(2)]
            else:
                p.is_active = False
                p.hole_cards = []

        actual_players = [p for p in state.players if p.is_active]
        if len(actual_players) < 2:
            return
            
        state.button_index = (state.button_index + 1) % len(actual_players)
        
        sb_player = actual_players[state.button_index]
        bb_player = actual_players[(state.button_index + 1) % len(actual_players)]

        sb_amount = min(sb_player.chips, state.small_blind)
        sb_player.chips -= sb_amount
        sb_player.current_bet += sb_amount
        sb_player.total_investment += sb_amount
        state.pot += sb_amount

        bb_amount = min(bb_player.chips, state.big_blind)
        bb_player.chips -= bb_amount
        bb_player.current_bet += bb_amount
        bb_player.total_investment += bb_amount
        state.pot += bb_amount
        
        state.phase = GamePhase.PREFLOP
        state.current_turn_index = state.players.index(bb_player)
        PokerEngine._find_next_active_player(state)

    @staticmethod
    def _evaluate_board(state: GameState, community_cards: list):
        """Evaluate hands against a specific community board. Returns (winners, hand_names)."""
        from .evaluator import evaluate_hand
        
        participants = [p for p in state.players if p.is_active and len(p.hole_cards) > 0]
        
        best_score = -1
        best_tie_breaker = ()
        winners = []
        hand_names = {}
        
        for p in participants:
            score, tie_breaker, hand_name = evaluate_hand(p.hole_cards + community_cards)
            hand_names[p.id] = hand_name
            if score > best_score or (score == best_score and tie_breaker > best_tie_breaker):
                best_score = score
                best_tie_breaker = tie_breaker
                winners = [p]
            elif score == best_score and tie_breaker == best_tie_breaker:
                winners.append(p)
        
        return winners, hand_names

    @staticmethod
    def _execute_showdown(state: GameState):
        state.phase = GamePhase.SHOWDOWN
        
        participants_not_folded = [p for p in state.players if p.is_active and len(p.hole_cards) > 0]
        if len(participants_not_folded) == 1:
            winner = participants_not_folded[0]
            winner.chips += state.pot
            state.showdown_results = [{"name": winner.name, "won": state.pot, "reason": "其余参赛者均弃牌(Fold)"}]
            # Save cards and hide by default — winner can choose to show
            winner._saved_hole_cards = list(winner.hole_cards)
            winner.hole_cards = []
            return
        
        winners, hand_names = PokerEngine._evaluate_board(state, state.community_cards)
                
        if len(winners) > 0:
            win_amount = state.pot // len(winners)
            state.showdown_results = []
            for w in winners:
                w.chips += win_amount
                state.showdown_results.append({
                    "name": w.name,
                    "won": win_amount,
                    "reason": hand_names.get(w.id, "平局均分")
                })
        else:
            state.showdown_results = []

    @staticmethod
    def _execute_showdown_twice(state: GameState, board1: list, board2: list):
        """Execute showdown with two boards, splitting the pot 50/50."""
        state.phase = GamePhase.SHOWDOWN
        state.run_twice_boards = [board1, board2]
        
        half_pot = state.pot // 2
        other_half = state.pot - half_pot  # handle odd pot
        
        # Evaluate board 1
        winners1, hand_names1 = PokerEngine._evaluate_board(state, board1)
        # Evaluate board 2
        winners2, hand_names2 = PokerEngine._evaluate_board(state, board2)
        
        state.showdown_results = []
        
        # Distribute first half
        if len(winners1) > 0:
            share = half_pot // len(winners1)
            for w in winners1:
                w.chips += share
                state.showdown_results.append({
                    "name": w.name,
                    "won": share,
                    "reason": hand_names1.get(w.id, ""),
                    "run": 1
                })
        
        # Distribute second half
        if len(winners2) > 0:
            share = other_half // len(winners2)
            for w in winners2:
                w.chips += share
                state.showdown_results.append({
                    "name": w.name,
                    "won": share,
                    "reason": hand_names2.get(w.id, ""),
                    "run": 2
                })

        # Set community_cards to board1 for display (frontend will show both from run_twice_boards)
        state.community_cards = board1

    @staticmethod
    async def _advance_turn_or_phase(state: GameState, deck: Deck, broadcast_cb):
        active_players = [p for p in state.players if p.is_active]
        if len(active_players) <= 1:
            PokerEngine._execute_showdown(state)
            return
            
        players_need_action = [
            p for p in state.players 
            if p.is_active and p.chips > 0 and (not p.has_acted or p.current_bet < state.current_highest_bet)
        ]
        
        if len(players_need_action) == 0:
            active_bets = [p.current_bet for p in active_players]
            if len(active_bets) > 0:
                sorted_bets = sorted(active_bets, reverse=True)
                if len(sorted_bets) >= 2 and sorted_bets[0] > sorted_bets[1]:
                    diff = sorted_bets[0] - sorted_bets[1]
                    for p in active_players:
                        if p.current_bet == sorted_bets[0]:
                            p.current_bet -= diff
                            p.chips += diff
                            p.total_investment -= diff
                            state.pot -= diff
                            break
            
            players_with_chips = [p for p in active_players if p.chips > 0]
            if len(players_with_chips) <= 1:
                # All-in situation: check if we need run-it-twice decision
                if state.first_allin_player_id and len(active_players) >= 2:
                    # Set awaiting state and broadcast — let the first all-in player decide
                    state.awaiting_run_twice = True
                    # Reset betting state for display
                    for p in state.players:
                        p.current_bet = 0
                        p.has_acted = True
                    state.current_highest_bet = 0
                    state.current_turn_index = -1
                    # Do NOT fast-forward yet; wait for run_once/run_twice action
                    return
                else:
                    await PokerEngine._fast_forward_to_showdown(state, deck, broadcast_cb)
            else:
                PokerEngine._next_phase(state, deck)
        else:
            PokerEngine._find_next_active_player(state)

    @staticmethod
    async def _fast_forward_to_showdown(state: GameState, deck: Deck, broadcast_cb):
        for p in state.players:
            p.current_bet = 0
            p.has_acted = True
            
        state.current_highest_bet = 0
        state.min_raise = state.big_blind
        state.current_turn_index = -1
        
        while state.phase != GamePhase.SHOWDOWN:
            if state.phase == GamePhase.PREFLOP:
                state.community_cards.extend([str(c) for c in deck.deal(3)])
                state.phase = GamePhase.FLOP
            elif state.phase == GamePhase.FLOP:
                state.community_cards.append(str(deck.deal(1)[0]))
                state.phase = GamePhase.TURN
            elif state.phase == GamePhase.TURN:
                state.community_cards.append(str(deck.deal(1)[0]))
                state.phase = GamePhase.RIVER
            elif state.phase == GamePhase.RIVER:
                PokerEngine._execute_showdown(state)
                break
            else:
                break
                
            if broadcast_cb:
                await broadcast_cb()
            await asyncio.sleep(3)

    @staticmethod
    async def _fast_forward_to_showdown_twice(state: GameState, deck: Deck, broadcast_cb):
        """Deal remaining community cards twice (two separate boards) and evaluate both."""
        for p in state.players:
            p.current_bet = 0
            p.has_acted = True
            
        state.current_highest_bet = 0
        state.min_raise = state.big_blind
        state.current_turn_index = -1
        
        # Determine how many cards still need to be dealt
        current_count = len(state.community_cards)
        # cards_needed: PREFLOP->5, FLOP->2, TURN->1, RIVER->0
        if state.phase == GamePhase.PREFLOP:
            cards_needed = 5
        elif state.phase == GamePhase.FLOP:
            cards_needed = 2
        elif state.phase == GamePhase.TURN:
            cards_needed = 1
        else:
            # RIVER or already showdown — just do normal showdown
            PokerEngine._execute_showdown(state)
            return
        
        saved_community = list(state.community_cards)
        
        # Deal for the initial community cards if still in PREFLOP
        base_cards = list(saved_community)
        if state.phase == GamePhase.PREFLOP:
            flop = [str(c) for c in deck.deal(3)]
            base_cards.extend(flop)
            cards_needed = 2  # still need turn + river after flop
        
        # Deal run 1 remaining cards
        run1_extra = [str(c) for c in deck.deal(cards_needed)]
        board1 = base_cards + run1_extra
        
        # Deal run 2 remaining cards (next cards from same deck)
        run2_extra = [str(c) for c in deck.deal(cards_needed)]
        board2 = base_cards + run2_extra
        
        # Show dealing animation: display board1 being dealt
        state.community_cards = list(board1)
        state.phase = GamePhase.RIVER  # visually at river
        if broadcast_cb:
            await broadcast_cb()
        await asyncio.sleep(2)
        
        # Now execute dual-board showdown
        PokerEngine._execute_showdown_twice(state, board1, board2)

    @staticmethod
    def _next_phase(state: GameState, deck: Deck):
        for p in state.players:
            p.current_bet = 0
            if p.is_active and p.chips > 0:
                p.has_acted = False
            
        state.current_highest_bet = 0
        state.min_raise = state.big_blind
        
        state.current_turn_index = -1
        PokerEngine._find_next_active_player(state)

        if state.phase == GamePhase.PREFLOP:
            state.community_cards = [str(c) for c in deck.deal(3)]
            state.phase = GamePhase.FLOP
        elif state.phase == GamePhase.FLOP:
            state.community_cards.append(str(deck.deal(1)[0]))
            state.phase = GamePhase.TURN
        elif state.phase == GamePhase.TURN:
            state.community_cards.append(str(deck.deal(1)[0]))
            state.phase = GamePhase.RIVER
        elif state.phase == GamePhase.RIVER:
            PokerEngine._execute_showdown(state)

    @staticmethod
    def _find_next_active_player(state: GameState):
        start_index = state.current_turn_index
        while True:
            state.current_turn_index = (state.current_turn_index + 1) % len(state.players)
            p = state.players[state.current_turn_index]
            if p.is_active and p.chips > 0 and (not p.has_acted or p.current_bet < state.current_highest_bet):
                break
            if state.current_turn_index == start_index:
                PokerEngine._next_phase(state, None)
                break
