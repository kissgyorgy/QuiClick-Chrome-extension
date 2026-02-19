{ lib, ... }:

{
  # https://devenv.sh/basics/
  env = {
    # define it in devenv.local.nix
    # QUICLICK_GOOGLE_CLIENT_ID = "your-google-client-id";
    # QUICLICK_GOOGLE_CLIENT_SECRET = "your-google-client-secret";
    QUICLICK_SECRET_KEY = "change-me-to-a-random-secret";
    QUICLICK_SERVER_HOST = "https://local.fancyauth.com:8000";
    QUICLICK_DATA_DIR = "data";
  };

  # https://devenv.sh/packages/
  packages = [ ];

  # https://devenv.sh/languages/
  languages.python = {
    enable = true;
    venv.enable = true;
    uv = {
      enable = true;
      sync = {
        enable = true;
        allGroups = true;
        allExtras = true;
      };
    };
  };

  # https://devenv.sh/processes/
  processes.server.exec = "uvicorn quiclick_server.main:app --ssl-certfile ./nogit/local.fancyauth.com.pem --ssl-keyfile ./nogit/local.fancyauth.com-key.pem --reload --host 127.0.0.1 --port 8000";

  # https://devenv.sh/services/

  # https://devenv.sh/scripts/

  # https://devenv.sh/tests/

  # https://devenv.sh/git-hooks/
  # git-hooks.hooks.shellcheck.enable = true;

  # See full reference at https://devenv.sh/reference/options/
}
