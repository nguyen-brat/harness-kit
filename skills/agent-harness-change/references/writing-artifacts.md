# Writing each artifact

Read this when you write or restructure an always-loaded rules file, an agent role, a skill, a hook, helper code, a
plugin, a plan or a sub-agent brief.

- **Always-loaded rules (CLAUDE.md, AGENTS.md, system prompts).** Only facts that every turn needs. Every line is paid for by
  every agent on every turn. Notes for the people who maintain the harness belong in their own file.
- **Agent role or sub-agent definition.**
  - One job, its inputs, its limits, and the shape of its return.
  - The description is the trigger text.
  - Give it only the tools the job needs. "Read-only" in prose is not a sandbox.
  - If it grows past a few KB, split it by job or move the procedure into a skill.
- **Skill.**
  - Start the description with the trigger. Write imperative steps with explicit inputs and outputs.
  - Put rarely needed material in `references/`, one level deep, with a line saying when to read it. Put repeated mechanical
    work in `scripts/`.
  - Match the degree of freedom to the task: exact steps for fragile operations, general direction where many paths work.
- **Hook.** Use one for anything that must always hold.
  - The block message tells the agent what to do instead.
  - Unit-test it through stdin, and try it once in a live session on every host you support.
- **Helper or tool code.** Deterministic work (paging, counting, merging, formatting, submitting) belongs in code, not in an
  agent's head.
  - Fail open on unknown input formats.
  - Keep files small enough to review.
- **Plugin.** A package of the parts above, and the same rules apply to each part.
  - Skills (SKILL.md) port across hosts. Hooks and agent definitions are host-specific.
  - Test on every host you claim to support.
- **Plan.** One list, in the order the work is done.
  - For each item: the exact place, the mechanism, what it removes, and its impact on other paths.
  - No history or version notes.
  - Keep the user's ideas, and ask before dropping any.
- **Sub-agent brief.**
  - The goal, and what has already been ruled out.
  - The files to read.
  - The interfaces shared with other builders, with exact formats.
  - The output you need.
