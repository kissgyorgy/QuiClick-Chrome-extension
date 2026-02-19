import base64

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from quiclick_server.database import get_db
from quiclick_server.models import Bookmark, Item
from quiclick_server.schemas import (
    BookmarkCreate,
    BookmarkResponse,
    BookmarkUpdate,
    ReorderItem,
    ReorderRequest,
)

router = APIRouter(tags=["bookmarks"])


def _favicon_to_data_url(bookmark: Bookmark) -> str | None:
    """Convert stored favicon blob + mime to a data URL string."""
    if bookmark.favicon is None or bookmark.favicon_mime is None:
        return None
    b64 = base64.b64encode(bookmark.favicon).decode()
    return f"data:{bookmark.favicon_mime};base64,{b64}"


def _parse_favicon_data_url(data_url: str) -> tuple[bytes, str]:
    """Parse a data URL into (raw_bytes, mime_type)."""
    # Format: data:{mime};base64,{data}
    header, b64_data = data_url.split(",", 1)
    mime = header.split(":")[1].split(";")[0]
    raw = base64.b64decode(b64_data)
    return raw, mime


def _bookmark_to_response(bookmark: Bookmark) -> BookmarkResponse:
    return BookmarkResponse(
        id=bookmark.id,
        type=bookmark.type,
        title=bookmark.title,
        url=bookmark.url,
        favicon=_favicon_to_data_url(bookmark),
        date_added=bookmark.date_added,
        parent_id=bookmark.parent_id,
        position=bookmark.position,
    )


def _next_position(db: Session, parent_id: int | None) -> float:
    """Get the next position value for items in the given scope."""
    max_pos = db.query(func.max(Item.position)).filter(
        Item.parent_id == parent_id
    ).scalar()
    return (max_pos or 0.0) + 1.0


@router.get("", response_model=list[BookmarkResponse])
def list_bookmarks(
    folder_id: str | None = None,
    db: Session = Depends(get_db),
):
    """List bookmarks. Optional ?folder_id= filter. Use folder_id=root for root level."""
    query = db.query(Bookmark)
    if folder_id is not None:
        if folder_id == "root":
            query = query.filter(Bookmark.parent_id.is_(None))
        else:
            try:
                fid = int(folder_id)
            except ValueError:
                raise HTTPException(status_code=422, detail="folder_id must be an integer or 'root'")
            query = query.filter(Bookmark.parent_id == fid)
    bookmarks = query.order_by(Bookmark.position).all()
    return [_bookmark_to_response(b) for b in bookmarks]


@router.post("", response_model=BookmarkResponse, status_code=201)
def create_bookmark(
    body: BookmarkCreate,
    db: Session = Depends(get_db),
):
    """Create a new bookmark."""
    position = body.position if body.position is not None else _next_position(db, body.parent_id)

    favicon_bytes = None
    favicon_mime = None
    if body.favicon:
        favicon_bytes, favicon_mime = _parse_favicon_data_url(body.favicon)

    bookmark = Bookmark(
        title=body.title,
        url=body.url,
        favicon=favicon_bytes,
        favicon_mime=favicon_mime,
        parent_id=body.parent_id,
        position=position,
    )
    db.add(bookmark)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Position conflict")
    db.refresh(bookmark)
    return _bookmark_to_response(bookmark)


@router.get("/{bookmark_id}", response_model=BookmarkResponse)
def get_bookmark(
    bookmark_id: int,
    db: Session = Depends(get_db),
):
    """Get a single bookmark by ID."""
    bookmark = db.get(Bookmark, bookmark_id)
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return _bookmark_to_response(bookmark)


@router.put("/{bookmark_id}", response_model=BookmarkResponse)
def update_bookmark_full(
    bookmark_id: int,
    body: BookmarkCreate,
    db: Session = Depends(get_db),
):
    """Full update of a bookmark."""
    bookmark = db.get(Bookmark, bookmark_id)
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    bookmark.title = body.title
    bookmark.url = body.url
    bookmark.parent_id = body.parent_id
    if body.position is not None:
        bookmark.position = body.position

    if body.favicon:
        favicon_bytes, favicon_mime = _parse_favicon_data_url(body.favicon)
        bookmark.favicon = favicon_bytes
        bookmark.favicon_mime = favicon_mime
    else:
        bookmark.favicon = None
        bookmark.favicon_mime = None

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Position conflict")
    db.refresh(bookmark)
    return _bookmark_to_response(bookmark)


@router.patch("/{bookmark_id}", response_model=BookmarkResponse)
def update_bookmark_partial(
    bookmark_id: int,
    body: BookmarkUpdate,
    db: Session = Depends(get_db),
):
    """Partial update of a bookmark."""
    bookmark = db.get(Bookmark, bookmark_id)
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    if body.title is not None:
        bookmark.title = body.title
    if body.url is not None:
        bookmark.url = body.url
    if body.parent_id is not None:
        bookmark.parent_id = body.parent_id
    if body.position is not None:
        bookmark.position = body.position
    if body.favicon is not None:
        favicon_bytes, favicon_mime = _parse_favicon_data_url(body.favicon)
        bookmark.favicon = favicon_bytes
        bookmark.favicon_mime = favicon_mime

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Position conflict")
    db.refresh(bookmark)
    return _bookmark_to_response(bookmark)


@router.delete("/{bookmark_id}", status_code=204)
def delete_bookmark(
    bookmark_id: int,
    db: Session = Depends(get_db),
):
    """Delete a bookmark."""
    bookmark = db.get(Bookmark, bookmark_id)
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    db.delete(bookmark)
    db.commit()


@router.patch("/reorder", status_code=200)
def reorder_bookmarks(
    body: ReorderRequest,
    db: Session = Depends(get_db),
):
    """Bulk-update positions for multiple bookmarks."""
    for item in body.items:
        bookmark = db.get(Bookmark, item.id)
        if not bookmark:
            raise HTTPException(
                status_code=404, detail=f"Bookmark {item.id} not found"
            )
        bookmark.position = item.position

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Position conflict during reorder")

    return {"detail": "Reordered"}
