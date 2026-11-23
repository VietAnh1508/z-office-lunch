import { createDb, restaurants } from "db";
import { TEST_DATABASE_URL, truncateAll } from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../../index";
import { createFakeMenuImagesBucket } from "../../test/fake-menu-images-bucket";
import { testEnv } from "../../test/env";

type Restaurant = typeof restaurants.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

describe("restaurants menu image routes", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterAll(async () => {
    await db.$client.end();
  });

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
