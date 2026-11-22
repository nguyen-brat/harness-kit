---
name: agent-harness-change
description: How to build or change an AI agent harness without the "fix one problem, break or bloat something else" spiral - agent role files, skills, prompts, slash commands, sub-agent definitions, hooks, plugins, orchestrator or pipeline flow, helper/tool code, CLAUDE.md / AGENTS.md rules, and plans for any of these. Use it whenever the user asks to create, fix, enhance, review, clean up or extend an agent system (Claude Code, Codex, Copilot, LangGraph or a custom orchestrator), says "the agent did X wrong, fix it", "why did the agent not follow the rule", "the instructions are too long", "apply the fixes from the last run", "write a skill/agent/hook", or brings a run log or transcript to analyse - even if they never say "harness". Not for ordinary application code with no agent instructions involved.
---

# Building and changing an agent harness

A harness is everything around the model: instructions, roles, skills, tools, hooks, helper code and the flow that connects
them. When a coding assistant edits a harness, it tends to fall into a loop:
1. The user reports a failure.
2. The assistant adds a rule or a branch where the symptom showed.
3. Later, those fixes need fixing.

Instruction files grow, rules contradict each other, agents follow fewer of them, and the system slows down. The habits below
cause that loop. They feel like diligence, which is why they repeat. Each habit has a counter that must be done, not just
remembered. `references/failure-patterns.md` describes how each pattern shows up and how to detect it.

## Six habits to fight
1. **Patching the symptom where it showed.** A sentence gets added next to the failure.
   - **Counter:** name the mechanism before choosing a fix: why did the agent do X, on which loading path?
   - When a failure recurs after a fix, re-check whether the earlier fix reached that path before adding another one.
2. **Seeing one file, not the system.** You don't know which agent loads which file on which path, where the copies of a rule
   are, or who calls the code.
   - **Counter:** map it first (step 2 below).
3. **Treating written text as behaviour.** "I wrote the rule" gets reported as "fixed".
   - **Counter:** prove it on a run, a replay or a test.
   - Report untested changes as untested.
4. **Adding, never deleting.** Without a map, nobody can prove a rule is dead, so everything stays. A line that every run reads
   seems to cost its author nothing.
   - **Counter:** every change shows what it removes.
   - Keep a size budget for always-loaded text.
5. **Writing for the requester and the example in front of you.** The text explains the incident, cites ids and dates, and turns
   one case (this task, this stack, this dataset) into a general rule.
   - **Counter:** write for a cold agent facing a case you have not seen.
   - Facts from one case stay labelled examples or detected branches.
6. **Optimising the local check, not the system's goal.** Each fix adds a gate, a verifier or a retry, and nobody adds up the
   cost.
   - **Counter:** state the goal (quality, latency, cost, success rate) and measure the whole flow against it.

Process habits seen in the same sessions:
- building before the plan was approved;
- plans that state outcomes without the mechanism, so conflicts surface at build time;
- silently dropping the user's ideas, or adding one's own;
- running the most expensive test for a one-line change, or no test at all.

## Procedure for one change (in order)
1. **Pick the entry and gather its input.**
   - **New capability:** who calls it, and one acceptance example: an input, plus what good output looks like.
   - **Observed failure:** open the records (transcript, sub-agent sessions, tool results, logs) and quote what the agent read
     and did. Do this with the `trace-agent-run` skill. List the competing explanations. A memory note or an earlier summary
     is not evidence.
   - **Cleanup:** the callers of the text or code, and the duplicates of it.
2. **Map the load path before choosing a fix.** For the entry point, write a small table:
   `entry point | role | files injected by the host | skills or files loaded on demand | evidence it was loaded (record, version)`.
   - Then grep every copy of the rule and every pointer to the file or section.
   - List the code's callers and tests.
   - Read the decision log, or `git log`, for why the current text exists.
   - A rule in a file the failing path never loads did nothing.
3. **Name the cause class** (failure entry):
   - not loaded on that path;
   - two rules conflict;
   - the rule cannot be satisfied with the real tools;
   - the fix sits in the wrong layer;
   - a mechanism is missing (ordering, locking, timing, state);
   - genuinely beyond the model.

   Blame the model last, and only with a minimal repro that has the exact context the agent had.
4. **Pick the lowest layer that can make it true,** in this order:
   1. code or a hook;
   2. a tool schema, or a helper that refuses bad input;
   3. a skill loaded only on that path;
   4. the role file;
   5. always-loaded rules.

   Code and hooks hold every time. Prose holds only some of the time.
5. **Write a baseline before the change.** Pick three cases: the reported failure (or the acceptance example), a neighbouring
   case that already works, and a routine request. Run them on the current version, for example with a sub-agent, and record
   for each: outcome, calls, time, and any excuses the agent gave for skipping a rule. A fix that you have not seen fail first
   is not proven.
