from collections.abc import Generator
from pathlib import Path

from fastapi import Depends, Request
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base

from quiclick_server.config import cfg

Base = declarative_base()

# --- User registry DB (single shared users.db) ---

_users_db_path = Path(cfg.data_dir) / "users.db"


def get_users_engine():
    """Create engine for the shared users.db registry."""
    _users_db_path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(
        f"sqlite:///{_users_db_path}",
        connect_args={"check_same_thread": False},
    )


def init_users_db():
    """Create the users registry tables if they don't exist."""
    from quiclick_server.models import UserRecord  # noqa: F811

    engine = get_users_engine()
    UserRecord.metadata.create_all(engine)
    engine.dispose()


# --- Auth dependency ---


def get_current_user(request: Request) -> str:
    """Extract sub from session cookie, raise 401 if not authenticated."""
    from fastapi import HTTPException

    sub = request.session.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sub


# --- Per-user DB dependency ---


def _migrate_user_db(engine):
    """Add new columns to existing user databases if missing."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)

    # Migrate items table
    if inspector.has_table("items"):
        existing = {col["name"] for col in inspector.get_columns("items")}
        with engine.begin() as conn:
            if "last_updated" not in existing:
                conn.execute(
                    text(
                        "ALTER TABLE items ADD COLUMN last_updated DATETIME "
                        "NOT NULL DEFAULT '2025-01-01T00:00:00'"
                    )
                )
            if "deleted_at" not in existing:
                conn.execute(text("ALTER TABLE items ADD COLUMN deleted_at DATETIME"))

    # Migrate settings table
    if inspector.has_table("settings"):
        existing = {col["name"] for col in inspector.get_columns("settings")}
        with engine.begin() as conn:
            if "last_updated" not in existing:
                conn.execute(
                    text(
                        "ALTER TABLE settings ADD COLUMN last_updated DATETIME "
                        "NOT NULL DEFAULT '2025-01-01T00:00:00'"
                    )
                )


def get_db(sub: str = Depends(get_current_user)) -> Generator[Session, None, None]:
    """Yield a SQLAlchemy Session for the authenticated user's personal DB."""
    from quiclick_server.models import Base as UserBase

    db_path = Path(cfg.data_dir) / f"{sub}.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    first_time = not db_path.exists()
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    try:
        if first_time:
            UserBase.metadata.create_all(engine)
        else:
            _migrate_user_db(engine)
        with Session(engine) as session:
            yield session
    finally:
        engine.dispose()
