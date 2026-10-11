import json
import random
import uuid
from pathlib import Path
from typing import Optional
from .state import Card, Player, GameState, Note
from .epilogues import generate_epilogue

DATA_DIR = Path(__file__).parent.parent / "data"

with open(DATA_DIR / "cards.json", encoding="utf-8") as f:
    CARDS_DATA = json.load(f)

with open(DATA_DIR / "disasters.json", encoding="utf-8") as f:
    DISASTERS_DATA = json.load(f)

with open(DATA_DIR / "misfortunes.json", encoding="utf-8") as f:
    MISFORTUNES_DATA = json.load(f)


def _pick(cards: list, used_ids: set) -> dict:
    pool = [c for c in cards if c["id"] not in used_ids]
    if not pool:
        pool = cards
    card = random.choice(pool)
    used_ids.add(card["id"])
    return card


class Room:
    def __init__(self, room_id: str):
        self.state = GameState(room_id=room_id)
        self.used_card_ids: set = set()

    def add_player(self, name: str, socket_id: str) -> Player:
        pid = uuid.uuid4().hex[:8]
        avatars = ["🦊", "🐺", "🦉", "🐸", "🐼", "🦁", "🐯", "🐨", "🐵", "🦄"]
        used = {p.avatar for p in self.state.players.values()}
        free = [a for a in avatars if a not in used] or avatars

        player = Player(
            id=pid, name=name, socket_id=socket_id,
            avatar=random.choice(free),
            is_host=len(self.state.players) == 0,
        )
        self.state.players[pid] = player
        self._log(f"👋 {name} присоединился")
        return player

    def remove_player(self, socket_id: str):
        for pid, p in list(self.state.players.items()):
            if p.socket_id == socket_id:
                self._log(f"📴 {p.name} отключился")
                p.socket_id = None
                return

    def get_by_socket(self, socket_id: str) -> Optional[Player]:
        for p in self.state.players.values():
            if p.socket_id == socket_id:
                return p
        return None

    def get_by_id(self, player_id: str) -> Optional[Player]:
        return self.state.players.get(player_id)

    def reconnect_player(self, player_id: str, socket_id: str) -> Optional[Player]:
        p = self.state.players.get(player_id)
        if p:
            p.socket_id = socket_id
            self._log(f"🔌 {p.name} вернулся в игру")
            return p
        return None

    def alive_players(self):
        return [p for p in self.state.players.values() if p.alive]

    def deal_cards(self):
        types = ["profession", "health", "hobby", "baggage", "fact"]
        abilities = ["thief", "spy", "shield", "curse", "anonymous"]

        for p in self.state.players.values():
            for t in types:
                data = _pick(CARDS_DATA[t], self.used_card_ids)
                p.cards[t] = Card(**data)

            picked = random.sample(abilities, 2)
            p.abilities = picked
            p.ability_uses = {a: 1 for a in picked}
            if "spy" in picked:
                p.ability_uses["spy"] = 2

        self._log("🎴 Карты и способности раздали")

    def start_game(self):
        self.deal_cards()
        N = len(self.state.players)

        min_slots = max(2, N - 3)
        max_slots = max(2, N - 1)
        slots = random.randint(min_slots, max_slots)

        self.state.disaster = random.choice(DISASTERS_DATA["disasters"])
        self.state.bunker = {
            "size":  random.choice([60, 80, 100, 120, 150]),
            "slots": slots,
            "food":  random.choice([3, 6, 12, 18, 24]),
            "water": random.choice([2, 4, 8, 12, 18]),
            "power": random.choice([6, 12, 24, 36, 48]),
            "med":   random.choice([1, 3, 6, 12, 24]),
        }
        self.state.phase = "intro"
        self.state.intro_shown = False
        self.state.round = 1

        order = list(self.state.players.keys())
        random.shuffle(order)
        self.state.turn_order = order
        self.state.active_player_id = order[0]

        self._log(f"☢️ Катастрофа: {self.state.disaster['name']}")

    def finish_intro(self):
        self.state.phase = "discussion"
        self.state.intro_shown = True
        active = self.state.players.get(self.state.active_player_id)
        if active:
            self._log(f"🎬 Первый ход: {active.name}")
        self._log(f"🚪 Мест в бункере: {self.state.bunker.get('slots')} (игроков: {len(self.state.players)})")

    def next_turn(self):
        if not self.state.turn_order:
            return
        order = self.state.turn_order
        try:
            idx = order.index(self.state.active_player_id)
        except ValueError:
            idx = -1

        for step in range(1, len(order) + 1):
            cand = order[(idx + step) % len(order)]
            p = self.state.players.get(cand)
            if p and p.alive:
                self.state.active_player_id = cand
                self._log(f"➡️ Ход перешёл: {p.name}")
                return

    def start_voting(self):
        self.state.phase = "voting"
        self.state.votes = {}
        for p in self.state.players.values():
            p.voted_for = None
            p.sent_notes = []
        self._log(f"🗳️ Раунд {self.state.round}: голосование")

    def cast_vote(self, voter_id: str, target_id: str) -> Optional[str]:
        voter = self.state.players.get(voter_id)
        target = self.state.players.get(target_id)
        if not voter or not target:
            return "Неверный игрок"
        if not voter.alive:
            return "Ты исключён"
        if not target.alive:
            return "Цель уже исключена"
        if voter_id == target_id:
            return "Нельзя голосовать за себя"
        if voter_id in self.state.votes:
            return "Ты уже проголосовал"

        self.state.votes[voter_id] = target_id
        voter.voted_for = target_id

        alive = self.alive_players()
        if len(self.state.votes) >= len(alive):
            self._finish_voting()
        return None

    def _finish_voting(self):
        tally = {}
        for target_id in self.state.votes.values():
            tally[target_id] = tally.get(target_id, 0) + 1

        if not tally:
            self._log("🤷 Никто не голосовал")
            self.state.phase = "vote_result"
            return

        max_votes = max(tally.values())
        leaders = [pid for pid, v in tally.items() if v == max_votes]

        if len(leaders) > 1:
            names = ", ".join(self.state.players[pid].name for pid in leaders)
            self._log(f"🤝 Ничья: {names} — никто не исключён")
            self.state.last_excluded = None
        else:
            victim_id = leaders[0]
            victim = self.state.players[victim_id]

            has_shield = any(s.type == "shield" for s in victim.status_effects)
            if has_shield:
                self._log(f"🛡️ {victim.name} под Щитом — не исключён!")
                self.state.last_excluded = None
                victim.status_effects = [s for s in victim.status_effects if s.type != "shield"]
            else:
                victim.alive = False
                victim.voted_for = None
                for t in victim.cards.keys():
                    if t not in victim.revealed:
                        victim.revealed.append(t)
                self._log(f"💀 {victim.name} ИЗГНАН из бункера")
                self.state.last_excluded = victim_id

        self.state.phase = "vote_result"

    def next_round(self):
        alive = self.alive_players()
        slots = self.state.bunker.get("slots", 2)

        if len(alive) <= slots:
            self._start_final()
            return

        self.state.round += 1
        self.state.phase = "discussion"
        self.state.votes = {}
        self.state.last_excluded = None
        for p in self.state.players.values():
            p.voted_for = None
            p.sent_notes = []
            p.status_effects = [s for s in p.status_effects if s.type != "shield"]

        order = [p.id for p in alive]
        random.shuffle(order)
        self.state.turn_order = order
        self.state.active_player_id = order[0] if order else None
        self._log(f"🎬 Раунд {self.state.round}")

    def _start_final(self):
        self.state.phase = "final"
        self.state.winner = None
        for p in self.alive_players():
            for t in p.cards.keys():
                if t not in p.revealed:
                    p.revealed.append(t)
        picked = random.sample(MISFORTUNES_DATA["misfortunes"], 2)
        self.state.final_misfortunes = picked
        self.state.final_results = []
        self.state.final_index = 0
        self._log("🚪 БУНКЕР ЗАКРЫТ. Начинаются несчастья...")

    def resolve_current_misfortune(self):
        idx = self.state.final_index
        if idx >= len(self.state.final_misfortunes):
            return
        mf = self.state.final_misfortunes[idx]

        total = 0
        for p in self.alive_players():
            for card in p.cards.values():
                total += card.power

        passed = total >= mf["threshold"]
        self.state.final_results.append({
            "id": mf["id"],
            "name": mf["name"],
            "icon": mf["icon"],
            "score": total,
            "threshold": mf["threshold"],
            "passed": passed,
        })

        if passed:
            self._log(f"✅ Несчастье «{mf['name']}» пройдено! ({total}/{mf['threshold']})")
        else:
            self._log(f"❌ Несчастье «{mf['name']}» провалено ({total}/{mf['threshold']})")

        self.state.final_index += 1

        if self.state.final_index >= len(self.state.final_misfortunes):
            passed_count = sum(1 for r in self.state.final_results if r["passed"])
            self.state.winner = passed_count >= 1
            self.state.phase = "end"
            self._generate_epilogues()
            if self.state.winner:
                self._log("🏆 ПОБЕДА! Бункер выжил.")
            else:
                self._log("💀 ПОРАЖЕНИЕ. Бункер погиб.")
        else:
            next_mf = self.state.final_misfortunes[self.state.final_index]
            self._log(f"⚡ Несчастье {self.state.final_index + 1}: {next_mf['name']}")

    def _generate_epilogues(self):
        """Генерирует персональные эпилоги."""
        self.state.epilogues = {}
        for p in self.state.players.values():
            if p.alive and self.state.winner:
                self.state.epilogues[p.id] = generate_epilogue(p)
            elif p.alive and not self.state.winner:
                self.state.epilogues[p.id] = "Ты погиб вместе с бункером. История твоя оборвалась здесь."
            else:
                self.state.epilogues[p.id] = "Ты был изгнан. Дальнейшая судьба неизвестна."

    # ---------- Записки ----------
    def send_note(self, from_id: str, to_id: str, text: str) -> Optional[str]:
        sender = self.state.players.get(from_id)
        target = self.state.players.get(to_id)
        if not sender or not target:
            return "Неверный игрок"
        if not sender.alive:
            return "Ты исключён"
        if not target.alive:
            return "Цель исключена"
        if from_id == to_id:
            return "Нельзя отправить себе"
        if to_id in sender.sent_notes:
            return "Ты уже отправил записку этому игроку в этом раунде"
        if not text or len(text.strip()) < 2:
            return "Записка слишком короткая"
        if len(text) > 200:
            return "Записка слишком длинная (макс 200)"

        note = Note(
            id=uuid.uuid4().hex[:6],
            from_id=None,                # анонимно!
            from_name="Аноним",
            text=text.strip(),
            round=self.state.round,
        )
        target.notes.append(note)
        sender.sent_notes.append(to_id)
        self._log(f"✉️ Кто-то отправил анонимную записку {target.name}")
        return None

    def _log(self, text: str):
        self.state.log.append({"round": self.state.round, "text": text})
        self.state.log = self.state.log[-50:]

    # ---------- Сериализация ----------
    def public_view(self) -> dict:
        tally = {}
        for target_id in self.state.votes.values():
            tally[target_id] = tally.get(target_id, 0) + 1

        return {
            "room_id": self.state.room_id,
            "round": self.state.round,
            "phase": self.state.phase,
            "timer": self.state.timer,
            "disaster": self.state.disaster,
            "bunker": self.state.bunker,
            "active_player_id": self.state.active_player_id,
            "votes_tally": tally,
            "votes_count": len(self.state.votes),
            "alive_count": len(self.alive_players()),
            "last_excluded": self.state.last_excluded,
            "final_misfortunes": self.state.final_misfortunes,
            "final_results": self.state.final_results,
            "final_index": self.state.final_index,
            "winner": self.state.winner,
            "epilogues": self.state.epilogues,
            "players": [
                {
                    "id": p.id,
                    "name": p.name,
                    "avatar": p.avatar,
                    "avatar_photo": p.avatar_photo,
                    "alive": p.alive,
                    "in_bunker": p.in_bunker,
                    "revealed": p.revealed,
                    "has_shield": any(s.type == "shield" for s in p.status_effects),
                    "revealed_cards": {
                        k: p.cards[k].model_dump() for k in p.revealed if k in p.cards
                    },
                    "total_power": sum(c.power for c in p.cards.values()),
                }
                for p in self.state.players.values()
            ],
            "log": self.state.log[-8:],
        }

    def player_view(self, player_id: str) -> dict:
        p = self.state.players[player_id]
        is_my_turn = (self.state.active_player_id == player_id)
        has_voted = player_id in self.state.votes

        return {
            "me": {
                "id": p.id,
                "name": p.name,
                "avatar": p.avatar,
                "avatar_photo": p.avatar_photo,
                "alive": p.alive,
                "in_bunker": p.in_bunker,
                "cards": {k: v.model_dump() for k, v in p.cards.items()},
                "revealed": p.revealed,
                "abilities": p.abilities,
                "ability_uses": dict(p.ability_uses),
                "status_effects": [s.model_dump() for s in p.status_effects],
                "is_my_turn": is_my_turn,
                "has_voted": has_voted,
                "voted_for": p.voted_for,
                "notes": [n.model_dump() for n in p.notes],
                "sent_notes": list(p.sent_notes),
            },
            "others": [
                {
                    "id": o.id,
                    "name": o.name,
                    "avatar": o.avatar,
                    "avatar_photo": o.avatar_photo,
                    "alive": o.alive,
                    "revealed": o.revealed,
                    "revealed_cards": {
                        k: o.cards[k].model_dump() for k in o.revealed if k in o.cards
                    },
                }
                for o in self.state.players.values() if o.id != player_id
            ],
            "round": self.state.round,
            "phase": self.state.phase,
            "timer": self.state.timer,
            "disaster": self.state.disaster,
            "bunker": self.state.bunker,
            "active_player_id": self.state.active_player_id,
            "epilogue": self.state.epilogues.get(player_id),
            "log": self.state.log[-8:],
        }


ROOMS: dict = {}


def get_room(room_id: str = "default") -> Room:
    if room_id not in ROOMS:
        ROOMS[room_id] = Room(room_id)
    return ROOMS[room_id]