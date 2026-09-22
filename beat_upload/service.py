"""systemd user unit for running ``beat-upload serve`` permanently.

Pure helpers: they build the unit text and write it under a given home directory.
Nothing here calls ``systemctl``; the user enables the unit with the commands the CLI prints.
The template in ``deploy/beat-upload.service`` documents the same unit with placeholders.
"""

import sys
from pathlib import Path

UNIT_NAME = "beat-upload"
DEFAULT_DESCRIPTION = "beat-upload web server"
_UNIT_TEMPLATE = """\
[Unit]
Description={description}
After=network-online.target

[Service]
ExecStart={exec_start}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
"""


def unit_text(exec_start: str, description: str = DEFAULT_DESCRIPTION) -> str:
    """Return the full text of the systemd unit."""
    return _UNIT_TEMPLATE.format(description=description, exec_start=exec_start)


def service_path(home: Path) -> Path:
    """Where systemd looks for user units: ``~/.config/systemd/user/beat-upload.service``."""
    return home / ".config" / "systemd" / "user" / f"{UNIT_NAME}.service"


def install_service(home: Path, exec_start: str) -> Path:
    """Write the unit under ``home`` (creating directories) and return its path."""
    path = service_path(home)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(unit_text(exec_start), encoding="utf-8")
    return path


def current_exec_start(port: int) -> str:
    """``ExecStart`` for the ``beat-upload`` executable of the running venv (``sys.prefix``)."""
    executable = Path(sys.prefix) / "bin" / UNIT_NAME
    return f"{executable} serve --port {port}"


def enable_commands(user: str = "$USER") -> list[str]:
    """Shell commands that activate the installed unit, in order."""
    return [
        "systemctl --user daemon-reload",
        f"systemctl --user enable --now {UNIT_NAME}",
        f"loginctl enable-linger {user}",
    ]
