import base64
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from quiclick_server.database import get_db
from quiclick_server.models import Bookmark, Folder, Item, Settings
from quiclick_server.schemas import (
    ExportBookmark,
    ExportData,
    ExportFolder,
    SettingsResponse,
)

router = APIRouter(tags=["export_import"])


def _bookmark_favicon_data_url(bm: Bookmark) -> str | None:
    if bm.favicon is None or bm.favicon_mime is None:
        return None
    b64 = base64.b64encode(bm.favicon).decode()
    return f"data:{bm.favicon_mime};base64,{b64}"


@router.get("/export", response_model=ExportData)
def export_data(db: Session = Depends(get_db)):
    """Export all user data as JSON."""
    bookmarks = db.query(Bookmark).order_by(Bookmark.position).all()
    folders = db.query(Folder).order_by(Folder.position).all()
    settings = db.get(Settings, 1)

    export_bookmarks = [
        ExportBookmark(
            id=bm.id,
            title=bm.title,
            url=bm.url,
            favicon=_bookmark_favicon_data_url(bm),
            date_added=bm.date_added,
            parent_id=bm.parent_id,
            position=bm.position,
        )
        for bm in bookmarks
    ]

    export_folders = [
        ExportFolder(
            id=f.id,
            title=f.title,
            date_added=f.date_added,
            parent_id=f.parent_id,
            position=f.position,
        )
        for f in folders
    ]

    settings_resp = None
    if settings:
        settings_resp = SettingsResponse.model_validate(settings)

    return ExportData(
        bookmarks=export_bookmarks,
        folders=export_folders,
        settings=settings_resp,
        export_date=datetime.now(timezone.utc),
        version=1,
    )


@router.post("/import", status_code=200)
def import_data(body: ExportData, db: Session = Depends(get_db)):
    """Import data from JSON export. Replaces all existing data."""
    try:
        # Delete all existing data
        db.query(Bookmark).delete()
        db.query(Folder).delete()
        db.query(Item).delete()
        db.query(Settings).delete()
        db.flush()

        # Import folders first (they are Items too, but no FK dependencies among them)
        for f_data in body.folders:
            folder = Folder(
                id=f_data.id,
                title=f_data.title,
                date_added=f_data.date_added,
                parent_id=f_data.parent_id,
                position=f_data.position,
            )
            db.add(folder)

        db.flush()

        # Import bookmarks
        for bm_data in body.bookmarks:
            favicon_bytes = None
            favicon_mime = None
            if bm_data.favicon:
                # Parse data URL
                header, b64_data = bm_data.favicon.split(",", 1)
                favicon_mime = header.split(":")[1].split(";")[0]
                favicon_bytes = base64.b64decode(b64_data)

            bookmark = Bookmark(
                id=bm_data.id,
                title=bm_data.title,
                url=bm_data.url,
                favicon=favicon_bytes,
                favicon_mime=favicon_mime,
                date_added=bm_data.date_added,
                parent_id=bm_data.parent_id,
                position=bm_data.position,
            )
            db.add(bookmark)

        db.flush()

        # Import settings
        if body.settings:
            settings = Settings(
                id=1,
                show_titles=body.settings.show_titles,
                tiles_per_row=body.settings.tiles_per_row,
                tile_gap=body.settings.tile_gap,
                show_add_button=body.settings.show_add_button,
            )
            db.add(settings)

        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {e}")

    return {"detail": "Import successful"}
