from pathlib import Path

import pytest
from platformdirs import user_config_dir, user_data_dir

from beat_upload import auth
from beat_upload.errors import AuthError
from beat_upload.workspace import Workspace


def test_default_uses_platformdirs() -> None:
    ws = Workspace.default()
    assert ws.config_dir == Path(user_config_dir("beat-upload"))
    assert ws.data_dir == Path(user_data_dir("beat-upload"))


def test_paths_derive_from_dirs(tmp_path: Path) -> None:
    ws = Workspace(config_dir=tmp_path / "cfg", data_dir=tmp_path / "data")
    assert ws.token_file == tmp_path / "cfg" / "token.json"
    assert ws.secrets_file == tmp_path / "cfg" / "client_secrets.json"
    assert ws.db_file.parent == tmp_path / "data"
    assert ws.beat_dir("abc") == tmp_path / "data" / "beats" / "abc"


def test_constructing_creates_nothing(tmp_path: Path) -> None:
    ws = Workspace(config_dir=tmp_path / "cfg", data_dir=tmp_path / "data")
    _ = ws.token_file, ws.db_file, ws.beat_dir("x")
    assert not ws.config_dir.exists()
    assert not ws.data_dir.exists()


def test_missing_token_raises_auth_error(tmp_path: Path) -> None:
    ws = Workspace(config_dir=tmp_path / "cfg", data_dir=tmp_path / "data")
    with pytest.raises(AuthError, match="Not logged in"):
        auth.get_valid_credentials(ws)


def test_save_client_secrets_creates_config_dir(tmp_path: Path) -> None:
    ws = Workspace(config_dir=tmp_path / "cfg", data_dir=tmp_path / "data")
    auth.save_client_secrets(ws, "id", "secret")
    assert ws.secrets_file.is_file()
    assert '"client_id": "id"' in ws.secrets_file.read_text()


def test_login_without_secrets_raises(tmp_path: Path) -> None:
    ws = Workspace(config_dir=tmp_path / "cfg", data_dir=tmp_path / "data")
    with pytest.raises(AuthError, match="Client secrets not found"):
        auth.run_login_flow(ws)
