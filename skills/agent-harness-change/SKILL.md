---
name: agent-harness-change
description: How to build or change an AI agent harness without the "fix one problem, break or bloat something else" spiral - agent role files, skills, prompts, slash commands, sub-agent definitions, hooks, plugins, orchestrator or pipeline flow, helper/tool code, CLAUDE.md / AGENTS.md rules, and plans for any of these. Use it whenever the user asks to create, fix, enhance, review, clean up or extend an agent system (Claude Code, Codex, Copilot, LangGraph or a custom orchestrator), says "the agent did X wrong, fix it", "why did the agent not follow the rule", "the instructions are too long", "apply the fixes from the last run", "write a skill/agent/hook", or brings a run log or transcript to analyse - even if they never say "harness". Not for ordinary application code with no agent instructions involved.
---

# Building and changing an agent harness

A harness is everything around the model: instructions, roles, skills, tools, hooks, helper code and the flow that connects
them. When a coding assistant edits one, it falls into a loop. The user reports a failure, the assistant adds a rule or a
branch where the symptom showed, and later those fixes need fixing. The instruction files grow, rules contradict each other,
agents follow fewer of them, and the system gets slower. The habits below cause that loop. They feel like diligence, which
is why they repeat. Each has a counter that must be done, not remembered. `references/failure-patterns.md` describes each
pattern: how it shows up and how to detect it.

## Six habits to fight
1. **Patching the symptom where it showed.** A sentence gets added next to the failure.
   - **Counter:** from the run record, name the mechanism (why the agent did X) before choosing a fix.
   - If the same failure comes back after a fix, the earlier fix was wrong. Do not stack another one on top.
2. **Seeing one file, not the system.** You don't know which agent loads which file on which path, where the copies are, or
   who calls the code.
   - **Counter:** map loads, copies, pointers and callers before editing (step 4).
3. **Treating written text as behaviour.** "I wrote the rule" gets reported as "fixed".
   - **Counter:** prove it on a run, a replay or a test.
   - Report an untested change as untested.
4. **Adding, never deleting.** Without a map, nobody can prove a rule is dead, so everything stays. A line that every run
   reads seems to cost nothing to its author.
   - **Counter:** every change shows what it removes.
   - Keep a size budget for text that is always loaded.
5. **Writing for the requester and the example in front of you.** The text explains the incident, cites ids and dates, and
   turns one case (this task, this stack, this dataset) into a general rule.
   - **Counter:** write for a cold agent facing a case you have not seen.
   - Facts from one case stay labelled examples or detected branches.
6. **Optimising the local check, not the system's goal.** Each fix adds a gate, a verifier or a retry, and nobody adds up
   the cost in time, tokens or throughput.
   - **Counter:** state the system's real goal (quality, latency, cost, success rate).
   - Measure the whole flow against that goal after each change.

The same sessions showed some process habits:
- building before the plan was approved;
- plans that state outcomes ("the agent will do A") without the mechanism, so the conflicts appear at build time;
- silently dropping the user's ideas, or adding one's own;
- running the most expensive test for a one-line change, or no test at all.

## Procedure for one change (in order)
1. **Start from the record.** Open the failing run: transcript, sub-agent sessions, tool calls, logs.
   - Quote what the agent read and did.
   - A memory note or an earlier summary is not evidence. Reopen the record.
2. **Name the cause class:**
   - the file is not loaded on that path;
   - two rules conflict;
   - the rule cannot be satisfied with the real tools;
   - the fix lives in the wrong layer;
   - a mechanism is missing (ordering, locking, timing, state);
   - the task is genuinely beyond the model.

   Blame the model last. Do it only with a minimal repro that gives the model the exact context the agent had.
3. **Pick the lowest layer that can make it true,** in this order:
   1. code or a hook;
   2. a tool schema, or a helper that refuses bad input;
   3. a skill loaded only on that path;
   4. the role file;
   5. always-loaded rules.

   Code and hooks hold every time. Prose holds only some of the time.
4. **Map the impact:**
   - grep every copy of the rule and every pointer to the file or section;
   - trace what each step loads (config, command, includes, "read X" lines);
   - list the code's callers and tests;
   - list the other task types, inputs and environments the change touches;
   - read the decision log, or `git log`, for why the current text exists.
5. **Write it as a replacement.**
   - Remove or rewrite the old rule in the same change, and keep one copy only.
   - Say how (which tool, which command), not only what.
   - No incident stories, ids, dates, "previously", or capitals-and-NEVER shouting.
   - A blocking rule must be satisfiable in a normal run. If it is not, agents learn to argue their way around rules.
6. **Check generality.** Would this be right for an input, a project or an environment you have not seen? If it holds only
   for the example, make it a detected branch or a labelled example, not a rule.
