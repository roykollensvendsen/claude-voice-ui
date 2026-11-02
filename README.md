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

Every session is in exactly one of eight states, each with its own icon and
colour, and the card says how long it has been in that state. The bridge
decides the state; the app reads it from rawer words only for an older bridge. Sessions waiting for
the owner are counted at the top, and each session keeps its place, in the order of its number. This is the list the code itself holds:

```console
$ node scripts/states.ts
●  working  green  Working
○  idle     grey   Idle
?  answer   amber  Waiting for an answer
!  approval amber  Waiting for approval
…  input    amber  Waiting for input
→  moved    faded  Moved
■  stopped  red    Stopped
```

## How it talks to the bridge

Only through the bridge's event API, described in [API.md](API.md): a few JSON
endpoints and one stream of live events, behind the bridge's own login. The app
keeps no data of its own beyond being signed in.

## Where things stand

The app works against the bridge on the owner's computer:

- signing in with the bridge's login secret, with a reason when it is refused;
- a grid of small tiles, one per session, in one of the states above, waiting
  sessions first, changing within seconds of the session itself; a switch
  turns it into a list of cards that can be opened in place, and sessions can
  be hidden;
- one tap on a tile makes it the session the voice talks to; a long press, or
  the arrow in its corner, opens the session's page instead;
- the session's page: its latest turns as they arrive, what it waits for, and
  its open pull requests;
- each session's branch, last commit and distance from main, and how full its
  context is;
- the plan's use with its reset time, and an estimate of voice activity;
- a banner naming anything the bridge is missing on the computer, and how to
  fix it, and a button to update the bridge when it is behind;
- a bar naming the session the voice is talking to right now, and a legend for
  the colours.

Still to come, each agreed with the bridge first: answering questions and
approvals from the phone, once the owner decides to allow it, and a pinned
card for contributing.

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
