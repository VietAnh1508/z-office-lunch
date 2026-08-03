#!/usr/bin/env bash
# Stop this project's dev servers (wrangler/workerd, vite, concurrently) if left
# running, e.g. after a `pnpm dev` or `pnpm dev:hot` session wasn't Ctrl+C'd
# cleanly. Kills the whole matching process tree at once (not just the leaf
# listening on a port) so a still-alive supervisor (concurrently, wrangler's own
# CLI) can't respawn a child right after — killing only the port-listener and
# leaving wrangler's CLI process alive was exactly this bug the first time.
# Scoped by each candidate's cwd being this repo (or a subdirectory of it, since
# `pnpm --filter` runs commands with cwd set to that package), not by matching
# the repo path in the command line — pnpm/concurrently's own binaries live
# outside the repo and don't mention its path at all.
#
# Candidates are matched by path fragment (/workerd, /wrangler, ...), not by a
# bare keyword — a loose `wrangler|workerd|vite|concurrently` substring search
# self-matched (and killed) an unrelated shell command that merely mentioned
# those words, e.g. while grepping for them in a `ps aux` line. The top-level
# `pnpm exec concurrently ...` wrapper has no path fragment of its own, so it's
# matched by its exact invocation string from dev-hot.sh instead.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
REPO_ROOT="$(pwd)"

candidates=$(ps -eo pid=,command= 2>/dev/null | grep -E '/workerd|/wrangler|/vite|/concurrently|pnpm exec concurrently -n api,web -c blue,green pnpm --filter api dev pnpm --filter web dev' | awk '{print $1}')

pids=""
for pid in $candidates; do
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)
  if [[ "$cwd" == "$REPO_ROOT"* ]]; then
    pids="$pids $pid"
  fi
done
pids=$(echo "$pids" | xargs -n1 2>/dev/null | sort -un | xargs)

if [ -z "$pids" ]; then
  echo "No z-office-lunch dev processes found."
  exit 0
fi

echo "Stopping z-office-lunch dev processes:"
ps -p "$(echo "$pids" | tr ' ' ',')" -o pid,command

kill $pids 2>/dev/null || true
sleep 1

for pid in $pids; do
  if ps -p "$pid" > /dev/null 2>&1; then
    echo "PID $pid still running, sending SIGKILL..."
    kill -9 "$pid" 2>/dev/null || true
  fi
done

echo "Stopped."
