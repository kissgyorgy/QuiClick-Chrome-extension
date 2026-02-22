from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from quiclick_server import auth
from quiclick_server.config import cfg
from quiclick_server.database import init_users_db
from quiclick_server.routes import bookmarks, changes, export_import, folders, reorder
from quiclick_server.routes import settings as settings_routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the shared users registry DB on startup."""
    init_users_db()
    yield


app = FastAPI(title="QuiClick API", lifespan=lifespan)

# Session middleware (signed cookie)
app.add_middleware(
    SessionMiddleware,
    secret_key=cfg.secret_key,
    https_only=cfg.server_host.startswith("https"),
    same_site="lax",
)

# CORS — allow the Chrome extension to send credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cfg.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Content-Type", "If-Modified-Since"],
    expose_headers=["Last-Modified"],
)

# Routers
app.include_router(auth.router)
app.include_router(bookmarks.router, prefix="/bookmarks")
app.include_router(folders.router, prefix="/folders")
app.include_router(reorder.router)
app.include_router(settings_routes.router, prefix="/settings")
app.include_router(export_import.router)
app.include_router(changes.router)


@app.get("/")
def root():
    return {"app": "QuiClick API", "status": "ok"}
