from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, List


@dataclass
class Card:
    id: str
    type: str
    title: str
    value: str
    icon: str = "🃏"
    power: int = 0

    def model_dump(self):
        return asdict(self)


@dataclass
class StatusEffect:
    type: str
    rounds_left: int = 1
    source: Optional[str] = None

    def model_dump(self):
        return asdict(self)


@dataclass
class Note:
    id: str
    from_id: Optional[str]      # None = анонимная
    from_name: str              # "Аноним" или имя
    text: str
    round: int = 1

    def model_dump(self):
        return asdict(self)


@dataclass
class Player:
    id: str
    name: str
    socket_id: Optional[str] = None
    avatar: str = "🦊"
    avatar_photo: Optional[str] = None
    alive: bool = True
    in_bunker: bool = False
    is_host: bool = False
    cards: Dict[str, Card] = field(default_factory=dict)
    revealed: List[str] = field(default_factory=list)
    abilities: List[str] = field(default_factory=list)
    ability_uses: Dict[str, int] = field(default_factory=dict)
    status_effects: List[StatusEffect] = field(default_factory=list)
    voted_for: Optional[str] = None
    notes: List[Note] = field(default_factory=list)      # входящие записки
    sent_notes: List[str] = field(default_factory=list)  # id тех, кому уже отправил в этом раунде


@dataclass
class GameState:
    room_id: str
    players: Dict[str, Player] = field(default_factory=dict)
    round: int = 1
    phase: str = "lobby"
    timer: int = 0
    log: List[dict] = field(default_factory=list)

    disaster: Optional[dict] = None
    bunker: Optional[dict] = None

    active_player_id: Optional[str] = None
    turn_order: List[str] = field(default_factory=list)

    votes: Dict[str, str] = field(default_factory=dict)
    last_excluded: Optional[str] = None

    final_misfortunes: List[dict] = field(default_factory=list)
    final_results: List[dict] = field(default_factory=list)
    final_index: int = 0
    winner: Optional[bool] = None
    epilogues: Dict[str, str] = field(default_factory=dict)   # player_id -> текст

    intro_shown: bool = False   # показать ли вступление