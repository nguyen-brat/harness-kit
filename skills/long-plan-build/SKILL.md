---
name: long-plan-build
description: Build a long, multi-component implementation plan end to end with sub-agents, without dropping requirements or quality - a requirement list with ids, a check that maps every id to evidence (a passing test or a reviewer's confirmation), one fresh reviewer per component, parallel tracks on git worktrees for independent parts, careful merges, and a final whole-spec review. Use this skill whenever the user approves a plan or spec with many parts (roughly 5+ components) to be built - "build it", "go ahead", "approved, implement", "implement the whole plan", "yes do it all", accepting a plan in plan mode, "run the build in parallel" - or worries that a long build will miss parts of the plan or lose quality, even if they do not say "skill" or "sub-agents". Not for a small change or a plan of one or two parts (do it directly), and not for writing the plan itself.
---

# Long plan build

**Goal:** turn an approved spec into working code. Every checkable statement in the spec must be implemented and proven,
nothing quietly dropped, and independent parts run in parallel to save time.

**Why:** long builds rarely fail because the model cannot write the code. They fail on bookkeeping:
- a requirement gets lost between plan and code;
- a builder declares done on a hunch;
- two parallel builders read a shared format differently;
- a test passes because it tests nothing;
- code follows the spec but fails on real data;
- a merge silently drops one side;
- the coordinator loses track after a context reset.

Each step below closes one of these gaps.

## Roles
- **Coordinator (you).** You own:
  - the requirement list, the progress file, commits and merges;
  - which components run in parallel.

  Write little code yourself, and keep your context for decisions. Never relay a sub-agent's claim without the output behind it.
- **Builder (sub-agent).** It builds one component from a fixed brief, then:
  - writes tests named by requirement id;
  - runs its tests and the full suite;
  - reports back.

  It never commits and never edits the requirement list.
- **Reviewer (fresh sub-agent, read-only).** It checks one commit against the spec and the ids. It reports only gaps that
  affect correctness, the user's outcome or run time. It never saw the builder's reasoning, which is the point.
- **Merge agent (sub-agent).** It resolves conflicts when tracks merge, keeping both sides' intent.

## Procedure

### 0. Set up (once)
1. Make sure the code is under git, with a clean baseline commit. Everything below runs on this one machine: editing, tests, and
   parallel tracks as git worktrees.
   - Optional: if results only count on another machine (another OS, bigger hardware), keep building here. Run the suite
     there by pushing the branch with git and pulling it on that machine. Never copy or mirror a working copy across machines.
2. Run the whole suite once and record the baseline: count, failures and duration. You need it to tell new failures from old
   ones.
3. Create a build folder outside the shipped code (called `<build>` here). Put in it:
   - `requirements.json` and `progress.md`;
   - the briefs from `references/`, with the project facts filled in;
   - for a Node `node:test` project, `scripts/coverage.mjs` and `scripts/stop-check.mjs`. Other runners need an adapter.
4. Write the requirement list (step 1) **before** you arm the Stop hook. Then install the hook as described in
   `references/hooks.md` and create `<build>/ACTIVE`.
   - The hook blocks you from ending a turn while any requirement is open, unless a fresh `<build>/WAITING` entry or
     `<build>/PAUSED` explains why.
   - The hook affects every session in the project while `ACTIVE` exists. Remove both when the build ends.

### 1. Requirement list
1. Turn every checkable statement of the spec into one requirement. Each gets an id (`C1.04`), a component, one line of text,
   `verify: test | review | deferred` and `passes: false`. The format is in `references/requirements-format.md`.
2. Ask one independent checker to compare the spec bullet by bullet with the list, and to report MISSING and WRONG items only.
   Check each finding against the spec text before you apply it.
3. Only `passes` and `evidence` may change later. Never delete or weaken a requirement.
   - A wrong requirement is corrected to match the spec, and the correction is recorded.
   - `deferred` means it needs the user or a real run. It does not block the build and is reported at the end.
4. Add the finish items as `review` requirements:
   - `FIN.01`: the suite is green on its final run;
   - `FIN.02`: the whole-spec review is done and its findings are fixed and reviewed;
   - `FIN.03`: the docs are updated against the final code;
   - `FIN.04`: the final report is ready, with unresolved items listed.

### 2. The check that decides "done"
- A `verify: test` requirement needs a passing test whose name **starts with its id or ids**.
  - Example: `test('C1.07 owner reserve holds ...')`.
  - TODO and skipped tests never count as passing.
  - `coverage.mjs` reads the full-suite output together with its exit status, sets `passes`, and lists every gap.
- A `verify: review` requirement is set only by you, and only from a reviewer's confirmation with file:line evidence, or from
  output that proves it.
- "Done" means all three:
  - the full suite exited 0;
  - coverage shows no gap;
  - every review id is confirmed.
- Ask sub-agents for the command output, not for "all tests pass".

### 3. Plan the tracks (what can run in parallel)
- Components that build on another component's API stay in one sequential track. Components in separate files run on their
  own track: a git worktree on its own branch (`git worktree add <dir> -b track-<T> <base>`).
- Serialize test runs only where the project shares a resource, such as a fixed port or a database.
- **Decide every cross-track interface before the tracks start.** That means file formats (exact JSON shape and field types)
  and function names and signatures. Send the same text to both builders. Interface guesses that differ are the most common
  merge problem.

### 4. Build one component (builder loop)
1. Spawn the builder with:
   - the builder brief;
   - the component and its ids;
   - what earlier components built (APIs, hooks, known limits from `progress.md`).

   After the spawn succeeds, add `<UTC time> <agent id> <role> <component>` to `<build>/WAITING`.
2. The builder reads the spec section, the project rules and the code it touches. It then:
   - implements the smallest complete change;
   - writes behavioural tests for its `verify: test` ids only;
   - runs the targeted tests, then the full suite;
   - reports: files changed, tests per id, the suite result, and any ambiguities.
3. When it returns:
   - remove its WAITING line;
   - check the suite result yourself;
   - commit with the ids in the message;
   - update `progress.md`.
4. Spawn a reviewer on that commit, using the reviewer brief. The reviewer reads the exact commit (`git show <hash>:<path>`) and
   gets the test output from you. Point it at the riskiest question first: "can this report done when it is not?"
5. The next builder on the track may start right after the commit, while the review runs alongside it.
   - Send review gaps to the builder that now owns those files, or to a fix builder. Never put two builders in one working copy.
   - **Fixes are test-first:** reproduce with a failing test, then fix.
   - Every fix commit gets a review too.
   - If the third review of the same component still finds a gap, tell the user what keeps failing.

### 5. When the spec itself is wrong
Builders and reviewers will find spec statements that are unsound or that fail on real data.
- If the fix clearly serves the user's stated goal, decide it yourself:
  1. amend the spec with an "Amended during the build (who, date): ..." sentence;
  2. add or correct the requirement;
  3. tell the user in plain words what changed and why.
- Never let a builder deviate silently. Never keep code that follows the spec but fails the purpose.

### 6. Real data and end-to-end proof
- Unit tests on synthetic mocks pass easily. Replay the component on real recorded input privately. For a public repo, commit
  a synthetic fixture that has the same shape.
- Before the end, build the end-to-end tests the spec names and record the measured timings. They find seams that unit tests
  cannot.

### 7. Merging tracks
- Merge only when the target has no uncommitted builder edits.
- On a conflict:
  - Resolve trivial conflicts yourself, such as two appended test blocks.
  - Send semantic conflicts to a merge agent, using `references/merge-brief.md`. It resolves them in the checkout where git
    recorded the conflict.
- After the merge, run the full suite, then a merge reviewer: "compare the merge with both parents; report lost or broken
  changes."

### 8. Finish
1. **Stability:** fix flaky tests at their root, by awaiting the event or injecting the clock. A "flake" can be a real race.
   If the suite is load-sensitive, require several green runs in a row.
2. **Final whole-spec review** by a fresh agent. It compares the spec bullet by bullet with the final code, not with the
   requirement list. It also checks cross-track seams and the user-visible path end to end. Fix its findings test-first,
   review the fixes, and run the suite again.
3. **Docs:** update them in the same build, against the final code.
4. **Outward or irreversible steps** need the user's explicit OK: installing on a live machine, real-run probes, spending the
   user's budget. Write the question into `<build>/PAUSED` and ask once.
5. **Report** what was built, the proof level (unit, mock, end-to-end, real run), the measured gains, the known limits and the
   deferred items. Then remove `ACTIVE` and the hook entry.

## Rules that keep it honest
- Keep `progress.md` current after every event (spawn, return, commit, review, decision). After a context reset, rebuild your
  state from it, from the requirement list and from `git log`, not from memory.
- One component per builder, and one builder per working copy at a time.
- A reviewer asked to find problems always finds something. Act on correctness, outcome and time, and skip style. Check each
  finding against the spec before acting.
- Read sub-agent reports critically:
  - "tests pass" needs the suite result;
  - "the flake is unrelated" needs a solo rerun;
  - "follows the spec" is not the same as "works".
- Once the user has approved the whole build, never stop between components to ask "shall I continue?". Stop only for the
  user's decisions.

## Bundled files
- `references/builder-brief.md`, `references/reviewer-brief.md`, `references/merge-brief.md`: brief templates.
- `references/requirements-format.md`: the requirement list format.
- `references/hooks.md`: the Stop hook setting and the WAITING / PAUSED / ACTIVE protocol.
- `scripts/coverage.mjs`: maps `node:test` spec-reporter output to requirement ids. Adapt it for other runners.
- `scripts/stop-check.mjs`: the Stop hook script.
