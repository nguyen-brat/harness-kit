---
name: trace-agent-run
description: Find out why an AI agent run failed, stalled, ran long, skipped a rule or repeated an error, using only the recorded evidence (session transcripts, sub-agent sessions, tool calls, orchestrator logs, app logs). Use it whenever the user asks why an agent or pipeline step did something, gives a run, ticket, job or session to analyse, says "check the logs", "why did it not follow the instruction", "why is it stuck/slow", or before you write a fix, an incident note or a new rule for agent behaviour - even if they never say "trace". Works for Claude Code, Codex and custom orchestrators; a project skill with that project's record locations takes precedence for where the records are.
---

# Trace an agent run from the records

Goal: say what happened, and why, from records you have read. The agent's reasoning is usually not recorded, and your
memory of earlier answers is not evidence. A cause stated from the last symptom is usually wrong. In one traced case, the
first answer was "the agent typed a bad line by hand". The records showed that the system had already rejected the agent's
first, correct attempt 44 seconds earlier, because the agent had retyped an id with one wrong character. The first answer
would have fixed the wrong thing.

## Procedure
1. **Fix the scope:** which run or job, which step, which time window. Check whether it is still running (last event, job
   status) before you call it "stuck".
2. **Find every record:**
   - the orchestrator transcript;
   - each sub-agent's session (Claude Code keeps them in `<session>/subagents/`; Codex keeps one rollout per thread);
   - tool call inputs and outputs;
   - orchestrator or job logs, app and server logs, and status changes;
   - the instruction files at the version that was live then (git history, or what the agent printed when it loaded them).
3. **Dump the evidence in time order:** run `node scripts/run-audit.mjs <session.jsonl | dir> --timeline` to get every
   message, tool call and result in order.
   - Without `--timeline` it prints a summary: files read, files edited with edit tools vs shell writes, skills loaded,
     sub-agents spawned, tool errors, idle gaps, and the final answer.
   - Add `--file <regex>` to check whether a given instruction file was ever opened.
   - For other log formats, write a small extractor and check it by hand on one file first.
4. **Read all of it, in order, before forming a theory:** every orchestrator message, every tool input and output, and every
   sub-agent session, not just the first and last. Skimming is how a second cause gets missed.
5. **Find the first error, not the last symptom.** Take the earliest failing record and ask what happened just before it. A
   cause cannot come after its effect.
6. **Compare what the model typed with the source of truth.** Tool inputs are retyped by the model and can differ by one
   character. Compare them with what the system wrote (ids, paths, config values).
7. **Find the text the agent was following:** what it actually loaded on that path, at that version. A rule in a file the
   agent never opened did not exist for that run.
8. **Check how the system reacts in its code** before saying what "the orchestrator does". Quote the line you relied on.
9. **Test each hypothesis against the records:**
   - write down what you would expect to see if it were true, then look for it and for evidence against it;
   - prefer the earliest cause that explains every symptom;
   - blame the model only with a minimal repro that gives it the exact context the agent had.

## Rules that prevent invented explanations
- Label every claim:
  - **Seen:** quote the time and the value.
  - **Inferred:** say what it is inferred from.
  - **Unknown:** say which record would settle it.
- Compute durations from the timestamps; never estimate them. Give times in UTC, and in the user's zone when it helps.
- Say who wrote each line: the system, a helper, the agent by hand, or a sub-agent.
- When you count across transcripts, use a script you checked by hand on one file. Resumed runs can copy their session
  file: count distinct runs, not files.
- Something that looks wrong is not a cause until you show it came first and that removing it removes the symptom.
- Do not reuse your own earlier summary or a memory note as evidence. Open the record again.
- If you could not read something (output cut off, no timestamps, no reasoning recorded), list it under "Not verified".
  Never fill the gap with a plausible story.
- Read only. Do not change a live run, its workspace or its logs while you trace. Back up records that the next run will
  overwrite.

## Report (short, plain words)
1. What happened: a timeline of 4 to 8 lines, with times.
2. The cause chain, with each link labelled Seen or Inferred and the record that shows it.
3. What made it worse or hid it (second causes).
4. What is not verified.
5. The fix, and what the next run must show to prove it. Choose the fix with the agent-harness-change skill.

For a large trace, hand the reading to the `run-tracer` agent (it returns a labelled timeline). Check its key claims
against the records before you report them.
