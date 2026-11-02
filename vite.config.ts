import { defineConfig } from "vitest/config";

// The bridge to talk to while developing. The page itself always calls its own
// origin, so in development Vite passes /api on to the bridge.
const bridge = process.env.CLAUDE_VOICE_URL ?? "http://127.0.0.1:8811";

export default defineConfig({
  // Relative paths, so the same build works at the bridge's /ui/ and anywhere else.
  base: "./",
  server: {
    proxy: {
      "/api": {
        target: bridge,
        changeOrigin: true,
        // The bridge refuses a cookie-signed change whose Origin is not its own.
        // Through this proxy the page is the bridge, as it is when the bridge serves it.
        headers: { origin: bridge },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    coverage: { provider: "v8", include: ["src/**/*.ts"] },
  },
});
