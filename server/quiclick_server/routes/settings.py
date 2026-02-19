from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from quiclick_server.database import get_db
from quiclick_server.models import Settings
from quiclick_server.schemas import SettingsPatch, SettingsResponse

router = APIRouter(tags=["settings"])


def _get_or_create_settings(db: Session) -> Settings:
    """Get the single settings row, creating it with defaults if missing."""
    settings = db.get(Settings, 1)
    if not settings:
        settings = Settings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("", response_model=SettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    """Get user settings (creates defaults if none exist)."""
    settings = _get_or_create_settings(db)
    return SettingsResponse.model_validate(settings)


@router.patch("", response_model=SettingsResponse)
def patch_settings(body: SettingsPatch, db: Session = Depends(get_db)):
    """Partial update of user settings."""
    settings = _get_or_create_settings(db)

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(settings, key, value)

    db.commit()
    db.refresh(settings)
    return SettingsResponse.model_validate(settings)
