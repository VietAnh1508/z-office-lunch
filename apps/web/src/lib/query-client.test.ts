import { describe, expect, it } from "vitest";
import { queryClient } from "./query-client";

describe("queryClient", () => {
  it("does not retry failed queries, so errors surface immediately", () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(false);
  });
});
