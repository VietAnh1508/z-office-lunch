import { createDb, restaurants } from "db";
import { TEST_DATABASE_URL, truncateAll } from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../index";
import { createFakeMenuImagesBucket } from "../test/fake-menu-images-bucket";
import { testEnv, unreachableEnv } from "../test/env";

type Restaurant = typeof restaurants.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

describe("restaurants routes", () => {
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

  it("GET returns a structured 500 when the database is unreachable", async () => {
    const res = await app.request("/api/restaurants", {}, unreachableEnv);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  describe("PATCH /:id", () => {
    async function createRestaurant(overrides: Record<string, unknown> = {}) {
      const res = await app.request(
        "/api/restaurants",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Pho 24",
            type: "food",
            contactInfo: "090-123-4567",
            note: "Cash only",
            menuUrl: "https://pho24.example.com/menu",
            ...overrides,
          }),
        },
        testEnv,
      );
      return (await res.json()) as Restaurant;
    }

    it("updates name, contactInfo, note, menuUrl together and returns the updated row", async () => {
      const restaurant = await createRestaurant();

      const res = await app.request(
        `/api/restaurants/${restaurant.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Pho 25",
            contactInfo: "090-999-9999",
            note: "Card accepted now",
            menuUrl: "https://pho25.example.com/menu",
          }),
        },
        testEnv,
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Restaurant;
      expect(updated.name).toBe("Pho 25");
      expect(updated.contactInfo).toBe("090-999-9999");
      expect(updated.note).toBe("Card accepted now");
      expect(updated.menuUrl).toBe("https://pho25.example.com/menu");
    });

    it("clearing contactInfo/note/menuUrl (blank or omitted) sets them to null", async () => {
      const restaurant = await createRestaurant();

      const res = await app.request(
        `/api/restaurants/${restaurant.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Pho 24", contactInfo: "   ", note: "" }),
        },
        testEnv,
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Restaurant;
      expect(updated.contactInfo).toBeNull();
      expect(updated.note).toBeNull();
      expect(updated.menuUrl).toBeNull();
    });

    it("blank/whitespace-only/missing name returns 400 nameRequired, row left unchanged", async () => {
      const restaurant = await createRestaurant();

      for (const body of [{ name: "   " }, {}]) {
        const res = await app.request(
          `/api/restaurants/${restaurant.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
          testEnv,
        );
        expect(res.status).toBe(400);
      }

      const getRes = await app.request("/api/restaurants", {}, testEnv);
      const rows = (await getRes.json()) as Restaurant[];
      expect(rows.find((r) => r.id === restaurant.id)?.name).toBe("Pho 24");
    });

    it("never modifies type, even if included in the request body", async () => {
      const restaurant = await createRestaurant({ type: "food" });

      const res = await app.request(
        `/api/restaurants/${restaurant.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Pho 24", type: "drink" }),
        },
        testEnv,
      );

      expect(res.status).toBe(200);
      const updated = (await res.json()) as Restaurant;
      expect(updated.type).toBe("food");
    });

    it("nonexistent id returns 404 restaurantNotFound", async () => {
      const res = await app.request(
        "/api/restaurants/999999",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Pho 24" }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
    });

    it("non-integer id returns 404 restaurantNotFound", async () => {
      const res = await app.request(
        "/api/restaurants/abc",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Pho 24" }),
        },
        testEnv,
      );

      expect(res.status).toBe(404);
    });

    it("returns a structured 500 when the database is unreachable", async () => {
      const res = await app.request(
        "/api/restaurants/1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Pho 24" }),
        },
        unreachableEnv,
      );

      expect(res.status).toBe(500);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBeTruthy();
    });
  });

  describe("menu image", () => {
    async function createRestaurant() {
      const res = await app.request(
        "/api/restaurants",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Pho 24", type: "food" }),
        },
        testEnv,
      );
      return (await res.json()) as Restaurant;
    }

    function menuImageFormData(overrides?: { name?: string; type?: string; bytes?: Uint8Array }) {
      const formData = new FormData();
      const bytes = overrides?.bytes ?? new Uint8Array([1, 2, 3]);
      formData.append(
        "menuImage",
        new File([bytes], overrides?.name ?? "menu.jpg", { type: overrides?.type ?? "image/jpeg" }),
      );
      return formData;
    }

    describe("POST /:id/menu-image", () => {
      it("stores the file and sets menuImage on the row", async () => {
        const restaurant = await createRestaurant();
        const bucket = createFakeMenuImagesBucket();

        const res = await app.request(
          `/api/restaurants/${restaurant.id}/menu-image`,
          { method: "POST", body: menuImageFormData() },
          { ...testEnv, MENU_IMAGES: bucket },
        );

        expect(res.status).toBe(200);
        const updated = (await res.json()) as Restaurant;
        expect(updated.menuImage).toBeTruthy();
        expect(bucket.objects.size).toBe(1);
        const key = updated.menuImage as string;
        const object = bucket.objects.get(key);
        expect(object?.httpMetadata?.contentType).toBe("image/jpeg");
        expect(Array.from(object?.bytes ?? [])).toEqual([1, 2, 3]);
      });

      it("re-upload replaces the existing image", async () => {
        const restaurant = await createRestaurant();
        const bucket = createFakeMenuImagesBucket();
        const env = { ...testEnv, MENU_IMAGES: bucket };

        const firstRes = await app.request(
          `/api/restaurants/${restaurant.id}/menu-image`,
          { method: "POST", body: menuImageFormData({ bytes: new Uint8Array([1]) }) },
          env,
        );
        const first = (await firstRes.json()) as Restaurant;
        const firstKey = first.menuImage;

        const secondRes = await app.request(
          `/api/restaurants/${restaurant.id}/menu-image`,
          { method: "POST", body: menuImageFormData({ bytes: new Uint8Array([2]) }) },
          env,
        );
        expect(secondRes.status).toBe(200);
        const second = (await secondRes.json()) as Restaurant;

        expect(second.menuImage).not.toBe(firstKey);
        expect(bucket.objects.has(firstKey as string)).toBe(false);
        expect(bucket.objects.has(second.menuImage as string)).toBe(true);
      });

      it("missing menuImage field returns 400 menuImageRequired", async () => {
        const restaurant = await createRestaurant();
        const res = await app.request(
          `/api/restaurants/${restaurant.id}/menu-image`,
          { method: "POST", body: new FormData() },
          { ...testEnv, MENU_IMAGES: createFakeMenuImagesBucket() },
        );

        expect(res.status).toBe(400);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toBe("menuImage file is required");
      });

      it("wrong file type returns 400 menuImageTypeInvalid, checked before any DB query", async () => {
        const res = await app.request(
          "/api/restaurants/999999/menu-image",
          { method: "POST", body: menuImageFormData({ type: "text/plain" }) },
          { ...testEnv, MENU_IMAGES: createFakeMenuImagesBucket() },
        );

        expect(res.status).toBe(400);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toBe("menuImage must be a JPEG, PNG, or WebP image");
      });

      it("missing menuImage field against a nonexistent restaurant still returns 400, not 404", async () => {
        const res = await app.request(
          "/api/restaurants/999999/menu-image",
          { method: "POST", body: new FormData() },
          { ...testEnv, MENU_IMAGES: createFakeMenuImagesBucket() },
        );

        expect(res.status).toBe(400);
      });

      it("oversized file returns 413", async () => {
        const restaurant = await createRestaurant();
        const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
        const res = await app.request(
          `/api/restaurants/${restaurant.id}/menu-image`,
          { method: "POST", body: menuImageFormData({ bytes: oversized }) },
          { ...testEnv, MENU_IMAGES: createFakeMenuImagesBucket() },
        );

        expect(res.status).toBe(413);
      });

      it("nonexistent restaurant with a valid file returns 404 restaurantNotFound", async () => {
        const res = await app.request(
          "/api/restaurants/999999/menu-image",
          { method: "POST", body: menuImageFormData() },
          { ...testEnv, MENU_IMAGES: createFakeMenuImagesBucket() },
        );

        expect(res.status).toBe(404);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toBe("restaurant not found");
      });

      it("returns a structured 500 when the database is unreachable", async () => {
        const res = await app.request(
          "/api/restaurants/1/menu-image",
          { method: "POST", body: menuImageFormData() },
          { ...unreachableEnv, MENU_IMAGES: createFakeMenuImagesBucket() },
        );

        expect(res.status).toBe(500);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toBeTruthy();
      });
    });

    describe("GET /:id/menu-image", () => {
      it("streams the stored image bytes with content type", async () => {
        const restaurant = await createRestaurant();
        const bucket = createFakeMenuImagesBucket();
        const env = { ...testEnv, MENU_IMAGES: bucket };
        await app.request(
          `/api/restaurants/${restaurant.id}/menu-image`,
          { method: "POST", body: menuImageFormData({ bytes: new Uint8Array([9, 8, 7]) }) },
          env,
        );

        const res = await app.request(`/api/restaurants/${restaurant.id}/menu-image`, {}, env);

        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("image/jpeg");
        expect(res.headers.get("Cache-Control")).toBe("no-cache");
        expect(res.headers.get("ETag")).toBeTruthy();
        const bytes = new Uint8Array(await res.arrayBuffer());
        expect(Array.from(bytes)).toEqual([9, 8, 7]);
      });

      it("404s menuImageNotFound when no image is set", async () => {
        const restaurant = await createRestaurant();
        const res = await app.request(
          `/api/restaurants/${restaurant.id}/menu-image`,
          {},
          { ...testEnv, MENU_IMAGES: createFakeMenuImagesBucket() },
        );

        expect(res.status).toBe(404);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toBe("this restaurant has no menu image");
      });

      it("404s for a nonexistent restaurant", async () => {
        const res = await app.request(
          "/api/restaurants/999999/menu-image",
          {},
          { ...testEnv, MENU_IMAGES: createFakeMenuImagesBucket() },
        );

        expect(res.status).toBe(404);
      });
    });

    describe("DELETE /:id/menu-image", () => {
      it("clears menuImage and removes the stored object", async () => {
        const restaurant = await createRestaurant();
        const bucket = createFakeMenuImagesBucket();
        const env = { ...testEnv, MENU_IMAGES: bucket };
        const uploadRes = await app.request(
          `/api/restaurants/${restaurant.id}/menu-image`,
          { method: "POST", body: menuImageFormData() },
          env,
        );
        const uploaded = (await uploadRes.json()) as Restaurant;

        const res = await app.request(
          `/api/restaurants/${restaurant.id}/menu-image`,
          { method: "DELETE" },
          env,
        );

        expect(res.status).toBe(200);
        const updated = (await res.json()) as Restaurant;
        expect(updated.menuImage).toBeNull();
        expect(bucket.objects.has(uploaded.menuImage as string)).toBe(false);
      });

      it("404s when no image was set", async () => {
        const restaurant = await createRestaurant();
        const res = await app.request(
          `/api/restaurants/${restaurant.id}/menu-image`,
          { method: "DELETE" },
          { ...testEnv, MENU_IMAGES: createFakeMenuImagesBucket() },
        );

        expect(res.status).toBe(404);
      });
    });
  });
});
