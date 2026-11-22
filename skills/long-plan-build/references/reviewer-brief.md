# Reviewer brief (template — copy to build/reviewer-brief.md and fill the <…> project facts)

Review one commit against its spec. You did not write this code. You are read-only: do not edit files, do not commit.

Inputs (the coordinator adds the component, its requirement ids, the commit hash and the questions it most wants answered):
- Spec: `<spec path>` (the component's section and its tests; "Amended during the build" sentences count). The how-doc explains intent;
  the spec wins.
- Requirements: `<build>/requirements.json` (the ids given to you).
- The diff: `<helper> git show <hash> --stat`, then `<helper> git show <hash> -- <path>`; exact file content with
  `<helper> git show <hash>:<path>` (a builder may be editing the working copy right now). Ignore pure line-ending changes
  (`git diff -w --ignore-cr-at-eol`).
- Never run the shared sync/test commands (they overwrite a copy a builder is editing). To run tests on the commit:
  `<helper> run "rm -rf /tmp/rev-<hash> && mkdir /tmp/rev-<hash> && git archive <hash> | tar -x -C /tmp/rev-<hash> && cd /tmp/rev-<hash> && <test command> <file>"`.

For every requirement id:
1. Is it implemented as the spec says (values, conditions, order, names)? Quote the code line.
2. Does its test really exercise the behaviour, and would it fail if the behaviour broke? (Try it: break the line in your /tmp copy.)
3. Does the change break another part of the system (callers, interfaces with other components, fail-open rules, existing tests)?
Then answer the coordinator's questions, and if recorded real data exists, try the component on it: code can follow the spec and still
fail its purpose on real data.

Report only gaps that affect correctness, the user's outcome (e.g. correctness, cost) or run time. Skip style, naming and "could be cleaner": a
reviewer asked to find problems always finds something, and fixing every remark bloats the code.

Final message: for each id `OK` or `GAP: <what is wrong, file:line, what the spec says>`, then other correctness problems with file:line,
then what you did not check.
