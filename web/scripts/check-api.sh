#!/usr/bin/env bash
# Fail when src/api/schema.d.ts is stale relative to the server's OpenAPI schema.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp --suffix=.d.ts)"
trap 'rm -f "$tmp"' EXIT
bash scripts/gen-api.sh "$tmp" >/dev/null
if ! diff -u src/api/schema.d.ts "$tmp"; then
  echo "api:check: src/api/schema.d.ts is stale; run 'npm run api' and commit" >&2
  exit 1
fi
echo "api:check: up to date"
