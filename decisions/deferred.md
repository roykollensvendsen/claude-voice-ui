# What is deliberately not done yet

A thing left undone with no trigger is a thing forgotten. Each row names what
would make it worth doing, so the question comes back on its own rather than
depending on someone remembering it. Nothing enforces a trigger; the list is
read whenever a decision record is written and when a phase ends.

| Not done | The trigger | Why not now |
|---|---|---|
| A coverage threshold in CI | Two months of measured coverage to set it below | A number picked before there is data is a guess with a gate on it |
| A code of conduct and issue templates | A second contributor, or the first outside issue | Boilerplate answering questions nobody has asked |
| A release workflow and publishing | The first release someone outside will install | A published name is claimed and a published version cannot be reused |
| `CODEOWNERS` | A second person who reviews | It would name one person as the owner of everything |
| `pre-commit` as a requirement rather than an option | A second contributor | The gates run in CI, and a hook one person installs is a hook one person maintains |
| A service worker, so the app opens offline | Milestone 5 (install, offline shell, notifications), or the phone showing a blank page when the bridge is down | The app is useless without the bridge, and a cached old version is a new way to be confused |
| Using the bridge's own `state`, `state_since` and `status` event instead of deriving the state here | The bridge ships them (agreed with claude-voice-work on 2026-11-02) | They do not exist yet; until then the app maps the raw `status` itself |
| Polling less often than every fifteen seconds | The bridge sends a `status` event on every change of state | Without it, polling is the only way a card changes from working to idle |