6. **Write the change as a replacement.**
   - Remove or rewrite the old rule in the same change, and keep one copy only.
   - Say how (which tool, which command), not only what.
   - No incident stories, ids, dates, "previously", or capitals-and-NEVER shouting.
   - A blocking rule must be satisfiable in a normal run. Otherwise agents learn to argue their way around rules.
7. **Check generality.** Would this be right for an input, project or environment you have not seen? If it holds only for the
   example, make it a detected branch or a labelled example, not a rule.
8. **Verify at the cheapest level that can fail.**
   - Unit-test helper or hook code.
   - Rerun the three baseline cases on the new version, with the same input, host and model, and compare outcome, calls and
     time.
   - Reject a change that fixes the first case but breaks the neighbour.
   - Rerun the tests of earlier fixes in the same area.
   - Treat one timing difference as an observation, not a result.
   - For repeated or larger comparisons, use an eval tool instead of building one: skill-creator evals, promptfoo, or
     agent-skill-eval.
   - Count things from transcripts only with a script you checked by hand on one file.
9. **Get an independent review** for large changes (see below). Act on findings about correctness, the goal and cost. Check
   each finding against the source before applying it.
10. **Record it** in the decision log or changelog, with the cause and the evidence. Mark it unproven until a real run shows it
    working.

## Independent review
Give a fresh reviewer the change, the goal and the evidence, never your conclusion. Use the `harness-reviewer` agent: it is
read-only, so run the linter, the tests and `run-audit.mjs` yourself and hand it the output. It answers these questions, the
riskiest first:
- **Mechanism.** Does the change fix the mechanism, or could the failure return by another path?
- **Reach.** Is the text loaded on the failing path? Do other copies of the rule, or pointers to it, now disagree?
- **Replace.** Did it remove what it replaces? Did it leave dead paths, history notes, or emphasis where a mechanism belongs?
- **Feasibility.** Can every new rule be satisfied with the real tools in a normal run?
- **Generality.** Has something true only for the example been written as a rule?
- **Side effects.** Which callers, task types or shared resources does it touch? Does it undo an earlier fix?
- **Cost.** What time, tokens or calls does it add to the common path?
- **Proof.** Is there a test, a replay or an audit showing it works? If not, the answer is "unproven".

A good finding names the file and line, a concrete failing input, and the smallest fix. A bad finding is a style remark, or
"consider adding more validation" with no failing input. Skip bad findings.

## After a run or an evaluation: the find-and-fix loop
- Collect every finding first, then group the findings by mechanism. One mechanism gets one fix, never one fix per symptom.
- Look at the whole run, not only the failures: which steps made it slow or expensive, and what the successful paths did
  differently.
- Choose the few fixes that close failures you actually saw. Park the rest with their evidence: a long list of ideas is a
  backlog, not a plan.
- For each fix, list the earlier fixes in the same area and check that the new one does not undo them.
- Show the user the grouped list and get approval before building.

## Writing each artifact
Read `references/writing-artifacts.md` before you write or restructure an always-loaded rules file, an agent role, a
skill, a hook, helper code, a plugin, a plan or a sub-agent brief. It says what each one should and should not hold.

## The kit
Everything here ships in the harness-kit plugin.

**Skills**
- `trace-agent-run`: finding a cause from the records (procedure step 1).
- `long-plan-build`: building a plan with many parts through sub-agents without dropping requirements.

**Agents**
- `harness-reviewer`: review only, read-only. Give it the evidence.
- `run-tracer`: reads a large run's records and an audit index, and returns a labelled timeline.

**Scripts**
- `scripts/check-instructions.mjs <files or dirs> [--max-kb 12]` lints instruction files. It reports:
  - history notes (dates, "previously", "post-mortem");
  - broken relative links;
  - ticket-like ids;
  - dense emphasis words;
  - paragraphs copied between files;
  - files over the size budget.

  It exits 1 on errors. For format and frontmatter validation, use a dedicated linter such as agnix.
- `../trace-agent-run/scripts/run-audit.mjs <session>` reads Claude Code and Codex records. It pairs every call with its result
  and reports what the run did: files read, edits made with tools and with the shell, skills, sub-agents, errors, and gaps.
  Add `--share` for a report without excerpts.

**Hooks**
- The plugin's instruction-edit hook runs after edits in Claude Code (Edit/Write/MultiEdit) and in Codex (apply_patch, once
  you trust it via `/hooks`). It lints only the newly written text of instruction files, using the fence state of the
  resulting file, and asks what the edit removed when it adds many lines.
- `hooks/guard-shell-writes.mjs` is an opt-in hook for the runtime agents of the harness you build. It blocks file edits made
  through the shell. The wiring is in the file header.
- `long-plan-build` brings a Stop hook that keeps a build going until every requirement passes.

**Self-tests:** `node <path> --self-test` exists for `check-instructions.mjs`, `run-audit.mjs`, `guard-shell-writes.mjs` and
the plugin's `hooks/instruction-edit-hook.mjs`. The repository's `test/` folder holds the integration tests.
