# harness-kit

A Claude Code plugin for building and changing AI agent harnesses. A harness here means the role files, skills, prompts,
hooks, helper code and orchestrator flow around a model.

It targets one failure loop. You report "the agent did X wrong", the assistant adds a rule where the symptom showed, and
later those fixes need fixing. Over time the instructions bloat, contradict each other, get followed less often, and the
system slows down.

## What is inside

| Part | Kind | Use |
|---|---|---|
| `agent-harness-change` | skill | The hub. It covers six habits to fight, a 10-step change procedure, a find-and-fix loop after a run, and how to write each type of artifact. |
| `trace-agent-run` | skill | Finding why a run failed from its records (Seen / Inferred / Unknown labels). |
| `long-plan-build` | skill | Building a plan with many components through sub-agents. Every requirement gets an id that a passing test must cover. Each component gets a fresh reviewer, and parallel work runs on git worktrees. |
| `harness-reviewer` | agent | An independent read-only review of a harness change. |
| `run-tracer` | agent | Reads a large run and returns a labelled timeline. |
| instruction-edit hook | hook | Runs on Edit/Write. It checks the text written into instruction files for history notes and broken links, and asks what an edit removed when it adds many lines. |
| `check-instructions.mjs` | script | A linter for instruction files: links, history notes, emphasis density, ticket ids, duplicate paragraphs, size budget. |
| `run-audit.mjs` | script | Shows what a run actually did: files read, tool edits vs shell edits, skills, sub-agents, errors, idle gaps. It reads Claude Code and Codex transcripts. |
| `guard-shell-writes.mjs` | hook template | A hook for the runtime agents of your harness. It blocks file edits made through the shell. |

Every script has a `--self-test` mode and needs only Node.js 18 or later.

## Install

```
/plugin marketplace add nguyen-brat/harness-kit
/plugin install harness-kit@harness-kit
```

## License

MIT
