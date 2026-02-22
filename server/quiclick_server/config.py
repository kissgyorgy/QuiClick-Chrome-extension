import environ


@environ.config(prefix="QUICLICK")
class AppConfig:
    google_client_id: str = environ.var()
    google_client_secret: str = environ.var()
    secret_key: str = environ.var()
    server_host: str = environ.var("http://localhost:8000")
    cors_origins: str = environ.var("chrome-extension://fcemlekbbpkogapcgibnfnneknolknib")
    data_dir: str = environ.var("data")


_cfg = None


def get_config() -> AppConfig:
    global _cfg
    if _cfg is None:
        _cfg = environ.to_config(AppConfig)
    return _cfg


def reset_config():
    """Reset cached config (for testing)."""
    global _cfg
    _cfg = None


# For convenience — but accesses must go through get_config() internally
class _CfgProxy:
    """Lazy proxy so `from config import cfg` still works at module level."""

    def __getattr__(self, name):
        return getattr(get_config(), name)


cfg = _CfgProxy()
