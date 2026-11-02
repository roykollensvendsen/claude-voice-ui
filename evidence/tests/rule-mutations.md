# Every rule, turned off in turn

*Run 2026-11-02 by `python scripts/mutate.py --write
evidence/tests/rule-mutations.md`, which is how to repeat it. The script
restores every file it touched before it exits.*

Green on a first run proves nothing: a test that has never been red tests
nothing. Where a rule is written before its test, the test is run red first.
Where a rule already exists, this is the substitute. Each rule is disabled in
turn, by replacing its one line with something that can never hold, and the
suite is run. A rule whose removal breaks no test is a rule nothing protects.

**Result: 6 of 6 rules turned off the test that names them.** None survived.

| Rule turned off | Tests that went red | The test that names it | Did that one go red? |
|---|---|---|---|
| a session with a question waits for an answer | 1 | `test_a_session_with_a_question_waits_for_an_answer` | yes |
| sessions waiting for the owner come first | 1 | `test_sessions_waiting_for_the_owner_come_first` | yes |
| a focus event matches a session by id as well as by name | 1 | `test_a_focus_event_matches_a_session_by_id_as_well_as_by_name` | yes |
| the sessions are fetched again every fifteen seconds | 2 | `test_the_sessions_are_fetched_again_every_fifteen_seconds` | yes |
| after two quiet minutes the bar goes back to the active session | 1 | `test_after_two_quiet_minutes_the_bar_goes_back_to_the_active_session` | yes |
| being signed out while watching returns to the sign-in page | 6 | `test_being_signed_out_while_watching_returns_to_the_sign_in_page` | yes |

## What this does not prove

That the rules are the right rules, or that a rule catches every case of what
it names. It proves each rule is load-bearing: switch it off and a named test
says so. The last column is why that is worth more than a count: a mutation can
break a test for an incidental reason, and a `NO` there fails this script even
though something went red. A new rule follows the order in `CONTRIBUTING.md`
instead, a failing test first, and is added to `scripts/mutations.toml`, which
`tests/test_rules_have_evidence.py` requires.
