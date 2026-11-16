"""Two guards for the mutation runner, around every test run.

- The whole run fails if a test changed the runner's real recovery file.
  `scripts/mutate.py` keeps the file it is mutating there while the suite runs.
  A test that ran the runner without its own `RECOVERY` would overwrite or
  remove it, and in the middle of a mutation run the original would be lost.
  Proven by `tests/test_real_recovery_file_is_guarded.py`.
- Each test finds the signal handlers as the run began, since the runner
  installs its own. Proven by `tests/test_a_stopped_run.py`.
"""

import pathlib
import signal
from collections.abc import Iterator

import pytest

ROOT = pathlib.Path(__file__).parent.parent
RECOVERY = ROOT / "scripts/.mutate-recovery.json"
BEFORE = pytest.StashKey[bytes | None]()


def _now() -> bytes | None:
    return RECOVERY.read_bytes() if RECOVERY.is_file() else None


def pytest_sessionstart(session: pytest.Session) -> None:
    session.config.stash[BEFORE] = _now()


def pytest_sessionfinish(session: pytest.Session) -> None:
    if _now() != session.config.stash[BEFORE]:
        sys_out = (
            "\nA test changed scripts/.mutate-recovery.json, the mutation runner's real recovery file. "
            "A test that runs scripts/mutate.py must point RECOVERY at its own temporary file.\n"
        )
        session.config.get_terminal_writer().write(sys_out)
        session.exitstatus = pytest.ExitCode.TESTS_FAILED


STOPS = (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)


@pytest.fixture(autouse=True)
def _signal_handlers_as_the_run_began() -> Iterator[None]:
    """Put back SIGINT, SIGTERM and SIGHUP after each test, as the runner installs its own.

    Left behind, a later test stops differently, and the rule check could report a
    rule killed by another test. Proven by `tests/test_a_stopped_run.py`.
    """
    began = {each: signal.getsignal(each) for each in STOPS}
    yield
    for each, handler in began.items():
        signal.signal(each, handler)
