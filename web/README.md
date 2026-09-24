# web/

Frontend of `beat-upload serve`: Vite + React 19 + TypeScript, TanStack Query, react-router.
Built output (`dist/`) is served by FastAPI at `/`.

```bash
npm install
npm run dev          # http://localhost:5173, proxies /api to the server on 8765
npm run build        # -> dist/, picked up by `beat-upload serve`
npm test             # vitest (run mode)
npm run lint:tokens  # no colours, radii or fonts outside design/ds/
npm run api          # regenerate src/api/schema.d.ts from the server's OpenAPI schema
npm run api:check    # fail if schema.d.ts is stale (CI)
```

`npm run api` does not need a running server: it runs `python -m beat_server.openapi` and
pipes the JSON into `openapi-typescript`. The interpreter comes from the `PYTHON` env var
(default `python`); it must be able to import `beat_server`. A relative path is resolved
against the directory you run from, so this works as written:

```bash
PYTHON=../.venv/bin/python npm run api
# from a git worktree without its own venv:
PYTHONPATH=.. PYTHON=/path/to/.venv/bin/python npm run api
```

## The look

There is no stylesheet here. Every colour, size, font, radius, shadow and component class
comes from the Design System mirror in `../design/ds/`, which `src/main.tsx` links directly
(ADR 0005). `src/styles/globals.css` is the Tailwind entry point and nothing else.

Tailwind is layout glue only — flex, grid, gap, sizing, alignment. `npm run lint:tokens`
fails on a hex colour, an `oklch()` / `rgb()` / `hsl()`, a `style=` prop or any Tailwind
colour / radius / font utility under `src/`. It reads the Design System's own class names
out of `design/ds/styles.css`, so `text-muted` and `tag-accent` pass as the DS classes they
are. The one allowed inline style is a fill's percentage width or height — the DS pattern
for `.progress > i`, `.rail > i` and `.bars > i`, which cannot be a class.

Anything visual that is missing is added to the Design System (`design/ds/styles.css`, its
`readme.md` row and a component-page example) and pushed back to the Claude Design project
in the same task — never written locally.

### The cascade, in one paragraph

`design/ds/styles.css` is imported **unlayered**, while every Tailwind utility lives in
`@layer utilities`. Unlayered CSS beats any layer at any specificity, so a DS class always
wins over a Tailwind utility that sets the same property — silently, with no build error and
no lint hit. `className="beat-grid flex gap-2"` renders as a grid; `className="panel hidden"`
stays visible. Working rule: **a DS class owns every property it sets; Tailwind may only add
properties it does not.**

## Other rules

- API types come only from the generated `src/api/schema.d.ts`, never hand-written.
- `src/features/<domain>/queries.ts` holds that domain's hooks.
