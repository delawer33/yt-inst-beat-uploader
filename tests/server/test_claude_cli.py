"""The ``claude`` CLI runner with ``subprocess.run`` faked: every failure is one message."""

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

from beat_server.services import claude_cli
from beat_server.services.claude_cli import run_claude
from beat_server.services.errors import FillError

SCHEMA = {"type": "object"}


def fake_run(
    monkeypatch: pytest.MonkeyPatch, *, stdout: str = "", returncode: int = 0
) -> list[tuple[list[str], str]]:
    calls: list[tuple[list[str], str]] = []

    def run(args: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append((args, kwargs["input"]))
        assert kwargs["timeout"] == claude_cli.TIMEOUT_SECONDS
        return subprocess.CompletedProcess(args, returncode, stdout=stdout, stderr="")

    monkeypatch.setattr(claude_cli, "find_claude", lambda: Path("/bin/claude"))
    monkeypatch.setattr(claude_cli.subprocess, "run", run)
    return calls


def result(**fields: Any) -> str:
    return json.dumps({"type": "result", "is_error": False} | fields)


def test_a_good_answer_is_the_structured_output(monkeypatch: pytest.MonkeyPatch) -> None:
    answer = {"description": "d", "tags": ["t"]}
    calls = fake_run(monkeypatch, stdout=result(structured_output=answer))

    assert run_claude("the prompt", SCHEMA) == answer
    ((args, stdin),) = calls
    assert args[0] == "/bin/claude"
    assert args[args.index("--json-schema") + 1] == json.dumps(SCHEMA)
    assert args[args.index("--model") + 1] == claude_cli.MODEL
    assert stdin == "the prompt"


def test_not_installed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(claude_cli, "find_claude", lambda: None)
    with pytest.raises(FillError, match="not installed"):
        run_claude("p", SCHEMA)


def test_not_logged_in(monkeypatch: pytest.MonkeyPatch) -> None:
    stdout = result(is_error=True, result="Not logged in · Please run /login")
    fake_run(monkeypatch, stdout=stdout, returncode=1)
    with pytest.raises(FillError, match="not logged in"):
        run_claude("p", SCHEMA)


def test_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_run(monkeypatch)

    def slow(args: list[str], **kwargs: Any) -> None:
        raise subprocess.TimeoutExpired(args, kwargs["timeout"])

    monkeypatch.setattr(claude_cli.subprocess, "run", slow)
    with pytest.raises(FillError, match="did not answer within 60 seconds"):
        run_claude("p", SCHEMA)


def test_bad_json(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_run(monkeypatch, stdout="Error: something broke", returncode=1)
    with pytest.raises(FillError, match="something broke"):
        run_claude("p", SCHEMA)


def test_an_error_result_carries_its_text(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_run(monkeypatch, stdout=result(is_error=True, result="API Error: 529 Overloaded"))
    with pytest.raises(FillError, match="529 Overloaded"):
        run_claude("p", SCHEMA)


def test_no_structured_output(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_run(monkeypatch, stdout=result(result="plain text"))
    with pytest.raises(FillError, match="no structured answer"):
        run_claude("p", SCHEMA)


def test_find_claude_falls_back_to_the_users_local_bin(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    local = tmp_path / ".local" / "bin" / "claude"
    local.parent.mkdir(parents=True)
    local.write_text("#!/bin/sh\n")
    local.chmod(0o755)
    monkeypatch.setattr(claude_cli.shutil, "which", lambda name: None)
    monkeypatch.setattr(claude_cli.Path, "home", lambda: tmp_path)

    assert claude_cli.find_claude() == local
