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
    items = []
    for entry in body.items:
        item = db.get(Item, entry.id)
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {entry.id} not found")
        items.append((item, entry.position))

    # Move all affected items to temporary negative positions to avoid
    # intermediate unique-constraint violations during the swap.
    for idx, (item, _) in enumerate(items):
        item.position_x = -(idx + 1)
        item.position_y = -1
    db.flush()

    # Set final positions
    for item, pos in items:
        item.position_x = pos.x
        item.position_y = pos.y

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Position conflict")
    return {"detail": "Reordered"}
