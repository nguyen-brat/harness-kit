# Stop hook protocol

Claude Code runs a `Stop` hook whenever the coordinator tries to end its turn. Exit code 2 sends the coordinator back to work,
with the hook's stderr as the reason. Codex has a `Stop` hook event too, but check how it handles the exit code on your version
before you rely on it. Use the hook so that a long build cannot end after one component.

Setting for Claude Code, in the project's `.claude/settings.local.json`. Use the absolute path to the copy of the script in the
build folder:
```json
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node <abs-path>/<build>/stop-check.mjs" } ] } ] } }
```

## Files in the build folder
- **`ACTIVE`:** the build is running.
  - Create it only after `requirements.json` holds its items, including the FIN.* finish items.
  - When the build is finished, delete it and remove the hook entry.
- **`WAITING`:** one line per background agent that is running: `<UTC ISO time> <agent id> <role> <component>`.
  - Add the line after the agent was spawned successfully. Remove it when the agent returns. Delete the file when it is empty.
  - A line older than `WAITING_MAX_HOURS` (default 3) is stale.
  - A line without a time is stale too. Rewrite it with the current time after checking that agent.
- **`PAUSED`:** a question for the user, written inside. Create it before asking; remove it when they answer.

## Decision order
1. `ACTIVE` is absent, or `PAUSED` exists: allow the stop.
2. `requirements.json` is missing or unreadable: allow the stop and print a warning (fail open).
3. Every non-deferred requirement has `passes === true`: allow the stop. Stale WAITING lines do not block a finished build.
4. At least one WAITING line is fresh: allow the stop, because a notification will come.
5. Otherwise, block. The message lists the open ids and any stale WAITING lines.

After eight blocked stops in a row with no tool call between them, Claude Code lets the turn end anyway (the cap is set by
`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`). So the hook is a guard against forgetting, not a cage. A real decision for the user goes
through `PAUSED`.
