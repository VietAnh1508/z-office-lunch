---
paths:
  - "apps/api/**/*.ts"
---

# API layers

Each feature module splits into three layers. Shared pieces: `lib/controller.ts` (`withDb`, `respond`), `lib/db-types.ts` (`Db`, `Tx`, `DbOrTx`), `lib/result.ts` (`Result`).

- **Controller** (Hono routes): routing, parsing/validation of the request, the DB lifecycle (`withDb`) and `Result` -> response mapping (`respond`). The only layer that touches `c`.
- **Service**: business rules and transactions. Never takes `c`. Returns `Result`.
- **Repository**: Drizzle queries only. Takes `db | tx`. Each repository owns its own tables.
- Cross-domain reads go through the other module's repository, never its service.
- Keep the existing error-check order and the `[]`-vs-404 policies exactly as they are when moving code.

## Moving a module (test-move protocol)

- **Red commit:** relocate the existing HTTP tests word for word into the module's controller test files (still passing), and add the new layer tests (failing).
- **Green commit:** move the code without touching the relocated assertions.
- Every old `it` is accounted for: kept, moved, or named as merged in the task's Implementation Log.

Test helpers live in `apps/api/src/test/`: `useTestDb()`, `request`/`get`/`post`/`patch`/`put`/`del`/`postForm`, `expectStructured500`.
