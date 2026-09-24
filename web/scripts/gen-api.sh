#!/usr/bin/env bash
# Generate the typed API client from the FastAPI OpenAPI schema, without a running server.
# PYTHON: interpreter with the project installed (default: python). See README.md.
# A relative PYTHON is resolved against the directory you ran this from, before any cd —
# `PYTHON=../.venv/bin/python` from web/ must mean web/../.venv, not the repo's parent.
set -euo pipefail
PYTHON="${PYTHON:-python}"
case "$PYTHON" in
  */*) PYTHON="$(cd "$(dirname "$PYTHON")" && pwd)/$(basename "$PYTHON")" ;;
esac
cd "$(dirname "$0")/.."
out="${1:-src/api/schema.d.ts}"
tmp="$(mktemp --suffix=.json)"
trap 'rm -f "$tmp"' EXIT
(cd .. && "$PYTHON" -m beat_server.openapi) > "$tmp"
npx openapi-typescript "$tmp" -o "$out" >/dev/null
echo "api: wrote $out"
