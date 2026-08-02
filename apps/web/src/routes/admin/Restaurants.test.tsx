import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { Restaurants } from "./Restaurants";

describe("Restaurants", () => {
  it("renders restaurants from the API", async () => {
    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([
          { id: 1, name: "Pizza Place", contactInfo: "555-1234", menuSourceNote: null },
        ]),
      ),
    );

    renderWithProviders(<Restaurants />);

    expect(await screen.findByText("Pizza Place")).toBeInTheDocument();
  });

  it("adds a restaurant via the create form without a page reload", async () => {
    const user = userEvent.setup();
    let restaurants: Array<{ id: number; name: string; contactInfo: string | null; menuSourceNote: null }> = [
      { id: 1, name: "Pizza Place", contactInfo: "555-1234", menuSourceNote: null },
    ];

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(restaurants)),
      http.post("/api/restaurants", async ({ request }) => {
        const body = (await request.json()) as { name: string; contactInfo?: string };
        const created = {
          id: 2,
          name: body.name,
          contactInfo: body.contactInfo ?? null,
          menuSourceNote: null,
        };
        restaurants = [...restaurants, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderWithProviders(<Restaurants />);

    await screen.findByText("Pizza Place");

    await user.type(screen.getByPlaceholderText("Name"), "Sushi Spot");
    await user.click(screen.getByRole("button", { name: "Add restaurant" }));

    await waitFor(() => {
      expect(screen.getByText("Sushi Spot")).toBeInTheDocument();
    });
  });
});
