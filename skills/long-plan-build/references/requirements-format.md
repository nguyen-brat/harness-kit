# Requirement list format (`build/requirements.json`)

```json
{
  "spec": "plans/<date>-<name>/10-plan.md",
  "rules": [
    "Only the 'passes' and 'evidence' fields may change. Never delete or weaken a requirement; a wrong one is corrected to match the spec and the correction is recorded here.",
    "verify=test: a passing test whose name starts with the id (several ids may lead one name) must exist; coverage.mjs checks it.",
    "verify=review: a fresh reviewer confirms it against code/text; evidence = file:line.",
    "verify=deferred: needs the user's OK or a real run; does not block the build; reported at the end.",
    "Requirements may be ADDED when an independent check finds the spec says more than the list."
  ],
  "requirements": [
    { "id": "C1.07", "c": "C1", "req": "Owner reserve: non-owner classes together <= total60-15 / total10-8 and starts >= ceil(60000/(total60-15)) ms apart; holds against a non-owner burst.", "verify": "test", "passes": false },
    { "id": "C9.10", "c": "C9", "req": "Lead role text covers every element of the lead loop (...)", "verify": "review", "passes": false },
    { "id": "POST.01", "c": "POST", "req": "Probe X on the real machine with the user's OK.", "verify": "deferred", "passes": false }
  ]
}
```

## Writing good requirements
- One checkable statement per item: a value, a condition, an order, a file and its format, a message text, a refusal, an env name and
  default, a named test from the spec's proof section. "Implements the gate" is not checkable; "a waiter whose earliest grant is after
  `until` gets RATE_LIMIT" is.
- Copy numbers and names exactly from the spec. Paraphrase loses details that later decide a bug.
- Mark text/doc/role items `review`; everything with behaviour `test`.
- Add an `E2E.*` group for the spec's end-to-end proofs, and one review item "whole suite green incl. updated old tests" (proven by the
  final suite output, not by a test named after it).
- When the spec is amended during the build, add a new id for the amendment (e.g. `C1.20 amended attempt limits`) rather than rewriting
  the old one silently.
