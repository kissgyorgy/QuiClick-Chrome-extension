from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from quiclick_server.database import get_db
from quiclick_server.models import Bookmark, Folder, Item
from quiclick_server.routes.bookmarks import (
    _bookmark_to_response,
    _next_position,
)
from quiclick_server.schemas import (
    FolderCreate,
    FolderDetailResponse,
    FolderResponse,
    FolderUpdate,
)

router = APIRouter(tags=["folders"])


def _folder_to_response(folder: Folder) -> FolderResponse:
    return FolderResponse(
        id=folder.id,
        type=folder.type,
        title=folder.title,
        date_added=folder.date_added,
        parent_id=folder.parent_id,
        position=folder.position,
        last_updated=folder.last_updated,
        deleted_at=folder.deleted_at,
    )


def _next_root_position(db: Session):
    """Get the next grid position for root-level items (shared space)."""
    return _next_position(db, None)


@router.get("", response_model=list[FolderResponse])
def list_folders(db: Session = Depends(get_db)):
    """List all folders, ordered by position."""
    folders = (
        db.query(Folder)
        .filter(Folder.deleted_at.is_(None))
        .order_by(Folder.position_y, Folder.position_x)
        .all()
    )
    return [_folder_to_response(f) for f in folders]


@router.post("", response_model=FolderResponse, status_code=201)
def create_folder(body: FolderCreate, db: Session = Depends(get_db)):
    """Create a new folder."""
    position = body.position if body.position is not None else _next_root_position(db)

    folder = Folder(
        title=body.title,
        parent_id=body.parent_id,
        position_x=position.x,
        position_y=position.y,
    )
    db.add(folder)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Position conflict")
    db.refresh(folder)
    return _folder_to_response(folder)


@router.get("/{folder_id}", response_model=FolderDetailResponse)
def get_folder(folder_id: int, db: Session = Depends(get_db)):
    """Get a folder and its child bookmarks."""
    folder = db.get(Folder, folder_id)
    if not folder or folder.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Folder not found")

    bookmarks = (
        db.query(Bookmark)
        .filter(Bookmark.parent_id == folder_id, Bookmark.deleted_at.is_(None))
        .order_by(Bookmark.position_y, Bookmark.position_x)
        .all()
    )

    resp = FolderDetailResponse(
        id=folder.id,
        type=folder.type,
        title=folder.title,
        date_added=folder.date_added,
        parent_id=folder.parent_id,
        position=folder.position,
        bookmarks=[_bookmark_to_response(b) for b in bookmarks],
    )
    return resp


@router.put("/{folder_id}", response_model=FolderResponse)
def update_folder(
    folder_id: int,
    body: FolderCreate,
    db: Session = Depends(get_db),
):
    """Full update of a folder (rename and/or reposition)."""
    folder = db.get(Folder, folder_id)
    if not folder or folder.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Folder not found")

    folder.title = body.title
    if body.position is not None:
        folder.position_x = body.position.x
        folder.position_y = body.position.y

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Position conflict")
    db.refresh(folder)
    return _folder_to_response(folder)


@router.delete("/{folder_id}", status_code=204)
def delete_folder(folder_id: int, db: Session = Depends(get_db)):
    """Soft-delete a folder. Orphaned bookmarks are moved to root (parent_id=None)."""
    folder = db.get(Folder, folder_id)
    if not folder or folder.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Folder not found")

    now = datetime.now(timezone.utc)

    # Move child bookmarks to root level
    children = (
        db.query(Bookmark)
        .filter(Bookmark.parent_id == folder_id, Bookmark.deleted_at.is_(None))
        .all()
    )
    # Soft-delete the folder first (frees its root position)
    folder.deleted_at = now
    folder.last_updated = now
    db.flush()

    # Move child bookmarks to root, assigning next available positions
    for child in children:
        pos = _next_position(db, None)
        child.parent_id = None
        child.position_x = pos.x
        child.position_y = pos.y
        child.last_updated = now
        db.flush()

    db.commit()
