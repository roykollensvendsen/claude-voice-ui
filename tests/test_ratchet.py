"""What the quality ratchet lets through and what it stops.

The measures and their rules are the ones claude-voice uses, so the bridge's
health page reads both repositories the same way. These cases are the ones a
change will actually meet: a measure slipping, a better level left unrecorded,
an exception written in the pull request, a slower suite.
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


def _problems(now, base=LEVEL, committed=None, allowed=()):
    return ratchet.compare(base, now, committed or now, set(allowed))


def test_nothing_worse_and_everything_recorded_passes():
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


def test_a_module_may_not_grow_and_a_new_module_stays_within_four_hundred_lines():
    assert _problems(_now(max_module_lines={"app.ts": 390, "view.ts": 100, "new.ts": 400})) == []
    problems = _problems(_now(max_module_lines={"app.ts": 401, "view.ts": 100, "new.ts": 401}))
    assert problems == [
        "app.ts grew: 400 -> 401 lines",
        "new module new.ts has 401 lines, over the ceiling of 400",
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


def test_a_better_level_must_be_recorded_in_the_same_change():
    (problem,) = _problems(_now(tests=310), committed=LEVEL)
    assert "quality.json does not record the levels now (tests)" in problem


def test_a_suite_over_its_time_budget_fails():
    assert _problems(_now(test_seconds=75.0)) == []
    (problem,) = _problems(_now(test_seconds=75.1))
    assert problem.startswith("test_seconds is 75.1, over the budget of 60")


def test_exceptions_are_read_only_from_lines_of_their_own():
    text = "Fixes the grid.\n\nRatchet-Exception: coverage - the menu moved\nSee Ratchet-Exception: tests"
    assert ratchet.exceptions(text) == {"coverage"}


def test_the_record_keeps_the_hand_set_budget_and_sorts_its_keys(tmp_path):
    path = tmp_path / "quality.json"
    path.write_text(json.dumps({"test_budget": {"seconds": 90, "tolerance": 0.1}}))
    ratchet.write(path, {**LEVEL, "test_budget": None})
    written = path.read_text()
    assert json.loads(written)["test_budget"] == {"seconds": 90, "tolerance": 0.1}
    assert list(json.loads(written)) == sorted(json.loads(written))


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
