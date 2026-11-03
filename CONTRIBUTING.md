# Contributing

Every rule this repository states is enforced by something that can fail. If
you find a rule here with no mechanism behind it, that is a bug worth
reporting.

## Set up

<!-- not run: clones the repository the reader is already in -->
```
git clone https://github.com/roykollensvendsen/claude-voice-ui
cd claude-voice-ui
npm ci
uv sync
```

The app is TypeScript and needs Node 22 or later. The repository's own tooling
(the commit checks, the mutation runner and the tests that keep these pages
honest) is Python, run through [uv](https://docs.astral.sh/uv/). Why two is in
[ADR-CVU-001](decisions/ADR-CVU-001-a-static-typescript-app-with-no-framework.md).
The commit linter is a separate binary,
[committed](https://github.com/crate-ci/committed).

To see the app against the bridge on this computer, run `npm run dev` and open
the address it prints. Vite passes `/api` on to the bridge at
`http://127.0.0.1:8811`, or to `CLAUDE_VOICE_URL` when that is set.

## The gates

All of these run in CI on every pull request. Run them before you push,
because they are the same lines:

<!-- not run: these are the gates; running them from inside a gate would recurse -->
```
npm run lint
npm run types
npm test -- --coverage
uv run ruff check . && uv run ruff format --check .
uv run pytest -q
committed --no-merge-commit origin/main..HEAD
```

Run them after the last edit, not before it. A file edited after the format
gate ran will fail in continuous integration, which is the cheapest possible
way to learn that the gates are not a ritual performed once.

## The quality ratchet

`quality.json` at the root records how the code stands: how much of `src`
the suite runs (`coverage`), how many guarded rules turn their test red when
switched off (`mutation`), the passing tests of both suites, lint and type
errors, import cycles among the modules that load, the most tangled
function in each module (`complexity`, McCabe's count), imports that reach up
a layer (`layer_violations`), and the share of lines in copied blocks of six
or more (`duplication`). The `quality` job in
CI measures the pull request and compares it with the base's `quality.json`:

- a measure may stay or get better, never worse; coverage may wobble half a
  point;
- a new module may have no function more tangled than 15, and no more than
  400 lines; a module that is already there may not grow (`max_module_lines`);
- a module imports, when it loads, only from layers below its own: words and
  storage, then what the data means and how the bridge is reached, then
  drawing, then the app, then the start. The layers are `LAYERS` in
  `scripts/structure.ts`, and a new module goes into one there;
- a level that got better is recorded in the same pull request, so it cannot
  slip back unnoticed;
- the suites together stay within `test_budget`, a limit changed by hand.

Record the levels after a change, and commit `quality.json` with it:

<!-- not run: it runs the whole suite and the mutation run, a few minutes -->
```
uv run python scripts/ratchet.py update
```

When a change has to make something worse, say so in the pull request, on a
line of its own, and still record the new level:

<!-- not run: a line in a pull request, not a command -->
```
Ratchet-Exception: coverage - the reason
```

The measures and their rules are the same as in claude-voice, so the bridge's
health page reads both repositories alike.

## Dependency updates

Dependabot opens one grouped pull request a month for each ecosystem. One
that brings only fixes and minor versions merges itself once every check is
green. One with a major version waits for a person to read what changed,
because a major version can change behaviour the checks do not see.

## How a change is made

1. **Decide before you build.** A choice that costs more to reverse than to
   take is written as a record under `decisions/` before the code, in the form
   [`decisions/README.md`](decisions/README.md) gives.
2. **Say it before you build it.** A rule, a flag or a field is written down
   before it is code. If the documentation does not say it, it is not decided.
3. **Write a test and watch it fail.** A test that passes on its first run
   proves nothing. Where the rule already exists and no test can precede it,
   turn the rule off with `uv run python scripts/mutate.py`, watch a named test
   go red, and keep the row in `scripts/mutations.toml`.

   A rule is a line marked `// RULE: what it says` in the app's source. Every
   one needs a row in `scripts/mutations.toml` and a test whose title is the
   rule's own words — `// RULE: a wrong secret is refused` wants
   `test("a wrong secret is refused", …)`. `tests/test_rules_have_evidence.py` refuses
   a rule missing either. That naming is not decoration: the mutation script
   checks that the test named after a rule is one of the ones that went red, and
   fails the run when something else broke instead. A kill by an unrelated test
   is not evidence about the rule.

   Do not edit the tree while it runs. It refuses to restore a file that
   changed underneath it and says so, but the run it was in the middle of is
   then about a tree that no longer exists.
4. **Write the smallest code that turns it green**, then refactor with the
   suite green.
5. **Open one pull request per change**, with the template's checklist
   answered. The template is the mechanism for the rules no script can measure.

`main` is protected: a pull request is required, every status check has to pass,
force pushes and deletions are refused, history stays linear, and none of it is
waived for administrators. That is a repository setting rather than a test,
because a test that proves it would need a credential to pass and would fail for
the wrong reasons. It is the one rule here enforced by something the suite
cannot see. `python scripts/forge.py roykollensvendsen/claude-voice-ui` in the `start-repo` skill is what
applies it, and it says plainly when the forge refuses — branch protection needs
a public repository or a paid plan.

A pull request lands by rebase, and by nothing else. Every commit on a branch
therefore arrives on `main` individually, so write each one to stand alone:
lintable, readable from `git blame` without the others, and green, except a
test-first commit, which is red on purpose and only in the tests it adds.
Work on a topic branch named for what it does, never on `main` itself. A branch
cannot be tidied at the end by squashing it, which is why `committed.toml`
refuses a fixup and a work-in-progress commit rather than trusting you to clean
up later.

## Words on the page, and adding a language

Every word the page shows lives in `src/i18n/`, one file per language, and
the code asks for it by key: `t("session.hide")`, or `plural(n,
"hidden.count")` for a text with a count. English, `en.json`, is the
reference. Names, questions and output from the sessions are never
translated; they are shown as they arrive.

`uv run pytest -q` holds every language to English:

- every key English has, and no key English no longer has;
- the same blanks, such as `{count}` and `{name}`, in every text;
- a warning for a text still identical to English, which is probably
  untranslated, unless the key is listed for that language in
  `src/i18n/same-as-english.json` (for example the app's name);
- `scripts/ui_text.py` fails on a string in `src/*.ts` that reads as words,
  so new text cannot skip the files. A string that only reaches a log ends
  its line with `// not shown`.

To add a language, say German:

1. Copy `src/i18n/en.json` to `src/i18n/de.json` and translate every text.
   Keep each `{blank}` as it is, and give every `.one`/`.other` pair the forms
   the language needs.
2. Import it in `src/i18n.ts`, add it to `LANGUAGES`, give it its own name in
   `NAMES` ("Deutsch"), and teach `pickLanguage` its tag.
3. List in `same-as-english.json` any key that is rightly the same as English.
4. Add a case for its tag to the language test in `test/i18n.test.ts`, run the
   gates, look at the page in it on a phone-sized screen for text that does
   not fit, and open a pull request.

## Documents that restate a fact

Point rather than copy. Where a document has to copy anyway, two test files
keep the copy honest. Any block fenced as ` ```console ` is run by
`tests/test_documented_commands.py`, and its output has to match what the page
shows. Pages are found by walking rather than listed, so a new one is covered
the day it is written; a block that looks like commands and is not run must
carry `<!-- not run: why -->` above it, because choosing another fence would
otherwise be an opt-out nobody sees.

`tests/test_documentation.py` checks the facts that are not commands: the
gates above against the workflow that must run them, and every deferred item
against its trigger. Add a test there whenever you write a fact into prose
that also lives in code.

## When something bites you

Write the lesson where the next person doing this task will read it, in the
same pull request as the fix. Where the mistake is checkable, make it a test or
a check rather than prose: prose gets skipped under the same pressure that
crowds out learning in the first place, and a failing test does not.

This is the one pattern with a measured effect behind it. A surgical checklist
run during the operation, rather than a lesson filed after it, halved the death
rate across eight hospitals. The incident-review literature diagnoses the
failure from the other side, naming the lesson nobody wired back to anything an
"orphan action item". The reasoning and its sources are in
[`references/learning-from-experience.md`](references/learning-from-experience.md).

Attach it to the step it belongs to, as a sentence in that step. Not a section
of its own, and never a "gotchas" heading: that is a drawer things are filed in
rather than read from. A lesson with no step to attach to does not belong in
that skill, and the absence is the signal that it belongs in another one. One
line in the skill, and the detail in `references/` if it needs more.

A lesson written into a skill keeps its provenance in `git blame`, not in the
text: point at the line, get the commit, get the story. Never write a commit
hash into a skill. It duplicates what blame already gives, it dates the
guidance, and the commit that records a lesson cannot cite itself.

What blame does not give is a corpus. It answers why one line says what it
says, and never which lessons have gone stale, which contradict each other, or
which step has none. That is what a knowledge base is for, and
[`decisions/deferred.md`](decisions/deferred.md) says what would make building
one worth it.

There is no retrospective ritual here on purpose. Every source measuring one
is about information flowing between people in a team, which has no referent
when the team is one person and their agents.

## Commit messages

**Write them for somebody who has never seen this project.** They do not know
the file names, the settings, or what any abbreviation here stands for, and a
message that sends them into the code to find out has failed. Everyday words,
and a term explained in the sentence before it is leaned on. Anything
mechanical — file paths, settings, flags, record numbers — goes at the bottom,
under a heading of its own, so that everything above it can be read without
them. The [`write-commit`](.claude/skills/write-commit/SKILL.md) skill has a
worked example of the same change written both ways.

[Conventional Commits](https://www.conventionalcommits.org/), checked by
`committed.toml`: one line, `type: Subject`, at most 72 characters,
capitalised after the type, no full stop. Types are build, chore, ci, docs,
feat, fix, perf, refactor, revert, style and test. Keep body lines at or under
100 characters. Say why the change was made, not what the diff already shows.

Write the subject in the imperative: it completes "if applied, this commit
will ...". So "Add the check", never "Added", "Adds", "Adding", and never a
noun phrase like "A new check". The linter has a setting for this, and it fires only on a lowercase first
word while the same configuration requires a capital, so it can never fire;
`scripts/imperative.py` is what refuses it.

**No links to a Claude session in a commit message.** A `Claude-Session:`
line, or any `claude.ai/code/session_` address, points into one person's
account and is a dead link to everyone else. Credit with `Co-Authored-By:`
only. `scripts/no_session_links.py` refuses it, in the commit-msg hook and in
continuous integration; the history was cleaned of them before it was
published, so every commit is held to it.

A `commit-msg` hook runs these checks while you are writing the message, rather than
in CI afterwards. Turn it on once per clone:

<!-- not run: it is already on in this clone -->
```
git config core.hooksPath .githooks
```

It is a convenience and not the gate: `--no-verify` skips it, and CI is what
actually blocks.

The hook also warns when a body is harder to read than it needs to be:
sentences over thirty words, an average over twenty, a body far past eighty
words. It only warns. How long a sentence needs to be is a judgement, and a
gate that refuses a message nobody can shorten teaches people to bypass it.

## Licence

GPL-3.0-or-later, in `LICENSE`. A contribution you submit is under that licence;
there is no separate agreement to sign.
