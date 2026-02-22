# Overview

Merge `quiclick` (Chrome extension) and `quiclick-server` into a single monorepo with `extension/` and `server/` subdirectories, preserving full git history of both projects. The `quiclick` repo is the base (keeps GitHub remote). A unified `devenv.nix` at the root manages both Python/uv and Bun tooling.

# Architecture

Use `git-filter-repo` to rewrite the extension repo's history so all files appear under `extension/`. Then add `quiclick-server` as a remote and use `git merge --allow-unrelated-histories` on a `git-filter-repo`-rewritten branch that places server files under `server/`. Root-level files (`devenv.nix`, `devenv.yaml`, `.gitignore`, `.envrc`) tie everything together.

# Implementation plan

## Step 1: Backup

Create backup copies of both repos before any destructive operations:

```bash
cp -r /home/walkman/Projects/quiclick /home/walkman/Projects/quiclick-backup
cp -r /home/walkman/Projects/quiclick-server /home/walkman/Projects/quiclick-server-backup
```

## Step 2: Rewrite extension history into `extension/`

Work on the `quiclick` repo. Use `git-filter-repo` to move all files under `extension/`:

```bash
cd /home/walkman/Projects/quiclick
git filter-repo --to-subdirectory-filter extension/ --force
```

This rewrites every commit so files appear at `extension/path` instead of `path`. The `--force` flag is needed since we have a remote. The remote will be removed by `git-filter-repo` (expected — re-add later).

## Step 3: Prepare server repo into `server/`

First, delete `claudetmp/` from the server repo so it doesn't pollute the merged history:

```bash
cd /home/walkman/Projects/quiclick-server
git rm -r claudetmp/
git commit -m "Remove claudetmp"
```

Then rewrite the server repo's history:

```bash
git filter-repo --to-subdirectory-filter server/ --force
```

## Step 4: Merge server history into extension repo

```bash
cd /home/walkman/Projects/quiclick
git remote add server /home/walkman/Projects/quiclick-server
git fetch server
git merge server/main --allow-unrelated-histories --no-edit
git remote remove server
```

(Adjust `server/main` to the actual default branch name if different.)

## Step 5: Clean up unwanted files from root

After the merge, remove agent/Claude files that were rewritten into subdirectories — they'll exist at `extension/CLAUDE.md`, `extension/.claude/`, `extension/.pi/`, `server/AGENTS.md`, `server/.claude/`, `server/.pi/`, `server/plans/`, `extension/plans/`, etc.

```bash
git rm -r extension/CLAUDE.md extension/.claude/ extension/.pi/
git rm -r server/AGENTS.md server/.claude/ server/.pi/
# Also remove server's devenv files (moving to root)
git rm server/devenv.nix server/devenv.yaml server/devenv.lock server/.envrc server/.gitignore
# Remove extension's .gitignore (will create root one)
git rm extension/.gitignore
```

## Step 6: Create root-level files

### `devenv.yaml`

```yaml
inputs:
  nixpkgs:
    url: github:NixOS/nixpkgs/nixpkgs-unstable
```

### `devenv.nix`

Merge both projects' needs:

```nix
{ lib, pkgs, ... }:

{
  env = {
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
```

Note: The `directory` option for `languages.python` and `languages.javascript` tells devenv to look for `pyproject.toml` / `package.json` in those subdirectories. Need to verify this works with devenv — if not, use `enterShell` hooks for `cd server && uv sync` / `cd extension && bun install`.

### `.envrc`

```
source_url "https://raw.githubusercontent.com/cachix/devenv/d1f7b48e35e6571571c36f3da3a4e34b6e413499/direnv_support_sha256" "sha256-YBzqskFZxmNb3kYVoKD9ZixoPXJh1C9ZvTLGFRkauZ0="
use devenv
```

### `.gitignore`

Merged from both projects:

```
# Python
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/
*.db

# JavaScript / Bun
node_modules/
dist/
*.tgz
coverage/
*.lcov
*.tsbuildinfo
.eslintcache
.cache

# Devenv
.devenv*
devenv.local.nix
.direnv

# Logs
logs/
*.log

# Environment
.env
.env.*.local

# IDE
.idea
.DS_Store
```

