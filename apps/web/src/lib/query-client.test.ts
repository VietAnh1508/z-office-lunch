import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { queryClient } from "./query-client";

function retry(failureCount: number, error: unknown) {
  const shouldRetry = queryClient.getDefaultOptions().queries?.retry;
  if (typeof shouldRetry !== "function") {
    throw new Error("expected queries.retry to be a function");
  }
  return shouldRetry(failureCount, error as Error);
}

describe("queryClient", () => {
  it("never retries a 4xx ApiError, so client errors surface immediately", () => {
    expect(retry(0, new ApiError(400, "bad request"))).toBe(false);
    expect(retry(0, new ApiError(404, "not found"))).toBe(false);
  });

  it("retries a 5xx ApiError up to twice", () => {
    const error = new ApiError(500, "internal error");
    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(true);
    expect(retry(2, error)).toBe(false);
  });

  it("retries a non-ApiError (e.g. a network failure) up to twice", () => {
    const error = new TypeError("Failed to fetch");
    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(true);
    expect(retry(2, error)).toBe(false);
  });
});
