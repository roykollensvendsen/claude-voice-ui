"""Every measure the bridge publishes has words on the code-health page."""

import json
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "scripts"))

import measures
import pytest

ROOT = pathlib.Path(__file__).parent.parent
PAGE = """
export const MEASURES: Record<string, Key> = {
  coverage: "health.coverage",
  test_time: "health.testTime",
};
"""
WORDS = {"health.coverage": "Test coverage", "health.testTime": "Time the tests take"}


def published(*ids):
    return [{"id": i, "unit": ""} for i in ids]


def test_a_measure_with_words_on_the_page_passes():
    assert measures.missing(published("coverage", "test_time"), PAGE, WORDS) == []


def test_a_measure_the_page_does_not_name_is_reported_by_its_id():
    assert measures.missing(published("coverage", "layers"), PAGE, WORDS) == [
        "layers: the page has no words for it (add it to MEASURES in src/view/health.ts)"
    ]


def test_a_measure_whose_words_are_missing_is_reported_by_its_id():
    words = {"health.coverage": "Test coverage"}
    assert measures.missing(published("test_time"), PAGE, words) == [
        "test_time: health.testTime is not in src/i18n/en.json"
    ]


def test_the_page_without_its_list_of_measures_is_an_error_not_a_pass():
    with pytest.raises(ValueError, match="MEASURES"):
        measures.page_measures("export const OTHER = {};")


def test_the_page_as_it_is_reads_its_own_list():
    page = (ROOT / "src" / "view" / "health.ts").read_text(encoding="utf-8")
    assert measures.page_measures(page)["coverage"] == "health.coverage"


def test_the_command_fails_and_names_the_id(tmp_path):
    listed = tmp_path / "measures.json"
    listed.write_text(json.dumps(published("coverage", "brand_new")), encoding="utf-8")
    done = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "measures.py"), str(listed)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert done.returncode == 1
    assert "brand_new" in done.stdout