## Step 7: Update extension paths in package.json

The `extension/package.json` scripts reference relative paths like `./src/main.css`. These are still correct because they're relative to where `bun` runs. But the `package` script's zip command should be verified. No changes likely needed since bun would run from `extension/`.

## Step 8: Re-add GitHub remote

```bash
git remote add origin git@github.com:kissgyorgy/QuiClick-Chrome-extension.git
```

Consider renaming the GitHub repo to just `quiclick` since it now contains both.

## Step 9: Commit and verify

```bash
git add devenv.nix devenv.yaml .envrc .gitignore
git commit -m "Merge extension and server into monorepo"
```

# Files to modify

| File                   | Action | Description                             |
| ---------------------- | ------ | --------------------------------------- |
| `devenv.nix`           | Create | Unified devenv config with Python + Bun |
| `devenv.yaml`          | Create | Nix inputs                              |
| `.envrc`               | Create | direnv integration                      |
| `.gitignore`           | Create | Merged gitignore                        |
| `server/claudetmp/`    | Delete | Removed before merge (pre-filter-repo)  |
| `extension/CLAUDE.md`  | Delete | Will be re-created by user              |
| `extension/.claude/`   | Delete | Will be re-created by user              |
| `extension/.pi/`       | Delete | Will be re-created by user              |
| `server/AGENTS.md`     | Delete | Will be re-created by user              |
| `server/.claude/`      | Delete | Will be re-created by user              |
| `server/.pi/`          | Delete | Will be re-created by user              |
| `server/devenv.nix`    | Delete | Moved to root                           |
| `server/devenv.yaml`   | Delete | Moved to root                           |
| `server/.envrc`        | Delete | Moved to root                           |
| `server/.gitignore`    | Delete | Merged into root                        |
| `extension/.gitignore` | Delete | Merged into root                        |

# Verification, success criteria

1. **History preserved**: `git log --oneline -- extension/script.js` shows the extension's commit history. `git log --oneline -- server/quiclick_server/main.py` shows the server's commit history.

2. **File structure correct**:
   - `ls extension/` shows `manifest.json`, `script.js`, `newtab.html`, `package.json`, etc.
   - `ls server/` shows `quiclick_server/`, `pyproject.toml`, `tests/`, etc.
   - Root has `devenv.nix`, `devenv.yaml`, `.envrc`, `.gitignore`
   - No CLAUDE.md, AGENTS.md, .claude/, .pi/ anywhere
   - `extension/plans/` and `server/plans/` exist (kept)

3. **Devenv works**: `devenv shell` enters successfully with both Python/uv and Bun available. Run `python --version`, `bun --version` inside the shell.

4. **Extension builds**: `cd extension && bun install && bun run build-css` succeeds.

5. **Server starts**: `cd server && uv sync` succeeds. `cd server && python -c "from quiclick_server.main import app"` works.

6. **No stale files**: No `devenv.nix` in `server/`, no `.gitignore` in subdirectories.

# Todo items

1. Create backup copies of both repos
2. Run `git filter-repo --to-subdirectory-filter extension/` on quiclick repo
3. Delete `claudetmp/` from quiclick-server with a commit (before filter-repo)
4. Run `git filter-repo --to-subdirectory-filter server/` on quiclick-server repo
5. Merge server history into quiclick repo with `--allow-unrelated-histories`
6. Remove agent files from both subdirectories (`CLAUDE.md`, `.claude/`, `.pi/`, `AGENTS.md`) — keep `plans/`
7. Remove server's `devenv.nix`, `devenv.yaml`, `devenv.lock`, `.envrc`, `.gitignore` from `server/`
8. Remove extension's `.gitignore` from `extension/`
9. Create root `devenv.nix` with unified Python + Bun config
10. Create root `devenv.yaml`, `.envrc`, `.gitignore`
11. Commit all root-level changes
12. Re-add GitHub remote
13. Verify history, builds, and devenv shell
