# ADR-CVU-001: A static TypeScript app with no framework, and Python only for the repository's tooling

## Status

Proposed by Claude for Roy Kollen Svendsen, 2026-11-02. Roy's yes makes it
Accepted.

## Context

The app is a handful of screens: a sign-in, a list of session cards, a detail
view and a bar showing which session the voice talks to. Everything it shows
comes from the bridge's event API ([API.md](../API.md)). The design draft asks
for "HTML/TS, lightweight, no heavy framework", and for an installable app on
an Android phone. The bridge can serve built files itself at `/ui/`, which puts
the page and the API on one address so the sign-in cookie works with no extra
setup.

The template this repository copies, the one claude-voice uses, is Python:
its commit checks, mutation runner and document tests are small standard-library
scripts.

## Options considered

- **Plain HTML and script with no build, as the prototype was.** Nothing to
  install, but no types, and the prototype's single string of markup is hard to
  test piece by piece.
- **React, Svelte or another framework.** More than four screens need, a larger
  download on a phone, and a dependency that moves every few months.
- **TypeScript with no framework, built by Vite and tested by Vitest.** Types
  catch a misread API field before the phone does; the build is a folder of
  static files any host, the bridge included, can serve. Chosen.
- **Port the repository tooling to TypeScript as well.** One language, but the
  scripts are already written, tested and shared with claude-voice, and a port
  would drift from them.

## Decision

The app is TypeScript with no UI framework, built with Vite into static files,
tested with Vitest in a simulated browser (jsdom), and linted and formatted
with Biome. The repository's tooling stays Python, run through uv, as in
claude-voice. A rule in the app is marked `// RULE:` and its test is titled with
the rule's own words; the mutation runner turns each off and runs Vitest.

## Consequences

- The built app is a folder of files with no server of its own.
- A contributor needs both Node and uv. That is worse than one toolchain, and
  is the price of sharing the tooling with claude-voice unchanged.
- Without a framework, the screens are drawn with plain DOM calls. If the app
  grows past a few screens, that choice should be revisited.

## Related

[CONTRIBUTING.md](../CONTRIBUTING.md), `package.json`, `pyproject.toml`,
`scripts/mutate.py`.
