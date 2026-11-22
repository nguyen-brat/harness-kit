# harness-kit

A plugin for **Claude Code** and **OpenAI Codex** for building and changing AI agent harnesses. A harness is the role files,
skills, prompts, hooks, helper code and orchestrator flow around a model.

It targets one failure loop:
1. You report "the agent did X wrong".
2. The assistant adds a rule where the symptom showed.
3. Later, those fixes need fixing.

Over time the instructions bloat, contradict each other, get followed less often, and the system slows down.

## What is inside

| Part | Kind | Use |
|---|---|---|
| `agent-harness-change` | skill | The hub: six habits to fight, a change procedure with three entries (new capability, observed failure, cleanup), a before/after baseline, independent review questions, the find-and-fix loop, and guidance per artifact type. |
| `trace-agent-run` | skill | Finding why a run failed from its records, with every claim labelled Seen / Inferred / Unknown. |
| `long-plan-build` | skill | Building a plan with many components through sub-agents. Every requirement gets an id that needs evidence, each component gets a fresh reviewer, and parallel work runs on git worktrees. |
| `harness-reviewer` / `run-tracer` | agents | Read-only reviewer and run investigator. These are Claude Code sub-agents; Codex gets TOML roles through the installer. |
| instruction-edit hook | hook | Lints only the newly written text of instruction files: history notes, broken links, and large net additions. Runs on Claude Code Edit/Write/MultiEdit and Codex apply_patch. |
| `check-instructions.mjs` | script | Linter for instruction files: history notes, links, ticket ids, emphasis density, copied paragraphs, size budget. |
| `run-audit.mjs` | script | Shows what a run actually did. It pairs calls with their results in Claude Code and Codex records. Add `--share` for a report without excerpts. |
| `guard-shell-writes.mjs` | hook template | Opt-in hook for the runtime agents of your harness. It blocks file edits made through the shell. |

Requirements: Node.js 18 or later, and git (for the worktree workflow in `long-plan-build`).

## Install in Claude Code

```
/plugin marketplace add nguyen-brat/harness-kit
/plugin install harness-kit@harness-kit
```

- **Check:** `claude plugin details harness-kit@harness-kit` should list 3 skills, 2 agents and 1 hook.
- **Update:** `/plugin marketplace update harness-kit`, then reinstall.
- **Remove:** `/plugin uninstall harness-kit@harness-kit`.
- **Turn off only the edit hook:** disable the plugin with `/plugin`, or remove its hook entry from your local copy.

## Install in Codex

```
codex plugin marketplace add nguyen-brat/harness-kit
```

1. Open `/plugins` in Codex and install **Harness Kit**.
2. Open `/hooks` and trust the instruction-edit hook. Codex skips hooks that have not been reviewed, and asks again after an
   update that changes a hook.
3. Codex plugins do not ship agent roles, so install the two TOML roles from your local copy of this repository:
   `node scripts/install-codex-agents.mjs --project <repo>`. Use `--user` to install for every project. The script never
   overwrites a changed file. `--uninstall` removes only unchanged files.
4. Start a new session.

The skills also work without the plugin: copy the folders under `skills/` into `.agents/skills/`.

## Use the shell guard in your own harness (optional)

Wire `skills/agent-harness-change/hooks/guard-shell-writes.mjs` as a `PreToolUse` hook with the matcher `Bash`, in the
settings that your runtime agents load:
- Claude Code: `.claude/settings.json`, or the `--settings` file passed to `claude -p`.
- Codex: `.codex/hooks.json`.

The file header shows the entry. It is a heuristic: it blocks common shell edits of source and doc files, and allows builds,
tests and logs.

## Tests

```
node --test test/integration.test.mjs
node skills/agent-harness-change/scripts/check-instructions.mjs --self-test
node skills/agent-harness-change/hooks/guard-shell-writes.mjs --self-test
node skills/trace-agent-run/scripts/run-audit.mjs --self-test
node hooks/instruction-edit-hook.mjs --self-test
node scripts/install-codex-agents.mjs --self-test
```

## License

MIT
