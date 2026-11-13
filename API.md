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
- follow `/api/v1/events` for live `focus`, `active` and `news` events;
- show sessions on the owner's other computers: each session's `machine`
  (null for the bridge's own), the `machines` beside the sessions with
  whether each one answers, and the `machine` event when that changes. Their
  ids carry the machine's name in front and are used as they are.
- show the team's work: `/api/v1/work` gives what waits on the owner and the
  open pull requests across the repositories, and the `work` event carries
  the same whenever it changes.
- open a session where the owner is: `GET /api/v1/whoami` says whether the
  page was opened on the bridge's own computer, and only then does the page
  offer `POST /api/v1/sessions/{id}/focus` for a session that runs there. The
  bridge's answer is a code (`raised`, `attached`, or a reason), which the page
  says in words.
- group the sessions by programme: each session's `programme`, `component`,
  `role` and `programme_wide`, the `programmes` beside the sessions with their
  `order`, and the `programmes` event when that list changes. Each
  programme's Organisation view is read from `/api/v1/org/{programme}` when it
  is opened.
- show how the code is doing: `/api/v1/health/software` answers at once from
  the report the bridge keeps, with `measured_at` (null before the first
  measure) and `refreshing`. While `refreshing` is true and the page is open,
  the page reads it again every 30 seconds.
- hint at new programmes: the `programme_hints` beside the sessions, and the
  `programme_hints` event when they change, name groups of sessions in no
  programme that message each other or share a folder or a name. Under Other,
  the page shows each group together with a note, a link to how a programme is
  written down, and a way to put the hint away. It never writes anything.
- answer a session's question or approval: `POST /api/v1/prompts/{id}`. The
  page tells the cases apart under the question: answered, gone (404), not
  fitting (409, 502), refused for another reason (its status and the bridge's
  words, or a plain sentence when it gave none), and an answer that never
  reached the bridge. A refusal as coming from another page (403) adds a next
  step: open the page at the bridge's own address.
