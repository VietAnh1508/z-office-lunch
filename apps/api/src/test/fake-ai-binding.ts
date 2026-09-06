// Mirrors fake-menu-images-bucket.ts's pattern: a minimal object shaped like the real binding
// (only the `run` method the route actually calls), configured per test via `resolveWith`/`rejectWith`
// before the route is invoked. Keeps `pnpm test`/`pnpm test:e2e` free of any real network call to
// Workers AI, which has no local emulation (see tasks/038-workers-ai-menu-generation.md).
export function createFakeAiBinding() {
  let handler: () => Promise<unknown> = async () => {
    throw new Error("createFakeAiBinding: no response configured for this test");
  };

  return {
    // `response` mirrors the real binding's `{ response: ... }` envelope's `response` field only —
    // pass a parsed object, a JSON string, or free-text prose to cover each shape Workers AI is
    // observed to actually return (see task 038's Plan Deviations for the real-call findings).
    resolveWith(response: unknown) {
      handler = async () => ({ response });
    },
    rejectWith(error: unknown) {
      handler = async () => {
        throw error;
      };
    },
    async run() {
      return handler();
    },
  };
}
