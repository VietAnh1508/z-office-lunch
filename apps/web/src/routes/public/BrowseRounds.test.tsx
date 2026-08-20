import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { BrowseRounds } from "./BrowseRounds";

function renderBrowseRounds() {
  return renderWithProviders(
    <MemoryRouter initialEntries={["/"]}>
      <BrowseRounds />
    </MemoryRouter>,
  );
}

describe("BrowseRounds (public homepage)", () => {
  it("renders both section titles and their empty-state messages when there are no rounds", async () => {
    server.use(http.get("/api/rounds/public", () => HttpResponse.json([])));

    renderBrowseRounds();

    expect(await screen.findByText("Current office lunches")).toBeInTheDocument();
    expect(screen.getByText("Past office lunches")).toBeInTheDocument();
    expect(
      screen.getByText("No office lunch is open for orders right now."),
    ).toBeInTheDocument();
    expect(screen.getByText("No past office lunches yet.")).toBeInTheDocument();
  });

  it("groups rounds under their matching section title", async () => {
    server.use(
      http.get("/api/rounds/public", () =>
        HttpResponse.json([
          {
            id: 1,
            label: "Open Round",
            status: "open",
            deadline: "2999-01-01T00:00:00.000Z",
            foodRestaurantName: "Pho 24",
            drinkRestaurantName: null,
          },
          {
            id: 2,
            label: "Closed Round",
            status: "closed",
            deadline: "2000-01-01T00:00:00.000Z",
            foodRestaurantName: "Com Tam",
            drinkRestaurantName: null,
          },
        ]),
      ),
    );

    renderBrowseRounds();

    const openTitle = await screen.findByText("Current office lunches");
    const closedTitle = screen.getByText("Past office lunches");
    const openCard = openTitle.closest('[data-slot="card"]') as HTMLElement;
    const closedCard = closedTitle.closest('[data-slot="card"]') as HTMLElement;

    expect(within(openCard!).getByText("Open Round")).toBeInTheDocument();
    expect(within(openCard!).queryByText("Closed Round")).not.toBeInTheDocument();
    expect(within(closedCard!).getByText("Closed Round")).toBeInTheDocument();
    expect(within(closedCard!).queryByText("Open Round")).not.toBeInTheDocument();
  });

  it("renders label, both restaurant names, deadline, and status badge for a round with a drink restaurant", async () => {
    server.use(
      http.get("/api/rounds/public", () =>
        HttpResponse.json([
          {
            id: 1,
            label: "Week 1",
            status: "open",
            deadline: "2026-08-01T00:00:00.000Z",
            foodRestaurantName: "Pho 24",
            drinkRestaurantName: "Tra Da Corner",
          },
        ]),
      ),
    );

    renderBrowseRounds();

    expect(await screen.findByText("Week 1")).toBeInTheDocument();
    expect(screen.getByText("Pho 24 + Tra Da Corner")).toBeInTheDocument();
    const formattedDeadline = new Date("2026-08-01T00:00:00.000Z").toLocaleString();
    expect(
      screen.getByText((_, element) => element?.textContent === `Deadline ${formattedDeadline}`),
    ).toBeInTheDocument();
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("renders cleanly with only the food restaurant name when there is no drink restaurant", async () => {
    server.use(
      http.get("/api/rounds/public", () =>
        HttpResponse.json([
          {
            id: 1,
            label: "Week 2",
            status: "open",
            deadline: "2026-08-01T00:00:00.000Z",
            foodRestaurantName: "Pho 24",
            drinkRestaurantName: null,
          },
        ]),
      ),
    );

    renderBrowseRounds();

    expect(await screen.findByText("Pho 24")).toBeInTheDocument();
    expect(screen.queryByText(/\+ null/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+ undefined/)).not.toBeInTheDocument();
  });

  it("links the round label to its public round page", async () => {
    server.use(
      http.get("/api/rounds/public", () =>
        HttpResponse.json([
          {
            id: 42,
            label: "Week 3",
            status: "open",
            deadline: "2026-08-01T00:00:00.000Z",
            foodRestaurantName: "Pho 24",
            drinkRestaurantName: null,
          },
        ]),
      ),
    );

    renderBrowseRounds();

    const link = await screen.findByRole("link", { name: "Week 3" });
    expect(link).toHaveAttribute("href", "/r/42");
  });

  it("shows an error message when the request fails", async () => {
    server.use(
      http.get("/api/rounds/public", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );

    renderBrowseRounds();

    expect(
      await screen.findByText("Something went wrong loading rounds. Please try again."),
    ).toBeInTheDocument();
  });
});
