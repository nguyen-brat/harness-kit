---
name: long-plan-build
description: Build a long, multi-component implementation plan end to end with sub-agents, without dropping requirements or quality - a requirement list with ids, a coverage check that maps every id to a passing test, one fresh reviewer per component, parallel tracks on git worktrees for independent parts, careful merges, and a final whole-spec review. Use this skill whenever the user approves a plan or spec with many parts (roughly 5+ components) to be built - "build it", "go ahead", "approved, implement", "implement the whole plan", "yes do it all", accepting a plan in plan mode, "run the build in parallel" - or worries that a long build will miss parts of the plan or lose quality, even if they do not say "skill" or "sub-agents". Not for a small change or a plan of one or two parts (do it directly), and not for writing the plan itself.
---

# Long plan build

Goal: turn an approved spec into working, tested code where **every** checkable statement in the spec is implemented, proven by a test or a
named reviewer, and nothing was quietly dropped, while running independent parts in parallel to save wall-clock time.

**Why this exists.** On a 14-component build (about 116 requirements, 550 tests at the end) the things that went
wrong were never "the model could not write the code". They were: a requirement lost between plan and code, a builder declaring done on
a hunch, two parallel builders reading a shared file in different formats, a test that passed because it tested nothing, code that
followed the spec but failed on real data, a merge that silently dropped one side, Windows line endings poisoning every merge, and the
coordinator losing track after a context reset. Each step below exists because one of those happened. The method follows Anthropic's
long-running-agent practice (a fixed feature list only the `passes` flag may change, one feature at a time, progress file + git,
self-verification) and the Claude Code best practices (give the agent a check to run, enforce must-hold rules with a Stop hook, review
against the spec with a fresh subagent and skip style).

## Roles
- **Coordinator (you):** owns the requirement list, progress file, commits, merges and the decision of what runs in parallel. Writes
  little code itself; keeps its context for decisions. Never relays a sub-agent's claim as fact without the test output behind it.
- **Builder (sub-agent, one component):** implements one component from a fixed brief, writes tests named by requirement id, runs the
  full suite, reports. Never commits, never touches the requirement list.
- **Reviewer (fresh sub-agent, read-only):** checks one commit against the spec and its ids; reports only gaps that affect correctness,
  the user's outcome or run time. It never saw the builder's reasoning, which is the point.
- **Merge agent (sub-agent):** resolves conflicts when tracks are merged, keeping both sides' intent, then runs the suite.

## Procedure

Words used below: "spec" = the approved plan; "how-docs" = implementation notes, if the plan has them; "project rules" = the repo's
CLAUDE.md / contribution rules; "outcome" = what the user optimises (score, latency, revenue …) — use their words in briefs.

### 0. Set up (once)
1. Find the source of truth for the code and the machine where tests must run (ask only if it is genuinely unclear). Two layouts:
   - **Local:** edit and test in one checkout. Run the suite yourself with the spec reporter into `<build>/last-test.txt`, then
     `node <build>/coverage.mjs`. Skip `remote-track.sh`.
   - **Remote test machine** (bigger machine, the target OS): edit a local copy, keep git and run tests there with
     `scripts/remote-track.sh`. Check both copies are identical before you start (checksums).
   - **Different operating systems** (common: a Windows laptop for editing, a Linux machine for tests and production): write it into
     every brief. Results count only from the target OS; shipped code uses portable paths and no OS-specific shells; LF endings;
     commands on the editing machine follow its shell (Git Bash: Unix syntax, `/c/...` paths). Some tests fail only on the editing OS —
     never "fix" those by changing shipped code.
2. Put the code under git if it is not (`git init`, baseline commit). Add `.gitattributes` with `* text=auto eol=lf` before any merge.
3. Run the whole test suite once and record the baseline (count, failures, duration). You need it to tell new failures from old ones.
4. Create the build folder next to the plan, outside the shipped code — called `<build>` here (e.g. `plans/<plan>/build/`; avoid a name
   build tools clean). Put in it `requirements.json`, `progress.md`, the briefs (from `references/`, project facts filled in), and the
   scripts (`coverage.mjs`, `stop-check.mjs`, and `remote-track.sh` for the remote layout).
5. Write the requirement list (step 1) **before** arming the hook. Then install the Stop hook (`references/hooks.md`) and create
   `<build>/ACTIVE`. The hook blocks you from ending a turn while any requirement — including the FIN.* finish items — is open, unless
   `<build>/WAITING` lists a running background agent or `<build>/PAUSED` holds a question for the user. This is what keeps a long build
   from stopping after "phase 1". The hook lives in the project's settings, so it also affects other sessions in that project while
   `ACTIVE` exists: remove `ACTIVE` (and the hook entry) when the build ends.

