import { createDb, restaurants } from "db";
import { TEST_DATABASE_URL, seedSizePreset, truncateAll } from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../../index";
import { expectStructured500 } from "../../test/assertions";
import { createFakeAiBinding } from "../../test/fake-ai-binding";
import { createFakeMenuImagesBucket } from "../../test/fake-menu-images-bucket";
import { testEnv, unreachableEnv } from "../../test/env";

type Restaurant = typeof restaurants.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

function post(body: unknown, env = testEnv) {
  return app.request(
    "/api/restaurants",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    env,
  );
}

describe("restaurants CRUD routes", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("POST without name returns 400", async () => {
    const res = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("valid POST persists a row and is retrievable via GET", async () => {
    const postRes = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24", type: "food", contactInfo: "090-123-4567" }),
      },
      testEnv,
    );

    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as Restaurant;
    expect(created.name).toBe("Pho 24");
    expect(created.type).toBe("food");

    const getRes = await app.request("/api/restaurants", {}, testEnv);
    expect(getRes.status).toBe(200);
    const rows = (await getRes.json()) as Restaurant[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Pho 24");
    expect(rows[0]?.contactInfo).toBe("090-123-4567");
    expect(rows[0]?.type).toBe("food");
  });

  it("POST persists note and menuUrl", async () => {
    const postRes = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Pho 24",
          type: "food",
          note: "Cash only",
          menuUrl: "https://pho24.example.com/menu",
        }),
      },
      testEnv,
    );

    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as Restaurant;
    expect(created.note).toBe("Cash only");
    expect(created.menuUrl).toBe("https://pho24.example.com/menu");
  });

  it("POST without note/menuUrl, or with blank/whitespace values, stores null for each independently", async () => {
    const missingRes = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24", type: "food" }),
      },
      testEnv,
    );
    const missingCreated = (await missingRes.json()) as Restaurant;
    expect(missingCreated.note).toBeNull();
    expect(missingCreated.menuUrl).toBeNull();

    const blankRes = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bun Cha", type: "food", note: "   ", menuUrl: "" }),
      },
      testEnv,
    );
    const blankCreated = (await blankRes.json()) as Restaurant;
    expect(blankCreated.note).toBeNull();
    expect(blankCreated.menuUrl).toBeNull();
  });

  it("POST without type returns 400", async () => {
    const res = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24" }),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("POST with an invalid type returns 400", async () => {
    const res = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pho 24", type: "sandwich" }),
      },
      testEnv,
    );

    expect(res.status).toBe(400);
  });

  it("valid POST with type drink persists and round-trips via GET", async () => {
    const postRes = await app.request(
      "/api/restaurants",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tra Da", type: "drink" }),
      },
      testEnv,
    );

    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as Restaurant;
    expect(created.type).toBe("drink");

    const getRes = await app.request("/api/restaurants", {}, testEnv);
    const rows = (await getRes.json()) as Restaurant[];
    expect(rows[0]?.type).toBe("drink");
  });

  describe("POST /api/restaurants size preset", () => {
    it("stores sizePresetId on a drink restaurant and exposes it via GET", async () => {
      const { preset } = await seedSizePreset(db);
      const res = await post({ name: "Tea", type: "drink", sizePresetId: preset.id });
      expect(res.status).toBe(201);
      expect(((await res.json()) as Restaurant).sizePresetId).toBe(preset.id);

      const list = (await (
        await app.request("/api/restaurants", {}, testEnv)
      ).json()) as Restaurant[];
      expect(list[0]?.sizePresetId).toBe(preset.id);
    });

    it("defaults sizePresetId to null when omitted or null", async () => {
      for (const body of [
        { name: "A", type: "drink" },
        { name: "B", type: "drink", sizePresetId: null },
      ]) {
        const res = await post(body);
        expect(res.status).toBe(201);
        expect(((await res.json()) as Restaurant).sizePresetId).toBeNull();
      }
    });

    it("400 sizePresetIdInvalid when not an integer or null", async () => {
      for (const sizePresetId of ["1", 1.5, true, {}]) {
        const res = await post({ name: "Tea", type: "drink", sizePresetId });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "sizePresetId must be a valid size preset id" });
      }
    });

    it("400 sizePresetFoodRestaurant for a food restaurant with a preset", async () => {
      const { preset } = await seedSizePreset(db);
      const res = await post({ name: "Pho", type: "food", sizePresetId: preset.id });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "only a drink restaurant can have a size preset" });
    });

    it("allows a food restaurant with an explicit null preset", async () => {
      const res = await post({ name: "Pho", type: "food", sizePresetId: null });
      expect(res.status).toBe(201);
    });

    it("404 sizePresetNotFound for a missing preset", async () => {
      const res = await post({ name: "Tea", type: "drink", sizePresetId: 999999 });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "size preset not found" });
    });
  });

  it("returns a structured 500 when the database is unreachable", async () => {
    const formData = new FormData();
    formData.append(
      "menuImage",
      new File([new Uint8Array([1, 2, 3])], "menu.jpg", { type: "image/jpeg" }),
    );
    const unreachableWithBindings = {
      ...unreachableEnv,
      MENU_IMAGES: createFakeMenuImagesBucket(),
      AI: createFakeAiBinding() as unknown,
    };

    await expectStructured500(await app.request("/api/restaurants", {}, unreachableEnv));
    await expectStructured500(await post({ name: "Pho 24", type: "food" }, unreachableEnv));
    await expectStructured500(
      await app.request(
        "/api/restaurants/1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Pho 24", sizePresetId: 1 }),
        },
        unreachableEnv,
      ),
    );
    await expectStructured500(
      await app.request(
        "/api/restaurants/1/size-reset-impact?sizePresetId=null",
        {},
        unreachableEnv,
      ),
    );
    await expectStructured500(
      await app.request(
        "/api/restaurants/1/menu-image",
        { method: "POST", body: formData },
        unreachableWithBindings,
      ),
    );
    await expectStructured500(
      await app.request("/api/restaurants/1/menu-image", {}, unreachableWithBindings),
    );
    await expectStructured500(
      await app.request(
        "/api/restaurants/1/menu-image",
        { method: "DELETE" },
        unreachableWithBindings,
      ),
    );
    await expectStructured500(
      await app.request(
        "/api/restaurants/1/generate-menu",
        { method: "POST" },
        unreachableWithBindings,
      ),
    );
  });
});
