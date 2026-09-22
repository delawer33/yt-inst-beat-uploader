import sys
from pathlib import Path

from beat_upload import service

TEMPLATE = Path(__file__).resolve().parent.parent / "deploy" / "beat-upload.service"


def test_unit_text_has_required_directives() -> None:
    text = service.unit_text("/opt/venv/bin/beat-upload serve --port 8765")
    assert "[Unit]" in text and "[Service]" in text and "[Install]" in text
    assert "Description=beat-upload web server" in text
    assert "After=network-online.target" in text
    assert "ExecStart=/opt/venv/bin/beat-upload serve --port 8765" in text
    assert "Restart=on-failure" in text
    assert "RestartSec=5" in text
    assert "WantedBy=default.target" in text


def test_unit_text_custom_description() -> None:
    assert "Description=custom" in service.unit_text("x", description="custom")


def test_unit_text_matches_deploy_template() -> None:
    """The documentation copy in deploy/ carries the same directives as the generated unit."""
    template = [
        line
        for line in TEMPLATE.read_text(encoding="utf-8").splitlines()
        if not line.startswith("#")
    ]
    generated = service.unit_text("<venv>/bin/beat-upload serve --port <port>").splitlines()
    assert [line for line in template if line] == [line for line in generated if line]


def test_service_path(tmp_path: Path) -> None:
    assert service.service_path(tmp_path) == (
        tmp_path / ".config" / "systemd" / "user" / "beat-upload.service"
    )


def test_install_service_writes_unit(tmp_path: Path) -> None:
    path = service.install_service(tmp_path, "/opt/venv/bin/beat-upload serve --port 9000")
    assert path == service.service_path(tmp_path)
    assert path.is_file()
    assert "ExecStart=/opt/venv/bin/beat-upload serve --port 9000" in path.read_text(
        encoding="utf-8"
    )


def test_install_service_overwrites(tmp_path: Path) -> None:
    service.install_service(tmp_path, "old serve --port 1")
    path = service.install_service(tmp_path, "new serve --port 2")
    assert "old" not in path.read_text(encoding="utf-8")


def test_current_exec_start_points_next_to_interpreter() -> None:
    exec_start = service.current_exec_start(8765)
    executable, *args = exec_start.split(" ")
    assert Path(executable).parent == Path(sys.executable).resolve().parent
    assert Path(executable).name == "beat-upload"
    assert args == ["serve", "--port", "8765"]


def test_enable_commands() -> None:
    commands = service.enable_commands("alice")
    assert commands[0] == "systemctl --user daemon-reload"
    assert commands[1] == "systemctl --user enable --now beat-upload"
    assert commands[2] == "loginctl enable-linger alice"
