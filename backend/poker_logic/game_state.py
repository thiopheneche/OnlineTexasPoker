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
    chips: int = 1000
    current_bet: int = 0
    total_investment: int = 0
    is_active: bool = True
    has_acted: bool = False
    revives_used: int = 0
    hole_cards: List[str] = Field(default_factory=list)

class GameState(BaseModel):
    table_id: str = "default"
    phase: GamePhase = GamePhase.WAITING
    pot: int = 0
    current_highest_bet: int = 0
    small_blind: int = 25
    big_blind: int = 50
    min_raise: int = 50
    showdown_results: List[dict] = Field(default_factory=list)
    community_cards: List[str] = Field(default_factory=list)
    players: List[Player] = Field(default_factory=list)
    button_index: int = 0
    current_turn_index: int = 0
