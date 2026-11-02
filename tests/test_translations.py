"""Every language has every text, with the same blanks, and no text lives outside the files."""

import json
import pathlib
import re
import subprocess
import sys
import warnings

import pytest

ROOT = pathlib.Path(__file__).parent.parent
FOLDER = ROOT / "src" / "i18n"
ENGLISH = json.loads((FOLDER / "en.json").read_text(encoding="utf-8"))
OTHERS = sorted(p for p in FOLDER.glob("*.json") if p.stem not in {"en", "same-as-english"})
SAME = json.loads((FOLDER / "same-as-english.json").read_text(encoding="utf-8"))
BLANK = re.compile(r"\{[a-z]+\}")


def test_there_are_languages_besides_english():
    assert {p.stem for p in OTHERS} >= {"nb", "es"}


@pytest.mark.parametrize("path", OTHERS, ids=lambda p: p.stem)
def test_every_language_has_every_text_and_no_others(path):
    words = json.loads(path.read_text(encoding="utf-8"))
    assert sorted(set(ENGLISH) - set(words)) == [], "missing"
    assert sorted(set(words) - set(ENGLISH)) == [], "no longer in English"


@pytest.mark.parametrize("path", OTHERS, ids=lambda p: p.stem)
def test_every_text_keeps_the_blanks_english_has(path):
    words = json.loads(path.read_text(encoding="utf-8"))
    blanks = lambda text: set(BLANK.findall(text))  # noqa: E731
    wrong = {k: v for k, v in words.items() if k in ENGLISH and blanks(v) != blanks(ENGLISH[k])}
    assert wrong == {}


@pytest.mark.parametrize("path", OTHERS, ids=lambda p: p.stem)
def test_a_text_still_in_english_is_pointed_out(path):
    words = json.loads(path.read_text(encoding="utf-8"))
    allowed = set(SAME.get(path.stem, []))
    same = sorted(k for k, v in words.items() if v == ENGLISH.get(k) and k not in allowed)
    if same:
        warnings.warn(f"{path.stem}: still the same as English, perhaps untranslated: {same}", stacklevel=1)


def test_no_text_for_the_owner_is_written_outside_the_translation_files():
    done = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "ui_text.py")], capture_output=True, text=True, check=False
    )
    assert done.returncode == 0, done.stdout + done.stderr
