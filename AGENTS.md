# For an assistant working on this repository

claude-voice-ui is the phone page beside the claude-voice bridge. It talks to
the bridge only through the bridge's event API, specified in claude-voice's
`docs/event-api.md`.

## How a change is made

[CONTRIBUTING.md](CONTRIBUTING.md) is the rule book, and
[ADR-CVU-002](decisions/ADR-CVU-002-how-a-change-is-made.md) is why. In short:

- **A failing test first.** Commit the test on its own, red, then the code
  that turns it green, as two commits. A `// RULE:` line in the code needs a
  test titled with the same words and a row in `scripts/mutations.toml`.
- **Conventional Commits.** `type: Subject` in the imperative, at most 72
  characters; the types are in `committed.toml`. The body is written for a
  stranger, and file names and settings go in a details section at the bottom.
  No fixup or work-in-progress commits: every commit stands alone.
- **Topic branches.** Once the repository is on GitHub, work happens on a
  branch named for what it does, and lands on `main` through a pull request,
  by rebase.
- **The gates** in CONTRIBUTING pass before every commit. The commit-msg hook
  checks the message locally, and CI checks every commit again.

## What only the owner decides

- **Publishing.** Never create the GitHub repository, push, or open a pull
  request without the owner's yes.
- **The bridge.** claude-voice belongs to its own session. Ask it for API
  changes; never edit `../claude-voice` or its service.
- **Network.** Tailscale serve and Funnel settings are the owner's to change.
- **Approvals.** Never answer an approval for the owner.

## What never to do

- **Never print the login secret** (`CLAUDE_VOICE_TOKEN` in
  `~/.config/claude-voice/env`).
- **Never leave the bridge changed after a live test.** Read what you are about
  to change (for example the session the voice talks to) and put it back.
