# Stop hook protocol

Claude Code runs a `Stop` hook whenever the coordinator tries to end its turn; exit code 2 sends it back to work with the hook's stderr
as the reason (Claude Code best practices, "Enforce the check with a Stop hook"). Use it so a long build cannot end after one component.

Setting (project `.claude/settings.local.json`; absolute path to the copy of the script in the build folder):
```json
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node <abs-path>/<build>/stop-check.mjs" } ] } ] } }
```

Files in the build folder:
- `ACTIVE`: the build is running. Create it only after `requirements.json` has its items (incl. the FIN.* finish items). Delete it, and
  the hook entry, when the build is finished.
- `WAITING`: one line per running background agent (`<agent id> <role> <component>`). The coordinator may end its turn while it has a
  line, because a notification will come. Remove an agent's line when it returns; delete the file when it is empty. A line older than
  `WAITING_MAX_HOURS` (default 3) counts as stale: the hook then blocks and asks you to check that agent, so a forgotten line cannot let
  a build stall silently.
- `PAUSED`: a question for the user (written inside). Create it before asking; remove it when they answer.

The hook allows stopping when `ACTIVE` is absent, `PAUSED` exists, `WAITING` has a fresh line, or every non-deferred requirement passes.
Otherwise it blocks with the open ids. A missing or unreadable `requirements.json` allows stopping with a warning (fail open). Per the
Claude Code docs, after eight blocked stops in a row with no tool call between them Claude Code lets the turn end
(`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` changes the cap), so the hook is a guard against forgetting, not a cage: a real user decision goes
through `PAUSED`. The hook also affects any other Claude session in the same project while `ACTIVE` exists.
