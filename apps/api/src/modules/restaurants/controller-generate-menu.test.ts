import { createDb, restaurants } from "db";
import { TEST_DATABASE_URL, truncateAll } from "db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../../index";
import { createFakeAiBinding } from "../../test/fake-ai-binding";
import { createFakeMenuImagesBucket } from "../../test/fake-menu-images-bucket";
import { testEnv } from "../../test/env";

type Restaurant = typeof restaurants.$inferSelect;

const db = createDb(TEST_DATABASE_URL);

describe("POST /api/restaurants/:id/generate-menu", () => {
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

  it("nonexistent restaurant returns 404 restaurantNotFound", async () => {
    const res = await app.request(
      "/api/restaurants/999999/generate-menu",
      { method: "POST" },
      {
        ...testEnv,
        MENU_IMAGES: createFakeMenuImagesBucket(),
        AI: createFakeAiBinding() as unknown,
      },
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("restaurant not found");
  });

  it("restaurant with no menu image returns 404 menuImageNotFound", async () => {
    const restaurant = await createRestaurant();
    const res = await app.request(
      `/api/restaurants/${restaurant.id}/generate-menu`,
      { method: "POST" },
      {
        ...testEnv,
        MENU_IMAGES: createFakeMenuImagesBucket(),
        AI: createFakeAiBinding() as unknown,
      },
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("this restaurant has no menu image");
  });

  it("valid image and a well-formed model response returns 200 with items", async () => {
    const restaurant = await createRestaurant();
    const bucket = createFakeMenuImagesBucket();
    const uploadRes = await app.request(
      `/api/restaurants/${restaurant.id}/menu-image`,
      { method: "POST", body: menuImageFormData() },
      { ...testEnv, MENU_IMAGES: bucket },
    );
    expect(uploadRes.status).toBe(200);

    const ai = createFakeAiBinding();
    ai.resolveWith({
      items: [{ name: "Ca Phe Den" }, { name: "Banh Mi" }],
    });

    const res = await app.request(
      `/api/restaurants/${restaurant.id}/generate-menu`,
      { method: "POST" },
      { ...testEnv, MENU_IMAGES: bucket, AI: ai as unknown },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { name: string }[] };
    expect(body.items).toEqual([{ name: "Ca Phe Den" }, { name: "Banh Mi" }]);
  });

  it("a well-formed model response encoded as a JSON string also returns 200 with items", async () => {
    const restaurant = await createRestaurant();
    const bucket = createFakeMenuImagesBucket();
    await app.request(
      `/api/restaurants/${restaurant.id}/menu-image`,
      { method: "POST", body: menuImageFormData() },
      { ...testEnv, MENU_IMAGES: bucket },
    );

    const ai = createFakeAiBinding();
    ai.resolveWith(JSON.stringify({ items: [{ name: "Banh Mi" }] }));

    const res = await app.request(
      `/api/restaurants/${restaurant.id}/generate-menu`,
      { method: "POST" },
      { ...testEnv, MENU_IMAGES: bucket, AI: ai as unknown },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { name: string }[] };
    expect(body.items).toEqual([{ name: "Banh Mi" }]);
  });

  it("ignores a price the model returns anyway", async () => {
    const restaurant = await createRestaurant();
    const bucket = createFakeMenuImagesBucket();
    await app.request(
      `/api/restaurants/${restaurant.id}/menu-image`,
      { method: "POST", body: menuImageFormData() },
      { ...testEnv, MENU_IMAGES: bucket },
    );

    const ai = createFakeAiBinding();
    ai.resolveWith({ items: [{ name: "Pho Bo", price: "25.000" }] });

    const res = await app.request(
      `/api/restaurants/${restaurant.id}/generate-menu`,
      { method: "POST" },
      { ...testEnv, MENU_IMAGES: bucket, AI: ai as unknown },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { name: string }[] };
    expect(body.items).toEqual([{ name: "Pho Bo" }]);
  });

  it("a free-text (non-JSON) model response returns a structured 500", async () => {
    const restaurant = await createRestaurant();
    const bucket = createFakeMenuImagesBucket();
    await app.request(
      `/api/restaurants/${restaurant.id}/menu-image`,
      { method: "POST", body: menuImageFormData() },
      { ...testEnv, MENU_IMAGES: bucket },
    );

    const ai = createFakeAiBinding();
    ai.resolveWith("Here is the menu:\n* Ca Phe Den (S) - 29");

    const res = await app.request(
      `/api/restaurants/${restaurant.id}/generate-menu`,
      { method: "POST" },
      { ...testEnv, MENU_IMAGES: bucket, AI: ai as unknown },
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  it("a model response with an item missing a required field returns a structured 500", async () => {
    const restaurant = await createRestaurant();
    const bucket = createFakeMenuImagesBucket();
    await app.request(
      `/api/restaurants/${restaurant.id}/menu-image`,
      { method: "POST", body: menuImageFormData() },
      { ...testEnv, MENU_IMAGES: bucket },
    );

    const ai = createFakeAiBinding();
    ai.resolveWith({ items: [{}] });

    const res = await app.request(
      `/api/restaurants/${restaurant.id}/generate-menu`,
      { method: "POST" },
      { ...testEnv, MENU_IMAGES: bucket, AI: ai as unknown },
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  it("a rejected model call returns a structured 500", async () => {
    const restaurant = await createRestaurant();
    const bucket = createFakeMenuImagesBucket();
    await app.request(
      `/api/restaurants/${restaurant.id}/menu-image`,
      { method: "POST", body: menuImageFormData() },
      { ...testEnv, MENU_IMAGES: bucket },
    );

    const ai = createFakeAiBinding();
    ai.rejectWith(new Error("model unavailable"));

    const res = await app.request(
      `/api/restaurants/${restaurant.id}/generate-menu`,
      { method: "POST" },
      { ...testEnv, MENU_IMAGES: bucket, AI: ai as unknown },
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  it("R2 object missing despite menuImage set on the row returns a structured 500", async () => {
    const restaurant = await createRestaurant();
    const bucket = createFakeMenuImagesBucket();
    const uploadRes = await app.request(
      `/api/restaurants/${restaurant.id}/menu-image`,
      { method: "POST", body: menuImageFormData() },
      { ...testEnv, MENU_IMAGES: bucket },
    );
    const uploaded = (await uploadRes.json()) as Restaurant;
    bucket.objects.delete(uploaded.menuImage as string);

    const res = await app.request(
      `/api/restaurants/${restaurant.id}/generate-menu`,
      { method: "POST" },
      { ...testEnv, MENU_IMAGES: bucket, AI: createFakeAiBinding() as unknown },
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });
});
