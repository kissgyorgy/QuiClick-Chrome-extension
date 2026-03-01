# Overview

Deploy the quiclick server as a Nix closure to `nixstinger`, following the SMC pattern: `nix build` → `nix copy` → symlink swap → systemctl restart. Single environment (prod only), no test/prod split.

# Architecture

A `flake.nix` uses uv2nix to build a Python virtualenv from `server/pyproject.toml`, then wraps it in a control script (`quiclick-ctl`) that sets up env vars and dispatches subcommands (server, manage). The resulting derivation is pushed to `nixstinger` via `nix copy --to ssh://nixstinger`, symlinked at `/opt/quiclick/quiclick`, and managed by a systemd service. Config (secrets, Google OAuth creds) lives in an env file at `/srv/quiclick/env`.

# Implementation plan

## 1. Create `flake.nix`

Based on the SMC flake but simpler (no static assets, no Tailwind, single environment).

**Inputs:** nixpkgs, pyproject-nix, uv2nix, pyproject-build-systems (same as SMC).

**Package output (`.#default`):**

- `venv` — `pythonSet.mkVirtualEnv` from uv2nix workspace loaded at `./server`
- `quiclick-ctl` — `writeShellApplication` that:
  - Sets `PYTHONPATH` to the server source (embedded via `${./server/quiclick_server}` or similar)
  - Sources `/srv/quiclick/env` for secrets (`QUICLICK_GOOGLE_CLIENT_ID`, `QUICLICK_GOOGLE_CLIENT_SECRET`, `QUICLICK_SECRET_KEY`, etc.)
  - Dispatches: `server` (runs uvicorn), `manage` (future admin commands)
- `quiclick` convenience wrapper — calls `quiclick-ctl "$@"`
- Bundled systemd unit file at `share/systemd/quiclick.service`

The server source needs to be accessible at runtime. Options:

- Embed it in the Nix store via the flake (cleanest). The `PYTHONPATH` points to the store path containing the quiclick_server package. Since it's already a proper Python package with pyproject.toml, the venv built by uv2nix will include it — no separate PYTHONPATH needed.

**Systemd unit:**

```ini
[Unit]
Description=QuiClick API server
After=network.target

[Service]
ExecStart=/opt/quiclick/quiclick/bin/quiclick server
EnvironmentFile=/srv/quiclick/env
Restart=always

[Install]
WantedBy=multi-user.target
```

Note: Unlike SMC, no `ExecStartPre` migrations needed (SQLite, auto-created).

## 2. Add deploy recipes to justfile

```just
# In root justfile
build:
    nix build .#default --out-link ./build/deploy

deploy: build
    #!/usr/bin/env bash
    link=./build/deploy
    nix copy --to ssh://nixstinger ${link}
    store_path=$(readlink -f ${link})
    ssh nixstinger "
      sudo ln -sfn ${store_path} /opt/quiclick/quiclick
      sudo systemctl restart quiclick
    "

restart:
    ssh nixstinger "sudo systemctl daemon-reload && sudo systemctl restart quiclick"
```

## 3. Key differences from SMC

| Aspect         | SMC                           | QuiClick              |
| -------------- | ----------------------------- | --------------------- |
| Environments   | test + prod                   | single (prod)         |
| Static assets  | Tailwind + collectstatic      | None (API only)       |
| Database       | PostgreSQL (needs migrate)    | SQLite (auto-created) |
| Service user   | gordius-{env}                 | quiclick (or root)    |
| Systemd        | Template unit (@)             | Simple unit           |
| Control script | gordius-ctl with env dispatch | quiclick-ctl, simpler |

## 4. uv2nix workspace root

The `workspace.loadWorkspace` call needs `workspaceRoot = ./server` since that's where `pyproject.toml` and `uv.lock` live.

## 5. Server config for production

The `quiclick-ctl server` command runs:

```bash
exec uvicorn quiclick_server.main:app \
  --host "${QUICLICK_HOST:-0.0.0.0}" \
  --port "${QUICLICK_PORT:-8000}"
```

Production env file at `/srv/quiclick/env`:

```
QUICLICK_GOOGLE_CLIENT_ID=...
QUICLICK_GOOGLE_CLIENT_SECRET=...
QUICLICK_SECRET_KEY=...
QUICLICK_SERVER_HOST=https://quiclick.example.com
QUICLICK_CORS_ORIGINS=chrome-extension://...
QUICLICK_DATA_DIR=/srv/quiclick/data
```

## 6. NixOS service module (`~/nixconf/services/quiclick.nix`)

