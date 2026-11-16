"""The mutation runner's shared temporary folder is this user's alone.

Each run of the tooling's suite keeps its files in a folder inside one folder
with a fixed name in the shared temporary area, and the next start sweeps
that folder. Another user could have made a folder by that name first, or a
link to somewhere else, and then the run would write there and the sweep
would delete there. So the folder is opened without following a link and
checked through what was opened, at the start of a run and in the sweep.
New-plugin-v8 point 4, as garage-door's `own_place` does.
"""

import importlib.util
import os
import pathlib

import pytest

ROOT = pathlib.Path(__file__).parent.parent


@pytest.fixture
def mutate(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("mutate_own_place", ROOT / "scripts/mutate.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "MUTATE_TMP", tmp_path / "mutate-tmp")
    monkeypatch.setattr(module, "RECOVERY", tmp_path / "recovery.json")
    return module


def _mode(place):
    return place.lstat().st_mode & 0o777


def test_a_new_shared_folder_is_made_for_this_user_alone(mutate):
    mutate.own_place(mutate.MUTATE_TMP)
    assert mutate.MUTATE_TMP.is_dir()
    assert _mode(mutate.MUTATE_TMP) == 0o700


def test_a_link_in_place_of_the_shared_folder_stops_the_run(tmp_path, mutate):
    """Followed, the run would write and the sweep delete wherever the link points."""
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir(mode=0o700)
    (elsewhere / "run-someone-else-s").mkdir()
    mutate.MUTATE_TMP.symlink_to(elsewhere)
    with pytest.raises(SystemExit, match="not a folder only you can use") as stopped:
        mutate.sweep()
    assert "rm -rf --" in str(stopped.value)
    assert (elsewhere / "run-someone-else-s").exists()


def test_a_shared_folder_others_can_write_to_stops_the_run(mutate, monkeypatch):
    """They may already have put something in it. Checked as a suite run starts, before it writes there."""
    mutate.MUTATE_TMP.mkdir()
    mutate.MUTATE_TMP.chmod(0o777)
    ran = []
    # A stand-in for the suite: a real one would run this very test again, inside itself.
    monkeypatch.setattr(mutate.subprocess, "run", lambda *a, **_k: ran.append(a))
    with pytest.raises(SystemExit, match="others can write to it"):
        mutate.run_pytest()
    assert ran == [], "the suite ran in a folder others can write to"


def test_a_shared_folder_others_may_only_read_is_closed_to_them(mutate):
    """A folder made by an older runner with mkdir's 0755 keeps working, closed to others."""
    mutate.MUTATE_TMP.mkdir()
    mutate.MUTATE_TMP.chmod(0o755)
    mutate.sweep()
    assert _mode(mutate.MUTATE_TMP) == 0o700


def test_the_shared_folder_the_runs_live_in_is_this_user_s_alone(mutate, monkeypatch):
    """Made by another user first, it is theirs to read and change, so the run stops."""
    mutate.MUTATE_TMP.mkdir(mode=0o700)
    real = os.fstat

    def owned_by_someone_else(fd):
        found = real(fd)
        return os.stat_result(
            (found.st_mode, found.st_ino, found.st_dev, found.st_nlink, found.st_uid + 1, *found[5:])
        )

    monkeypatch.setattr(mutate.os, "fstat", owned_by_someone_else)
    with pytest.raises(SystemExit, match=f"belongs to user {os.getuid() + 1}"):
        mutate.sweep()
