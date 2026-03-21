from collections import Counter

def parse_card(card_str):
    suit = card_str[0]
    rank_str = card_str[1:]
    ranks = {'J': 11, 'Q': 12, 'K': 13, 'A': 14}
    rank = int(ranks.get(rank_str, rank_str))
    return rank, suit

def evaluate_hand(cards_str_list):
    cards = [parse_card(c) for c in cards_str_list]
    cards.sort(key=lambda x: x[0], reverse=True)
    
    ranks = [c[0] for c in cards]
    suits = [c[1] for c in cards]
    
    counts = Counter(ranks)
    freqs = sorted([(count, rank) for rank, count in counts.items()], reverse=True)
    
    is_flush = False
    flush_suit = None
    suit_counts = Counter(suits)
    for s, c in suit_counts.items():
        if c >= 5:
            is_flush = True
            flush_suit = s
            break
            
    flush_cards = [c[0] for c in cards if c[1] == flush_suit] if is_flush else []
    
    def get_straight_high(rs):
        unique_ranks = sorted(list(set(rs)), reverse=True)
        if len(unique_ranks) < 5: return None
        for i in range(len(unique_ranks) - 4):
            if unique_ranks[i] - unique_ranks[i+4] == 4:
                return unique_ranks[i]
        if set([14, 5, 4, 3, 2]).issubset(set(unique_ranks)):
            return 5
        return None
        
    straight_high = get_straight_high(ranks)
    straight_flush_high = get_straight_high(flush_cards) if is_flush else None
    
    if straight_flush_high:
        if straight_flush_high == 14:
            return (9, (14,), "皇家同花顺(Royal Flush)")
        return (8, (straight_flush_high,), "同花顺(Straight Flush)")
        
    if freqs[0][0] == 4:
        return (7, (freqs[0][1], freqs[1][1]), "四条(Four of a Kind)")
        
    if freqs[0][0] == 3 and len(freqs) > 1 and freqs[1][0] >= 2:
        return (6, (freqs[0][1], freqs[1][1]), "葫芦(Full House)")
        
    if is_flush:
        return (5, tuple(flush_cards[:5]), "同花(Flush)")
        
    if straight_high:
        return (4, (straight_high,), "顺子(Straight)")
        
    if freqs[0][0] == 3:
        kickers = [r for r in ranks if r != freqs[0][1]][:2]
        return (3, tuple([freqs[0][1]] + kickers), "三条(Three of a Kind)")
        
    if freqs[0][0] == 2 and len(freqs) > 1 and freqs[1][0] >= 2:
        kickers = [r for r in ranks if r != freqs[0][1] and r != freqs[1][1]][:1]
        pair1 = max(freqs[0][1], freqs[1][1])
        pair2 = min(freqs[0][1], freqs[1][1])
        return (2, tuple([pair1, pair2] + kickers), "两对(Two Pair)")
        
    if freqs[0][0] == 2:
        kickers = [r for r in ranks if r != freqs[0][1]][:3]
        return (1, tuple([freqs[0][1]] + kickers), "一对(Pair)")
        
    return (0, tuple(ranks[:5]), "高牌(High Card)")
