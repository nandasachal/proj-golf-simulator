#!/usr/bin/env bash
# Single pass/fail entrypoint: tests + build. Offline, no secrets, no evals.
set -euo pipefail
cd "$(dirname "$0")/.."

CI=true npx react-scripts test --watchAll=false

# BUILD_PATH keeps this out of the tracked build/ dir (committed for GitHub Pages).
tmp_build="$(mktemp -d)"
trap 'rm -rf "$tmp_build"' EXIT
BUILD_PATH="$tmp_build" npx react-scripts build >/dev/null
