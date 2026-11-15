"""Every rule this project enforces has evidence, and the evidence names it.

A rule here is one line of source marked ``# RULE: what it says``, in the
page's code (``src/``) or in the project's own tools (``scripts/``). Three things
have to be true of each, and none of them is true by writing the rule:

* it has a row, in a file of its own under ``scripts/mutations/``, so
  something switches it off;
* a test carries the rule's own words as its name;
* switching it off turns *that* test red, which ``scripts/mutate.py`` checks.

The second is what makes the third readable. A mutation breaks whatever it
breaks, and a kill only means something when the test that went red is the one
that names the rule — otherwise a documented example that happened to change can
leave a rule looking guarded while nothing guards it.
"""

import importlib.util
import pathlib
import re

import pytest

ROOT = pathlib.Path(__file__).parent.parent
MARKER = re.compile(r"^[ \t]*(?:#|//)\s*RULE:\s*(.+?)\s*$")
#: A Vitest case, whose title is written in words rather than as an identifier.
TITLE = re.compile(r"""^\s*(?:test|it)\(\s*(["'`])(.+?)\1""", re.MULTILINE)


def _mutate():
    """The mutation runner, loaded by path: scripts/ is not a package."""
    spec = importlib.util.spec_from_file_location("mutate", ROOT / "scripts/mutate.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def marked_rules() -> set[str]:
    """Every rule the source marks, by the words the marker gives it."""
    found = set()
    sources = [*(ROOT / "src").rglob("*.ts"), *(ROOT / "scripts").rglob("*.py")]
    for source in sorted(p for p in sources if p.is_file()):
        for line in source.read_text().splitlines():
            match = MARKER.search(line)
            if match:
                found.add(match.group(1))
    return found


def rowed_rules() -> set[str]:
    """Every rule the mutation rows claim to switch off."""
    return {str(rule["name"]) for rule in _mutate().all_rows()}


def defined_test_names() -> set[str]:
    """Every test function this suite defines.

    Not called ``test_names``: pytest collects anything starting with ``test_``,
    and a helper that returns a set would be reported as a test that forgot to
    assert.
    """
    found = set()
    for module in sorted((ROOT / "tests").rglob("test_*.py")):
        found.update(re.findall(r"^(?:async )?def (test_\w+)", module.read_text(), re.MULTILINE))
    name_for = _mutate().test_name_for
    for module in sorted((ROOT / "test").rglob("*.test.ts")):
        found.update(name_for(m.group(2)) for m in TITLE.finditer(module.read_text()))
    return found


def test_every_rule_in_the_source_has_a_row_in_the_mutation_table():
    """Without this the evidence falls behind the code and nobody sees it happen."""
    marked, rowed = marked_rules(), rowed_rules()
    assert marked - rowed == set(), f"marked in the source and never switched off: {marked - rowed}"
    assert rowed - marked == set(), f"a row for a rule no longer in the source: {rowed - marked}"


def test_every_rule_has_a_test_named_after_it():
    """A kill is only evidence about a rule when the test that went red names it."""
    name_for = _mutate().test_name_for
    named = defined_test_names()
    missing = sorted(rule for rule in marked_rules() if name_for(rule) not in named)
    wanted = ", ".join(f"{name_for(rule)}()" for rule in missing)
    assert not missing, f"rules with no test named after them — write {wanted}"


def _row(name, file="src/states.ts"):
    return f"[[rule]]\nname = \"{name}\"\nfile = \"{file}\"\nfind = 'x'\nreplace = 'y'\n"


def test_every_rule_s_row_is_read_from_a_file_of_its_own(tmp_path):
    """Two pull requests that each add a row at the end of one table collide; a file per row cannot."""
    states, ratchet = tmp_path / "src/states.ts", tmp_path / "scripts/ratchet.py"
    states.mkdir(parents=True)
    ratchet.mkdir(parents=True)
    (states / "one.toml").write_text(_row("one"))
    (ratchet / "two.toml").write_text(_row("two", "scripts/ratchet.py"))
    assert sorted(rule["name"] for rule in _mutate().all_rows(tmp_path)) == ["one", "two"]


def test_the_same_rule_with_two_rows_is_refused(tmp_path):
    """A row moved and not deleted would switch its rule off twice; the refusal names both files."""
    for source in ("src/states.ts", "src/app.ts"):
        (tmp_path / source).mkdir(parents=True)
        (tmp_path / source / "twice.toml").write_text(_row("twice", source))
    with pytest.raises(SystemExit, match="delete") as refused:
        _mutate().all_rows(tmp_path)
    assert "src/app.ts/twice.toml" in str(refused.value)
    assert "src/states.ts/twice.toml" in str(refused.value)


def test_a_row_in_the_wrong_folder_is_refused(tmp_path):
    """One row per file, named after its rule, in a folder that is the whole path of its source.

    Then where a row lives is never a choice, and two pull requests only meet on the same rule.
    """
    states, app = tmp_path / "src/states.ts", tmp_path / "src/app.ts"
    states.mkdir(parents=True)
    app.mkdir(parents=True)
    (states / "in-place.toml").write_text(_row("in place"))
    (app / "wrong-folder.toml").write_text(_row("wrong folder"))
    (states / "a-wrong-name.toml").write_text(_row("named otherwise"))
    (states / "two-rows.toml").write_text(_row("two rows") + _row("in one file"))
    found = " ".join(_mutate().misfiled(tmp_path))
    there = "src/states.ts"
    assert f"src/app.ts/wrong-folder.toml should be {there}/wrong-folder.toml" in found
    assert f"{there}/a-wrong-name.toml should be {there}/named-otherwise.toml" in found
    assert f"{there}/two-rows.toml holds 2 rows" in found
    assert "in-place" not in found


def test_every_row_file_in_the_repository_is_where_its_rule_says():
    misfiled = _mutate().misfiled()
    assert not misfiled, "row files out of place: " + "; ".join(misfiled)


def test_a_rule_whose_words_give_no_file_name_is_refused():
    """A name with no letter or digit would be filed as ".toml", and the next such name would land on it."""
    with pytest.raises(SystemExit, match=r"'\?!'.*letter"):
        _mutate().row_path({"name": "?!", "file": "src/states.ts"})
