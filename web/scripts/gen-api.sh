#!/usr/bin/env bash
# Generate the typed API client from the FastAPI OpenAPI schema, without a running server.
# PYTHON: interpreter with the project installed (default: python). See README.md.
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-src/api/schema.d.ts}"
PYTHON="${PYTHON:-python}"
tmp="$(mktemp --suffix=.json)"
trap 'rm -f "$tmp"' EXIT
(cd .. && "$PYTHON" -m beat_server.openapi) > "$tmp"
npx openapi-typescript "$tmp" -o "$out" >/dev/null
echo "api: wrote $out"
