"""Tests for the unified reorder endpoint."""

from starlette.testclient import TestClient

from quiclick_server.database import get_current_user
from quiclick_server.main import app

TEST_SUB = "test-user-reorder"


def _authenticated_client() -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: TEST_SUB
    return TestClient(app)


def _cleanup():
    app.dependency_overrides.clear()


def test_reorder_root_items():
    client = _authenticated_client()

    # Create a folder and a bookmark at root
    f_resp = client.post("/folders", json={"title": "Folder"})
    b_resp = client.post(
        "/bookmarks", json={"title": "BM", "url": "https://bm.com"}
    )
    fid = f_resp.json()["id"]
    bid = b_resp.json()["id"]

    # Reorder: swap positions
    resp = client.patch(
        "/reorder",
        json={
            "items": [
                {"id": fid, "position": 10.0},
                {"id": bid, "position": 5.0},
            ]
        },
    )
    assert resp.status_code == 200

    # Verify new positions
    folder = client.get(f"/folders/{fid}").json()
    bookmark = client.get(f"/bookmarks/{bid}").json()
    assert folder["position"] == 10.0
    assert bookmark["position"] == 5.0
    _cleanup()


def test_reorder_not_found():
    client = _authenticated_client()
    resp = client.patch(
        "/reorder", json={"items": [{"id": 9999, "position": 1.0}]}
    )
    assert resp.status_code == 404
    _cleanup()
