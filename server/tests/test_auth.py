"""Tests for auth guard — unauthenticated requests get 401."""

from starlette.testclient import TestClient

from quiclick_server.main import app


def test_bookmarks_requires_auth():
    client = TestClient(app)
    resp = client.get("/bookmarks")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Not authenticated"


def test_folders_requires_auth():
    client = TestClient(app)
    resp = client.get("/folders")
    assert resp.status_code == 401


def test_settings_requires_auth():
    client = TestClient(app)
    resp = client.get("/settings")
    assert resp.status_code == 401


def test_export_requires_auth():
    client = TestClient(app)
    resp = client.get("/export")
    assert resp.status_code == 401


def test_reorder_requires_auth():
    client = TestClient(app)
    resp = client.patch("/reorder", json={"items": []})
    assert resp.status_code == 401


def test_auth_me_requires_auth():
    client = TestClient(app)
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_root_endpoint_is_public():
    client = TestClient(app)
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json()["app"] == "QuiClick API"
