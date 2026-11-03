#!/usr/bin/env python3
"""Find text for the owner written in the code instead of in the translation files.

Every word the page shows the owner lives in src/i18n/*.json, so that each
language has it. This reads every string in src/*.ts and fails on one that
looks like words: a word that is not a CSS class from the stylesheet, an
HTML or DOM name, or one of the code's own identifiers listed below.

    python scripts/ui_text.py

A line can say that its string is never shown, by ending in
`// not shown`, for an error that only reaches a log. Exit 1 names each
string found, with its file and line.
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent.parent
SOURCES = sorted(p for p in (ROOT / "src").glob("*.ts") if p.name != "i18n.ts")
STYLE = (ROOT / "src" / "style.css").read_text(encoding="utf-8")
CLASSES = set(re.findall(r"\.([a-z][a-z0-9-]*)", STYLE))
#: Names the code uses as data, never shown: tags, events, attributes, states, kinds and settings.
_NAMES = """
    a b button code div form h1 h2 h3 header input li ol p pre section span ul main
    click keydown pointerdown pointerup pointerleave pointercancel contextmenu visibilitychange
    submit role title true false aria expanded pressed label hidden password secret current
    Enter ContextMenu object focusout gone prompt_closed tool checkbox hello message_sent
    settings background terminal start-in remote-control generating ready summary_state
    bad class points polyline repo svg unknown viewBox success failure running
    blank noopener no store none center undefined feat fix kind
    grid cards system light dark ok warn full stop required optional
    connecting live reconnecting page voice terminal
    working idle answer approval input shell moved stopped busy running waiting error cancelled interrupted
    question permission approv started done updated up_to_date rolled_back confirm user assistant
    focus active news status git update output peek prompt
    check fetch pull install test restart verify rollback
    rejected allowed_warning green grey amber slate faded red
    GET POST PUT DELETE Content Type application json Authorization Bearer
    cvu expanded view theme lang keep app text home language hide question-text
    up_to_date unavailable wrong unreachable too-many
    """
NAMES = set(_NAMES.split())
STRING = re.compile(r'"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`')
WORD = re.compile(r"[A-Za-z][A-Za-z_'-]+")
KEY = re.compile(r"^[a-z][A-Za-z]*(\.[A-Za-z]+)+$")


def looks_like_text(literal: str) -> bool:
    """Whether a string from the code reads as words for the owner rather than a name."""
    if KEY.match(re.sub(r"\$\{[^}]*\}", "x", literal)):
        return False
    plain = re.sub(r"\$\{[^}]*\}", "", literal)
    # An address, a query or a selector, not words.
    if " " not in plain.strip() and re.search(r"[/=&?\[]", plain):
        return False
    return any(not known(w) for w in WORD.findall(plain))


def known(word: str) -> bool:
    """Whether a word is a class, a DOM name or one of the code's own names."""
    if word.endswith("-"):
        # "tone-" with its end filled in at run time, as in "tone-green".
        return any(c.startswith(word) for c in CLASSES)
    return word in NAMES or word in CLASSES or all(part in NAMES | CLASSES for part in word.split("-"))


def found(path: pathlib.Path) -> list[str]:
    """Each string in one source file that reads as words, as `file:line: 'string'`."""
    hits = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        code = line.strip()
        if code.startswith(("//", "*", "/*", "import ")) or code.endswith("// not shown"):
            continue
        code = code.split(" // ")[0]
        for match in STRING.finditer(code):
            literal = match.group(1) if match.group(1) is not None else match.group(2)
            if looks_like_text(literal):
                hits.append(f"{path.relative_to(ROOT)}:{number}: {literal!r}")
    return hits


def main() -> int:
    """Name every string found; exit 1 when there is any."""
    hits = [hit for path in SOURCES for hit in found(path)]
    for hit in hits:
        print(hit)  # noqa: T201
    if hits:
        print("Text for the owner belongs in src/i18n/en.json and the other languages.")  # noqa: T201
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
