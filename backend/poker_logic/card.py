from enum import Enum
from functools import total_ordering

class Suit(str, Enum):
    SPADES = '♠'
    HEARTS = '♥'
    CLUBS = '♣'
    DIAMONDS = '♦'

class Rank(int, Enum):
    TWO = 2
    THREE = 3
    FOUR = 4
    FIVE = 5
    SIX = 6
    SEVEN = 7
    EIGHT = 8
    NINE = 9
    TEN = 10
    JACK = 11
    QUEEN = 12
    KING = 13
    ACE = 14

@total_ordering
class Card:
    def __init__(self, suit: Suit, rank: Rank):
        self.suit = suit
        self.rank = rank

    def __str__(self):
        rank_str = str(self.rank.value)
        if self.rank == Rank.JACK: rank_str = 'J'
        elif self.rank == Rank.QUEEN: rank_str = 'Q'
        elif self.rank == Rank.KING: rank_str = 'K'
        elif self.rank == Rank.ACE: rank_str = 'A'
        return f"{self.suit.value}{rank_str}"

    def __eq__(self, dict2):
        return self.rank == dict2.rank

    def __lt__(self, dict2):
        return self.rank < dict2.rank
