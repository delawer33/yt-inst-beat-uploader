"""Print the OpenAPI schema as JSON without running the server.

    python -m beat_server.openapi > openapi.json

Used by ``web/`` (``npm run api``) to generate the typed client. No file is touched: the app
is built against an in-memory sqlite with migrations skipped.
"""

import json
import sys
from pathlib import Path

from beat_server.app import create_app
from beat_server.db.engine import MEMORY
from beat_server.settings import ServerSettings
from beat_upload.workspace import Workspace


def schema() -> dict:
    ws = Workspace(config_dir=Path("."), data_dir=Path("."))
    app = create_app(ws, ServerSettings(), web_dist=None, db_path=MEMORY, migrate=False)
    return app.openapi()


def main() -> None:
    json.dump(schema(), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
