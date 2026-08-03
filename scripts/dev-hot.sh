#!/usr/bin/env bash
# Local dev bring-up with frontend hot reload: container runtime -> Postgres -> env file ->
# wrangler dev (api, :8787) + vite dev (web, :5173) run concurrently, no SPA build step.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

source scripts/dev-setup.sh

echo "==> Starting wrangler dev (http://localhost:8787) and vite dev (http://localhost:5173) with hot reload..."
exec pnpm exec concurrently -n api,web -c blue,green "pnpm --filter api dev" "pnpm --filter web dev"
