#!/usr/bin/env python3
"""The quality ratchet: the code may get better or stay as it is, never worse unless a change says why.

It measures how much of the source the suite runs, the share of rules whose test
notices them switched off, the number of passing tests, lint and type errors, import
cycles and layers among the modules, copied code, each module's length and its most
tangled function, and compares them with the levels main reached. A change that makes
one worse fails, unless its pull request has a line of its own

    Ratchet-Exception: coverage - the reason

naming the measure. Main keeps its levels: continuous integration measures them after
every push to main and keeps them with that run, so a change never records them. When
they are missing, the base is measured in a copy of it, which takes as long again.
`quality.json` holds only what is set by hand: the suite's time budget.

    uv run python scripts/ratchet.py check --base REF   # measure and compare with REF
    uv run python scripts/ratchet.py check --base REF --levels FILE --out FILE
    uv run python scripts/ratchet.py measure --out FILE  # measure only

`check` reads exceptions from the environment variable RATCHET_EXCEPTIONS (continuous
integration passes the pull request's text). `--skip-mutation` keeps the base's
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
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable

#: A measure as quality.json holds it: a number, or for mutation {killed, total}.
Measure = float | int | dict[str, int]
Levels = dict[str, Any]

# The tree to measure: this one, or a copy of the base named by RATCHET_ROOT (see measure_at).
ROOT = Path(os.environ.get("RATCHET_ROOT") or Path(__file__).resolve().parent.parent)
FILE = ROOT / "quality.json"
SOURCE = ROOT / "src"
COVERAGE_WOBBLE = 0.5  # percentage points: coverage differs slightly between machines and versions
HIGHER = ("coverage", "mutation", "tests")
LOWER = ("lint_errors", "type_errors", "cycles", "layer_violations", "duplication")
CEILING = 15  # the most tangled function a new module may have
BLOCK = 6  # consecutive lines that, repeated, count as a copy
MODULE_CEILING = 400  # the most lines a new module may have
DEFAULT_BUDGET = {"seconds": 60, "tolerance": 0.25}
#: The only keys quality.json may hold: limits set by hand, never a measured level.
SET_BY_HAND = {"test_budget"}
EXCEPTION = re.compile(r"^\s*ratchet-exception:\s*([a-z_]+)", re.IGNORECASE | re.MULTILINE)


# -- measuring ---------------------------------------------------------------------------


def _run(
    *command: str, cwd: Path = ROOT, env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, check=False)  # noqa: S603


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


def compare(base: Levels, now: Levels, allowed: set[str], budget: dict[str, Any]) -> list[str]:
    """What is wrong with `now`.

    A measure worse than the base without an exception, or the suite over its time
    budget. A better level needs no recording: main measures its own.
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
    limit = budget["seconds"] * (1 + budget["tolerance"])
    if now["test_seconds"] > limit:
        found.append(
            f"test_seconds is {now['test_seconds']}, over the budget of {budget['seconds']}"
            f" (+{budget['tolerance']:.0%})"
        )
    return found


def _grown(base: dict[str, int] | None, now: dict[str, int], allowed: set[str]) -> list[str]:
    """Modules over the ceiling: any may grow to it, and one already over it may not grow.

    Nothing is checked while the base does not count lines yet.
    """
    if base is None or "max_module_lines" in allowed:
        return []
    found = []
    for module, lines in now.items():
        before = base.get(module)
        if before is not None and before > MODULE_CEILING:
            if lines > before:
                over = f"and is already over the ceiling of {MODULE_CEILING}"
                found.append(f"{module} grew: {before} -> {lines} lines, {over}")
        elif lines > MODULE_CEILING:
            found.append(f"{module} has {lines} lines, over the ceiling of {MODULE_CEILING}")
    return found


def exceptions(text: str) -> set[str]:
    """The measures a pull request allows to get worse, each on a `Ratchet-Exception:` line."""
    return {m.lower() for m in EXCEPTION.findall(text or "")}


