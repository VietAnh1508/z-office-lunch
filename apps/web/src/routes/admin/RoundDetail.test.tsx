import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { RoundDetail } from "./RoundDetail";

const RESTAURANTS = [
  { id: 1, name: "Pho 24", type: "food", contactInfo: null, menuSourceNote: null },
  { id: 2, name: "Tra Da Corner", type: "drink", contactInfo: null, menuSourceNote: null },
];

function draftRound(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    label: "Week 1",
    foodRestaurantId: 1,
    drinkRestaurantId: null,
    deadline: "2026-08-10T12:00:00.000Z",
    status: "draft",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderDetail(id: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/admin/rounds/${id}`]}>
      <Routes>
        <Route path="/admin/rounds/:id" element={<RoundDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoundDetail", () => {
  it("shows a not-found message for an unknown round id", async () => {
    server.use(
      http.get("/api/rounds/999", () => HttpResponse.json({ error: "round not found" }, { status: 404 })),
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
    );

    renderDetail("999");

    expect(await screen.findByText("Round not found.")).toBeInTheDocument();
  });

  it("lists active food menu items as checkboxes, checked for curated items", async () => {
    server.use(
      http.get("/api/rounds/1", () => HttpResponse.json(draftRound())),
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds/1/menu-items", () => HttpResponse.json([{ id: 5, roundId: 1, menuItemId: 10 }])),
      http.get("/api/restaurants/1/menu-items", () =>
        HttpResponse.json([
          { id: 10, restaurantId: 1, name: "Pho Bo", price: null, active: true },
          { id: 11, restaurantId: 1, name: "Banh Mi", price: null, active: true },
        ]),
      ),
    );

    renderDetail("1");

    expect(await screen.findByRole("heading", { name: "Week 1" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Pho Bo")).toBeChecked();
    expect(screen.getByLabelText("Banh Mi")).not.toBeChecked();
  });

  it("curates a menu item by checking it", async () => {
    const user = userEvent.setup();
    let curated: Array<{ id: number; roundId: number; menuItemId: number }> = [];

    server.use(
      http.get("/api/rounds/1", () => HttpResponse.json(draftRound())),
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds/1/menu-items", () => HttpResponse.json(curated)),
      http.get("/api/restaurants/1/menu-items", () =>
        HttpResponse.json([{ id: 10, restaurantId: 1, name: "Pho Bo", price: null, active: true }]),
      ),
      http.post("/api/rounds/1/menu-items", async ({ request }) => {
        const body = (await request.json()) as { menuItemId: number };
        const created = { id: 1, roundId: 1, menuItemId: body.menuItemId };
        curated = [...curated, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderDetail("1");

    await screen.findByLabelText("Pho Bo");
    expect(screen.getByLabelText("Pho Bo")).not.toBeChecked();

    await user.click(screen.getByLabelText("Pho Bo"));

    await waitFor(() => {
      expect(screen.getByLabelText("Pho Bo")).toBeChecked();
    });
    expect(await screen.findByText("Menu item added to round")).toBeInTheDocument();
  });

  it("removes a curated menu item by unchecking it", async () => {
    const user = userEvent.setup();
    let curated = [{ id: 5, roundId: 1, menuItemId: 10 }];

    server.use(
      http.get("/api/rounds/1", () => HttpResponse.json(draftRound())),
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds/1/menu-items", () => HttpResponse.json(curated)),
      http.get("/api/restaurants/1/menu-items", () =>
        HttpResponse.json([{ id: 10, restaurantId: 1, name: "Pho Bo", price: null, active: true }]),
      ),
      http.delete("/api/rounds/1/menu-items/5", () => {
        curated = [];
        return HttpResponse.json({ id: 5, roundId: 1, menuItemId: 10 });
      }),
    );

    renderDetail("1");

    await screen.findByLabelText("Pho Bo");
    expect(screen.getByLabelText("Pho Bo")).toBeChecked();

    await user.click(screen.getByLabelText("Pho Bo"));

    await waitFor(() => {
      expect(screen.getByLabelText("Pho Bo")).not.toBeChecked();
    });
    expect(await screen.findByText("Menu item removed from round")).toBeInTheDocument();
  });

  it("shows an Open button for a draft round and opens it", async () => {
    const user = userEvent.setup();
    let round = draftRound();

    server.use(
      http.get("/api/rounds/1", () => HttpResponse.json(round)),
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds/1/menu-items", () => HttpResponse.json([{ id: 5, roundId: 1, menuItemId: 10 }])),
      http.get("/api/restaurants/1/menu-items", () =>
        HttpResponse.json([{ id: 10, restaurantId: 1, name: "Pho Bo", price: null, active: true }]),
      ),
      http.patch("/api/rounds/1/status", () => {
        round = { ...round, status: "open" };
        return HttpResponse.json(round);
      }),
    );

    renderDetail("1");

    await screen.findByRole("button", { name: "Open" });
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(await screen.findByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(await screen.findByText("Round opened")).toBeInTheDocument();
  });

  it("shows a fallback error toast when opening a round fails with a known error", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/rounds/1", () => HttpResponse.json(draftRound())),
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      http.patch("/api/rounds/1/status", () =>
        HttpResponse.json(
          { error: "round must have at least one curated food item to open" },
          { status: 400 },
        ),
      ),
    );

    renderDetail("1");

    await user.click(await screen.findByRole("button", { name: "Open" }));

    expect(
      await screen.findByText("round must have at least one curated food item to open"),
    ).toBeInTheDocument();
  });

  it("shows a Close button for an open round and closes it", async () => {
    const user = userEvent.setup();
    let round = draftRound({ status: "open" });

    server.use(
      http.get("/api/rounds/1", () => HttpResponse.json(round)),
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds/1/menu-items", () => HttpResponse.json([{ id: 5, roundId: 1, menuItemId: 10 }])),
      http.get("/api/restaurants/1/menu-items", () =>
        HttpResponse.json([{ id: 10, restaurantId: 1, name: "Pho Bo", price: null, active: true }]),
      ),
      http.patch("/api/rounds/1/status", () => {
        round = { ...round, status: "closed" };
        return HttpResponse.json(round);
      }),
    );

    renderDetail("1");

    await screen.findByRole("button", { name: "Close" });
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(await screen.findByText("This round is closed.")).toBeInTheDocument();
    expect(await screen.findByText("Round closed")).toBeInTheDocument();
  });

  it("shows no status button and a closed message for a closed round", async () => {
    server.use(
      http.get("/api/rounds/1", () => HttpResponse.json(draftRound({ status: "closed" }))),
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
    );

    renderDetail("1");

    expect(await screen.findByText("This round is closed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("shows a drink items section only when the round has a drink restaurant", async () => {
    server.use(
      http.get("/api/rounds/1", () => HttpResponse.json(draftRound({ drinkRestaurantId: 2 }))),
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      http.get("/api/restaurants/2/menu-items", () =>
        HttpResponse.json([{ id: 20, restaurantId: 2, name: "Tra Da", price: null, active: true }]),
      ),
    );

    renderDetail("1");

    expect(await screen.findByText("Tra Da")).toBeInTheDocument();
    expect(screen.getByText("Drink items", { exact: false })).toBeInTheDocument();
  });
});