### 1. Requirement list
1. Turn every concrete, checkable statement of the spec into one requirement with an id (`C1.04`), component, one-line text, and
   `verify: test | review | deferred`, `passes: false` (format: `references/requirements-format.md`). Typical density: 5–20 per component.
2. Spawn one independent checker: "compare the spec bullet by bullet with this list; report MISSING and WRONG items only". Apply its
   findings. In the reference build it found 20 missing and 6 wrong items; one of its own suggestions contradicted the spec, so check
   each finding against the spec text before applying it.
3. Rules written into the file: only `passes`/`evidence` change; requirements are never deleted or weakened; a wrong requirement is
   corrected to match the spec (record the correction in `rules`); new ones may be added when the spec says more than the list.
   `deferred` = needs the user or a real run (probes, live metrics); it does not block the build and is reported at the end.
4. Add the finish items as `review` requirements so the hook also guards the end: `FIN.01` three full-suite runs in a row green,
   `FIN.02` final whole-spec review done and its findings fixed and reviewed, `FIN.03` docs updated against the final code,
   `FIN.04` final report given to the user. A "whole suite green" item is a review item whose evidence is the suite output.

### 2. The check that decides "done"
- Every `verify: test` requirement needs a passing test whose name **starts with its id(s)** (`test('C1.07 owner reserve holds …')`;
  several ids may lead one name). `scripts/coverage.mjs` parses the full-suite output, sets `passes` for test ids, and lists every GAP.
- `verify: review` ids are set by you only from a reviewer's confirmation (file:line evidence) or, for FIN items, from the output that
  proves them. Edit `requirements.json` only while no main-track full-suite run is going (coverage rewrites the file at the end of
  each run).
- Coverage runs on the main track only; ids built on a parallel track show as GAP until that track is merged. Track runs print their
  id lines instead.
- "Done" = full suite green **and** coverage shows no GAP **and** every review id confirmed. Ask sub-agents for the command output, not
  for "all tests pass".

### 3. Plan the tracks (what can run in parallel)
- Draw the dependency order from the spec. Components that build on another's API (a parser, then the module that uses its output, then the hook that calls that module) stay in one
  sequential track. Components in separate files or with a hook-shaped dependency run on their own track.
- Each extra track = a git worktree on its own branch plus its own working copy; the helper takes `TRACK=<letter>`. Create both before
  the builder starts: `git worktree add <dst> -b track-<T> <base>` on the test machine, an empty local folder, then
  `TRACK=<T> remote-track.sh pull`, then `sync` and check `git status` is clean. Test runs are serialized across tracks with a lock
  (tests with fixed ports collide).
- **Decide every cross-track interface before the tracks start, and send the same text to both builders**: file formats (exact JSON
  shape, field types — e.g. "traps are plain strings"), function names and signatures for hooks (`leadNotify(service, line)`), who owns a
  shared schema or text. Two of the reference build's merge problems were interface guesses that differed.
- When the user asks for more speed, add tracks only for work whose inputs exist; say which parts must stay sequential and why.

### 4. Build one component (builder loop)
1. Coordinator: add a line `<agent id> <role> <component>` to `<build>/WAITING`, spawn the builder with the builder brief + component
   name + its ids + what earlier components built (APIs, hooks, known limits from progress.md). Background it; work on other things.
2. Builder reads the spec section, the how-docs, the project rules, the code it touches; implements the smallest complete change;
   writes behavioural tests per id; runs targeted tests, then the full suite; reports files, tests per id, suite line, ambiguities.
3. On return: remove its line from `WAITING` (delete the file when empty), read the report, check the suite line yourself, commit with
   the ids in the message, update progress.md.
4. Spawn the reviewer on that commit (reviewer brief; also listed in `WAITING`). It reads the exact commit (`git show <hash>:<path>`),
   never syncs or runs the suite in a shared copy, and may run tests from a `git archive` copy in its own `/tmp/rev-<hash>` folder. Point
   it at the builder's own choices and the riskiest question first ("can this ever report done/complete when it is not?").
5. The next builder of the same track may start right after the commit; the review runs alongside it. Reviewer gaps then go, by message,
   to the builder that currently owns those files (queued after its own work), or to a fix builder once the copy is free — never two
   builders in one copy. **Fixes are test-first**: "reproduce with a failing test, then fix". Every fix commit gets a review too (fixes
   introduced new gaps several times). Stop the loop when a review finds no correctness/outcome gap; if the third round on the same
   component still finds one, tell the user what keeps failing.

