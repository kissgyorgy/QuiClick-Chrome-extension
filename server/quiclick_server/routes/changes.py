from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from quiclick_server.database import get_current_user, get_db
from quiclick_server.models import Bookmark, Folder, Item, Settings
from quiclick_server.routes.bookmarks import _bookmark_to_response
from quiclick_server.routes.folders import _folder_to_response
from quiclick_server.schemas import ChangesResponse, SettingsWithTimestamp, UserResponse

router = APIRouter(tags=["changes"])


@router.get("/changes")
def get_changes(
    request: Request,
    db: Session = Depends(get_db),
    sub: str = Depends(get_current_user),
):
    """
    Delta sync endpoint. Returns items changed since If-Modified-Since.
    Returns 304 if nothing changed. Includes user info for auth check.
    """
    # Parse If-Modified-Since header
    since = None
    ims_header = request.headers.get("If-Modified-Since")
    if ims_header:
        try:
            since = parsedate_to_datetime(ims_header)
            # Ensure timezone-aware
            if since.tzinfo is None:
                since = since.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            since = None

    # Get user info from session
    user = UserResponse(
        sub=sub,
        email=request.session.get("email", ""),
        name=request.session.get("name"),
    )

    # Find the max last_updated across all items and settings
    max_item_ts = db.query(func.max(Item.last_updated)).scalar()
    settings = db.get(Settings, 1)
    max_settings_ts = settings.last_updated if settings else None

    # Compute overall max timestamp
    timestamps = [t for t in [max_item_ts, max_settings_ts] if t is not None]
    if not timestamps:
        # No data at all — return empty response
        resp = ChangesResponse(
            user=user,
            bookmarks=[],
            folders=[],
            settings=None,
            deleted_ids=[],
        )
        return resp

    max_ts = max(timestamps)

    # Ensure max_ts is timezone-aware for comparison
    if max_ts.tzinfo is None:
        max_ts = max_ts.replace(tzinfo=timezone.utc)

    # Check if we can return 304
    if since is not None and max_ts <= since:
        return Response(status_code=304)

    # Query changed items
    if since is not None:
        changed_bookmarks = (
            db.query(Bookmark)
            .filter(Bookmark.last_updated > since, Bookmark.deleted_at.is_(None))
            .order_by(Bookmark.position)
            .all()
        )
        changed_folders = (
            db.query(Folder)
            .filter(Folder.last_updated > since, Folder.deleted_at.is_(None))
            .order_by(Folder.position)
            .all()
        )
        # Deleted items since the given time
        deleted_items = (
            db.query(Item.id)
            .filter(
                Item.deleted_at.is_not(None),
                Item.last_updated > since,
            )
            .all()
        )
        deleted_ids = [row[0] for row in deleted_items]

        # Settings: include only if changed since
        changed_settings = None
        if settings and settings.last_updated is not None:
            settings_ts = settings.last_updated
            if settings_ts.tzinfo is None:
                settings_ts = settings_ts.replace(tzinfo=timezone.utc)
            if settings_ts > since:
                changed_settings = SettingsWithTimestamp.model_validate(settings)
    else:
        # Full pull — return everything
        changed_bookmarks = (
            db.query(Bookmark)
            .filter(Bookmark.deleted_at.is_(None))
            .order_by(Bookmark.position)
            .all()
        )
        changed_folders = (
            db.query(Folder)
            .filter(Folder.deleted_at.is_(None))
            .order_by(Folder.position)
            .all()
        )
        deleted_ids = []
        changed_settings = (
            SettingsWithTimestamp.model_validate(settings) if settings else None
        )

    resp = ChangesResponse(
        user=user,
        bookmarks=[_bookmark_to_response(b) for b in changed_bookmarks],
        folders=[_folder_to_response(f) for f in changed_folders],
        settings=changed_settings,
        deleted_ids=deleted_ids,
    )

    # Set Last-Modified header
    last_modified = format_datetime(max_ts, usegmt=True)
    return JSONResponse(
        content=resp.model_dump(mode="json"),
        headers={"Last-Modified": last_modified},
    )
