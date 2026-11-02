# claude-voice-ui

A phone app for talking to Claude Code sessions by voice.

The owner talks to the Claude Code sessions on his computer through a voice
assistant, by way of the [claude-voice](https://github.com/roykollensvendsen/claude-voice)
bridge. This app is the screen beside the voice:

- **Pick who the voice talks to.** Every session shows as a card with its name,
  project and status. Tapping one makes it the session the voice sends to by
  default.
- **Watch the conversation live.** While the owner talks, the app highlights the
  session being talked to right now. It shows what that session last wrote,
  whether it waits for a choice or an approval, and the open pull requests of
  its project.

It is a progressive web app, so it can be added to an Android home screen and
opened at any time, with or without a voice call running.

## What a card shows

Every session is in exactly one of seven states, each with its own icon and
colour, and the card says how long ago it last changed. Sessions waiting for
the owner come first. This is the list the code itself holds:

```console
$ node scripts/states.ts
●  working  green  Working
○  idle     grey   Idle
?  answer   amber  Waiting for an answer
!  approval orange Waiting for approval
›  shell    slate  At the shell
→  moved    faded  Moved
■  stopped  red    Stopped
```

## How it talks to the bridge

Only through the bridge's event API, described in [API.md](API.md): a few JSON
endpoints and one stream of live events, behind the bridge's own login. The app
keeps no data of its own beyond being signed in.

## Where things stand

The first version works against the bridge on the owner's computer:

- signing in with the bridge's login secret, with a reason when it is refused;
- a card for every session, in one of the states above, waiting sessions first;
- tapping a card makes it the session the voice talks to;
- a bar naming the session the voice is talking to right now, from the bridge's
  live `focus` events, falling back to the chosen session after two quiet
  minutes;
- live updates from the bridge's event stream, and a fresh list every fifteen
  seconds, because the bridge does not yet announce every change of state.

Still to come, each agreed with the bridge first: a detail view with live
output, answering questions and approvals, git status per session, an update
button for the bridge, usage bars, and a pinned card for contributing.

## Try it

<!-- not run: starts a development server that runs until stopped -->
```bash
npm ci
npm run dev
```

This serves the app at `http://localhost:5173` and passes `/api` on to the
bridge at `http://127.0.0.1:8811` (or `CLAUDE_VOICE_URL`). With
`CLAUDE_VOICE_TOKEN` set in its environment, the development server signs every
call in by itself; the page never sees the secret.

## Put it on the phone

<!-- not run: builds into dist/, which the bridge is then told to serve -->
```bash
npm run build
```

The bridge serves the built folder at `/ui/` when `CLAUDE_VOICE_UI_DIR` names
`dist/` ([ADR-CVU-003](decisions/ADR-CVU-003-served-by-the-bridge.md)). The app
is meant to be reached only inside the owner's tailnet, over `tailscale serve`,
never over the public Funnel address. Both are changes to the owner's own
service settings, so neither is made without asking.
