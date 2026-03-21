from backend.poker_logic.game_state import GameState, Player, GamePhase
from backend.poker_logic.deck import Deck
from backend.poker_logic.game import PokerEngine

state = GameState()
deck = Deck()

state.players.append(Player(id="p1", name="P1", chips=1000))
state.players.append(Player(id="p2", name="P2", chips=1000))

print(f"Initial Phase: {state.phase}")
PokerEngine.process_action(state, deck, "p1", "start")
print(f"Phase after start: {state.phase}")

print(f"Turn is player index: {state.current_turn_index}")
for p in state.players:
    print(f"  {p.id}: bet={p.current_bet}, chips={p.chips}, has_acted={p.has_acted}")

current_p_id = state.players[state.current_turn_index].id
print(f"Player {current_p_id} calling...")
PokerEngine.process_action(state, deck, current_p_id, "call")

print(f"Turn is player index: {state.current_turn_index}")
for p in state.players:
    print(f"  {p.id}: bet={p.current_bet}, chips={p.chips}, has_acted={p.has_acted}")

current_p_id = state.players[state.current_turn_index].id
print(f"Player {current_p_id} checking...")
PokerEngine.process_action(state, deck, current_p_id, "check")

print(f"Phase after checks: {state.phase}")
for p in state.players:
    print(f"  {p.id}: bet={p.current_bet}, chips={p.chips}, has_acted={p.has_acted}")
