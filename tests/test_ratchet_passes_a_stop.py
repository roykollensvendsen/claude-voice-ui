"""A stopped quality ratchet lets the step it started put back what it changed.

The ratchet runs `scripts/mutate.py` as a child, through `uv run`, and a
mutation run holds a source file with a rule switched off. GitHub cancels a
job with signals to the ratchet, and a terminal's Ctrl-C goes to the
ratchet's whole process group. Before this, the ratchet died at once and the
step was never told, or killed it after a quarter of a second. Either way,
the line stayed off until the next run repaired it.

Now the step runs in a session of its own. On a stop, the ratchet sends it
one Ctrl-C, to the step alone, and waits with no time limit. To the step
alone matters: `uv run` passes a Ctrl-C on to its own child, so one sent to
uv's whole group would reach the Python under it twice. A second Ctrl-C cuts
pytest's cleanup short. New-plugin-v8 point 8, after garage-door #42 and
dreame-mcp #45.
"""

import contextlib
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import time

import pytest

ROOT = pathlib.Path(__file__).parent.parent

#: Stands in for the ratchet: its own stop handling, then one step, started as the ratchet starts its own.
RATCHET = """
import importlib.util, pathlib, sys
path = pathlib.Path(sys.argv[1]) / "scripts/ratchet.py"
spec = importlib.util.spec_from_file_location("ratchet_stopped", path)
ratchet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ratchet)
getattr(ratchet, "stop_cleanly", lambda: None)()  # a ratchet without one stops as Python does
ratchet._run(*sys.argv[4:], "-c", sys.argv[3], sys.argv[2])
"""

#: Stands in for the mutation run. It counts every Ctrl-C it gets, and puts its line
#: back after the first; any second one would arrive while it does.
STEP = """
import os, pathlib, signal, sys, time
tmp = pathlib.Path(sys.argv[1])

def count(signum, frame):
    with (tmp / "got-int").open("a") as got:
        got.write("INT\\n")

signal.signal(signal.SIGINT, count)
(tmp / "step.pid").write_text(str(os.getpid()))
(tmp / "ready").write_text("")
give_up = time.monotonic() + 30  # a step never told gives up, leaving no put-back: the test then fails
while not (tmp / "got-int").exists():
    if time.monotonic() > give_up:
        sys.exit(1)
    time.sleep(0.05)
time.sleep(1)  # putting the line back takes a moment: the ratchet waits, and a second Ctrl-C lands here
(tmp / "put-back").write_text("")
"""

STRAIGHT = (sys.executable,)
THROUGH_UV = ("uv", "run", "--no-project", "python")


def _stop_while_the_step_runs(tmp_path, send, starts=STRAIGHT):
    """Start the stand-in ratchet in a group of its own, as a terminal would, and stop it with `send`."""
    ratchet = subprocess.Popen(
        [sys.executable, "-c", RATCHET, str(ROOT), str(tmp_path), STEP, *starts],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )
    try:
        while not (tmp_path / "ready").exists() and ratchet.poll() is None:
            time.sleep(0.05)
        assert (tmp_path / "ready").exists(), ratchet.communicate()[0]
        send(ratchet)
        out, _ = ratchet.communicate()
        return ratchet.returncode, out
    finally:
        if ratchet.poll() is None:
            ratchet.kill()
        if (tmp_path / "step.pid").exists():
            with contextlib.suppress(ProcessLookupError):
                os.kill(int((tmp_path / "step.pid").read_text()), signal.SIGKILL)


def _told_once_and_put_back(tmp_path, out):
    assert (tmp_path / "put-back").exists(), out
    assert (tmp_path / "got-int").read_text() == "INT\n", "the step was told more than once"


@pytest.mark.parametrize("stop", [signal.SIGINT, signal.SIGTERM, signal.SIGHUP], ids=["INT", "TERM", "HUP"])
def test_a_stopped_measurement_lets_its_step_put_back_what_it_changed(tmp_path, stop):
    """A cancelled job signals the ratchet alone; the step must still be told, and waited for."""
    code, out = _stop_while_the_step_runs(tmp_path, lambda ratchet: ratchet.send_signal(stop))
    assert code != 0, out
    _told_once_and_put_back(tmp_path, out)


def test_a_ctrl_c_in_the_terminal_reaches_the_step_once(tmp_path):
    """A terminal sends Ctrl-C to the whole group; a step in that group would get it twice."""
    code, out = _stop_while_the_step_runs(tmp_path, lambda ratchet: os.killpg(ratchet.pid, signal.SIGINT))
    assert code != 0, out
    _told_once_and_put_back(tmp_path, out)


@pytest.mark.skipif(shutil.which("uv") is None, reason="needs uv, as the ratchet's own steps do")
@pytest.mark.parametrize("stop", ["ctrl-c", "cancel"])
def test_a_stop_reaches_the_python_under_uv_once(tmp_path, stop):
    """The ratchet starts its steps through `uv run`, and uv passes a Ctrl-C on to its own child."""

    def send(ratchet):
        if stop == "ctrl-c":
            os.killpg(ratchet.pid, signal.SIGINT)  # a terminal's Ctrl-C, to the ratchet's group
        else:
            ratchet.send_signal(signal.SIGTERM)  # a cancelled job, to the ratchet alone

    code, out = _stop_while_the_step_runs(tmp_path, send, THROUGH_UV)
    assert code != 0, out
    _told_once_and_put_back(tmp_path, out)
