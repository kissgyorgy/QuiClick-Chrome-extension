"""Tests for settings endpoints."""

from starlette.testclient import TestClient

from quiclick_server.database import get_current_user
from quiclick_server.main import app

TEST_SUB = "test-user-settings"


def _authenticated_client() -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: TEST_SUB
    return TestClient(app)


def _cleanup():
    app.dependency_overrides.clear()


def test_get_settings_defaults():
    client = _authenticated_client()
    resp = client.get("/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["show_titles"] is True
    assert data["tiles_per_row"] == 8
    assert data["tile_gap"] == 1
    assert data["show_add_button"] is True
    _cleanup()


def test_patch_settings():
    client = _authenticated_client()

    # Get defaults first
    client.get("/settings")

    # Patch
    resp = client.patch("/settings", json={"tiles_per_row": 6, "show_titles": False})
    assert resp.status_code == 200
    data = resp.json()
    assert data["tiles_per_row"] == 6
    assert data["show_titles"] is False
    assert data["tile_gap"] == 1  # unchanged
    assert data["show_add_button"] is True  # unchanged
    _cleanup()


def test_patch_settings_idempotent():
    client = _authenticated_client()

    # Patch twice with same value
    client.patch("/settings", json={"tile_gap": 3})
    resp = client.patch("/settings", json={"tile_gap": 3})
    assert resp.json()["tile_gap"] == 3
    _cleanup()
