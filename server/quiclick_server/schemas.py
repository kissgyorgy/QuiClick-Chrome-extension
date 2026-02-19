import base64
import re
from datetime import datetime

from pydantic import BaseModel, field_validator

# --- Favicon validation ---

_DATA_URL_RE = re.compile(r"^data:([^;]+);base64,(.+)$", re.DOTALL)

_ALLOWED_MIMES = {
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/x-icon",
    "image/svg+xml",
}

_MAGIC_BYTES: dict[str, list[tuple[bytes, int] | tuple[bytes, int, bytes, int]]] = {
    "image/png": [(b"\x89PNG", 0)],
    "image/jpeg": [(b"\xff\xd8\xff", 0)],
    "image/gif": [(b"GIF87a", 0), (b"GIF89a", 0)],
    "image/webp": [],  # special handling: RIFF at 0 and WEBP at 8
    "image/x-icon": [(b"\x00\x00\x01\x00", 0)],
    "image/svg+xml": [],  # special handling: text contains <svg
}


def validate_favicon_data_url(v: str) -> str:
    """Validate a base64 data URL for favicon. Returns the original string if valid."""
    m = _DATA_URL_RE.match(v)
    if not m:
        raise ValueError(
            "Favicon must be a data URL in the format data:{mime};base64,{data}"
        )

    mime = m.group(1)
    b64_data = m.group(2)

    if mime not in _ALLOWED_MIMES:
        raise ValueError(
            f"Unsupported MIME type '{mime}'. Allowed: {', '.join(sorted(_ALLOWED_MIMES))}"
        )

    try:
        raw = base64.b64decode(b64_data)
    except Exception:
        raise ValueError("Invalid base64 encoding in favicon data URL")

    if not raw:
        raise ValueError("Favicon data is empty")

    # Magic byte verification
    if mime == "image/svg+xml":
        try:
            text = raw.decode("utf-8", errors="ignore").lstrip("\ufeff").strip()
        except Exception:
            raise ValueError("SVG favicon could not be decoded as text")
        if "<svg" not in text.lower():
            raise ValueError("SVG favicon does not contain <svg element")
    elif mime == "image/webp":
        if len(raw) < 12:
            raise ValueError("WEBP data too short")
        if raw[0:4] != b"RIFF" or raw[8:12] != b"WEBP":
            raise ValueError("Invalid WEBP magic bytes")
    else:
        magics = _MAGIC_BYTES.get(mime, [])
        if magics:
            matched = False
            for magic_bytes, offset in magics:
                end = offset + len(magic_bytes)
                if len(raw) >= end and raw[offset:end] == magic_bytes:
                    matched = True
                    break
            if not matched:
                raise ValueError(
                    f"Favicon binary content does not match declared MIME type '{mime}'"
                )

    return v


# --- Bookmark schemas ---


class BookmarkCreate(BaseModel):
    title: str
    url: str
    favicon: str | None = None
    parent_id: int | None = None
    position: float | None = None

    @field_validator("favicon", mode="before")
    @classmethod
    def check_favicon(cls, v: str | None) -> str | None:
        return validate_favicon_data_url(v) if v else v


class BookmarkUpdate(BaseModel):
    title: str | None = None
    url: str | None = None
    favicon: str | None = None
    parent_id: int | None = None
    position: float | None = None

    @field_validator("favicon", mode="before")
    @classmethod
    def check_favicon(cls, v: str | None) -> str | None:
        return validate_favicon_data_url(v) if v else v


class BookmarkResponse(BaseModel):
    id: int
    type: str
    title: str
    url: str
    favicon: str | None
    date_added: datetime
    parent_id: int | None
    position: float

    model_config = {"from_attributes": True}


# --- Folder schemas ---


class FolderCreate(BaseModel):
    title: str
    parent_id: int | None = None
    position: float | None = None


class FolderUpdate(BaseModel):
    title: str | None = None
    position: float | None = None


class FolderResponse(BaseModel):
    id: int
    type: str
    title: str
    date_added: datetime
    parent_id: int | None
    position: float

    model_config = {"from_attributes": True}


class FolderDetailResponse(FolderResponse):
    """Folder with its child bookmarks."""

    bookmarks: list[BookmarkResponse] = []


# --- Reorder schemas ---


class ReorderItem(BaseModel):
    id: int
    position: float


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


# --- Settings schemas ---


class SettingsResponse(BaseModel):
    show_titles: bool
    tiles_per_row: int
    tile_gap: int
    show_add_button: bool

    model_config = {"from_attributes": True}


class SettingsPatch(BaseModel):
    show_titles: bool | None = None
    tiles_per_row: int | None = None
    tile_gap: int | None = None
    show_add_button: bool | None = None


# --- Export/Import schemas ---


class ExportBookmark(BaseModel):
    id: int
    title: str
    url: str
    favicon: str | None
    date_added: datetime
    parent_id: int | None
    position: float


class ExportFolder(BaseModel):
    id: int
    title: str
    date_added: datetime
    parent_id: int | None
    position: float


class ExportData(BaseModel):
    bookmarks: list[ExportBookmark]
    folders: list[ExportFolder]
    settings: SettingsResponse | None
    export_date: datetime
    version: int = 1


# --- Auth schemas ---


class UserResponse(BaseModel):
    sub: str
    email: str
    name: str | None
