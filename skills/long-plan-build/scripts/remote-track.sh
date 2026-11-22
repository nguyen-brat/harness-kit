#!/usr/bin/env bash
# Build helper for "edit a local working copy; git + tests on a (remote) test machine", with parallel tracks on git worktrees.
# Copy into the build folder and set the variables below (or export BUILD_*). Needs bash, rsync and flock on the test machine.
# Tracks: TRACK=main (default) = $SRC_MAIN <-> $DST_MAIN (main branch);
# TRACK=B|C|... = $SRC_TRACKS/<T> <-> $DST_MAIN-wt-<T> (git worktree on branch track-<T>; create it with
#   remote "cd $DST_MAIN && git worktree add <dst> -b track-<T> <base>" then `TRACK=<T> remote-track.sh pull`).
#   sync                 mirror the working copy to the test machine (keeps .git/.gitattributes/.gitignore there, so edit those two
#                        on the test machine; strips CR from text files unless STRIP_CR=0, skipping paths matching $CR_KEEP)
#   test [files...]      sync, then run the given test files, or the whole suite (every run takes one lock shared by all tracks; main
#                        writes last-test.txt and runs coverage.mjs, exit code = coverage's; other tracks write last-test-<T>.txt)
#   commit "message"     sync, then git add -A && git commit on the test machine
#   pull                 make the working copy equal to HEAD of this track (after a merge). Deletes local files git does not track
#                        (never .git, node_modules, .env*); refuses when the copy holds a .git folder or more than PULL_MAX_DELETE files
#                        would go (FORCE=1 overrides). Run it only when no builder has uncommitted edits in that copy.
#   git <args...>        run git there;   run "<cmd>"  run a shell command in the track's copy there
set -euo pipefail
HOST="${BUILD_HOST:-my-test-host}"                 # ssh host alias; use "local" to run on this machine
SRC_MAIN="${BUILD_SRC:-$HOME/project/pack-src}"   # local working copy of the main track
SRC_TRACKS="${BUILD_SRC_TRACKS:-$HOME/build-wt}"  # local parent folder of track working copies
DST_MAIN="${BUILD_DST:-~/project-src}"            # git repo on the test machine
TEST_CMD="${BUILD_TEST_CMD:-node --test --test-reporter=spec}"
ENV_INIT="${BUILD_ENV_INIT:-true}"                # e.g. ". ~/env.sh" to load the toolchain
CR_KEEP="${BUILD_CR_KEEP:-/fixtures/}"            # paths (grep -E) whose CRs are kept, e.g. recorded data
PULL_MAX_DELETE="${PULL_MAX_DELETE:-20}"

HERE="$(cd "$(dirname "$0")" && pwd)"
TRACK="${TRACK:-main}"
if [ "$TRACK" = main ]; then SRC="$SRC_MAIN"; DST="$DST_MAIN"; OUT="$HERE/last-test.txt"
else SRC="$SRC_TRACKS/$TRACK"; DST="$DST_MAIN-wt-$TRACK"; OUT="$HERE/last-test-$TRACK.txt"; fi
remote() { if [ "$HOST" = local ]; then bash -c "$*"; else ssh -o BatchMode=yes -o ServerAliveInterval=30 "$HOST" "$@"; fi; }

sync() {
  local strip=true
  [ "${STRIP_CR:-1}" = 1 ] && strip="{ grep -rlI \$'\r' --exclude-dir=.git --exclude-dir=node_modules . | grep -Ev '$CR_KEEP' | tr '\n' '\0' | xargs -0 -r sed -i 's/\r\$//'; }"
  tar -C "$SRC" --exclude=node_modules --exclude=.git -cf - . | remote "rm -rf ~/.stage-$TRACK && mkdir -p ~/.stage-$TRACK && tar -C ~/.stage-$TRACK -xf - && rsync -a --delete --exclude=.git --exclude=.gitignore --exclude=.gitattributes --exclude=node_modules ~/.stage-$TRACK/ $DST/ && cd $DST && $strip"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  sync) sync; echo synced ;;
  test)
    sync
    if [ $# -gt 0 ]; then remote "cd $DST && $ENV_INIT && flock ~/.suite.lock $TEST_CMD $*" 2>&1 | tail -n 200
    else
      rc=0; remote "cd $DST && $ENV_INIT && flock ~/.suite.lock $TEST_CMD" > "$OUT" 2>&1 || rc=$?
      tail -n 12 "$OUT"
      if [ "$TRACK" = main ]; then node "$HERE/coverage.mjs"; exit $?
      else grep -E '^\s*[✔✖] [A-Z][A-Z0-9]*\.[0-9]+' "$OUT" | sort -u | head -80 || true; exit $rc; fi
    fi ;;
  commit) sync; remote "cd $DST && git add -A && git commit -q -m $(printf '%q' "$1") && git log --oneline -1" ;;
  pull)
    [ -d "$SRC/.git" ] && [ "${FORCE:-0}" != 1 ] && { echo "refusing: $SRC is a git checkout (pull mirrors files; use git there)"; exit 1; }
    mkdir -p "$SRC"
    files="$(remote "cd $DST && git ls-files")"
    ( cd "$SRC" && find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -name '.env*' | sed 's|^\./||' | sort ) > /tmp/pull-local-$TRACK
    printf '%s\n' "$files" | sort > /tmp/pull-remote-$TRACK
    comm -23 /tmp/pull-local-$TRACK /tmp/pull-remote-$TRACK | { grep -vxE '\.gitattributes|\.gitignore' || true; } > /tmp/pull-del-$TRACK
    n=$(wc -l < /tmp/pull-del-$TRACK)
    if [ "$n" -gt "$PULL_MAX_DELETE" ] && [ "${FORCE:-0}" != 1 ]; then
      echo "refusing: $n local files are not in git HEAD (first: $(head -3 /tmp/pull-del-$TRACK | tr '\n' ' ')); FORCE=1 to delete them"; exit 1; fi
    while read -r f; do [ -n "$f" ] && rm -f "$SRC/$f"; done < /tmp/pull-del-$TRACK
    remote "cd $DST && git archive HEAD" | tar -C "$SRC" -xf -
    rm -f "$SRC/.gitattributes" "$SRC/.gitignore"
    echo "pulled $(remote "cd $DST && git log --oneline -1")" ;;
  git) remote "cd $DST && git $(printf '%q ' "$@")" ;;
  run) remote "cd $DST && $ENV_INIT && $1" ;;
  *) sed -n '2,/^set -euo/p' "$0" | sed '$d'; exit 1 ;;
esac
