// The page's entry point: the real bridge and the browser's own EventSource.
import { start } from "./app";
import { bridge } from "./bridge";
import type { Change } from "./changes";

/** Set by the build, which also writes it to version.json beside the page. */
declare const __BUILD_ID__: string;

async function latest(): Promise<string> {
  const response = await fetch("./version.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`version.json answered ${response.status}`); // not shown
  return ((await response.json()) as { build: string }).build;
}

async function changes(): Promise<Change[]> {
  const response = await fetch("./changelog.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`changelog.json answered ${response.status}`); // not shown
  return (await response.json()) as Change[];
}

const root = document.getElementById("app");
if (root) {
  start(root, {
    bridge: bridge(),
    openEvents: (url) => new EventSource(url),
    version: { built: __BUILD_ID__, latest, changes },
  });
}
