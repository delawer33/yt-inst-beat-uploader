#!/usr/bin/env bash
# ADR 0005: the look comes only from the Design System. Nothing under web/src/ may carry a
# colour, a radius or type of its own — no hex, no oklch()/rgb()/hsl(), no inline style, and
# no Tailwind colour / radius / font utility. Tailwind stays for layout glue: flex, grid,
# gap, sizing, alignment.
#
# The Design System's own class names are read out of design/ds/styles.css and allowed, so
# `.text-muted`, `.text-accent` and `.tag-accent` — DS classes that merely look like Tailwind
# utilities — pass, and stay in step with the sheet automatically.
#
# The one allowed inline style is a fill's percentage width/height — the Design System's own
# pattern for `.progress > i`, `.rail > i` and `.bars > i`, which cannot be a class. It is cut
# out of the source before the check, not the line it sits on: a hex colour sharing that line
# still fails, and the pattern survives whatever spacing (or rewrap) Prettier picks.
#
# python3 is already a dev dependency here — see `npm run api`.
set -u
cd "$(dirname "$0")/.."
hits=$(
  python3 - <<'PY'
import pathlib
import re

DS_SHEET = pathlib.Path("../design/ds/styles.css")
DS_CLASSES = set(re.findall(r"\.(-?[A-Za-z_][\w-]*)", DS_SHEET.read_text()))

# The allowed inline style: a percentage width/height, spaced or wrapped however.
EXCEPTION = re.compile(r"style=\{\{\s*(?:width|height):\s*`\$\{[^`]*\}%`\s*,?\s*\}\}")
# Comments are prose, not markup: "already rounded." is not a radius utility.
COMMENT = re.compile(r"(?<!:)//[^\n]*|/\*.*?\*/", re.S)

# A literal colour or an inline style, anywhere.
LITERAL = re.compile(r"#[0-9a-fA-F]{3,8}\b|\b(?:oklch|rgba?|hsla?)\(|style=")

# Tailwind families that can only ever set colour, radius, shadow or type.
UTILITY = re.compile(r"(?<![-\w])(bg|ring|shadow|outline|fill|stroke|divide|caret|"
                     r"placeholder|accent|decoration|leading|tracking|border|font|text|"
                     r"rounded)(-[A-Za-z0-9][\w.%/\[\]#-]*)?")
# Bare, these are still utilities: `class="border"`, `class="rounded"`, `class="shadow"`.
BARE_BANNED = {"border", "rounded", "shadow"}
# `text-*` that positions or wraps text rather than colouring or sizing it.
TEXT_LAYOUT = {"left", "center", "right", "justify", "start", "end",
               "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip"}

SUFFIXES = {".ts", ".tsx", ".css"}
SKIP = {"schema.d.ts"}


def banned(match: re.Match[str]) -> bool:
    whole, head, tail = match.group(0), match.group(1), match.group(2)
    if whole in DS_CLASSES:  # a Design System class that merely looks like a utility
        return False
    if tail is None:
        return head in BARE_BANNED
    if head == "text" and tail[1:] in TEXT_LAYOUT:
        return False
    return True


for path in sorted(pathlib.Path("src").rglob("*")):
    if path.suffix not in SUFFIXES or path.name in SKIP:
        continue
    # Blank the exception and the comments, keeping newlines so line numbers stay true.
    text = path.read_text()
    for pattern in (EXCEPTION, COMMENT):
        text = pattern.sub(lambda m: "\n" * m.group().count("\n"), text)
    for number, line in enumerate(text.splitlines(), 1):
        why = []
        if LITERAL.search(line):
            why.append("literal colour or inline style")
        if any(banned(m) for m in UTILITY.finditer(line)):
            why.append("colour / radius / font utility")
        if why:
            print(f"src/{path.relative_to('src')}:{number}: {', '.join(why)}")
PY
)
if [ -n "$hits" ]; then
  {
    echo "lint:tokens: the look must come from design/ds/ only (ADR 0005):"
    echo "$hits"
  } >&2
  exit 1
fi
echo "lint:tokens: ok"
