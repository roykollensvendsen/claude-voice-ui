"""A test run must leave the mutation runner's real recovery file as it found it.

`scripts/mutate.py` keeps the file it is mutating in
`scripts/.mutate-recovery.json` while the suite runs, so a killed run can be
repaired. A test that ran the runner without pointing `RECOVERY` at its own
temporary file would write or remove that real file. In the middle of a
mutation run, that loses the original. `tests/conftest.py` fails the whole run
when it happens; these tests copy it into a scratch project and prove it there.
Ported from garage-door #40.
"""

import pathlib
import subprocess
import sys

import pytest

ROOT = pathlib.Path(__file__).parent.parent
REAL = "scripts/.mutate-recovery.json"

WRITES = f"def test_it(): __import__('pathlib').Path({REAL!r}).write_text('{{}}')\n"
REMOVES = f"def test_it(): __import__('pathlib').Path({REAL!r}).unlink()\n"
LEAVES = "def test_it(): pass\n"


def _run(tmp_path, test, *, there_before):
    """Run `test` in a scratch project guarded by this repository's conftest."""
    (tmp_path / "tests").mkdir()
    (tmp_path / "scripts").mkdir()
    conftest = ROOT / "tests/conftest.py"
    if conftest.is_file():
        (tmp_path / "tests/conftest.py").write_text(conftest.read_text(encoding="utf-8"))
    (tmp_path / "tests/test_scratch.py").write_text(test)
    if there_before:
        (tmp_path / REAL).write_text('{"file": "kept"}')
    return subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "--rootdir", str(tmp_path), "tests"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )


@pytest.mark.parametrize(
    ("test", "there_before"),
    [(WRITES, False), (REMOVES, True), (WRITES, True)],
    ids=["writes it", "removes it", "overwrites it"],
)
def test_a_test_that_changes_the_real_recovery_file_fails_the_run(tmp_path, test, there_before):
    result = _run(tmp_path, test, there_before=there_before)
    assert result.returncode != 0
    assert "real recovery file" in result.stdout


@pytest.mark.parametrize("there_before", [False, True], ids=["absent", "there all along"])
def test_a_test_that_leaves_the_real_recovery_file_alone_passes(tmp_path, there_before):
    """During a mutation run the file is there all along, and the suite it starts must still pass."""
    assert _run(tmp_path, LEAVES, there_before=there_before).returncode == 0
