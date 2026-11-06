// One shape for "parse/validate this input" results across API routes.
// Success spreads its payload next to `ok: true`; failure always carries the
// message and HTTP status the route should reply with.
export type Failure<S extends number = 400> = { ok: false; error: string; status: S };

export type Result<T extends object = object, S extends number = 400> =
  ({ ok: true } & T) | Failure<S>;

export function ok(): { ok: true };
export function ok<T extends object>(value: T): { ok: true } & T;
export function ok(value: object = {}) {
  return { ok: true as const, ...value };
}

export function fail(error: string): Failure<400>;
export function fail<S extends number>(error: string, status: S): Failure<S>;
export function fail(error: string, status = 400) {
  return { ok: false as const, error, status };
}