Create a reusable service module at `~/nixconf/services/quiclick.nix`, following the existing pattern (e.g. `uptime-kuma.nix`, `fossflow.nix`). Takes `{ pkgs, listen, ... }` as arguments.

```nix
{ pkgs, listen, ... }:
let
  host = "quiclick.walkman.io";
  port = 8000;
in
{
  users.groups.quiclick = { };
  users.users.quiclick = {
    isSystemUser = true;
    group = "quiclick";
    home = "/srv/quiclick";
    createHome = true;
  };

  environment.systemPackages = [
    (pkgs.writeShellScriptBin "quiclick" ''exec /opt/quiclick/quiclick/bin/quiclick "$@"'')
  ];

  systemd.services.quiclick = {
    description = "QuiClick API server";
    after = [ "network.target" ];
    wantedBy = [ "multi-user.target" ];
    serviceConfig = {
      User = "quiclick";
      Group = "quiclick";
      ExecStart = "/opt/quiclick/quiclick/bin/quiclick server";
      EnvironmentFile = "/srv/quiclick/env";
      Restart = "always";
    };
  };

  services.nginx.virtualHosts."${host}" = {
    listenAddresses = [ listen ];
    enableACME = true;
    forceSSL = true;
    acmeRoot = null;
    locations."/" = {
      proxyPass = "http://127.0.0.1:${toString port}";
    };
  };
}
```

## 7. Import in nixstinger services.nix

Pass the public IP as `listen` to the quiclick module:

```nix
# In nixstinger/services.nix:
let
  tailscaleIP = "100.79.234.8";
  publicIP = "147.93.59.34";
in
{
  imports = [
    (import ../../services/openssh.nix { inherit pkgs; listen = tailscaleIP; })
    (import ../../services/uptime-kuma.nix { listen = tailscaleIP; })
    (import ../../services/nextcloud.nix { inherit pkgs config lib; })
    (import ../../services/quiclick.nix { inherit pkgs; listen = publicIP; })
    ../../services/nginx.nix
  ];
}
```

Note: The systemd unit in `flake.nix` (bundled with the package) is **not needed** since the NixOS config defines the service declaratively. The flake only needs to produce the `quiclick-ctl` wrapper + venv.

# Files to modify

### `flake.nix` (new, in quiclick repo)

The main Nix flake with uv2nix integration, `quiclick-ctl` wrapper, single `default` package output. No bundled systemd unit needed since NixOS manages the service.

### `justfile` (modify, in quiclick repo)

Add `build`, `deploy`, `restart` recipes alongside existing `mod extension`.

### `~/nixconf/services/quiclick.nix` (new)

Reusable NixOS service module: quiclick user/group, systemd service, nginx virtualhost, convenience script. Takes `{ pkgs, listen, ... }`.

### `~/nixconf/hosts/nixstinger/services.nix` (modify)

Add import of `../../services/quiclick.nix` with `listen = publicIP` (`147.93.59.34`). Add `publicIP` variable to the `let` block.


# Verification, success criteria

1. **Local build works:**

   ```bash
   cd ~/Projects/quiclick
   nix build .#default
   ./build/deploy/bin/quiclick --help
   # Should print usage: quiclick {server|...}
   ```

2. **NixOS config builds:**

   ```bash
   cd ~/nixconf
   nixos-rebuild build --flake .#nixstinger
   # Should succeed without errors
   ```

3. **Deploy nixconf to nixstinger:**

   ```bash
   # Apply the NixOS config (creates user, service, nginx vhost)
   nixos-rebuild switch --flake .#nixstinger --target-host nixstinger
   ```

4. **Deploy quiclick app:**

   ```bash
   cd ~/Projects/quiclick
   just deploy
   ssh nixstinger "systemctl status quiclick"
   # Should show active (running)
   curl https://quiclick.walkman.io/
   # Should return {"app": "QuiClick API", "status": "ok"}
   ```

# Todo items

1. Create `flake.nix` in quiclick repo with uv2nix workspace, python venv, `quiclick-ctl` wrapper script, and single `default` package output
2. Add `build`, `deploy`, `restart` recipes to root `justfile`
3. Create `~/nixconf/services/quiclick.nix` with user, systemd service, nginx vhost, convenience script
4. Import quiclick service in `~/nixconf/hosts/nixstinger/services.nix` with public IP
5. Test local `nix build .#default` succeeds and produces working binary
6. Deploy NixOS config to nixstinger (`nixos-rebuild switch`)
7. Create `/srv/quiclick/env` on nixstinger with production secrets, create `/opt/quiclick/` directory
8. Test full deploy cycle: `just deploy` → service running → `curl https://quiclick.walkman.io/` returns OK