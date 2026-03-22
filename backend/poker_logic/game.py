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
            
        if state.phase in (GamePhase.WAITING, GamePhase.SHOWDOWN):
            if action == "start":
                PokerEngine._start_new_hand(state, deck)
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
    def _execute_showdown(state: GameState):
        from .evaluator import evaluate_hand
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
            
        best_score = -1
        best_tie_breaker = ()
        winners = []
        hand_names = {}
        
        for p in participants_not_folded:
            score, tie_breaker, hand_name = evaluate_hand(p.hole_cards + state.community_cards)
            hand_names[p.id] = hand_name
            if score > best_score or (score == best_score and tie_breaker > best_tie_breaker):
                best_score = score
                best_tie_breaker = tie_breaker
                winners = [p]
            elif score == best_score and tie_breaker == best_tie_breaker:
                winners.append(p)
                
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
            # 缩短等待间隙，由 5s 变为 3s
            await asyncio.sleep(3)

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
