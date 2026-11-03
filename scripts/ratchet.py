#!/usr/bin/env python3
"""The quality ratchet: the code may get better or stay as it is, never worse unless a change says why.

`quality.json` at the root records the current measures: how much of the source the
suite runs, the share of rules whose test notices them switched off, the number of
passing tests, lint and type errors, import cycles among the modules, and the most
tangled function in each module. A change that makes one worse fails, unless its pull
request has a line of its own

    Ratchet-Exception: coverage - the reason

naming the measure. A change that makes one better must record the new level in the same
change (`update`), so the level never slips back. The suite also has a time budget, which
is a limit rather than a level: it is changed by hand.

    uv run python scripts/ratchet.py update            # measure and record (a few minutes)
    uv run python scripts/ratchet.py check --base REF  # measure and compare with REF's quality.json

`check` reads exceptions from the environment variable RATCHET_EXCEPTIONS (continuous
integration passes the pull request's text). `--skip-mutation` keeps the recorded
mutation figures, for a quick local look; continuous integration never skips it.

The measures and the rules are claude-voice's, so its health page reads both alike.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

#: A measure as quality.json holds it: a number, or for mutation {killed, total}.
Measure = float | int | dict[str, int]
Levels = dict[str, Any]

ROOT = Path(__file__).resolve().parent.parent
FILE = ROOT / "quality.json"
SOURCE = ROOT / "src"
COVERAGE_WOBBLE = 0.5  # percentage points: coverage differs slightly between machines and versions
HIGHER = ("coverage", "mutation", "tests")
LOWER = ("lint_errors", "type_errors", "cycles", "layer_violations", "duplication")
CEILING = 15  # the most tangled function a new module may have
BLOCK = 6  # consecutive lines that, repeated, count as a copy
MODULE_CEILING = 400  # the most lines a new module may have
EXCEPTION = re.compile(r"^\s*ratchet-exception:\s*([a-z_]+)", re.IGNORECASE | re.MULTILINE)


# -- measuring ---------------------------------------------------------------------------


def _run(*command: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=False)  # noqa: S603


def structure(folder: Path) -> dict[str, Any]:
    """Complexity, import cycles and the imports that reach up a layer, from scripts/structure.ts."""
    shown = _run("node", str(ROOT / "scripts" / "structure.ts"), str(folder))
    if shown.returncode:
        raise SystemExit("Could not read the source's structure.\n" + shown.stderr[-2000:])
    return json.loads(shown.stdout)


def module_lines(folder: Path) -> dict[str, int]:
    """How many lines each module has, every line counted."""
    return {
        path.relative_to(folder).as_posix(): len(path.read_text(encoding="utf-8").splitlines())
        for path in sorted(folder.rglob("*.ts"))
    }


def duplication(folder: Path) -> float:
    """The share of non-blank source lines in blocks of BLOCK or more lines that appear more than once.

    Lines are compared with their whitespace squeezed, so indenting a copy does not hide it.
    """
    lines: list[tuple[str, int]] = []  # (normalised text, file number)
    for number, path in enumerate(sorted(folder.rglob("*.ts"))):
        for raw in path.read_text(encoding="utf-8").splitlines():
            text = " ".join(raw.split())
            if text:
                lines.append((text, number))
    seen: dict[tuple[str, ...], list[int]] = {}
    for start in range(len(lines) - BLOCK + 1):
        window = lines[start : start + BLOCK]
        if len({file for _, file in window}) == 1:  # a block never runs across two files
            seen.setdefault(tuple(text for text, _ in window), []).append(start)
    copied: set[int] = set()
    for starts in seen.values():
        if len(starts) > 1:
            for start in starts:
                copied.update(range(start, start + BLOCK))
    return round(100.0 * len(copied) / len(lines), 2) if lines else 0.0


def measure(*, skip_mutation: bool = False, recorded: Levels | None = None) -> Levels:
    """Every measure, from the tree as it is. The tests and their time are both suites together."""
    with tempfile.TemporaryDirectory() as tmp:
        results = Path(tmp) / "vitest.json"
        started = time.monotonic()
        app = _run(
            "npx",
            "vitest",
            "run",
            "--coverage",
            "--coverage.reporter=json-summary",
            f"--coverage.reportsDirectory={tmp}",
            "--reporter=json",
            f"--outputFile={results}",
        )
        tooling = _run("uv", "run", "pytest", "-q", "-p", "no:cacheprovider")
        seconds = round(time.monotonic() - started, 1)
        if app.returncode or tooling.returncode:
            said = (app.stdout + tooling.stdout)[-2000:]
            raise SystemExit("The suite fails; the ratchet measures a green tree.\n" + said)
        summary = json.loads((Path(tmp) / "coverage-summary.json").read_text())
        coverage = round(summary["total"]["lines"]["pct"], 2)
        passed = json.loads(results.read_text())["numPassedTests"]
    tooling_passed = re.search(r"(\d+) passed", tooling.stdout)
    lint = _run("npx", "biome", "check", "--reporter=json", ".")
    python_lint = _run("uv", "run", "ruff", "check", ".", "--output-format", "json")
    types = _run("npx", "tsc", "--noEmit")
    if skip_mutation and recorded:
        mutation = recorded["mutation"]
    else:
        mutate = _run("uv", "run", "python", "scripts/mutate.py")
        tally = re.search(r"(\d+)/(\d+) rules turned off", mutate.stdout)
        killed, total = (int(tally[1]), int(tally[2])) if tally else (0, 1)
        mutation = {"killed": killed if mutate.returncode == 0 else min(killed, total - 1), "total": total}
    found = structure(SOURCE)
    for breach in found["breaches"]:
        print(f"layers: {breach}", file=sys.stderr)  # noqa: T201
    return {
        "coverage": coverage,
        "mutation": mutation,
        "tests": passed + (int(tooling_passed[1]) if tooling_passed else 0),
        "lint_errors": json.loads(lint.stdout or "{}").get("summary", {}).get("errors", 0)
        + len(json.loads(python_lint.stdout or "[]")),
        "type_errors": len(re.findall(r"error TS\d+", types.stdout)),
        "cycles": found["cycles"],
        "layer_violations": found["layer_violations"],
        "duplication": duplication(SOURCE),
        "max_module_lines": module_lines(SOURCE),
        "complexity": found["complexity"],
        "test_seconds": seconds,
        "test_budget": None,
    }


# -- comparing ---------------------------------------------------------------------------


def _score(value: Measure) -> float:
    if isinstance(value, dict):  # mutation: the share of rules whose test noticed
        return 100.0 * value["killed"] / max(value["total"], 1)
    return float(value)


def _worse(metric: str, base: Measure, now: Measure) -> bool:
    wobble = COVERAGE_WOBBLE if metric == "coverage" else 0.0
    if metric in HIGHER:
        return _score(now) < _score(base) - wobble
    return _score(now) > _score(base)


def _differs(metric: str, recorded: Measure, now: Measure) -> bool:
    wobble = COVERAGE_WOBBLE if metric == "coverage" else 0.0
    return abs(_score(now) - _score(recorded)) > wobble


def compare(base: Levels, now: Levels, committed: Levels, allowed: set[str]) -> list[str]:
    """What is wrong with `now`.

    A measure worse than the base without an exception, a level not recorded, or the
    suite over its time budget.
    """
    found = [
        f"{metric} got worse: {base[metric]} -> {now[metric]}"
        for metric in (*HIGHER, *LOWER)
        # A measure the base does not record yet has nothing to compare with.
        if metric in base and _worse(metric, base[metric], now[metric]) and metric not in allowed
    ]
    for module, score in now["complexity"].items():
        before = base["complexity"].get(module)
        if "complexity" in allowed:
            continue
        if before is not None and score > before:
            found.append(f"complexity of {module} got worse: {before} -> {score}")
        elif before is None and score > CEILING:
            found.append(f"complexity of new module {module} is {score}, over the ceiling of {CEILING}")
    found += _grown(base.get("max_module_lines"), now["max_module_lines"], allowed)
    stale = [m for m in (*HIGHER, *LOWER) if m not in committed or _differs(m, committed[m], now[m])]
    stale += [m for m in ("complexity", "max_module_lines") if committed.get(m) != now[m]]
    if stale:
        listed = ", ".join(stale)
        found.append(f"quality.json does not record the levels now ({listed}): run scripts/ratchet.py update")
    budget = committed.get("test_budget") or base["test_budget"]
    limit = budget["seconds"] * (1 + budget["tolerance"])
    if now["test_seconds"] > limit:
        found.append(
            f"test_seconds is {now['test_seconds']}, over the budget of {budget['seconds']}"
            f" (+{budget['tolerance']:.0%})"
        )
    return found


def _grown(base: dict[str, int] | None, now: dict[str, int], allowed: set[str]) -> list[str]:
    """Modules that grew, and new ones over the ceiling; nothing when the base does not count lines yet."""
    if base is None or "max_module_lines" in allowed:
        return []
    found = []
    for module, lines in now.items():
        before = base.get(module)
        if before is not None and lines > before:
            found.append(f"{module} grew: {before} -> {lines} lines")
        elif before is None and lines > MODULE_CEILING:
            found.append(f"new module {module} has {lines} lines, over the ceiling of {MODULE_CEILING}")
    return found


def exceptions(text: str) -> set[str]:
    """The measures a pull request allows to get worse, each on a `Ratchet-Exception:` line."""
    return {m.lower() for m in EXCEPTION.findall(text or "")}


def write(path: Path, now: Levels) -> None:
    """Record the measures, keeping the hand-set time budget."""
    try:
        old = json.loads(path.read_text())
    except (OSError, ValueError):
        old = {}
    budget = now.get("test_budget") or old.get("test_budget") or {"seconds": 120, "tolerance": 0.25}
    path.write_text(json.dumps({**now, "test_budget": budget}, indent=2, sort_keys=True) + "\n")


def _at(ref: str) -> Levels | None:
    shown = _run("git", "show", f"{ref}:quality.json")
    return json.loads(shown.stdout) if shown.returncode == 0 else None


def main() -> int:
    """Measure, then record the levels or check them against a base."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("action", choices=("check", "update"))
    parser.add_argument("--base", help="the git ref whose quality.json is the level to keep")
    parser.add_argument("--skip-mutation", action="store_true")
    args = parser.parse_args()
    committed = json.loads(FILE.read_text()) if FILE.exists() else None
    now = measure(skip_mutation=args.skip_mutation, recorded=committed)
    if args.action == "update":
        write(FILE, now)
        print(f"Recorded the levels in {FILE.name}.")  # noqa: T201
        return 0
    if committed is None:
        print("There is no quality.json yet: run scripts/ratchet.py update.", file=sys.stderr)  # noqa: T201
        return 1
    base = (_at(args.base) if args.base else None) or committed
    found = compare(base, now, committed, exceptions(os.environ.get("RATCHET_EXCEPTIONS", "")))
    for problem in found:
        print(problem, file=sys.stderr)  # noqa: T201
    if not found:
        print("The ratchet holds: nothing got worse, and quality.json records the levels.")  # noqa: T201
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
