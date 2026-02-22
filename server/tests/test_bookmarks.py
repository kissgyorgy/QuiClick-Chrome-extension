"""Tests for bookmark CRUD operations."""

from starlette.testclient import TestClient

from quiclick_server.database import get_current_user
from quiclick_server.main import app

TEST_SUB = "test-user-123"


def _authenticated_client() -> TestClient:
    """Create a TestClient with the auth dependency overridden."""
    app.dependency_overrides[get_current_user] = lambda: TEST_SUB
    client = TestClient(app)
    return client


def _cleanup():
    app.dependency_overrides.clear()


# --- List ---


def test_list_bookmarks_empty():
    client = _authenticated_client()
    resp = client.get("/bookmarks")
    assert resp.status_code == 200
    assert resp.json() == []
    _cleanup()


# --- Create ---


def test_create_bookmark():
    client = _authenticated_client()
    resp = client.post(
        "/bookmarks",
        json={"title": "GitHub", "url": "https://github.com"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "GitHub"
    assert data["url"] == "https://github.com"
    assert data["type"] == "bookmark"
    assert data["favicon"] is None
    assert data["parent_id"] is None
    assert data["position"] == 1.0
    assert "id" in data
    assert "date_added" in data
    _cleanup()


def test_create_bookmark_auto_position():
    client = _authenticated_client()
    resp1 = client.post(
        "/bookmarks", json={"title": "First", "url": "https://first.com"}
    )
    resp2 = client.post(
        "/bookmarks", json={"title": "Second", "url": "https://second.com"}
    )
    assert resp1.json()["position"] == 1.0
    assert resp2.json()["position"] == 2.0
    _cleanup()


def test_create_bookmark_explicit_position():
    client = _authenticated_client()
    resp = client.post(
        "/bookmarks",
        json={"title": "At 5", "url": "https://five.com", "position": 5.0},
    )
    assert resp.json()["position"] == 5.0
    _cleanup()


# --- Get single ---


def test_get_bookmark():
    client = _authenticated_client()
    create_resp = client.post(
        "/bookmarks", json={"title": "Test", "url": "https://test.com"}
    )
    bid = create_resp.json()["id"]

    resp = client.get(f"/bookmarks/{bid}")
    assert resp.status_code == 200
    assert resp.json()["id"] == bid
    assert resp.json()["title"] == "Test"
    _cleanup()


def test_get_bookmark_not_found():
    client = _authenticated_client()
    resp = client.get("/bookmarks/9999")
    assert resp.status_code == 404
    _cleanup()


# --- Update (PUT) ---


def test_update_bookmark_full():
    client = _authenticated_client()
    create_resp = client.post(
        "/bookmarks", json={"title": "Old", "url": "https://old.com"}
    )
    bid = create_resp.json()["id"]

    resp = client.put(
        f"/bookmarks/{bid}",
        json={"title": "New", "url": "https://new.com"},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "New"
    assert resp.json()["url"] == "https://new.com"
    _cleanup()


# --- Update (PATCH) ---


def test_update_bookmark_partial():
    client = _authenticated_client()
    create_resp = client.post(
        "/bookmarks", json={"title": "Original", "url": "https://orig.com"}
    )
    bid = create_resp.json()["id"]

    resp = client.patch(
        f"/bookmarks/{bid}",
        json={"title": "Updated"},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated"
    assert resp.json()["url"] == "https://orig.com"  # unchanged
    _cleanup()


# --- Delete ---


def test_delete_bookmark():
    client = _authenticated_client()
    create_resp = client.post(
        "/bookmarks", json={"title": "ToDelete", "url": "https://del.com"}
    )
    bid = create_resp.json()["id"]

    resp = client.delete(f"/bookmarks/{bid}")
    assert resp.status_code == 204

    # Verify it's gone
    resp = client.get(f"/bookmarks/{bid}")
    assert resp.status_code == 404
    _cleanup()


def test_delete_bookmark_not_found():
    client = _authenticated_client()
    resp = client.delete("/bookmarks/9999")
    assert resp.status_code == 404
    _cleanup()


# --- Filter by folder ---


def test_list_bookmarks_filter_by_folder():
    client = _authenticated_client()

    # Create a folder
    folder_resp = client.post("/folders", json={"title": "Work"})
    fid = folder_resp.json()["id"]

    # Create bookmarks in root and in folder
    client.post("/bookmarks", json={"title": "Root BM", "url": "https://root.com"})
    client.post(
        "/bookmarks",
        json={"title": "Folder BM", "url": "https://folder.com", "parent_id": fid},
    )

    # Filter by folder
    resp = client.get(f"/bookmarks?folder_id={fid}")
    assert resp.status_code == 200
    bookmarks = resp.json()
    assert len(bookmarks) == 1
    assert bookmarks[0]["title"] == "Folder BM"

    # Filter by root
    resp = client.get("/bookmarks?folder_id=root")
    assert resp.status_code == 200
    bookmarks = resp.json()
    assert len(bookmarks) == 1
    assert bookmarks[0]["title"] == "Root BM"

    _cleanup()


# --- Favicon round-trip ---


def test_bookmark_with_favicon():
    import base64

    # Minimal valid PNG (1x1 transparent)
    png_header = b"\x89PNG\r\n\x1a\n"
    # Construct a minimal valid-enough PNG for our magic byte check
    # Full 1x1 PNG
    png_data = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
        b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
        b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    b64 = base64.b64encode(png_data).decode()
    data_url = f"data:image/png;base64,{b64}"

    client = _authenticated_client()
    resp = client.post(
        "/bookmarks",
        json={
            "title": "With Favicon",
            "url": "https://example.com",
            "favicon": data_url,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["favicon"] == data_url

    # Read it back
    bid = resp.json()["id"]
    resp = client.get(f"/bookmarks/{bid}")
    assert resp.json()["favicon"] == data_url
    _cleanup()
