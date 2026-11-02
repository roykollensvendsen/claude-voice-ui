# Usage figures the app can show

What can be read reliably about how much of the owner's Claude plan is used,
checked on 2026-11-02 against Claude Code 2.1.314 and the Python Agent SDK
0.2.175. None of it is in the bridge's event API yet. Adding it is a change to
the API, agreed with claude-voice first.

## Worth showing

| Figure | Where it comes from | How sure |
| --- | --- | --- |
| How full each session's context is, in per cent | Claude Code's status line input (`context_window.used_percentage`); for sessions the bridge runs, the SDK's `get_context_usage()`; otherwise the `usage` of the latest message in the transcript | documented; the transcript fallback is not |
| The plan's five-hour use, in per cent, and when it resets | status line input `rate_limits.five_hour.used_percentage` and `.resets_at` | documented, for Pro and Max only, and only after a session's first answer |
| The plan's weekly use, in per cent, and when it resets | status line input `rate_limits.seven_day` | the same |
| A warning when the limit is close or reached | the SDK's rate-limit event, `allowed_warning` or `rejected` | documented, but sent only when the state changes |

The status line input reaches only a status line script, so a small script
would have to write it to a file the bridge reads. Label the plan bars
"includes chat and voice" and "as of the last answer": they cover every way of
using Claude, and they move only when a session talks to the model.

## Leave out

- **Cost in dollars.** On a subscription it is an estimate at list price and not
  what anyone pays.
- **Voice minutes, or voice use apart from the rest.** Voice in the Claude app
  counts toward the same limits as chat and Claude Code, and nothing reports it
  separately.
- **Undocumented sources:** rate-limit response headers, the usage page on
  claude.ai, and `~/.claude/stats-cache.json`.
- **OpenTelemetry export.** It works, but needs a collector running; too much
  for one person.

## Sources

- Status line input: https://code.claude.com/docs/en/statusline
- Costs on a subscription: https://code.claude.com/docs/en/costs
- Monitoring: https://code.claude.com/docs/en/monitoring-usage
- Usage limits: https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work
- Voice mode counts toward the same limits: https://support.claude.com/en/articles/11101966-use-voice-mode
