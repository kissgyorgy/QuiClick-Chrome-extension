"""Tests for folder CRUD operations."""

from starlette.testclient import TestClient

from quiclick_server.database import get_current_user
from quiclick_server.main import app

TEST_SUB = "test-user-folders"


def _authenticated_client() -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: TEST_SUB
    return TestClient(app)


def _cleanup():
    app.dependency_overrides.clear()


def test_list_folders_empty():
    client = _authenticated_client()
    resp = client.get("/folders")
    assert resp.status_code == 200
    assert resp.json() == []
    _cleanup()


def test_create_folder():
    client = _authenticated_client()
    resp = client.post("/folders", json={"title": "Work"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Work"
    assert data["type"] == "folder"
    assert data["parent_id"] is None
    assert data["position"] == 1.0
    _cleanup()


def test_create_folder_auto_position_shared_with_bookmarks():
    """Folders and bookmarks share the root position space."""
    client = _authenticated_client()

    # Create a bookmark at position 1.0
    client.post("/bookmarks", json={"title": "BM", "url": "https://bm.com"})

    # Create a folder — should get position 2.0
    resp = client.post("/folders", json={"title": "Folder"})
    assert resp.json()["position"] == 2.0
    _cleanup()


def test_get_folder_with_bookmarks():
    client = _authenticated_client()

    # Create folder
    folder_resp = client.post("/folders", json={"title": "Reading"})
    fid = folder_resp.json()["id"]

    # Add bookmark to folder
    client.post(
        "/bookmarks",
        json={"title": "Article", "url": "https://article.com", "parent_id": fid},
    )

    # Get folder detail
    resp = client.get(f"/folders/{fid}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Reading"
    assert len(data["bookmarks"]) == 1
    assert data["bookmarks"][0]["title"] == "Article"
    _cleanup()


def test_get_folder_not_found():
    client = _authenticated_client()
    resp = client.get("/folders/9999")
    assert resp.status_code == 404
    _cleanup()


def test_update_folder():
    client = _authenticated_client()
    resp = client.post("/folders", json={"title": "Old Name"})
    fid = resp.json()["id"]

    resp = client.put(f"/folders/{fid}", json={"title": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "New Name"
    _cleanup()


def test_delete_folder_orphans_bookmarks():
    """Deleting a folder moves its bookmarks to root."""
    client = _authenticated_client()

    # Create folder + bookmark inside
    folder_resp = client.post("/folders", json={"title": "ToDelete"})
    fid = folder_resp.json()["id"]
    bm_resp = client.post(
        "/bookmarks",
        json={"title": "Orphan", "url": "https://orphan.com", "parent_id": fid},
    )
    bid = bm_resp.json()["id"]

    # Delete folder
    resp = client.delete(f"/folders/{fid}")
    assert resp.status_code == 204

    # Bookmark should now be at root
    bm = client.get(f"/bookmarks/{bid}").json()
    assert bm["parent_id"] is None
    _cleanup()


def test_delete_folder_not_found():
    client = _authenticated_client()
    resp = client.delete("/folders/9999")
    assert resp.status_code == 404
    _cleanup()