7. **Verify at the cheapest level that can fail:**
   - a unit test for helper or hook code;
   - one replay of a saved run, then an audit of what the agent actually did (files read, tools used, skills loaded);
   - the tests of every earlier fix in the same area.

   Count things from transcripts only with a script you checked by hand on one file. Do not run the most expensive test
   when a targeted one answers the question, and never run no test at all.
8. **Measure the cost** the change adds to each path (time, tokens, calls) against the goal. A safer step that makes the
   common path slower can make the whole system worse.
9. **Get an independent review** for large changes.
   - Use a fresh agent and give it the files and the goal, not your conclusion.
   - Act on findings about correctness and the goal.
   - Check each finding against the source before applying it.
10. **Record it** in the decision log or changelog, with the cause and the evidence. Mark it unproven until a real run shows
    it working.

## After a run or an evaluation: the find-and-fix loop
- Collect every finding first, then group the findings by mechanism. One mechanism gets one fix, never one fix per symptom.
- Look at the whole run, not only the failures. Find which steps made it slow or expensive, and what the successful paths
  did differently.
- Choose the few fixes that close failures you actually saw. Park the rest with their evidence: a long list of ideas is a
  backlog, not a plan.
- For each fix, list the earlier fixes in the same area and check that the new one does not undo them.
- Show the user the grouped list and get approval before building.

## Writing each artifact
- **Always-loaded rules (CLAUDE.md, AGENTS.md, system prompts):** only facts that every turn needs. Every line is paid for
  by every agent on every turn. Notes for the people who maintain the harness belong in their own file, not in a file the
  runtime agents read.
- **Agent role or sub-agent definition:**
  - one job, its inputs, its limits and the shape of what it returns;
  - the description is the trigger text;
  - if the file grows past a few KB, split it by job or move the procedure into a skill.
- **Skill:**
  - a trigger-first description;
  - imperative steps with explicit inputs and outputs;
  - material needed only sometimes goes in `references/`, with a line saying when to read it;
  - repeated mechanical work goes in `scripts/`.
- **Hook:** use one for anything that must always hold, such as blocking unsafe edit methods, blocking off-limits tools,
  or stopping a turn while work is still open.
  - The block message tells the agent what to do instead.
  - Unit-test the hook and try it once in a live run.
- **Helper or tool code:** deterministic work (paging, counting, merging, formatting, submitting) belongs in code, not in
  an agent's head.
  - Fail open when the input format is unknown.
  - Keep files small enough for a reviewer to read.
- **Plugin:** a package of the parts above, and the same rules apply to each part. Version it, and list what it changes at
  run time.
- **Plan:** one list, in the order the work is done.
  - For each item: the exact place, the mechanism, what it removes, and its impact on other paths.
  - No history or version notes. Write only what the implementer needs.
  - Keep the user's ideas, and ask before dropping any.
- **Sub-agent brief:**
  - the goal and what has already been ruled out;
  - the files to read;
  - the interfaces shared with other builders, with exact formats;
  - the output you need.

  Give reviewers the code, not your conclusion.

## The kit
All parts ship in the harness-kit plugin, so every project where it is enabled has them.

**Skills**
- `trace-agent-run`: steps 1-2, finding the cause from the records.
- `long-plan-build`: building a plan with many parts through sub-agents, without dropping requirements.

**Agents**
- `run-tracer`: reads a large run and returns a labelled timeline.
- `harness-reviewer`: the independent review in step 9. Give it the files and the goal, not your conclusion.

**Scripts**
- `scripts/check-instructions.mjs <files or dirs> [--max-kb 12]` lints instruction files. It flags:
  - broken relative links;
  - history notes (dates, "previously", "prior version", "post-mortem" wording);
  - dense emphasis words;
  - ticket-like ids;
  - paragraphs copied between files;
  - files over the size budget.

  Errors exit 1. Run it before and after a change, and wire it into the project's tests or pre-commit when allowed.
- `../trace-agent-run/scripts/run-audit.mjs <session>` shows what a run actually did: files read, edits made with tools
  vs the shell, skills, sub-agents, errors, gaps. Use it for the replay check in step 7.

**Hooks**
- The plugin's instruction-edit hook runs while the plugin is enabled (PostToolUse on Edit, Write and MultiEdit). When an
  instruction file is edited, it checks only the newly written text for history notes and broken links. It also asks what
  the edit removed when the edit adds many lines.
- `hooks/guard-shell-writes.mjs` is for the runtime agents of the harness you build, not for this session. It is a
  PreToolUse hook on Bash that blocks file edits made through the shell and tells the agent to use Edit/Write. The wiring
  is in the file header.
- `long-plan-build` brings a Stop hook that keeps a build going until every requirement passes.

Every script and hook has a `--self-test` mode.
