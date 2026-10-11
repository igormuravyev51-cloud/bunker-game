import json
import random
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent.parent / "data"

with open(DATA_DIR / "abilities.json", encoding="utf-8") as f:
    ABILITIES = json.load(f)

with open(DATA_DIR / "cards.json", encoding="utf-8") as f:
    CARDS = json.load(f)


def check_ability(room, player, ability_id: str) -> Optional[str]:
    if ability_id not in player.abilities:
        return "У тебя нет такой способности"
    left = player.ability_uses.get(ability_id, 0)
    if left <= 0:
        return "Способность исчерпана"
    if not player.alive:
        return "Ты исключён из игры"

    ability = ABILITIES.get(ability_id, {})
    if ability.get("timing") == "own_turn":
        if room.state.active_player_id != player.id:
            return "Сейчас не твой ход"
    return None


def use_ability(room, player, ability_id: str, target_id: str = None,
                card_type: str = None) -> dict:
    err = check_ability(room, player, ability_id)
    if err:
        return {"ok": False, "error": err}

    handler = HANDLERS.get(ability_id)
    if not handler:
        return {"ok": False, "error": "Способность не реализована"}

    result = handler(room, player, target_id, card_type)
    if result.get("ok"):
        player.ability_uses[ability_id] = player.ability_uses.get(ability_id, 0) - 1
    return result


def _h_thief(room, player, target_id, card_type):
    if not target_id or not card_type:
        return {"ok": False, "error": "Не выбрана цель или карта"}
    victim = room.state.players.get(target_id)
    if not victim or victim.id == player.id:
        return {"ok": False, "error": "Неверная цель"}
    if card_type not in victim.cards:
        return {"ok": False, "error": "У жертвы нет такой карты"}

    stolen = victim.cards[card_type]
    pool = [c for c in CARDS[card_type] if c["id"] != stolen.id]
    new_data = random.choice(pool)
    from .state import Card
    victim.cards[card_type] = Card(**new_data)

    player.cards[card_type] = stolen

    if card_type in victim.revealed:
        victim.revealed.remove(card_type)

    log = f"🦹 {player.name} украл карту у {victim.name}"
    return {"ok": True, "log": log, "private": f"Ты украл: {stolen.icon} {stolen.title}"}


def _h_spy(room, player, target_id, card_type):
    if not target_id or not card_type:
        return {"ok": False, "error": "Не выбрана цель или карта"}
    victim = room.state.players.get(target_id)
    if not victim or victim.id == player.id:
        return {"ok": False, "error": "Неверная цель"}
    if card_type not in victim.cards:
        return {"ok": False, "error": "У жертвы нет такой карты"}

    card = victim.cards[card_type]
    private = f"🔍 Ты подсмотрел у {victim.name}: {card.icon} {card.title} — {card.value}"
    return {"ok": True, "log": f"🔍 {player.name} тайно использовал способность", "private": private}


def _h_shield(room, player, target_id, card_type):
    from .state import StatusEffect
    player.status_effects.append(StatusEffect(type="shield", rounds_left=1))
    return {"ok": True, "log": f"🛡️ {player.name} активировал Щит", "private": "Щит активен 1 раунд"}


def _h_curse(room, player, target_id, card_type):
    if not target_id or not card_type:
        return {"ok": False, "error": "Не выбрана цель или карта"}
    victim = room.state.players.get(target_id)
    if not victim or victim.id == player.id:
        return {"ok": False, "error": "Неверная цель"}

    from .state import Card
    pool = CARDS[card_type]
    worst = min(pool, key=lambda c: c["power"])
    victim.cards[card_type] = Card(**worst)
    if card_type in victim.revealed:
        victim.revealed.remove(card_type)

    log = f"💀 {player.name} проклял карту {victim.name}"
    return {"ok": True, "log": log, "private": f"Ты наложил: {worst['icon']} {worst['title']}"}


def _h_anonymous(room, player, target_id, card_type):
    from .state import StatusEffect
    player.status_effects.append(StatusEffect(type="anonymous_vote", rounds_left=1))
    return {"ok": True, "log": f"🎭 {player.name} стал Анонимом", "private": "Твой голос скрыт в следующем раунде"}


HANDLERS = {
    "thief": _h_thief,
    "spy": _h_spy,
    "shield": _h_shield,
    "curse": _h_curse,
    "anonymous": _h_anonymous,
}