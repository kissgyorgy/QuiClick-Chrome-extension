{ lib, pkgs, ... }:

{
  env = {
    # define these in devenv.local.nix
    # QUICLICK_GOOGLE_CLIENT_ID = "your-google-client-id";
    # QUICLICK_GOOGLE_CLIENT_SECRET = "your-google-client-secret";
    QUICLICK_SECRET_KEY = "change-me-to-a-random-secret";
    QUICLICK_SERVER_HOST = "https://local.fancyauth.com:8000";
    QUICLICK_DATA_DIR = "data";
  };

  packages = [ ];

  languages.python = {
    enable = true;
    directory = "server";
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

  languages.javascript = {
    enable = true;
    bun.enable = true;
    directory = "extension";
  };

  processes.server.exec = "cd server && uvicorn quiclick_server.main:app --ssl-certfile ./nogit/local.fancyauth.com.pem --ssl-keyfile ./nogit/local.fancyauth.com-key.pem --reload --host 127.0.0.1 --port 8000";
}
