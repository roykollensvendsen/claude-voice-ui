// The automatic checks: a newer push stops a pull request's stale run, and nothing else.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const WORKFLOWS = [".github/workflows/checks.yml", ".github/workflows/measures.yml"];

const GROUP =
  "group: ${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.ref || github.run_id }}";
const CANCEL = "cancel-in-progress: ${{ github.event_name == 'pull_request' }}";

describe("the automatic checks", () => {
  test.each(WORKFLOWS)(
    "in %s only a pull request's stale run is stopped, and every other run finishes",
    (path) => {
      const lines = readFileSync(path, "utf8")
        .split("\n")
        .map((line) => line.trim());
      expect(lines).toContain(GROUP);
      expect(lines).toContain(CANCEL);
    },
  );
});
