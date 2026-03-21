from backend.poker_logic.game_state import GameState, Player
from backend.poker_logic.deck import Deck
from backend.poker_logic.game import PokerEngine
import json

def run_test():
    state = GameState()
    deck = Deck()
    state.players.append(Player(id="A", name="pA"))
    state.players.append(Player(id="B", name="pB"))
    
    print("Initial state:")
    print(state.model_dump_json(indent=2))
    
    print("Action START...")
    PokerEngine.process_action(state, deck, "A", "start")
    
    print("\nState after START:")
    print(state.model_dump_json(indent=2))

run_test()
