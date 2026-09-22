"""ADR 0002: the core package never imports the server.

``beat_upload/cli.py`` is not core: it is one of the two consumers (CLI, server) the ADR
names, and ``beat-upload serve`` has to import the server lazily. Every other module is
checked.
"""

import re
from pathlib import Path

CORE = Path(__file__).resolve().parent.parent / "beat_upload"
CONSUMERS = {"cli.py"}
FORBIDDEN = re.compile(r"^\s*(from|import)\s+beat_server\b", re.MULTILINE)


def test_core_does_not_import_server() -> None:
    offenders = [
        str(p.relative_to(CORE.parent))
        for p in sorted(CORE.rglob("*.py"))
        if p.name not in CONSUMERS and FORBIDDEN.search(p.read_text(encoding="utf-8"))
    ]
    assert offenders == []


def test_cli_imports_server_only_lazily() -> None:
    source = (CORE / "cli.py").read_text(encoding="utf-8")
    top_level = re.compile(r"^(from|import)\s+beat_server\b", re.MULTILINE)
    assert not top_level.search(source)
