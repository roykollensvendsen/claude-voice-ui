# Every rule, turned off in turn

*Run 2026-11-02 by `python scripts/mutate.py --write
evidence/tests/rule-mutations.md`, which is how to repeat it. The script
restores every file it touched before it exits.*

Green on a first run proves nothing: a test that has never been red tests
nothing. Where a rule is written before its test, the test is run red first.
Where a rule already exists, this is the substitute. Each rule is disabled in
turn, by replacing its one line with something that can never hold, and the
suite is run. A rule whose removal breaks no test is a rule nothing protects.

**Result: 17 of 17 rules turned off the test that names them.** None survived.

| Rule turned off | Tests that went red | The test that names it | Did that one go red? |
|---|---|---|---|
| a session with a question waits for an answer | 1 | `test_a_session_with_a_question_waits_for_an_answer` | yes |
| sessions waiting for the owner come first | 3 | `test_sessions_waiting_for_the_owner_come_first` | yes |
| a focus event matches a session by id as well as by name | 2 | `test_a_focus_event_matches_a_session_by_id_as_well_as_by_name` | yes |
| the sessions are fetched again every minute | 3 | `test_the_sessions_are_fetched_again_every_minute` | yes |
| after two quiet minutes the bar goes back to the active session | 1 | `test_after_two_quiet_minutes_the_bar_goes_back_to_the_active_session` | yes |
| being signed out while watching returns to the sign-in page | 6 | `test_being_signed_out_while_watching_returns_to_the_sign_in_page` | yes |
| a missing required thing shows a red banner | 1 | `test_a_missing_required_thing_shows_a_red_banner` | yes |
| the check is asked again every five minutes, not on every refresh | 1 | `test_the_check_is_asked_again_every_five_minutes_not_on_every_refresh` | yes |
| the state the bridge reports wins over the app's own reading | 6 | `test_the_state_the_bridge_reports_wins_over_the_app_s_own_reading` | yes |
| being behind is marked as behind even when also ahead | 3 | `test_being_behind_is_marked_as_behind_even_when_also_ahead` | yes |
| a reached limit says so | 1 | `test_a_reached_limit_says_so` | yes |
| usage is asked again every minute | 1 | `test_usage_is_asked_again_every_minute` | yes |
| the update starts only after the owner confirms | 1 | `test_the_update_starts_only_after_the_owner_confirms` | yes |
| an approval it waits on is shown, to be answered by voice or at the screen | 1 | `test_an_approval_it_waits_on_is_shown_to_be_answered_by_voice_or_at_the_screen` | yes |
| a new turn announced on the stream is fetched after the last one shown | 2 | `test_a_new_turn_announced_on_the_stream_is_fetched_after_the_last_one_shown` | yes |
| a hidden session comes back when it starts waiting | 1 | `test_a_hidden_session_comes_back_when_it_starts_waiting` | yes |
| the view chosen is remembered | 17 | `test_the_view_chosen_is_remembered` | yes |

## What this does not prove

That the rules are the right rules, or that a rule catches every case of what
it names. It proves each rule is load-bearing: switch it off and a named test
says so. The last column is why that is worth more than a count: a mutation can
break a test for an incidental reason, and a `NO` there fails this script even
though something went red. A new rule follows the order in `CONTRIBUTING.md`
instead, a failing test first, and is added to `scripts/mutations.toml`, which
`tests/test_rules_have_evidence.py` requires.
