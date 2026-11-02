# The bridge's event API

This app talks to the claude-voice bridge only through its event API. The
specification lives with the bridge, so it cannot drift from the code that
serves it:
[docs/event-api.md in claude-voice](https://github.com/roykollensvendsen/claude-voice/blob/main/docs/event-api.md)
(in a checkout next to this one: `../claude-voice/docs/event-api.md`).

In short:
- sign in with the bridge's login secret;
- read the sessions and the one the owner talks to, and change it;
- read one session's output, what it waits for, and its pull requests;
- follow `/api/v1/events` for live `focus`, `active` and `news` events.
