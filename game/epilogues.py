import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"

with open(DATA_DIR / "epilogues.json", encoding="utf-8") as f:
    EPILOGUES = json.load(f)


def generate_epilogue(player) -> str:
    """Собирает персональный эпилог из 4 карт игрока."""
    parts = []
    for card_type in ["profession", "health", "baggage", "fact"]:
        card = player.cards.get(card_type)
        if not card:
            continue
        pool = EPILOGUES.get(f"by_{card_type}", {})
        text = pool.get(card.id)
        if text:
            parts.append(text)
    if not parts:
        return "Ты выжил в бункере. Твоя история осталась нерассказанной."
    return " ".join(parts)