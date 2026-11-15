"""The mutation runner's own rules, each with a test named after it.

`scripts/mutate.py` proves every other rule by switching its line off and
watching the test named after it go red. Its own rules are proven the same
way, from rows under `scripts/mutations/scripts/mutate.py/`. That works because the runner has
already loaded its code when it switches a line off, and the suite it starts
loads the switched-off file. Ported from garage-door #36.

None of these runs a real suite: the suite is a stand-in that records what it
was asked to do, so a test here never mutates anything.
"""

import ast
import importlib.util
import pathlib
import subprocess

import pytest

ROOT = pathlib.Path(__file__).parent.parent


@pytest.fixture
def mutate(tmp_path, monkeypatch):
    """The runner, loaded by path, with its temporary folder and recovery file under `tmp_path`."""
    spec = importlib.util.spec_from_file_location("mutate_runner", ROOT / "scripts/mutate.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "MUTATE_TMP", tmp_path / "mutate-tmp")
    monkeypatch.setattr(module, "RECOVERY", tmp_path / "recovery.json")
    return module


def _suite_says(monkeypatch, mutate, stdout, returncode=1):
    """Stand in for the suite: it answers `stdout`, and the arguments it got are kept."""
    asked = {}

    def run(args, **kwargs):
        asked.update(args=args, **kwargs)
        return subprocess.CompletedProcess(args, returncode, stdout, "")

    monkeypatch.setattr(mutate.subprocess, "run", run)
    return asked


def test_a_file_changed_during_the_run_is_never_restored_over(tmp_path, mutate):
    """Someone saved the file while the suite ran: putting the original back would lose their edit."""
    source = tmp_path / "health.ts"
    source.write_text("edited while the suite ran\n")
    assert mutate.restore(source, "original\n", "mutated\n") is False
    assert source.read_text() == "edited while the suite ran\n"


def test_two_mutations_never_share_a_bytecode_cache(monkeypatch, mutate):
    """Two equal-size mutations in one second would otherwise import the last one's bytecode."""
    # Unset here, so the runner has to set it itself: a mutation run sets it for the suite it starts.
    monkeypatch.delenv("PYTHONDONTWRITEBYTECODE", raising=False)
    asked = _suite_says(monkeypatch, mutate, "1 passed\n", returncode=0)
    mutate.run_pytest()
    assert asked["env"]["PYTHONDONTWRITEBYTECODE"] == "1"


def test_a_coloured_failure_line_is_still_attributed(monkeypatch, mutate):
    """With colour on, FAILED is wrapped in codes, and a kill must still name its test."""
    coloured = (
        "\x1b[31mFAILED\x1b[0m tests/test_ratchet.py::test_a_worse_level_fails - assert\n"
        "\x1b[31m1 failed\x1b[0m\n"
    )
    _suite_says(monkeypatch, mutate, coloured)
    assert mutate.run_pytest() == (1, ["test_a_worse_level_fails"])


@pytest.mark.parametrize("table", ["missing", "empty"])
def test_no_rows_to_check_is_a_failure_not_a_pass(tmp_path, monkeypatch, capsys, mutate, table):
    """A table emptied or lost by mistake would leave every rule unproven while the run stayed green."""
    rows = tmp_path / "mutations"
    if table == "comments only":
        (rows / "src/states.ts").mkdir(parents=True)
        (rows / "README.md").write_text("no rows yet\n")
    monkeypatch.setattr(mutate, "ROOT", tmp_path)
    monkeypatch.setattr(mutate, "ROWS", rows)
    monkeypatch.setattr("sys.argv", ["mutate.py"])
    assert mutate.main() == 1
    said = capsys.readouterr().out
    assert "nothing to switch off" in said
    assert "git checkout origin/main -- scripts/mutations" in said


#: The function a killed run repairs with. A rule there would be switched off while it repairs.
UNPROVABLE = "repair"


def _inside_repair(text, rows, mutate):
    """The rules marked, or switched off by a row, in `repair()` or any function of `text` it calls."""
    functions = {f.name: f for f in ast.parse(text).body if isinstance(f, ast.FunctionDef)}
    missing = f"no {UNPROVABLE}() in the runner; if it was renamed, rename UNPROVABLE too"
    assert UNPROVABLE in functions, missing
    reached, waiting = set(), [UNPROVABLE]
    while waiting:  # repair() and everything it calls, however deep, within this file
        name = waiting.pop()
        reached.add(name)
        nodes = ast.walk(functions[name])
        calls = [c for c in nodes if isinstance(c, ast.Call) and isinstance(c.func, ast.Name)]
        waiting += [c.func.id for c in calls if c.func.id in functions and c.func.id not in reached]
    lines = text.splitlines()
    inside = {i for name in reached for i in range(functions[name].lineno - 1, functions[name].end_lineno)}
    marked = [lines[i].split("# RULE:")[1].strip() for i in sorted(inside) if "# RULE:" in lines[i]]
    rowed = [
        r["name"] for r in rows if mutate.line_of(text, r["find"], int(r.get("occurrence", 1))) in inside
    ]
    return sorted(set(marked + rowed))


REPAIR_WITH_A_RULE = '''
def write(kept):
    # RULE: a repaired file is written whole
    path.write_text(kept)


def repair():
    """Put back a file a killed run left mutated."""
    # RULE: a repaired file is the original
    if kept:
        write(kept)


def sweep():
    # RULE: a swept folder is gone
    remove()
'''


def test_a_rule_inside_repair_or_what_it_calls_is_found(mutate):
    """The guard below is only worth something if it sees a rule where one has been put."""
    rows = [
        {"name": "a swept folder is gone", "find": r"^\s*remove\(\)$"},
        {"name": "kept", "find": r"if kept:"},
    ]
    found = _inside_repair(REPAIR_WITH_A_RULE, rows, mutate)
    assert found == ["a repaired file is the original", "a repaired file is written whole", "kept"]


def test_no_rule_lives_inside_repair(mutate):
    """A killed run repairs with the code it left switched off, so a rule in repair() cannot be proven."""
    text = (ROOT / "scripts/mutate.py").read_text(encoding="utf-8")
    rows = [r for r in mutate.all_rows() if r["file"] == "scripts/mutate.py"]
    assert rows, "the runner's own rows are missing"
    assert _inside_repair(text, rows, mutate) == []
