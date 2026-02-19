"""Tests for export/import endpoints."""

from starlette.testclient import TestClient

from quiclick_server.database import get_current_user
from quiclick_server.main import app

TEST_SUB = "test-user-export"


def _authenticated_client() -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: TEST_SUB
    return TestClient(app)


def _cleanup():
    app.dependency_overrides.clear()


def test_export_empty():
    client = _authenticated_client()
    resp = client.get("/export")
    assert resp.status_code == 200
    data = resp.json()
    assert data["bookmarks"] == []
    assert data["folders"] == []
    assert data["settings"] is None
    assert data["version"] == 1
    assert "export_date" in data
    _cleanup()


def test_export_with_data():
    client = _authenticated_client()

    # Create some data
    client.post("/folders", json={"title": "Work"})
    client.post("/bookmarks", json={"title": "GH", "url": "https://github.com"})
    client.patch("/settings", json={"tiles_per_row": 5})

    resp = client.get("/export")
    data = resp.json()
    assert len(data["bookmarks"]) == 1
    assert len(data["folders"]) == 1
    assert data["settings"]["tiles_per_row"] == 5
    _cleanup()


def test_import_round_trip():
    client = _authenticated_client()

    # Create data
    client.post("/folders", json={"title": "Imported Folder"})
    client.post(
        "/bookmarks", json={"title": "Imported BM", "url": "https://import.com"}
    )
    client.patch("/settings", json={"tile_gap": 4})

    # Export
    export_resp = client.get("/export")
    export_data = export_resp.json()

    # Clear data by importing empty set first — actually let's just re-import
    # Import the same data (should replace)
    import_resp = client.post("/import", json=export_data)
    assert import_resp.status_code == 200

    # Verify data is intact
    bookmarks = client.get("/bookmarks").json()
    assert len(bookmarks) == 1
    assert bookmarks[0]["title"] == "Imported BM"

    folders = client.get("/folders").json()
    assert len(folders) == 1
    assert folders[0]["title"] == "Imported Folder"

    settings = client.get("/settings").json()
    assert settings["tile_gap"] == 4
    _cleanup()
