from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, relationship

from quiclick_server.database import Base

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
    position = Column(Float, nullable=False)

    children = relationship("Item", backref="parent", remote_side=[id])

    __table_args__ = (UniqueConstraint("parent_id", "position"),)
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


# --- User registry model (stored in users.db) ---

UserRegistryBase = declarative_base()


class UserRecord(UserRegistryBase):
    """User registry: maps Google sub to email/name."""

    __tablename__ = "users"

    sub = Column(String, primary_key=True)
    email = Column(String, nullable=False)
    name = Column(String, nullable=True)
