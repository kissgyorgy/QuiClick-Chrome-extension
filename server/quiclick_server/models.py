from datetime import datetime, timezone

from pydantic import GetCoreSchemaHandler
from pydantic_core import core_schema
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    text,
)
from sqlalchemy.orm import composite, declarative_base, relationship

from quiclick_server.database import Base


class Position:
    """Grid position (x, y).

    Works as both an SQLAlchemy composite value object and a Pydantic field
    type that serializes as a 2-element JSON array ``[x, y]``.
    """

    def __init__(self, x: int, y: int):
        self.x = int(x)
        self.y = int(y)

    # --- SQLAlchemy composite interface ---

    def __composite_values__(self):
        return self.x, self.y

    def __eq__(self, other):
        return isinstance(other, Position) and self.x == other.x and self.y == other.y

    def __ne__(self, other):
        return not self.__eq__(other)

    def __repr__(self):
        return f"Position({self.x}, {self.y})"

    # --- Pydantic interface ---

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler: GetCoreSchemaHandler):
        return core_schema.no_info_plain_validator_function(
            cls._validate,
            serialization=core_schema.plain_serializer_function_ser_schema(
                lambda v: [v.x, v.y], info_arg=False
            ),
        )

    @classmethod
    def _validate(cls, v):
        if isinstance(v, cls):
            return v
        if isinstance(v, (list, tuple)) and len(v) == 2:
            return cls(int(v[0]), int(v[1]))
        raise ValueError("Position must be [x, y]")


# --- Per-user models (stored in {sub}.db) ---


class Item(Base):
    """Base table for all positionable items (bookmarks and folders)."""

    __tablename__ = "items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(String, nullable=False)  # polymorphic discriminator
    title = Column(String, nullable=False)
    date_added = Column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    parent_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    position_x = Column(Integer, nullable=False, default=0)
    position_y = Column(Integer, nullable=False, default=0)
    position = composite(Position, position_x, position_y)
    last_updated = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    deleted_at = Column(DateTime, nullable=True, default=None)

    children = relationship("Item", backref="parent", remote_side=[id])

    __table_args__ = (
        Index(
            "uq_items_parent_pos",
            text("COALESCE(parent_id, 0)"),
            "position_x",
            "position_y",
            unique=True,
            sqlite_where=text("deleted_at IS NULL"),
        ),
    )
    __mapper_args__ = {
        "polymorphic_on": "type",
        "polymorphic_identity": "item",
    }


class Bookmark(Item):
    """Bookmark-specific columns."""

    __tablename__ = "bookmarks"

    id = Column(Integer, ForeignKey("items.id"), primary_key=True)
    url = Column(String, nullable=False)
    favicon = Column(LargeBinary, nullable=True)
    favicon_mime = Column(String, nullable=True)  # e.g. "image/png"

    __mapper_args__ = {"polymorphic_identity": "bookmark"}


class Folder(Item):
    """Folder-specific columns (extensible)."""

    __tablename__ = "folders"

    id = Column(Integer, ForeignKey("items.id"), primary_key=True)

    __mapper_args__ = {"polymorphic_identity": "folder"}


class Settings(Base):
    """Single-row settings table (id always 1)."""

    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, default=1)
    show_titles = Column(Boolean, nullable=False, default=True)
    tiles_per_row = Column(Integer, nullable=False, default=8)
    tile_gap = Column(Integer, nullable=False, default=1)
    show_add_button = Column(Boolean, nullable=False, default=True)
    last_updated = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


# --- User registry model (stored in users.db) ---

UserRegistryBase = declarative_base()


class UserRecord(UserRegistryBase):
    """User registry: maps Google sub to email/name."""

    __tablename__ = "users"

    sub = Column(String, primary_key=True)
    email = Column(String, nullable=False)
    name = Column(String, nullable=True)
