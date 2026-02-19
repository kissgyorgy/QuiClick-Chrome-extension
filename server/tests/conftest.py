"""Shared test fixtures for QuiClick server tests."""

import importlib
import os

import pytest


@pytest.fixture(autouse=True)
def _env_setup(tmp_path):
    """Set required env vars and point data_dir to a temp directory."""
    os.environ["QUICLICK_GOOGLE_CLIENT_ID"] = "test-client-id"
    os.environ["QUICLICK_GOOGLE_CLIENT_SECRET"] = "test-client-secret"
    os.environ["QUICLICK_SECRET_KEY"] = "test-secret-key"
    os.environ["QUICLICK_SERVER_HOST"] = "http://localhost:8000"
    os.environ["QUICLICK_DATA_DIR"] = str(tmp_path / "data")

    # Reset config cache so it picks up the new env vars
    from quiclick_server.config import reset_config

    reset_config()

    yield

    reset_config()
