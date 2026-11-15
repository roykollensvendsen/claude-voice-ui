"""What the quality ratchet lets through and what it stops.

The measures and their rules are the ones claude-voice uses, so the bridge's
health page reads both repositories the same way. These cases are the ones a
change will actually meet: a measure slipping, an exception written in the pull
request, a slower suite. Main keeps its own levels with each of its runs, so a
change never records them, and quality.json holds only what is set by hand.
"""

import json
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "scripts"))

import ratchet

LEVEL = {
    "coverage": 90.0,
    "mutation": {"killed": 25, "total": 25},
    "tests": 300,
    "lint_errors": 0,
    "type_errors": 0,
    "cycles": 0,
    "complexity": {"app.ts": 12, "view.ts": 9},
    "layer_violations": 0,
    "duplication": 1.5,
    "max_module_lines": {"app.ts": 400, "view.ts": 100},
    "test_seconds": 20.0,
    "test_budget": {"seconds": 60, "tolerance": 0.25},
}


def _now(**change):
    return {**LEVEL, **change}


def _problems(now, base=LEVEL, allowed=()):
    return ratchet.compare(base, now, set(allowed), LEVEL["test_budget"])


def test_nothing_worse_passes():
    assert _problems(_now()) == []


@pytest.mark.parametrize(
    "change",
    [
        {"coverage": 89.0},
        {"mutation": {"killed": 24, "total": 25}},
        {"tests": 299},
        {"lint_errors": 1},
        {"type_errors": 2},
        {"cycles": 1},
        {"layer_violations": 1},
        {"duplication": 2.0},
    ],
)
def test_a_measure_that_gets_worse_fails_the_check(change):
    (problem,) = _problems(_now(**change))
    assert f"{next(iter(change))} got worse" in problem


def test_coverage_may_wobble_half_a_point():
    assert _problems(_now(coverage=89.6)) == []


def test_a_module_more_tangled_than_before_fails():
    (problem,) = _problems(_now(complexity={"app.ts": 13, "view.ts": 9}))
    assert problem == "complexity of app.ts got worse: 12 -> 13"


def test_a_new_module_may_have_no_function_more_tangled_than_fifteen():
    assert _problems(_now(complexity={"app.ts": 12, "view.ts": 9, "new.ts": 15})) == []
    (problem,) = _problems(_now(complexity={"app.ts": 12, "view.ts": 9, "new.ts": 16}))
    assert problem == "complexity of new module new.ts is 16, over the ceiling of 15"


def test_any_module_may_grow_to_four_hundred_lines_but_one_already_over_may_not_grow():
    level = {**LEVEL, "max_module_lines": {"app.ts": 120, "big.ts": 500}}
    grown = {"app.ts": 400, "big.ts": 500, "new.ts": 400}
    assert _problems(_now(max_module_lines=grown), base=level) == []
    problems = _problems(_now(max_module_lines={"app.ts": 401, "big.ts": 501, "new.ts": 401}), base=level)
    assert problems == [
        "app.ts has 401 lines, over the ceiling of 400",
        "big.ts grew: 500 -> 501 lines, and is already over the ceiling of 400",
        "new.ts has 401 lines, over the ceiling of 400",
    ]


def test_module_lines_count_every_line_of_each_module(tmp_path):
    (tmp_path / "a.ts").write_text("export const a = 1;\n\n// a note\nexport const b = 2;\n")
    (tmp_path / "view").mkdir()
    (tmp_path / "view" / "b.ts").write_text("export const c = 3;\n")
    assert ratchet.module_lines(tmp_path) == {"a.ts": 4, "view/b.ts": 1}


def test_a_measure_the_base_does_not_record_yet_has_nothing_to_compare_with():
    old = {k: v for k, v in LEVEL.items() if k not in ("layer_violations", "duplication")}
    assert _problems(_now(duplication=9.0), base=old) == []


def test_an_exception_in_the_pull_request_lets_that_measure_slip():
    assert _problems(_now(coverage=80.0), allowed=["coverage"]) == []
    assert _problems(_now(tests=1), allowed=["coverage"]) != []


def test_a_better_level_needs_no_recording():
    assert _problems(_now(tests=310, coverage=95.0)) == []


def test_a_suite_over_its_time_budget_fails():
    assert _problems(_now(test_seconds=75.0)) == []
    (problem,) = _problems(_now(test_seconds=75.1))
    assert problem.startswith("test_seconds is 75.1, over the budget of 60")


def test_exceptions_are_read_only_from_lines_of_their_own():
    text = "Fixes the grid.\n\nRatchet-Exception: coverage - the menu moved\nSee Ratchet-Exception: tests"
    assert ratchet.exceptions(text) == {"coverage"}


def test_the_levels_main_keeps_leave_out_the_budget_and_sort_their_keys(tmp_path):
    path = tmp_path / "levels.json"
    ratchet.write_levels(path, {**LEVEL, "test_budget": None})
    written = json.loads(path.read_text())
    assert "test_budget" not in written
    assert written["tests"] == LEVEL["tests"]
    assert list(written) == sorted(written)


def test_the_budget_is_read_from_quality_json_or_falls_back_to_a_default(tmp_path):
    path = tmp_path / "quality.json"
    path.write_text(json.dumps({"test_budget": {"seconds": 90, "tolerance": 0.1}}))
    assert ratchet.budget(path) == {"seconds": 90, "tolerance": 0.1}
    assert ratchet.budget(tmp_path / "missing.json") == ratchet.DEFAULT_BUDGET


