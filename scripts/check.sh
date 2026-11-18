#!/usr/bin/env bash
# Single pass/fail entrypoint: client tests, server tests, build. Offline, no secrets, no evals.
set -euo pipefail
cd "$(dirname "$0")/.."

CI=true npx react-scripts test --watchAll=false

# Server tests start their own throwaway Postgres (pgserver); nothing to install.
(cd server && PATH="$HOME/.local/bin:$PATH" uv run --frozen pytest -q)

# BUILD_PATH keeps this out of the tracked build/ dir (committed for GitHub Pages).
tmp_build="$(mktemp -d)"
trap 'rm -rf "$tmp_build"' EXIT
# CI=true makes lint warnings fail the build, same as the Render deploy.
CI=true BUILD_PATH="$tmp_build" npx react-scripts build >/dev/null
