#!/usr/bin/env bash
# Full local dev bring-up: container runtime -> Postgres -> env file -> wrangler dev.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! docker info > /dev/null 2>&1; then
  if command -v colima > /dev/null 2>&1; then
    echo "==> Starting colima (container runtime not running)..."
    colima start
  else
    echo "error: no container runtime is running (docker info failed) and colima isn't installed." >&2
    echo "Start Docker Desktop (or install/start colima) and re-run." >&2
    exit 1
  fi
fi

echo "==> Starting local Postgres..."
docker compose up -d --wait

echo "==> Applying database migrations..."
pnpm db:migrate

if [ ! -f apps/api/.env ]; then
  echo "==> Creating apps/api/.env from .env.example..."
  cp apps/api/.env.example apps/api/.env
fi

echo "==> Building web..."
pnpm --filter web build

echo "==> Starting wrangler dev (http://localhost:8787)..."
exec pnpm --filter api dev
