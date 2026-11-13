# Every rule, turned off in turn

*Run 2026-11-13 by `python scripts/mutate.py --write
evidence/tests/rule-mutations.md`, which is how to repeat it. The script
restores every file it touched before it exits.*

Green on a first run proves nothing: a test that has never been red tests
nothing. Where a rule is written before its test, the test is run red first.
Where a rule already exists, this is the substitute. Each rule is disabled in
turn, by replacing its one line with something that can never hold, and the
suite is run. A rule whose removal breaks no test is a rule nothing protects.

**Result: 42 of 42 rules turned off the test that names them.** None survived.

| Rule turned off | Tests that went red | The test that names it | Did that one go red? |
|---|---|---|---|
| a session with a question waits for an answer | 1 | `test_a_session_with_a_question_waits_for_an_answer` | yes |
| sessions keep the order of their numbers, whatever their state | 251 | `test_sessions_keep_the_order_of_their_numbers_whatever_their_state` | yes |
| a focus event matches a session by id as well as by name | 23 | `test_a_focus_event_matches_a_session_by_id_as_well_as_by_name` | yes |
| the sessions are fetched again every minute | 7 | `test_the_sessions_are_fetched_again_every_minute` | yes |
| after two quiet minutes the speech bubble goes away | 3 | `test_after_two_quiet_minutes_the_speech_bubble_goes_away` | yes |
| being signed out while watching returns to the sign-in page | 6 | `test_being_signed_out_while_watching_returns_to_the_sign_in_page` | yes |
| a missing required thing shows a red banner | 1 | `test_a_missing_required_thing_shows_a_red_banner` | yes |
| the check is asked again every five minutes, not on every refresh | 1 | `test_the_check_is_asked_again_every_five_minutes_not_on_every_refresh` | yes |
| the state the bridge reports wins over the app's own reading | 10 | `test_the_state_the_bridge_reports_wins_over_the_app_s_own_reading` | yes |
| being behind is marked as behind even when also ahead | 3 | `test_being_behind_is_marked_as_behind_even_when_also_ahead` | yes |
| a reached limit says so | 1 | `test_a_reached_limit_says_so` | yes |
| usage is asked again every minute | 2 | `test_usage_is_asked_again_every_minute` | yes |
| the update starts only after the owner confirms | 3 | `test_the_update_starts_only_after_the_owner_confirms` | yes |
| an approval it waits on is shown, to be answered by voice or at the screen | 1 | `test_an_approval_it_waits_on_is_shown_to_be_answered_by_voice_or_at_the_screen` | yes |
| a new turn announced on the stream is fetched after the last one shown | 2 | `test_a_new_turn_announced_on_the_stream_is_fetched_after_the_last_one_shown` | yes |
| a hidden session comes back when it starts waiting | 4 | `test_a_hidden_session_comes_back_when_it_starts_waiting` | yes |
| the view chosen is remembered | 23 | `test_the_view_chosen_is_remembered` | yes |
| every kind of waiting is amber, as in the design draft | 2 | `test_every_kind_of_waiting_is_amber_as_in_the_design_draft` | yes |
| a long press opens the session's page without choosing it | 3 | `test_a_long_press_opens_the_session_s_page_without_choosing_it` | yes |
| the order holds still while a finger is on the screen | 2 | `test_the_order_holds_still_while_a_finger_is_on_the_screen` | yes |
| a tap just after the sessions moved chooses nothing | 1 | `test_a_tap_just_after_the_sessions_moved_chooses_nothing` | yes |
| the percentage turns from grey to yellow to red near the limit | 5 | `test_the_percentage_turns_from_grey_to_yellow_to_red_near_the_limit` | yes |
| a new version is loaded only when the notice is tapped | 2 | `test_a_new_version_is_loaded_only_when_the_notice_is_tapped` | yes |
| the theme chosen is remembered | 1 | `test_the_theme_chosen_is_remembered` | yes |
| the language chosen is remembered | 11 | `test_the_language_chosen_is_remembered` | yes |
| a name the voice used matches the session on this computer, not one of that name on another machine | 2 | `test_a_name_the_voice_used_matches_the_session_on_this_computer_not_one_of_that_name_on_another_machine` | yes |
| a machine's folded group stays folded when the page opens again | 1 | `test_a_machine_s_folded_group_stays_folded_when_the_page_opens_again` | yes |
| a terminal is offered only on this computer, and only for a session that runs on it | 1 | `test_a_terminal_is_offered_only_on_this_computer_and_only_for_a_session_that_runs_on_it` | yes |
| an exempt measure shows its reason and is never marked green | 1 | `test_an_exempt_measure_shows_its_reason_and_is_never_marked_green` | yes |
| a section folded by hand stays folded until something new waits in it | 1 | `test_a_section_folded_by_hand_stays_folded_until_something_new_waits_in_it` | yes |
| a switch groups the sessions by machine instead, and the phone remembers it | 1 | `test_a_switch_groups_the_sessions_by_machine_instead_and_the_phone_remembers_it` | yes |
| each role shows its purpose, who fills it, its limits and routing, and an unfilled one is marked | 1 | `test_each_role_shows_its_purpose_who_fills_it_its_limits_and_routing_and_an_unfilled_one_is_marked` | yes |
| the code-health page looks again only while it is open and the bridge is measuring | 1 | `test_the_code_health_page_looks_again_only_while_it_is_open_and_the_bridge_is_measuring` | yes |
| every component in a programme keeps its name, however few sessions it has | 2 | `test_every_component_in_a_programme_keeps_its_name_however_few_sessions_it_has` | yes |
| two sessions with the same name each say what tells them apart | 1 | `test_two_sessions_with_the_same_name_each_say_what_tells_them_apart` | yes |
| a hint put away stays away for that same group | 1 | `test_a_hint_put_away_stays_away_for_that_same_group` | yes |
| a hint with fewer than two of its sessions on the page is not shown | 1 | `test_a_hint_with_fewer_than_two_of_its_sessions_on_the_page_is_not_shown` | yes |
| an answer that fails says why under the question | 1 | `test_an_answer_that_fails_says_why_under_the_question` | yes |
| a refusal without the bridge's words still says what happened | 1 | `test_a_refusal_without_the_bridge_s_words_still_says_what_happened` | yes |
| an answer refused as coming from another page says where to answer instead | 1 | `test_an_answer_refused_as_coming_from_another_page_says_where_to_answer_instead` | yes |
| an ending of the checks the page does not know still reads plainly | 1 | `test_an_ending_of_the_checks_the_page_does_not_know_still_reads_plainly` | yes |
| a measure with nothing measured yet says so in the page's language | 1 | `test_a_measure_with_nothing_measured_yet_says_so_in_the_page_s_language` | yes |

## What this does not prove

That the rules are the right rules, or that a rule catches every case of what
it names. It proves each rule is load-bearing: switch it off and a named test
says so. The last column is why that is worth more than a count: a mutation can
break a test for an incidental reason, and a `NO` there fails this script even
though something went red. A new rule follows the order in `CONTRIBUTING.md`
instead, a failing test first, and is added to `scripts/mutations.toml`, which
`tests/test_rules_have_evidence.py` requires.
