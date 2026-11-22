# Failure patterns when editing an agent harness

Read this before a large change, or when one fix keeps coming back. Each pattern lists how it shows up and how to detect
it. The examples come from real harness work but are kept generic.

## 1. Symptom patching
- **Shows up as:**
  - the same failure recurs across several runs, and every run adds another rule or a regression test named after the failing
    case;
  - blocking rules that can never pass, which agents then argue their way around;
  - capitals and "MUST" spreading across the files.
- **Typical real cause:** a missing mechanism (an ordering race between parallel workers, shared state, a step spawned
  before its input existed). A sentence cannot fix it.
- **Detect:**
  - grep for rules or tests named after a single case;
  - count how many rules mention the same failure;
  - for each blocking rule, check in the run logs whether it ever passed.

## 2. One file, not the system
- **Shows up as:**
  - a fix applied to one copy of a rule while other copies keep the bug;
  - a fix written in a file the agent never loads on that path;
  - an orchestrator message that already contains the steps, so the agent skips the command that holds the fix;
  - a grader or reviewer checking against files the worker never reads;
  - a "local" change that breaks a shared folder, a shared path or another task type;
  - a cleanup that deletes a file a setup script still lists.
- **Detect:** build a load map (step, then command, then the files it reads) and grep every copy and pointer. Run the tests
  of the neighbouring features, not only the one you changed.

## 3. Text treated as behaviour
- **Shows up as:**
  - audits of real runs show the rules followed only part of the time;
  - rules that the real tools cannot satisfy ("edit without reading first", a progress tool in headless runs nobody
    watches);
  - confident counts from an unchecked script (duplicated session files counted twice);
  - claims about the current system made from memory;
  - a description of a flow that leaves out steps.
- **Detect:**
  - replay a saved run, and audit which files the agent read, which tools it used and which rules it skipped;
  - check any counting script by hand on one file;
  - reopen the code before describing it.

## 4. Accretion
- **Shows up as:**
  - most commits to instruction files add far more than they delete;
  - role files growing tens of KB over a few weeks;
  - the same rule repeated in several files;
  - dead paths (a removed integration, manual-run steps in an automated-only agent, input types that are never sent);
  - plans that keep every reviewer idea;
  - a plan far longer than the ideas it carries;
  - a single helper file too large for anyone to review.
- **Detect:**
  - net lines per commit over the instruction folders;
  - a size budget per file;
  - duplicate-paragraph and unreferenced-file checks (the linter);
  - "which ideas close a failure we actually saw?"

## 5. Writing for the requester and the example
- **Shows up as:**
  - ticket ids, dates and "the old version did ..." inside instructions;
  - one project's names, stack or framework in generic agents;
  - facts about one sample task (one dataset, one environment, one type of input) written as universal rules.
- **Detect:**
  - the linter's history and id checks;
  - for each rule, ask: "would this be wrong for an input I haven't seen?"

## 6. Local checks instead of the system's goal
- **Shows up as:**
  - every fix adds a gate, a verifier or a full test run;
  - output quality rises while latency or cost climbs;
  - the system loses whenever speed or cost counts;
  - the full test suite runs after a change that touched no code.
- **Detect:**
  - measure end-to-end time, tokens and calls per path before and after each change;
  - list the gates on the fastest path and ask what each one buys.

## Process patterns
- Plans that list outcomes without the mechanism, so contradictions and duplicates surface only during the build.
- Building before the plan is approved.
- Dropping the user's ideas, or adding your own, without saying so.
- Splitting a plan into phases and stopping after the first one.
- Using the most expensive test (a full end-to-end run) for a small change, or no test at all.
- A reviewer that keeps rewriting the plan: limit the review to findings, and let the author apply them.

## What reliably helped
- Hooks that block a bad action and say what to do instead, unit-tested and tried in a live run.
- A generated load map: which files each step can load, and which files nothing loads.
- A run audit: what the agent actually read and did.
- An instruction linter run before commit.
- Gates enforced in helper code instead of prompt rules.
- Targeted unit tests against mocks of external services.
- For long builds, a requirement list with ids mapped to passing tests, plus one fresh reviewer per component.
- Reading every record before naming a cause.
- An independent reviewer given the files, not the author's conclusion. It caught real errors only in that setup.
