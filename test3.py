import traceback
try:
    from backend.poker_logic.evaluator import evaluate_hand
    res = evaluate_hand(['♠A', '♠K', '♠Q', '♠J', '♠10'])
    print(res)
except Exception as e:
    traceback.print_exc()