### 5. When the spec itself is wrong
Reviewers and builders will find spec statements that are unsound or fail on real data (reference build: a reversed subset condition
that would have caused a wrong submitted value; a 10 s timeout contradicted by recorded latencies; name matching that picked junk on
real data). Decide it yourself when the fix is clearly better for the user's stated goal, then: amend the spec with an "Amended/Corrected
during the build (who, date): …" sentence, add or correct the requirement, tell the user in plain words what changed and why. Do not
let a builder silently deviate, and do not keep code that follows the spec but fails the purpose.

### 6. Real data and end-to-end proof
- Unit tests on synthetic mocks pass easily. As soon as recorded real data exists, add a fixture (inside the test folder, not shipped)
  and test the component on it. Ask reviewers to try the real data too.
- Before the end, build the end-to-end tests the spec names (a full scenario through every component, and a replay of a real run) and
  record the measured timings: they are the build's best estimate of the real gain, and they find seams unit tests cannot.

### 7. Merging tracks
- Merge only when the target working copy has no uncommitted builder edits (the sync helper mirrors the working copy and would wipe a
  merge). Typical moment: right after a main-track commit, before the next main builder starts.
- Order matters, because `test` and `sync` mirror the local copy onto the test machine:
  1. `git merge -X renormalize track-<T>` on the test machine.
  2. Conflicts: trivial ones (both sides appended tests at the same spot, one import line) you resolve on the test machine with a small
     script; semantic ones go to a merge agent with both intents spelled out (`references/merge-brief.md`), which copies the conflicted
     tree into the local copy, resolves there, syncs and commits.
  3. **`pull`** so the local copy equals the merged HEAD — before any `test` or `sync`, or the next sync reverts the merge.
  4. Full suite, then a merge reviewer: "compare the merge with both parents; report lost or broken changes".
- An integration branch lets you merge finished tracks early while the main track is busy; merge it into main at the next quiet point.

### 8. Finish
1. **Stability:** fix every load-sensitive flaky test at its root (await the event, inject the clock) — one of the reference build's
   "flakes" was a real product race. Then three full-suite runs in a row, all green.
2. **Final whole-spec review** by a fresh agent: the spec bullet by bullet against the final code (not against the requirement list),
   cross-track seams (formats, hooks, schemas vs handlers, instructions naming arguments that do not exist), the user-visible path end to
   end, generality rules. Fix what it finds (test-first), review the fixes, run the suite again.
3. **Docs** in the same build (decision log, changelog, knowledge base) — a draft can be written in parallel early, but the final pass is
   against the final code; mark nothing "verified" that was not re-checked.
4. **Outward or irreversible steps** (install on the live machine, real-run probes, anything costing the user's budget) need the user's
   explicit OK and the right moment (e.g. no live session running). Write the question into `<build>/PAUSED`, ask once, with what you
   will do and what you checked; remove `PAUSED` when they answer.
5. Report to the user: what was built, the proof level (unit/mock/E2E, no real run), measured gains, known limits, deferred items.
   Then remove `ACTIVE` and the hook entry.

## Rules that keep it honest
- Keep `progress.md` current after every event (spawn, return, commit, review, decision). After a context reset you rebuild your state
  from it, the requirement list and `git log` — not from memory.
- One component per builder; one builder per working copy at a time; the coordinator never edits a copy a builder is using.
- A reviewer asked to find problems always finds something: act on correctness, outcome and time; skip style; check each finding
  against the spec before acting (a reviewer's suggestion once contradicted the spec).
- Read sub-agent reports critically: "tests pass" needs the suite line; "the flake is unrelated" needs a solo rerun; "follows the spec"
  is not "works" — ask what happens on real data.
- Mechanics that bit the reference build: Windows editors writing CRLF (strip CR on sync, `.gitattributes`, renormalize on merge);
  a command-rewriting shell hook that filtered tool output and corrupted binary `tar` streams typed directly into the shell (put such
  pipes inside a script file); tests that need a file outside the repo (copy it next to the archive); coverage regexes that read only
  the first id of a multi-id test name.
- Never let the build stop between components to ask "shall I continue?" once the user approved the whole build; give one-line status
  updates while agents run. Stop only for the user's decisions (outward actions, a spec change you cannot judge).

## Bundled files
- `references/builder-brief.md`, `references/reviewer-brief.md`, `references/merge-brief.md`: brief templates; copy into the build folder
  and fill the project facts (paths, test command, rules files).
- `references/requirements-format.md`: the requirement list format and rules.
- `references/hooks.md`: the Stop hook setting and the WAITING/PAUSED/ACTIVE protocol.
- `scripts/coverage.mjs`: maps full-suite output to requirement ids (node:test spec reporter; adapt the line regex for other runners).
- `scripts/stop-check.mjs`: the Stop hook script.
- `scripts/remote-track.sh`: sync/test/commit/pull helper for "edit locally, git + tests on a remote machine", with tracks.
