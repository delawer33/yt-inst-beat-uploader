# web/

Frontend of `beat-upload serve`: Vite + React 19 + TypeScript, Tailwind v4 + shadcn/ui,
TanStack Query, react-router. Built output (`dist/`) is served by FastAPI at `/`.

```bash
npm install
npm run dev          # http://localhost:5173, proxies /api to the server on 8765
npm run build        # -> dist/, picked up by `beat-upload serve`
npm test             # vitest (run mode)
npm run lint:tokens  # no hex colours / inline styles outside src/styles/tokens.css
npm run api          # regenerate src/api/schema.d.ts from the server's OpenAPI schema
npm run api:check    # fail if schema.d.ts is stale (CI)
```

`npm run api` does not need a running server: it runs `python -m beat_server.openapi` and
pipes the JSON into `openapi-typescript`. The interpreter comes from the `PYTHON` env var
(default `python`); it must be able to import `beat_server`, e.g.

```bash
PYTHON=../.venv/bin/python npm run api
# from a git worktree without its own venv:
PYTHONPATH=.. PYTHON=/path/to/.venv/bin/python npm run api
```

Rules: colours, radii and fonts exist only as CSS variables in `src/styles/tokens.css`
(`globals.css` binds them to Tailwind utilities); no `style=` props; API types come only
from the generated `schema.d.ts`, never hand-written.
