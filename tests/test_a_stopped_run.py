"""A mutation run stopped from outside still puts the source back.

`scripts/mutate.py` switches one rule's line off at a time while the suite
runs. GitHub cancels a job with SIGINT and then SIGTERM, and a closed terminal
sends SIGHUP. Before this, SIGTERM and SIGHUP killed the runner outright,
and its `finally` never ran, so the source stayed switched off. And a SIGTERM
that came during a Ctrl-C's cleanup cut that cleanup short. Ported from
garage-door #41.

Each test runs a real runner in a child process, on a scratch project with
one rule, and sends it a real signal. The suite is a stand-in that waits.
"""

import pathlib
import signal
import subprocess
import sys
import time

import pytest

ROOT = pathlib.Path(__file__).parent.parent

STOPPED_RUN = """
import importlib.util, pathlib, sys, time
root, tmp = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("mutate_stopped", root / "scripts/mutate.py")
mutate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mutate)
mutate.ROOT, mutate.ROWS = tmp / "project", tmp / "mutations"
mutate.RECOVERY, mutate.MUTATE_TMP = tmp / "recovery.json", tmp / "mutate-tmp"
sys.argv = ["mutate.py"]
assert [r["file"] for r in mutate.all_rows()] == ["rule.py"], "would mutate the real tree"

def held(rule_file):
    (tmp / "ready").write_text("")
    time.sleep(60)

mutate.run_suite = held
sys.exit(mutate.main())
"""

SLOW_CLEANUP = """
restore = mutate.restore

def slow_restore(*args):
    (tmp / "cleaning").write_text("")
    time.sleep(2)
    return restore(*args)

mutate.restore = slow_restore
"""


def _project(tmp_path):
    """A scratch project with one rule, `x = 1`, which the row switches to `x = 2`."""
    (tmp_path / "project").mkdir()
    (tmp_path / "project/rule.py").write_text("x = 1\n")
    rows = tmp_path / "mutations/rule.py"
    rows.mkdir(parents=True)
    (rows / "x-is-one.toml").write_text(
        "[[rule]]\nname = \"x is one\"\nfile = \"rule.py\"\nfind = '^x = 1$'\nreplace = 'x = 2'\n"
    )


def _start(tmp_path, script):
    return subprocess.Popen(
        [sys.executable, "-c", script, str(ROOT), str(tmp_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )


def _wait_for(child, place):
    """Until `place` exists or the child has ended; no deadline, as these runs never have one."""
    while not place.exists() and child.poll() is None:
        time.sleep(0.05)
    assert place.exists(), child.communicate()[0]


def _put_back(tmp_path):
    assert (tmp_path / "project/rule.py").read_text() == "x = 1\n"
    assert not (tmp_path / "recovery.json").exists()


@pytest.mark.parametrize("stop", [signal.SIGTERM, signal.SIGHUP], ids=["SIGTERM", "SIGHUP"])
def test_a_stopped_run_cleans_up_as_an_interrupted_one_does(tmp_path, stop):
    """A cancelled CI job or a closed terminal stops the run by signal, and `finally` must still run."""
    _project(tmp_path)
    child = _start(tmp_path, STOPPED_RUN)
    _wait_for(child, tmp_path / "ready")
    assert (tmp_path / "project/rule.py").read_text() == "x = 2\n", "the rule was switched off"
    child.send_signal(stop)
    out, _ = child.communicate()
    assert child.returncode == 128 + stop, out
    _put_back(tmp_path)


def test_a_second_stop_does_not_cut_the_cleanup_short(tmp_path):
    """GitHub cancels with SIGINT, then SIGTERM: the second must not cut the first one's cleanup short."""
    _project(tmp_path)
    child = _start(
        tmp_path, STOPPED_RUN.replace("mutate.run_suite = held\n", "mutate.run_suite = held\n" + SLOW_CLEANUP)
    )
    _wait_for(child, tmp_path / "ready")
    child.send_signal(signal.SIGINT)
    _wait_for(child, tmp_path / "cleaning")
    child.send_signal(signal.SIGTERM)
    out, _ = child.communicate()
    # Ctrl-C ends as Python ends after KeyboardInterrupt: a shell sees 130 either way.
    assert child.returncode in (130, -signal.SIGINT), out
    _put_back(tmp_path)


TESTS = """
import signal

STOPS = (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)
FIRST = {each: signal.getsignal(each) for each in STOPS}


def test_1_changes_them():
    for each in STOPS:
        signal.signal(each, signal.SIG_IGN)


def test_2_finds_them_as_the_run_began():
    assert {each: signal.getsignal(each) for each in STOPS} == FIRST
"""


def test_a_test_finds_the_signal_handlers_the_run_began_with(tmp_path):
    """The runner installs its own handlers; a test running it in-process must not leave them behind.

    Left behind, a later test stops differently, and a rule could be reported killed
    by another test. `tests/conftest.py` puts them back after each test (tv-mcp #84).
    """
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests/conftest.py").write_text((ROOT / "tests/conftest.py").read_text(encoding="utf-8"))
    (tmp_path / "tests/test_scratch.py").write_text(TESTS)
    done = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "--rootdir", str(tmp_path), "tests"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert done.returncode == 0, done.stdout
