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
    ],
)
def test_a_measure_that_gets_worse_fails_the_check(change):
    (problem,) = _problems(_now(**change))
    assert f"{next(iter(change))} got worse" in problem


def test_coverage_may_wobble_half_a_point():
    assert _problems(_now(coverage=89.6)) == []


def test_a_module_more_tangled_than_before_fails_but_a_new_module_has_no_baseline():
    (problem,) = _problems(_now(complexity={"app.ts": 13, "view.ts": 9, "new.ts": 40}))
    assert problem == "complexity of app.ts got worse: 12 -> 13"


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
