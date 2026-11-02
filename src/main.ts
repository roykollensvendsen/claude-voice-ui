// The page's entry point: the real bridge and the browser's own EventSource.
import { start } from "./app";
import { bridge } from "./bridge";

const root = document.getElementById("app");
if (root) start(root, { bridge: bridge(), openEvents: (url) => new EventSource(url) });
