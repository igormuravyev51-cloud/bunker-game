from aiohttp import web
from pathlib import Path

from server.sockets import sio
from game.room import ROOMS

PUBLIC_DIR = Path(__file__).parent / "public"


async def index_page(request):
    return web.FileResponse(PUBLIC_DIR / "index.html")


async def player_page(request):
    return web.FileResponse(PUBLIC_DIR / "player.html")


async def tv_page(request):
    return web.FileResponse(PUBLIC_DIR / "tv.html")


def create_app():
    app = web.Application()

    app.router.add_static("/css/", PUBLIC_DIR / "css")
    app.router.add_static("/js/", PUBLIC_DIR / "js")

    app.router.add_get("/",            index_page)
    app.router.add_get("/player",      player_page)
    app.router.add_get("/player.html", player_page)
    app.router.add_get("/tv",          tv_page)
    app.router.add_get("/tv.html",     tv_page)

    sio.attach(app)
    return app


if __name__ == "__main__":
    web.run_app(create_app(), host="0.0.0.0", port=3000)