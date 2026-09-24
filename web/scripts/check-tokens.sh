#!/usr/bin/env bash
# Design rule: colours live only in src/styles/tokens.css; no inline styles anywhere.
# The one exception is a progress fill's percentage width — the Design System's own pattern
# for `.progress > i` and `.rail > i`, which cannot be expressed as a class.
set -u
cd "$(dirname "$0")/.."
hits=$(grep -rnE --include='*.ts' --include='*.tsx' --include='*.css' \
  --exclude='tokens.css' --exclude='schema.d.ts' \
  -e '#[0-9a-fA-F]{3,6}\b' -e 'style=' src \
  | grep -vE 'style=\{\{ (width|height): `\$\{[^`]*\}%` \}\}' || true)
if [ -n "$hits" ]; then
  echo "lint:tokens: hex colours or inline styles outside src/styles/tokens.css:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "lint:tokens: ok"
