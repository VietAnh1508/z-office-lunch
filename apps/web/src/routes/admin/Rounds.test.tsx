import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { Rounds } from "./Rounds";

const RESTAURANTS = [
  { id: 1, name: "Pho 24", type: "food", contactInfo: null, menuSourceNote: null },
  { id: 2, name: "Tra Da Corner", type: "drink", contactInfo: null, menuSourceNote: null },
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

    expect(await screen.findByText("Week 1")).toBeInTheDocument();
    expect(screen.getByText("draft", { exact: false })).toBeInTheDocument();
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
});
