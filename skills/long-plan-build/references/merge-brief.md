# Merge agent brief (template)

You are the merge agent for a parallel build. Read `<build>/builder-brief.md` (rules, test loop) and `<build>/progress.md` first.

State: branch `<target>` (local working copy `<path>`, helper calls with `TRACK=<T>` or none) at `<hash>`; `git merge -X renormalize
<branch>` (`<branch hash>`, branched from `<base>`) stopped with conflicts in `<files>`.

Bring the conflicted tree into the local working copy. Write these lines into a script file and run the file (binary pipes typed
straight into a shell can be mangled by output-filtering hooks):
```bash
<helper> run "tar --exclude=.git --exclude=node_modules -cf - ." > /tmp/merge-tree.tar
find <working copy> -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .git -exec rm -rf {} +   # keep installed dependencies
tar -C <working copy> -xf /tmp/merge-tree.tar
```

Intents to keep (the coordinator fills these from progress.md, one bullet per side): `<side A: what it built, names of new
functions/options/tests>`, `<side B: …>`, and any combined rule (e.g. "both sides rewrote test X: write one test that checks both").

Do:
1. Resolve every conflict keeping BOTH sides' intent. Read each side with `git show <branch>:<path>` and the base with
   `git show <base>:<path>` to understand what changed. Where both sides appended at the same spot, keep both blocks and restore the
   shared closing line. Check the code git merged automatically too: every function one side calls must exist on the merged side.
2. `<helper> sync`, then `<helper> run "git add -A && git commit -q --no-edit"`.
3. Full suite (`<helper> test`), green (rerun known load-sensitive files alone). Fix real merge breakages without weakening assertions;
   commit the fixes.
4. `<helper> pull` so the local copy equals HEAD.
Report: each conflict and its resolution, extra fixes, suite results, final hash.
