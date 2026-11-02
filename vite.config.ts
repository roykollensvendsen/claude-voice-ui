import { execFileSync } from "node:child_process";
import { defineConfig } from "vitest/config";
import { parseLog } from "./src/changes.ts";

// The bridge to talk to while developing. The page itself always calls its own
// origin, so in development Vite passes /api on to the bridge.
const bridge = process.env.CLAUDE_VOICE_URL ?? "http://127.0.0.1:8811";
// With the login secret in the environment, the proxy signs every call in with it, so a
// developer need not type it. It stays in the dev server; the page never sees it.
const token = process.env.CLAUDE_VOICE_TOKEN;

// One id per build: the commit, and when it was built, so a rebuild of the same commit counts too.
// The page carries it, and version.json beside the page names the one deployed now.
function commit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
const build = `${commit()}-${Date.now()}`;

function log(): string {
  try {
    return execFileSync("git", ["log", "-n", "300", "--format=%h%x09%s"], { encoding: "utf8" });
  } catch {
    return "";
  }
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(build) },
  plugins: [
    {
      name: "version-file",
      apply: "build",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: `${JSON.stringify({ build })}\n` });
        // What's new: the features and fixes among the latest commits, for a phone on an older build.
        this.emitFile({
          type: "asset",
          fileName: "changelog.json",
          source: `${JSON.stringify(parseLog(log()))}\n`,
        });
      },
    },
  ],
  // Relative paths, so the same build works at the bridge's /ui/ and anywhere else.
  base: "./",
  server: {
    proxy: {
      "/api": {
        target: bridge,
        changeOrigin: true,
        // The bridge refuses a cookie-signed change whose Origin is not its own.
        // Through this proxy the page is the bridge, as it is when the bridge serves it.
        headers: { origin: bridge, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    coverage: { provider: "v8", include: ["src/**/*.ts"] },
  },
});
