# Merge agent brief (template)

You are the merge agent for a parallel build. Read `<build>/builder-brief.md` (rules and test loop) and `<build>/progress.md`
first.

## State
- Checkout: `<path>`, on branch `<target>` at `<hash>`.
- `git merge <branch>` (`<branch hash>`, branched from `<base>`) stopped with conflicts in `<files>`.
- Work in this checkout. Git has recorded the conflict here, and `git status` shows it.

## Intents to keep
The coordinator fills these in from `progress.md`, one bullet per side:
- Side A: `<what it built: names of new functions, options and tests>`
- Side B: `<the same for this side>`
- Combined rules, if any, e.g. "both sides rewrote test X: write one test that checks both".

## Do
1. Resolve every conflict and keep BOTH sides' intent.
   - Read each side with `git show <branch>:<path>`, and the base with `git show <base>:<path>`.
   - Where both sides appended at the same spot, keep both blocks.
   - Check what git merged automatically too: every function one side calls must exist on the merged side.
2. `git add` the resolved files and finish the merge commit.
3. Run the full suite. It must exit 0. Fix real merge breakages without weakening assertions, and commit the fixes.

## Report
- Each conflict and how you resolved it.
- Any extra fixes.
- The suite's exit status and summary line.
- The final hash.
