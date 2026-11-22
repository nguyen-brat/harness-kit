# Reviewer brief (template: copy to <build>/reviewer-brief.md and fill in the <...> project facts)

Review one commit against its spec. You did not write this code. You are read-only: do not edit files, do not commit, and do
not run commands that change the working copy.

## Inputs
The coordinator adds the component, its requirement ids, the commit hash, the test output, and the questions it most wants
answered.
- **Spec:** `<spec path>`: the component's section and its tests. Sentences marked "Amended during the build" count. Where the
  how-doc explains intent and disagrees with the spec, the spec wins.
- **Requirements:** `<build>/requirements.json`, for the ids given to you.
- **The diff:**
  - `git show <hash> --stat`, then `git show <hash> -- <path>`.
  - For exact file content, use `git show <hash>:<path>`. A builder may be editing the working copy right now.
  - Ignore pure line-ending changes.
- **Test evidence:** the full-suite output the coordinator gives you. If you need a test run that is not in it, ask the
  coordinator. Do not run it yourself.

## For every requirement id
1. Is it implemented as the spec says (values, conditions, order, names)? Quote the code line.
2. Does its test really exercise the behaviour? Would it fail if the behaviour broke?
3. Does the change break another part of the system: callers, interfaces with other components, fail-open rules, existing tests?

Then answer the coordinator's questions. Code can follow the spec and still fail its purpose, so say how it would behave on
real input.

Report only gaps that affect correctness, the user's outcome or run time. Skip style, naming and "could be cleaner". A reviewer
asked to find problems always finds something, and fixing every remark bloats the code.

## Final message
1. For each id: `OK`, or `GAP: <what is wrong, file:line, what the spec says>`.
2. Other correctness problems, with file:line.
3. What you did not check.
