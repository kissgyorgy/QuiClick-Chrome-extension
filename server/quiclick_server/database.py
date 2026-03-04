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

            if "position_x" not in existing or "position_y" not in existing:
                if "position_x" not in existing:
                    conn.execute(
                        text(
                            "ALTER TABLE items ADD COLUMN position_x INTEGER NOT NULL DEFAULT 0"
                        )
                    )
                if "position_y" not in existing:
                    conn.execute(
                        text(
                            "ALTER TABLE items ADD COLUMN position_y INTEGER NOT NULL DEFAULT 0"
                        )
                    )

                # Read tiles_per_row from settings (default 8)
                tiles_per_row = 8
                if inspector.has_table("settings"):
                    row = conn.execute(
                        text("SELECT tiles_per_row FROM settings WHERE id = 1")
                    ).fetchone()
                    if row:
                        tiles_per_row = row[0]

                # Convert old float position to (x, y) per group of parent_id,
                # sorted by old position value.
                if "position" in existing:
                    parent_ids = conn.execute(
                        text(
                            "SELECT DISTINCT parent_id FROM items WHERE deleted_at IS NULL"
                        )
                    ).fetchall()
                    for (parent_id,) in parent_ids:
                        if parent_id is None:
                            rows = conn.execute(
                                text(
                                    "SELECT id FROM items "
                                    "WHERE parent_id IS NULL AND deleted_at IS NULL "
                                    "ORDER BY position ASC"
                                )
                            ).fetchall()
                        else:
                            rows = conn.execute(
                                text(
                                    "SELECT id FROM items "
                                    "WHERE parent_id = :pid AND deleted_at IS NULL "
                                    "ORDER BY position ASC"
                                ),
                                {"pid": parent_id},
                            ).fetchall()
                        for index, (item_id,) in enumerate(rows):
                            x = index % tiles_per_row
                            y = index // tiles_per_row
                            conn.execute(
                                text(
                                    "UPDATE items SET position_x = :x, position_y = :y "
                                    "WHERE id = :id"
                                ),
                                {"x": x, "y": y, "id": item_id},
                            )

    # Remove old UNIQUE(parent_id, position) constraint and add DEFAULT 0
    # to the legacy position column. SQLite can't ALTER constraints, so we
    # recreate the table. Needed because the model no longer maps the old
    # position column — without DEFAULT, INSERTs fail with NOT NULL violation.
    if inspector.has_table("items"):
        with engine.begin() as conn:
            # Check if old table definition has the inline UNIQUE constraint
            table_sql = conn.execute(
                text(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name='items'"
                )
            ).scalar()
            if table_sql and "UNIQUE (parent_id, position)" in table_sql:
                conn.execute(
                    text(
                        "CREATE TABLE items_new ("
                        "  id INTEGER PRIMARY KEY NOT NULL,"
                        "  type VARCHAR NOT NULL,"
                        "  title VARCHAR NOT NULL,"
                        "  date_added DATETIME NOT NULL,"
                        "  parent_id INTEGER REFERENCES items_new(id),"
                        "  position FLOAT NOT NULL DEFAULT 0,"
                        "  last_updated DATETIME NOT NULL DEFAULT '2025-01-01T00:00:00',"
                        "  deleted_at DATETIME,"
                        "  position_x INTEGER NOT NULL DEFAULT 0,"
                        "  position_y INTEGER NOT NULL DEFAULT 0"
                        ")"
                    )
                )
                conn.execute(
                    text(
                        "INSERT INTO items_new "
                        "(id, type, title, date_added, parent_id, position,"
                        " last_updated, deleted_at, position_x, position_y) "
                        "SELECT id, type, title, date_added, parent_id, position,"
                        " last_updated, deleted_at, position_x, position_y "
                        "FROM items"
                    )
                )
                conn.execute(text("DROP TABLE items"))
                conn.execute(text("ALTER TABLE items_new RENAME TO items"))

    # Add unique index on (coalesce(parent_id,0), position_x, position_y)
    if inspector.has_table("items"):
        with engine.begin() as conn:
            has_index = conn.execute(
                text(
                    "SELECT 1 FROM sqlite_master "
                    "WHERE type='index' AND name='uq_items_parent_pos'"
                )
            ).scalar()
            if not has_index:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX uq_items_parent_pos "
                        "ON items (COALESCE(parent_id, 0), position_x, position_y) "
                        "WHERE deleted_at IS NULL"
                    )
                )

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
