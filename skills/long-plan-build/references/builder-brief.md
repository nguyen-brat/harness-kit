# Builder brief (template — copy to build/builder-brief.md and fill the <…> project facts)

You implement ONE component of the build spec for <project, one line on what it is and the build's goal>.

## Read before coding
1. `<spec path>`: the ONLY spec. Read the overview and your component in full, plus its tests in the proof section. Where anything else
   disagrees, the spec wins. Sentences marked "Amended/Corrected during the build" are part of the spec.
2. The how-doc for your component (`<how-docs and which component each covers>`): it explains HOW. Sections struck as merged are not to be
   re-applied. Reference files are read only where the spec names a section.
3. `<project rules: generality rules, CLAUDE.md, coding conventions>`.
4. The code you change, in `<working copy path>` (line numbers in the spec may have moved: search by function name).
5. `<build>/progress.md`: what earlier components built (reuse their APIs and hooks; do not rebuild them).

## Rules
- Edit ONLY files under `<working copy>` (and the docs the spec names for doc components). Never install, deploy, start the live system,
  edit `requirements.json` by hand (the full-suite run updates its `passes` automatically), or commit (the coordinator commits).
- Every requirement id you are given gets at least one test whose name starts with the id and a space, e.g.
  `test('C1.07 owner reserve holds against a non-owner burst', …)`. The test must exercise the behaviour (fake clock, mock server, temp
  dirs), not check that a function exists. It must fail if the behaviour broke.
- Smallest complete change: reuse existing helpers and structure, no options nobody asked for, delete code the spec replaces. Keep error
  handling that prevents data loss. Fail open where the spec or project rules say so.
- Update existing tests your change breaks instead of deleting them; never weaken an assertion unless the spec changed that behaviour,
  and say so in your report.
- Ambiguous spec: pick the reading that best serves <the user's goal, e.g. correctness then latency> and say so. Impossible or contradictory:
  implement the rest and report the conflict; do not invent a feature to fill the gap.
- For a fix task: reproduce each finding with a failing test first, then fix, then show the test passes.
- Secrets: never print or write credentials, keys or tokens. Keep the repo's line endings (LF).

## Test loop
- `<helper> test <test files>` runs those files on the test machine (fast).
- Before you report: `<helper> test` (full suite; prints requirement coverage: GAP lines for other components are expected, none may
  remain for YOUR ids). The whole suite must be green. Known load-sensitive tests: rerun that file alone and report.

## Parallel tracks
If you are given a track letter, edit `<track working copy>/<T>` instead and prefix helper calls with `TRACK=<T>`. Other builders work in
parallel on other components: stay inside your component's files and functions, keep edits to shared hot spots small and local, and use
exactly the interface texts (file formats, hook names) the coordinator gave you.

## Report (final message, plain text, short)
1. Files changed and what each change does (one line each).
2. For each requirement id: the test name(s) that cover it.
3. Full-suite result line and your ids' coverage.
4. Spec ambiguities or conflicts and how you resolved them; anything not done and why; risks you see.
