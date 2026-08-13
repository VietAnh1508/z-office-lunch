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
        <Route path="/admin/rounds" element={<p>Rounds list page</p>} />
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

  it("shows a Delete button only for a draft round", async () => {
    server.use(
      http.get("/api/rounds/1", () => HttpResponse.json(draftRound({ status: "open" }))),
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
    );

    renderDetail("1");

    await screen.findByRole("button", { name: "Close" });
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("deletes a draft round via the confirmation dialog and navigates back to the list", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    server.use(
      http.get("/api/rounds/1", () => HttpResponse.json(draftRound())),
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      http.delete("/api/rounds/1", () => HttpResponse.json(draftRound())),
    );

    renderDetail("1");

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await screen.findByText("Delete this round?");
    await user.click(screen.getByRole("button", { name: "Delete round" }));

    expect(await screen.findByText("Rounds list page")).toBeInTheDocument();
    expect(await screen.findByText("Round deleted")).toBeInTheDocument();
  });

  describe("edit round", () => {
    it("renders the edit form pre-filled, only for a draft round", async () => {
      server.use(
        http.get("/api/rounds/1", () => HttpResponse.json(draftRound())),
        http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
        http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      );

      renderDetail("1");

      expect(await screen.findByText("Edit round")).toBeInTheDocument();
      expect(screen.getByLabelText("Food restaurant", { exact: false })).toHaveValue("1");
    });

    it("does not render the edit form for a non-draft round", async () => {
      server.use(
        http.get("/api/rounds/1", () => HttpResponse.json(draftRound({ status: "open" }))),
        http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
        http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      );

      renderDetail("1");

      await screen.findByRole("button", { name: "Close" });
      expect(screen.queryByText("Edit round")).not.toBeInTheDocument();
    });

    it("saves a deadline-only change immediately, with no confirmation dialog", async () => {
      const user = userEvent.setup();
      let patchBody: Record<string, unknown> | null = null;

      server.use(
        http.get("/api/rounds/1", () => HttpResponse.json(draftRound())),
        http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
        http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.patch("/api/rounds/1", async ({ request }) => {
          patchBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(draftRound());
        }),
      );

      renderDetail("1");

      await screen.findByText("Edit round");
      const deadlineInput = screen.getByLabelText("Deadline", { exact: false });
      await user.clear(deadlineInput);
      await user.type(deadlineInput, "2026-09-01T12:00");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(screen.queryByText(/curated items/i)).not.toBeInTheDocument();
      await waitFor(() => {
        expect(patchBody).not.toBeNull();
      });
      expect(patchBody).toMatchObject({ foodRestaurantId: 1 });
      expect(await screen.findByText("Round updated")).toBeInTheDocument();
    });

    it("shows a confirmation dialog when changing the food restaurant, and submits on confirm", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      let patchBody: Record<string, unknown> | null = null;
      const foodRestaurants = [
        ...RESTAURANTS,
        { id: 3, name: "Bun Cha", type: "food", contactInfo: null, menuSourceNote: null },
      ];

      server.use(
        http.get("/api/rounds/1", () => HttpResponse.json(draftRound())),
        http.get("/api/restaurants", () => HttpResponse.json(foodRestaurants)),
        http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.get("/api/restaurants/3/menu-items", () => HttpResponse.json([])),
        http.patch("/api/rounds/1", async ({ request }) => {
          patchBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(draftRound({ foodRestaurantId: 3 }));
        }),
      );

      renderDetail("1");

      await screen.findByText("Edit round");
      await user.selectOptions(screen.getByLabelText("Food restaurant", { exact: false }), "3");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await screen.findByText(/curated items/i);
      expect(patchBody).toBeNull();

      await user.click(screen.getByRole("button", { name: "Confirm" }));

      await waitFor(() => {
        expect(patchBody).not.toBeNull();
      });
      expect(patchBody).toMatchObject({ foodRestaurantId: 3 });
      expect(await screen.findByText("Round updated")).toBeInTheDocument();
    });

    it("shows a confirmation dialog when changing the drink restaurant, including clearing it to None", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      server.use(
        http.get("/api/rounds/1", () => HttpResponse.json(draftRound({ drinkRestaurantId: 2 }))),
        http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
        http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.get("/api/restaurants/2/menu-items", () => HttpResponse.json([])),
        http.patch("/api/rounds/1", () =>
          HttpResponse.json(draftRound({ drinkRestaurantId: null })),
        ),
      );

      renderDetail("1");

      await screen.findByText("Edit round");
      await user.selectOptions(screen.getByLabelText("Drink restaurant", { exact: false }), "");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText(/curated items/i)).toBeInTheDocument();
    });

    it("cancelling the confirmation dialog sends no request and leaves values unchanged", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      let patchCalled = false;
      const foodRestaurants = [
        ...RESTAURANTS,
        { id: 3, name: "Bun Cha", type: "food", contactInfo: null, menuSourceNote: null },
      ];

      server.use(
        http.get("/api/rounds/1", () => HttpResponse.json(draftRound())),
        http.get("/api/restaurants", () => HttpResponse.json(foodRestaurants)),
        http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.get("/api/restaurants/3/menu-items", () => HttpResponse.json([])),
        http.patch("/api/rounds/1", () => {
          patchCalled = true;
          return HttpResponse.json(draftRound({ foodRestaurantId: 3 }));
        }),
      );

      renderDetail("1");

      await screen.findByText("Edit round");
      await user.selectOptions(screen.getByLabelText("Food restaurant", { exact: false }), "3");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await screen.findByText(/curated items/i);
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText(/curated items/i)).not.toBeInTheDocument();
      expect(patchCalled).toBe(false);
    });

    it("shows the error toast when a save fails", async () => {
      const user = userEvent.setup();

      server.use(
        http.get("/api/rounds/1", () => HttpResponse.json(draftRound())),
        http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
        http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.patch("/api/rounds/1", () =>
          HttpResponse.json({ error: "round is not draft" }, { status: 400 }),
        ),
      );

      renderDetail("1");

      await screen.findByText("Edit round");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText("round is not draft")).toBeInTheDocument();
    });

    it("shows an inline error and sends no request when the food restaurant is cleared", async () => {
      const user = userEvent.setup();
      let patchCalled = false;

      server.use(
        http.get("/api/rounds/1", () => HttpResponse.json(draftRound())),
        http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
        http.get("/api/rounds/1/menu-items", () => HttpResponse.json([])),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.patch("/api/rounds/1", () => {
          patchCalled = true;
          return HttpResponse.json(draftRound());
        }),
      );

      renderDetail("1");

      await screen.findByText("Edit round");
      await user.selectOptions(screen.getByLabelText("Food restaurant", { exact: false }), "");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText("Food restaurant is required.")).toBeInTheDocument();
      expect(patchCalled).toBe(false);
    });
  });
});
