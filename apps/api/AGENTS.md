# API Conventions (`apps/api`)

When working in `apps/api/`, read and follow these project rules:

- [api-error-handling.md](../../.claude/rules/api-error-handling.md) — `try`/`catch`/`finally` with structured JSON logging, `ERROR_MESSAGES`, and synchronous `db.$client.end()`.
- [api-layers.md](../../.claude/rules/api-layers.md) — Controller / Service / Repository boundaries (`withDb`, `respond`, `Result`) and the test-move protocol.