def budget(path: Path) -> dict[str, Any]:
    """The suite's time budget, the one thing `quality.json` keeps."""
    try:
        return dict(json.loads(path.read_text())["test_budget"])
    except (OSError, ValueError, KeyError, TypeError):
        return dict(DEFAULT_BUDGET)


def write_levels(path: Path, now: Levels) -> None:
    """Write the measured levels, for main to keep with its run."""
    levels = {k: v for k, v in now.items() if k != "test_budget"}
    path.write_text(json.dumps(levels, indent=2, sort_keys=True) + "\n")


def base_levels(kept: Path | None, measure_base: Callable[[], Levels]) -> Levels:
    """Main's kept levels for the base, or, when they are missing, the base measured."""
    try:
        levels = json.loads(kept.read_text()) if kept else None
    except (OSError, ValueError):
        levels = None
    if isinstance(levels, dict) and "coverage" in levels:
        return levels
    # RULE: when main's levels are missing, the base is measured
    return measure_base()


def shares_packages(here: Path, base: Path) -> bool:
    """Whether the base can use this tree's installed packages: only when the lockfiles match."""
    lock = "package-lock.json"
    try:
        return (here / lock).read_bytes() == (base / lock).read_bytes()
    except OSError:
        return False


def measure_at(ref: str) -> Levels:
    """Measure `ref` in a copy of it, with this ratchet, so both sides are measured alike."""
    with tempfile.TemporaryDirectory() as tmp:
        copy, out = Path(tmp) / "base", Path(tmp) / "levels.json"
        added = _run("git", "worktree", "add", "--detach", str(copy), ref)
        if added.returncode:
            msg = f"Cannot check out {ref} to measure it:\n{added.stderr}"
            raise SystemExit(msg)
        try:
            # Installing the packages again takes minutes, so the copy shares this tree's when
            # its lockfile is the same, and installs its own when it is not.
            if shares_packages(ROOT, copy):
                (copy / "node_modules").symlink_to(ROOT / "node_modules")
            else:
                installed = _run("npm", "ci", "--no-audit", "--no-fund", cwd=copy)
                if installed.returncode:
                    msg = f"Cannot install {ref}'s packages to measure it:\n{installed.stderr[-2000:]}"
                    raise SystemExit(msg)
            env = {**os.environ, "RATCHET_ROOT": str(copy)}
            here = str(Path(__file__).resolve())
            measured = _run("uv", "run", "python", here, "measure", "--out", str(out), cwd=copy, env=env)
            if measured.returncode:
                said = f"{measured.stdout[-2000:]}{measured.stderr[-2000:]}"
                msg = f"Measuring {ref} failed:\n{said}"
                raise SystemExit(msg)
            return dict(json.loads(out.read_text()))
        finally:
            _run("git", "worktree", "remove", "--force", str(copy))


def main() -> int:
    """Measure, then write the levels or check them against a base."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("action", choices=("check", "measure"))
    parser.add_argument("--base", help="the git ref to compare with, usually origin/main")
    parser.add_argument("--levels", type=Path, help="main's kept levels for the base, if there are any")
    parser.add_argument("--out", type=Path, help="where to write the levels measured now")
    parser.add_argument("--skip-mutation", action="store_true")
    args = parser.parse_args()
    if args.action == "measure":
        now = measure()
        if args.out:
            write_levels(args.out, now)
        print(json.dumps(now, indent=2, sort_keys=True))  # noqa: T201
        return 0
    if not args.base:
        print("check needs --base, the ref to compare with (usually origin/main).", file=sys.stderr)  # noqa: T201
        return 1
    base = base_levels(args.levels, lambda: measure_at(args.base))
    now = measure(skip_mutation=args.skip_mutation, recorded=base)
    if args.out:
        write_levels(args.out, now)
    found = compare(base, now, exceptions(os.environ.get("RATCHET_EXCEPTIONS", "")), budget(FILE))
    for problem in found:
        print(problem, file=sys.stderr)  # noqa: T201
    if not found:
        print("The ratchet holds: nothing got worse than the base.")  # noqa: T201
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
