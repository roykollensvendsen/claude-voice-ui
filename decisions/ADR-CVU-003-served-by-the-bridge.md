# ADR-CVU-003: The app is served by the bridge, at its /ui/ address

## Status

Proposed by Claude for Roy Kollen Svendsen, 2026-11-02. Setting it up changes
the bridge's service settings on Roy's computer, so it waits for his yes.

## Context

The bridge signs a page in with a cookie that is sent only to the same site
(`SameSite=Strict`) and cannot be read by scripts (see the bridge's
[event API](../API.md)). The bridge serves a folder of built files at `/ui/`
when `CLAUDE_VOICE_UI_DIR` names it, and answers another origin only when
`CLAUDE_VOICE_UI_ORIGINS` lists it.

The owner wants the app reachable only inside his tailnet, not over the public
Funnel address the voice connector uses. The bridge's maintainers propose a
second `tailscale serve` port in front of the same bridge, which refuses `/api/`
and `/ui/` to anything arriving through Funnel.

## Options considered

- **Served by the bridge at `/ui/`.** One address for the page and the API, so
  the cookie just works, and the phone already reaches that address. Chosen.
- **Hosted elsewhere, such as GitHub Pages.** Needs the origin allowed in the
  bridge, and a strict same-site cookie is not sent from another site at all,
  so the app would have to keep a bearer token in the browser, where a script
  can read it.
- **Doing nothing until there is a native app.** Nothing for the phone in the
  meantime.

## Decision

The app is built with relative paths and served by the bridge from
`CLAUDE_VOICE_UI_DIR` at `/ui/`. It calls the API on its own origin and signs in
with the cookie, at the tailnet-only address. In development, Vite passes `/api` on to a running bridge, so
the page still calls its own origin.

## Consequences

- The app holds no secret: the cookie is out of reach of its scripts.
- A new version reaches the phone only when the folder the bridge serves is
  rebuilt, so deploying is a build on Roy's computer.
- Worse: the app cannot be tried against the bridge from any other address
  without changing the bridge's settings.

## Related

[API.md](../API.md), `vite.config.ts`, [ADR-CVU-001](ADR-CVU-001-a-static-typescript-app-with-no-framework.md).