def test_the_base_is_compared_with_the_levels_main_kept(tmp_path):
    kept = tmp_path / "levels.json"
    kept.write_text(json.dumps({k: v for k, v in LEVEL.items() if k != "test_budget"}))
    unmeasured = lambda: pytest.fail("measured although main kept levels")  # noqa: E731
    assert ratchet.base_levels(kept, unmeasured)["tests"] == 300


def test_when_main_s_levels_are_missing_the_base_is_measured(tmp_path):
    measured = {**LEVEL, "tests": 123}
    assert ratchet.base_levels(None, lambda: measured)["tests"] == 123
    broken = tmp_path / "levels.json"
    broken.write_text("not json")
    assert ratchet.base_levels(broken, lambda: measured)["tests"] == 123


def test_a_measured_level_in_quality_json_is_refused():
    """Measured levels change with every merge, so a file holding them collides between changes."""
    recorded = json.loads((pathlib.Path(__file__).parent.parent / "quality.json").read_text())
    measured = set(recorded) - ratchet.SET_BY_HAND
    assert measured == set(), f"measured, not set by hand: {measured}"


def test_modules_that_import_each_other_when_they_load_are_one_cycle(tmp_path):
    (tmp_path / "a.ts").write_text('import { b } from "./b";\nexport const a = () => b;\n')
    (tmp_path / "b.ts").write_text('import { a } from "./a.ts";\nexport const b = () => a;\n')
    (tmp_path / "c.ts").write_text('import type { A } from "./d";\nexport type C = A;\n')
    (tmp_path / "d.ts").write_text('import type { C } from "./c";\nexport type A = C;\n')
    assert ratchet.structure(tmp_path)["cycles"] == 1


def test_complexity_counts_each_branch_of_a_function_but_not_the_functions_inside_it(tmp_path):
    (tmp_path / "m.ts").write_text(
        "export function f(x: number, y?: boolean) {\n"
        "  if (x > 1 && y) return 1;\n"
        "  const inner = () => (x ? 2 : 3);\n"
        "  for (const z of [x]) if (z) return z ?? 0;\n"
        "  return inner();\n"
        "}\n"
        "export const g = (s: string) => {\n"
        "  switch (s) {\n"
        '    case "a":\n'
        '    case "b":\n'
        "      return 1;\n"
        "    default:\n"
        "      return 0;\n"
        "  }\n"
        "};\n"
    )
    # f: 1 + if + && + for + if + ?? = 6; the arrow inside it counts on its own (2); g: 1 + two cases = 3.
    assert ratchet.structure(tmp_path)["complexity"] == {"m.ts": 6}


def test_a_module_importing_from_a_layer_above_it_breaks_the_layers(tmp_path):
    (tmp_path / "i18n.ts").write_text('import { draw } from "./view";\nexport const t = () => draw;\n')
    (tmp_path / "view.ts").write_text('import { t } from "./i18n";\nexport const draw = () => t;\n')
    (tmp_path / "states.ts").write_text('import type { V } from "./view";\nexport type S = V;\n')
    found = ratchet.structure(tmp_path)
    assert found["layer_violations"] == 1
    assert found["breaches"] == ["i18n.ts (layer 0) imports view.ts (layer 5)"]


def test_a_module_in_no_layer_counts_as_a_breach_until_it_is_given_one(tmp_path):
    (tmp_path / "stray.ts").write_text("export const x = 1;\n")
    assert ratchet.structure(tmp_path)["breaches"] == ["stray.ts is in no layer: add it to LAYERS"]


def test_duplication_is_the_share_of_lines_in_blocks_of_six_or_more_that_repeat(tmp_path):
    block = "\n".join(f"  const v{i} = {i};" for i in range(6))
    (tmp_path / "a.ts").write_text(f"{block}\nexport const a = 1;\n\n")
    wider = block.replace("  ", "    ")
    (tmp_path / "b.ts").write_text(f"{wider}\nexport const b = 2;\nexport const c = 3;\n")
    (tmp_path / "c.ts").write_text("\n".join(f"const w{i} = {i};" for i in range(5)) + "\n")
    # 12 of the 20 non-blank lines sit in the repeated block; whitespace does not hide a copy.
    assert ratchet.duplication(tmp_path) == 60.0


def test_five_repeated_lines_are_not_yet_a_copy(tmp_path):
    block = "\n".join(f"const v{i} = {i};" for i in range(5))
    (tmp_path / "a.ts").write_text(block + "\n")
    (tmp_path / "b.ts").write_text(block + "\n")
    assert ratchet.duplication(tmp_path) == 0.0


def test_the_base_shares_this_tree_s_packages_only_when_its_lockfile_is_the_same(tmp_path):
    here, base = tmp_path / "here", tmp_path / "base"
    for folder in (here, base):
        folder.mkdir()
        (folder / "package-lock.json").write_text('{"lockfileVersion": 3}')
    assert ratchet.shares_packages(here, base)
    (base / "package-lock.json").write_text('{"lockfileVersion": 3, "packages": {"x": {}}}')
    assert not ratchet.shares_packages(here, base)
