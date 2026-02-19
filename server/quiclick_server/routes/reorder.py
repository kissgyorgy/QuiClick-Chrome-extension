from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from quiclick_server.database import get_db
from quiclick_server.models import Item
from quiclick_server.schemas import ReorderRequest

router = APIRouter(tags=["reorder"])


@router.patch("/reorder", status_code=200)
def reorder_items(body: ReorderRequest, db: Session = Depends(get_db)):
    """Bulk-update positions for root-level items (folders + bookmarks)."""
    for entry in body.items:
        item = db.get(Item, entry.id)
        if not item:
            raise HTTPException(
                status_code=404, detail=f"Item {entry.id} not found"
            )
        item.position = entry.position

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Position conflict during reorder")

    return {"detail": "Reordered"}
