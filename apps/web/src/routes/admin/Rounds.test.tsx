import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { Rounds } from "./Rounds";

const RESTAURANTS = [
  { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
  { id: 2, name: "Tra Da Corner", type: "drink", contactInfo: null, note: null, menuUrl: null },
];

function renderRounds() {
  return renderWithProviders(
    <MemoryRouter>
      <Rounds />
    </MemoryRouter>,
  );
}

describe("Rounds", () => {
  it("renders rounds from the API", async () => {
    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds", () =>
        HttpResponse.json([
          {
            id: 1,
            label: "Week 1",
            foodRestaurantId: 1,
            drinkRestaurantId: null,
            deadline: "2026-08-10T12:00:00.000Z",
            status: "draft",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        ]),
      ),
    );

    renderRounds();

    const roundRow = (await screen.findByText("Week 1")).closest("li");
    expect(roundRow).not.toBeNull();
    expect(within(roundRow!).getByText("draft")).toBeInTheDocument();
  });

  it("adds a round via the create form without a page reload", async () => {
    const user = userEvent.setup();
    let rounds: Array<Record<string, unknown>> = [];

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds", () => HttpResponse.json(rounds)),
      http.post("/api/rounds", async ({ request }) => {
        const body = (await request.json()) as {
          label: string;
          foodRestaurantId: number;
          drinkRestaurantId?: number;
          deadline: string;
        };
        const created = {
          id: 1,
          label: body.label,
          foodRestaurantId: body.foodRestaurantId,
          drinkRestaurantId: body.drinkRestaurantId ?? null,
          deadline: body.deadline,
          status: "draft",
          createdAt: "2026-08-01T00:00:00.000Z",
        };
        rounds = [...rounds, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderRounds();

    await screen.findByText("No rounds yet.");
    await screen.findByText("Pho 24");

    await user.type(screen.getByLabelText("Label", { exact: false }), "Week 1");
    await user.selectOptions(screen.getByLabelText("Food restaurant", { exact: false }), "1");
    await user.selectOptions(screen.getByLabelText("Drink restaurant", { exact: false }), "2");
    await user.type(screen.getByLabelText("Deadline", { exact: false }), "2026-08-10T12:00");
    await user.click(screen.getByRole("button", { name: "Add round" }));

    await waitFor(() => {
      expect(screen.getByText("Week 1")).toBeInTheDocument();
    });
    expect(await screen.findByText("Round added")).toBeInTheDocument();
  });

  it("shows inline errors and does not submit when required fields are empty", async () => {
    const user = userEvent.setup();
    let postCount = 0;

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds", () => HttpResponse.json([])),
      http.post("/api/rounds", () => {
        postCount += 1;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    renderRounds();

    await screen.findByText("No rounds yet.");
    await screen.findByText("Pho 24");

    await user.click(screen.getByRole("button", { name: "Add round" }));

    expect(await screen.findByText("Label is required.")).toBeInTheDocument();
    expect(screen.getByText("Food restaurant is required.")).toBeInTheDocument();
    expect(screen.getByText("Deadline is required.")).toBeInTheDocument();
    expect(postCount).toBe(0);
  });

  it("shows the API's error message as a toast when creating a round fails with a known error", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds", () => HttpResponse.json([])),
      http.post("/api/rounds", () =>
        HttpResponse.json({ error: "restaurant not found" }, { status: 404 }),
      ),
    );

    renderRounds();

    await screen.findByText("No rounds yet.");
    await screen.findByText("Pho 24");

    await user.type(screen.getByLabelText("Label", { exact: false }), "Week 1");
    await user.selectOptions(screen.getByLabelText("Food restaurant", { exact: false }), "1");
    await user.type(screen.getByLabelText("Deadline", { exact: false }), "2026-08-10T12:00");
    await user.click(screen.getByRole("button", { name: "Add round" }));

    expect(await screen.findByText("restaurant not found")).toBeInTheDocument();
  });

  it("shows a fallback error toast when creating a round fails with a network error", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds", () => HttpResponse.json([])),
      http.post("/api/rounds", () => HttpResponse.error()),
    );

    renderRounds();

    await screen.findByText("No rounds yet.");
    await screen.findByText("Pho 24");

    await user.type(screen.getByLabelText("Label", { exact: false }), "Week 1");
    await user.selectOptions(screen.getByLabelText("Food restaurant", { exact: false }), "1");
    await user.type(screen.getByLabelText("Deadline", { exact: false }), "2026-08-10T12:00");
    await user.click(screen.getByRole("button", { name: "Add round" }));

    expect(await screen.findByText("Could not create round.")).toBeInTheDocument();
  });

  it("shows a delete action only for the draft round", async () => {
    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds", () =>
        HttpResponse.json([
          {
            id: 1,
            label: "Week 1",
            foodRestaurantId: 1,
            drinkRestaurantId: null,
            deadline: "2026-08-10T12:00:00.000Z",
            status: "draft",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
          {
            id: 2,
            label: "Week 2",
            foodRestaurantId: 1,
            drinkRestaurantId: null,
            deadline: "2026-08-11T12:00:00.000Z",
            status: "open",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        ]),
      ),
    );

    renderRounds();

    const draftRow = (await screen.findByText("Week 1")).closest("li");
    const openRow = (await screen.findByText("Week 2")).closest("li");
    expect(draftRow).not.toBeNull();
    expect(openRow).not.toBeNull();

    expect(within(draftRow!).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(within(openRow!).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("deletes a draft round via the confirmation dialog", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    let rounds = [
      {
        id: 1,
        label: "Week 1",
        foodRestaurantId: 1,
        drinkRestaurantId: null,
        deadline: "2026-08-10T12:00:00.000Z",
        status: "draft",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ];

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds", () => HttpResponse.json(rounds)),
      http.delete("/api/rounds/1", () => {
        const [deleted] = rounds;
        rounds = [];
        return HttpResponse.json(deleted);
      }),
    );

    renderRounds();

    await screen.findByText("Week 1");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Delete this round?");
    await user.click(screen.getByRole("button", { name: "Delete round" }));

    await waitFor(() => {
      expect(screen.queryByText("Week 1")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Round deleted")).toBeInTheDocument();
  });

  it("does not delete the round when the confirmation is cancelled", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    let deleteCount = 0;

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds", () =>
        HttpResponse.json([
          {
            id: 1,
            label: "Week 1",
            foodRestaurantId: 1,
            drinkRestaurantId: null,
            deadline: "2026-08-10T12:00:00.000Z",
            status: "draft",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        ]),
      ),
      http.delete("/api/rounds/1", () => {
        deleteCount += 1;
        return HttpResponse.json({});
      }),
    );

    renderRounds();

    await screen.findByText("Week 1");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Delete this round?");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText("Delete this round?")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Week 1")).toBeInTheDocument();
    expect(deleteCount).toBe(0);
  });

  it("filters rounds by status", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds", () =>
        HttpResponse.json([
          {
            id: 1,
            label: "Week 1",
            foodRestaurantId: 1,
            drinkRestaurantId: null,
            deadline: "2026-08-10T12:00:00.000Z",
            status: "draft",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
          {
            id: 2,
            label: "Week 2",
            foodRestaurantId: 1,
            drinkRestaurantId: null,
            deadline: "2026-08-11T12:00:00.000Z",
            status: "open",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
          {
            id: 3,
            label: "Week 3",
            foodRestaurantId: 1,
            drinkRestaurantId: null,
            deadline: "2026-08-12T12:00:00.000Z",
            status: "closed",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        ]),
      ),
    );

    renderRounds();

    await screen.findByText("Week 1");
    expect(screen.getByText("Week 2")).toBeInTheDocument();
    expect(screen.getByText("Week 3")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status"), "open");

    expect(screen.queryByText("Week 1")).not.toBeInTheDocument();
    expect(screen.getByText("Week 2")).toBeInTheDocument();
    expect(screen.queryByText("Week 3")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status"), "closed");

    expect(screen.queryByText("Week 2")).not.toBeInTheDocument();
    expect(screen.getByText("Week 3")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status"), "all");

    expect(screen.getByText("Week 1")).toBeInTheDocument();
    expect(screen.getByText("Week 2")).toBeInTheDocument();
    expect(screen.getByText("Week 3")).toBeInTheDocument();
  });

  it("shows a message when no round matches the selected status filter", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds", () =>
        HttpResponse.json([
          {
            id: 1,
            label: "Week 1",
            foodRestaurantId: 1,
            drinkRestaurantId: null,
            deadline: "2026-08-10T12:00:00.000Z",
            status: "draft",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        ]),
      ),
    );

    renderRounds();

    await screen.findByText("Week 1");
    await user.selectOptions(screen.getByLabelText("Status"), "open");

    expect(await screen.findByText("No rounds match this filter.")).toBeInTheDocument();
  });

  it("shows the API's error message as a toast when deleting a round fails", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(RESTAURANTS)),
      http.get("/api/rounds", () =>
        HttpResponse.json([
          {
            id: 1,
            label: "Week 1",
            foodRestaurantId: 1,
            drinkRestaurantId: null,
            deadline: "2026-08-10T12:00:00.000Z",
            status: "draft",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        ]),
      ),
      http.delete("/api/rounds/1", () =>
        HttpResponse.json({ error: "round is not draft" }, { status: 400 }),
      ),
    );

    renderRounds();

    await screen.findByText("Week 1");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Delete this round?");
    await user.click(screen.getByRole("button", { name: "Delete round" }));

    expect(await screen.findByText("round is not draft")).toBeInTheDocument();
  });
});
