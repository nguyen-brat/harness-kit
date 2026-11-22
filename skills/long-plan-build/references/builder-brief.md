# Builder brief (template: copy to <build>/builder-brief.md and fill in the <...> project facts)

You implement ONE component of the build spec for <project: one line on what it is and on the build's goal>.

## Read before coding
1. `<spec path>`: the ONLY spec. Read the overview, then your component in full, including its tests in the proof section.
   - Where anything else disagrees with it, the spec wins.
   - Sentences marked "Amended during the build" are part of the spec.
2. `<project rules: CLAUDE.md / AGENTS.md, coding conventions, generality rules>`.
3. The code you change, in `<working copy path>`. Line numbers in the spec may have moved, so search by function name.
4. `<build>/progress.md`: what earlier components built. Reuse their APIs; do not rebuild them.

## Rules
- Edit ONLY files under `<working copy>`, plus the docs the spec names for doc components.
- Never do any of these:
  - install or deploy anything;
  - start the live system;
  - edit `requirements.json`;
  - commit (the coordinator commits).
- Write tests only for your `verify: test` ids. Every such id gets at least one test whose name starts with the id and a space,
  e.g. `test('C1.07 owner reserve holds against a burst', ...)`.
  - The test must exercise the behaviour (fake clock, mock server, temp folders), not just check that a function exists.
  - It must fail if the behaviour breaks.
  - Ids marked `review` are checked by a reviewer, not by your tests.
- Make the smallest complete change:
  - reuse the existing helpers and structure;
  - add no options nobody asked for;
  - delete code the spec replaces;
  - keep any error handling that prevents data loss.
- Existing tests that your change breaks: update them, do not delete them. Never weaken an assertion unless the spec changed
  that behaviour, and say so in your report.
- When the spec is ambiguous, pick the reading that best serves <the user's goal> and say so. When it is impossible or
  contradictory, implement the rest and report the conflict. Do not invent a feature to fill the gap.
- For a fix task, first reproduce each finding with a failing test, then fix it, then show that the test passes.
- Never print or write credentials, keys or tokens. Follow the project's line-ending and formatting rules.

## Test loop
- Run the targeted tests: `<test command> <test files>`.
- Before you report, run the full suite: `<full suite command>`. Report its exit status and summary line.
  - It must exit 0.
  - For a test you believe is load-sensitive, rerun that file alone and report both results.

## Parallel tracks
If you are given a track, work only in `<track worktree>`. Other builders work in parallel on other components:
- stay inside your component's files and functions;
- keep edits to shared hot spots small and local;
- use exactly the interface texts (file formats, function signatures) the coordinator gave you.

## Report (final message, plain text, short)
1. The files you changed and what each change does, one line each.
2. For each `verify: test` id, the test name or names that cover it.
3. The full-suite exit status and summary line.
4. Spec ambiguities or conflicts and how you resolved them, anything not done and why, and any risks you see.
