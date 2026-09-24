#!/usr/bin/env bash
# Design rule: colours live only in src/styles/tokens.css; no inline styles anywhere.
# The one exception is a progress fill's percentage width — the Design System's own pattern
# for `.progress > i` and `.rail > i`, which cannot be expressed as a class.
#
# The exception is cut out of the source before the check, not the line it sits on: anything
# else on that line is still linted, and the pattern survives whatever spacing (or multi-line
# rewrap) Prettier picks. python3 is already a dev dependency here — see `npm run api`.
set -u
cd "$(dirname "$0")/.."
hits=$(
  python3 - <<'PY'
import pathlib
import re

# The allowed inline style: a percentage width/height, spaced or wrapped however.
EXCEPTION = re.compile(r"style=\{\{\s*(?:width|height):\s*`\$\{[^`]*\}%`\s*,?\s*\}\}")
BANNED = re.compile(r"#[0-9a-fA-F]{3,6}\b|style=")
SUFFIXES = {".ts", ".tsx", ".css"}
SKIP = {"tokens.css", "schema.d.ts"}

for path in sorted(pathlib.Path("src").rglob("*")):
    if path.suffix not in SUFFIXES or path.name in SKIP:
        continue
    # Blank the exception, keeping its newlines so line numbers stay true.
    text = EXCEPTION.sub(lambda m: "\n" * m.group().count("\n"), path.read_text())
    for number, line in enumerate(text.splitlines(), 1):
        if BANNED.search(line):
            print(f"{path}:{number}:{line}")
PY
)
if [ -n "$hits" ]; then
  echo "lint:tokens: hex colours or inline styles outside src/styles/tokens.css:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "lint:tokens: ok"
