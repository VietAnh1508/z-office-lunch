---
paths:
  - "apps/api/**/*.ts"
---

# API route error handling

Every route handler that touches the database wraps its query in `try`/`catch`/`finally`:

```ts
import { ERROR_MESSAGES } from "../lib/errors";

const db = getDb(c);
try {
  // ... query ...
  return c.json(result);
} catch (e) {
  console.error(JSON.stringify({ message: "failed to <what this handler does>", error: String(e) }));
  return c.json({ error: ERROR_MESSAGES.internal }, 500);
} finally {
  await db.$client.end();
}
```

- `catch` always logs (structured JSON via `console.error`) and returns a JSON `{ error }` body with `500` — an uncaught throw falls through to Hono's default error handler, which returns a plain-text body with no logging, invisible in production and silently breaking any client expecting JSON.
- `finally` always calls `await db.$client.end()` directly — never `c.executionCtx.waitUntil(...)`. Tests exercise routes via `app.request()` outside a real Worker's lifecycle, so cleanup must be awaited synchronously or the connection leaks/hangs in tests.
- Error message strings — the internal-error message and any validation message reused across routes (e.g. a missing required field) — live in `apps/api/src/lib/errors.ts`'s `ERROR_MESSAGES`, not inlined per route. Add a new entry there rather than re-typing a string a second route also needs.

Established in `apps/api/src/index.ts`'s `/api/health` handler (the logging shape) and `apps/api/src/routes/restaurants.ts` (the first route to reuse the full pattern) — see `tasks/003-restaurants-crud.md`.
