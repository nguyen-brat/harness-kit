# Requirement list format (`<build>/requirements.json`)

```json
{
  "spec": "plans/<name>/plan.md",
  "rules": [
    "Only the 'passes' and 'evidence' fields may change. Never delete or weaken a requirement; a wrong one is corrected to match the spec and the correction is recorded here.",
    "verify=test: a passing test whose name starts with the id (several ids may lead one name) must exist; TODO and skipped tests do not count.",
    "verify=review: a fresh reviewer confirms it against code/text; evidence = file:line.",
    "verify=deferred: needs the user's OK or a real run; does not block the build; reported at the end.",
    "Requirements may be ADDED when an independent check finds the spec says more than the list."
  ],
  "requirements": [
    { "id": "C1.07", "c": "C1", "req": "A request over the per-minute limit waits until the window frees and is then sent once.", "verify": "test", "passes": false },
    { "id": "C9.10", "c": "C9", "req": "The role text covers every step of the loop in section 9.", "verify": "review", "passes": false },
    { "id": "POST.01", "c": "POST", "req": "Probe X on the real machine with the user's OK.", "verify": "deferred", "passes": false }
  ]
}
```

`passes` must be the boolean `true` to count. The strings `"true"` and `"false"` count as open.

## Writing good requirements
- One checkable statement per item. Good items name something you can check: a value, a condition, an order, a file and its
  format, a message text, a refusal, an env name and its default, or a named test from the spec's proof section.
  - Not checkable: "implements the gate".
  - Checkable: "a waiter whose earliest grant is after `until` gets RATE_LIMIT".
- Copy numbers and names from the spec exactly. Paraphrase loses the details that later decide a bug.
- Mark text, doc and role items `review`. Mark everything with behaviour `test`.
- Add an `E2E.*` group for the spec's end-to-end proofs.
- When the spec is amended during the build, add a new id for the amendment rather than silently rewriting the old one.
