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

## How it talks to the bridge

Only through the bridge's event API, described in [API.md](API.md): a few JSON
endpoints and one stream of live events, behind the bridge's own login. The app
keeps no data of its own beyond being signed in.

## Where things stand

Nothing is built yet. `prototype-from-claude-voice.py` holds a first page
written inside the bridge before the UI moved here: its HTML, CSS and script
show one way to draw the cards and the live panel. Take what is useful from it,
then delete it.
