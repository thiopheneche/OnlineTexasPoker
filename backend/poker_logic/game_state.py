from enum import Enum
from typing import List, Dict, Any
from pydantic import BaseModel, Field

class GamePhase(str, Enum):
    WAITING = "WAITING"
    PREFLOP = "PREFLOP"
    FLOP = "FLOP"
    TURN = "TURN"
    RIVER = "RIVER"
    SHOWDOWN = "SHOWDOWN"

class Player(BaseModel):
    id: str
    name: str
    chips: int = 2000
    current_bet: int = 0
    total_investment: int = 0
    is_active: bool = True
    is_online: bool = True
    is_ready: bool = False
    has_acted: bool = False
    revives_used: int = 0
    hole_cards: List[str] = Field(default_factory=list)

class GameState(BaseModel):
    table_id: str = "default"
    phase: GamePhase = GamePhase.WAITING
    pot: int = 0
    current_highest_bet: int = 0
    small_blind: int = 5
    big_blind: int = 10
    buy_in: int = 2000
    min_raise: int = 10
    showdown_results: List[dict] = Field(default_factory=list)
    community_cards: List[str] = Field(default_factory=list)
    players: List[Player] = Field(default_factory=list)
    button_index: int = 0
    current_turn_index: int = 0
    # Run-it-twice fields
    first_allin_player_id: str = ""
    awaiting_run_twice: bool = False
    run_it_twice: int = 0  # 0=undecided, 1=once, 2=twice
    run_twice_boards: List[List[str]] = Field(default_factory=list)  # [[board1], [board2]]
