import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { Round } from "./Round";

function renderRound(id: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/r/${id}`]}>
      <Routes>
        <Route path="/r/:roundId" element={<Round />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Round (public view)", () => {
  it("shows the same generic message for a draft round as for a nonexistent one", async () => {
    server.use(
      http.get("/api/rounds/1/public", () =>
        HttpResponse.json({ error: "round not found" }, { status: 404 }),
      ),
    );
    renderRound("1");
    const draftText = await screen.findByText("This round isn't open yet.");

    server.use(
      http.get("/api/rounds/999/public", () =>
        HttpResponse.json({ error: "round not found" }, { status: 404 }),
      ),
    );
    renderRound("999");
    const missingText = await screen.findByText("This round isn't open yet.");

    expect(draftText.textContent).toBe(missingText.textContent);
  });

  it("shows a closed message with the round label for a closed round", async () => {
    server.use(
      http.get("/api/rounds/1/public", () =>
        HttpResponse.json({
          label: "Week 1",
          deadline: "2000-01-01T00:00:00.000Z",
          status: "closed",
          foodItems: [],
        }),
      ),
    );

    renderRound("1");

    expect(await screen.findByRole("heading", { name: "Week 1" })).toBeInTheDocument();
    expect(await screen.findByText("This round is closed.")).toBeInTheDocument();
  });

  it("shows a deadline-passed message for an open round whose deadline has passed", async () => {
    server.use(
      http.get("/api/rounds/1/public", () =>
        HttpResponse.json({
          label: "Week 1",
          deadline: "2000-01-01T00:00:00.000Z",
          status: "open",
          foodItems: [],
        }),
      ),
    );

    renderRound("1");

    expect(await screen.findByRole("heading", { name: "Week 1" })).toBeInTheDocument();
    expect(
      await screen.findByText("The deadline for this round has passed."),
    ).toBeInTheDocument();
  });

  it("renders food items for an open round before the deadline, with no drink section", async () => {
    server.use(
      http.get("/api/rounds/1/public", () =>
        HttpResponse.json({
          label: "Week 1",
          deadline: "2999-01-01T00:00:00.000Z",
          status: "open",
          foodItems: [{ id: 10, name: "Pho Bo" }],
        }),
      ),
    );

    renderRound("1");

    expect(await screen.findByText("Pho Bo")).toBeInTheDocument();
    expect(screen.queryByText("Drink items")).not.toBeInTheDocument();
  });

  it("renders drink items when the round has a drinkRestaurantId", async () => {
    server.use(
      http.get("/api/rounds/1/public", () =>
        HttpResponse.json({
          label: "Week 1",
          deadline: "2999-01-01T00:00:00.000Z",
          status: "open",
          foodItems: [{ id: 10, name: "Pho Bo" }],
          drinkItems: [{ id: 20, name: "Tra Da" }],
        }),
      ),
    );

    renderRound("1");

    expect(await screen.findByText("Tra Da")).toBeInTheDocument();
    expect(screen.getByText("Drink items")).toBeInTheDocument();
  });
});
