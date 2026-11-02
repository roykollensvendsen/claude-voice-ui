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
| The last seven days of voice activity, drawn as a small chart | Roy asks how voice use changes over the week, or the bridge has a week of counts | Counting began on 2026-11-02, so there is nothing to draw yet |
| Markdown drawn as formatting in a session's turns | Roy finds the raw asterisks and dashes hard to read on the phone | A Markdown renderer is a dependency and a way to inject markup; plain text is safe and readable enough |
| Answering questions and approvals from the phone | Roy decides, through claude-voice-work, to allow it for sessions the bridge runs | A tap would run a tool on his computer; it is his decision, and terminal sessions cannot be answered from outside at all |
