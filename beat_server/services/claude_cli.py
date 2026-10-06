"""The runner Fill from title uses: the owner's own ``claude`` CLI (ADR 0006).

``run_claude(prompt, schema)`` runs ``claude -p`` with structured output and returns the
answer as a dict. Every way it can fail (not installed, not logged in, too slow, an answer
that is not JSON) is one ``FillError`` whose message says what to fix on the machine.

No tools, no session saved, none of the user's settings, hooks or MCP servers: the model
only writes text. The service unit does not carry the login shell's ``PATH``, so the binary
is also looked for in ``~/.local/bin``, where the installer puts it.
"""

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from beat_server.services.errors import FillError

# Measured on the owner's Template: sonnet answers in ~13 s with the neighbouring keywords,
# haiku took ~60 s and left them out.
MODEL = "sonnet"
TIMEOUT_SECONDS = 60
NOT_LOGGED_IN = "Not logged in"


def find_claude() -> Path | None:
    on_path = shutil.which("claude")
    if on_path is not None:
        return Path(on_path)
    local = Path.home() / ".local" / "bin" / "claude"
    return local if local.is_file() else None


def run_claude(prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
    binary = find_claude()
    if binary is None:
        raise FillError(
            "The `claude` command is not installed for this user, so Fill from title cannot "
            "run. Install Claude Code and log in with `claude` in a terminal."
        )
    args = [
        str(binary),
        "-p",
        "--output-format",
        "json",
        "--json-schema",
        json.dumps(schema),
        "--model",
        MODEL,
        "--tools",
        "",
        "--setting-sources",
        "",
        "--strict-mcp-config",
        "--no-session-persistence",
    ]
    try:
        done = subprocess.run(
            args,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            cwd=tempfile.gettempdir(),
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise FillError(
            f"`claude` did not answer within {TIMEOUT_SECONDS} seconds. Try again in a minute."
        ) from None
    except OSError as e:
        raise FillError(f"`claude` could not be started: {e}.") from None
    return _answer(done)


def _answer(done: subprocess.CompletedProcess[str]) -> dict[str, Any]:
    try:
        body = json.loads(done.stdout)
    except ValueError:
        said = (done.stdout or done.stderr).strip()[:300] or f"exit code {done.returncode}"
        raise FillError(f"`claude` answered something that is not JSON: {said}") from None
    if not isinstance(body, dict):
        raise FillError("`claude` answered something that is not a result.")
    text = str(body.get("result", "")).strip()
    if body.get("is_error"):
        if text.startswith(NOT_LOGGED_IN):
            raise FillError(
                "`claude` is not logged in for this user. Run `claude` in a terminal, "
                "log in with /login, then fill again."
            )
        raise FillError(f"`claude` failed: {text or 'no message'}")
    answer = body.get("structured_output")
    if not isinstance(answer, dict):
        raise FillError("`claude` came back with no structured answer. Try again.")
    return answer
