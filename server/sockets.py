import socketio
from game.room import get_room, ROOMS
from game.abilities import ABILITIES, use_ability

sio = socketio.AsyncServer(async_mode="aiohttp", cors_allowed_origins="*")


@sio.event
async def connect(sid, environ):
    print(f"[connect] {sid}")


@sio.event
async def disconnect(sid):
    for room in list(ROOMS.values()):
        player = room.get_by_socket(sid)
        if player:
            room.remove_player(sid)
            await broadcast_room(room)
    print(f"[disconnect] {sid}")


@sio.event
async def join_game(sid, data):
    room_id = data.get("room_id", "default")
    name = data.get("name", "Игрок")
    role = data.get("role", "player")
    player_id = data.get("player_id")

    await sio.save_session(sid, {"room_id": room_id, "role": role})
    await sio.enter_room(sid, room_id)

    room = get_room(room_id)

    if role == "player":
        existing = None
        if player_id:
            existing = room.reconnect_player(player_id, sid)

        if existing:
            await sio.emit("me", room.player_view(existing.id), to=sid)
            await sio.emit("reconnected", {"player_id": existing.id}, to=sid)
        else:
            player = room.add_player(name, sid)
            await sio.emit("me", room.player_view(player.id), to=sid)
            await sio.emit("reconnected", {"player_id": player.id}, to=sid)

    await broadcast_room(room)


@sio.event
async def set_avatar(sid, data):
    session = await sio.get_session(sid)
    room = get_room(session["room_id"])
    player = room.get_by_socket(sid)
    if not player:
        return
    photo = data.get("photo", "")
    if len(photo) > 300_000:
        photo = ""
    player.avatar_photo = photo or None
    room._log(f"📸 {player.name} обновил аватар")
    await broadcast_room(room)


@sio.event
async def start_game(sid, data=None):
    session = await sio.get_session(sid)
    room = get_room(session["room_id"])
    if len(room.state.players) < 2:
        await sio.emit("start_error", {"error": "Нужно минимум 2 игрока"}, to=sid)
        return
    room.start_game()
    await broadcast_room(room)


@sio.event
async def finish_intro(sid, data=None):
    session = await sio.get_session(sid)
    room = get_room(session["room_id"])
    if room.state.phase != "intro":
        return
    room.finish_intro()
    await broadcast_room(room)


@sio.event
async def next_turn(sid, data=None):
    session = await sio.get_session(sid)
    room = get_room(session["room_id"])
    room.next_turn()
    await broadcast_room(room)


@sio.event
async def reveal_card(sid, data):
    session = await sio.get_session(sid)
    room = get_room(session["room_id"])
    player = room.get_by_socket(sid)
    if not player:
        return
    if room.state.active_player_id != player.id:
        await sio.emit("ability_result", {"ok": False, "error": "Не твой ход"}, to=sid)
        return
    card_type = data["card_type"]
    if card_type in player.cards and card_type not in player.revealed:
        player.revealed.append(card_type)
        room._log(f"📖 {player.name} открыл: {player.cards[card_type].title}")
        await broadcast_room(room)


@sio.event
async def use_ability_event(sid, data):
    session = await sio.get_session(sid)
    room = get_room(session["room_id"])
    player = room.get_by_socket(sid)
    if not player:
        return
    result = use_ability(room, player,
                         data.get("ability_id"),
                         data.get("target_id"),
                         data.get("card_type"))
    if not result.get("ok"):
        await sio.emit("ability_result", {"ok": False, "error": result["error"]}, to=sid)
        return
    room._log(result["log"])
    await broadcast_room(room)
    await sio.emit("ability_result", {
        "ok": True,
        "message": result.get("private", result.get("log")),
    }, to=sid)


@sio.event
async def start_voting(sid, data=None):
    session = await sio.get_session(sid)
    room = get_room(session["room_id"])
    if room.state.phase != "discussion":
        return
    room.start_voting()
    await broadcast_room(room)


@sio.event
async def cast_vote(sid, data):
    session = await sio.get_session(sid)
    room = get_room(session["room_id"])
    player = room.get_by_socket(sid)
    if not player:
        return
    err = room.cast_vote(player.id, data.get("target_id"))
    if err:
        await sio.emit("vote_error", {"error": err}, to=sid)
        return
    await broadcast_room(room)


@sio.event
async def next_round(sid, data=None):
    session = await sio.get_session(sid)
    room = get_room(session["room_id"])
    if room.state.phase != "vote_result":
        return
    room.next_round()
    await broadcast_room(room)


@sio.event
async def resolve_misfortune(sid, data=None):
    session = await sio.get_session(sid)
    room = get_room(session["room_id"])
    if room.state.phase not in ("final",):
        return
    room.resolve_current_misfortune()
    await broadcast_room(room)


@sio.event
async def send_note(sid, data):
    session = await sio.get_session(sid)
    room = get_room(session["room_id"])
    player = room.get_by_socket(sid)
    if not player:
        return
    err = room.send_note(player.id, data.get("to_id"), data.get("text", ""))
    if err:
        await sio.emit("note_error", {"error": err}, to=sid)
        return
    await sio.emit("note_sent", {"ok": True}, to=sid)
    await broadcast_room(room)


async def broadcast_room(room):
    await sio.emit("tv_state", room.public_view(), room=room.state.room_id)
    for p in room.state.players.values():
        if p.socket_id:
            await sio.emit("me", room.player_view(p.id), to=p.socket_id)