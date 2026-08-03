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

    await user.type(screen.getByLabelText("Name", { exact: false }), "Sushi Spot");
    await user.click(screen.getByRole("button", { name: "Add restaurant" }));

    await waitFor(() => {
      expect(screen.getByText("Sushi Spot")).toBeInTheDocument();
    });
  });

  it("keeps showing the previously loaded list if a refetch fails", async () => {
    const user = userEvent.setup();
    let getCallCount = 0;

    server.use(
      http.get("/api/restaurants", () => {
        getCallCount += 1;
        if (getCallCount === 1) {
          return HttpResponse.json([
            { id: 1, name: "Pizza Place", contactInfo: null, menuSourceNote: null },
          ]);
        }
        return HttpResponse.json({ error: "internal error" }, { status: 500 });
      }),
      http.post("/api/restaurants", () =>
        HttpResponse.json(
          { id: 2, name: "Sushi Spot", contactInfo: null, menuSourceNote: null },
          { status: 201 },
        ),
      ),
    );

    renderWithProviders(<Restaurants />);

    await screen.findByText("Pizza Place");

    await user.type(screen.getByLabelText("Name", { exact: false }), "Sushi Spot");
    await user.click(screen.getByRole("button", { name: "Add restaurant" }));

    await waitFor(() => {
      expect(getCallCount).toBeGreaterThan(1);
    });

    expect(screen.getByText("Pizza Place")).toBeInTheDocument();
  });

  it("shows an inline error and does not submit when Name is empty", async () => {
    const user = userEvent.setup();
    let postCount = 0;

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json([])),
      http.post("/api/restaurants", () => {
        postCount += 1;
        return HttpResponse.json(
          { id: 1, name: "Sushi Spot", contactInfo: null, menuSourceNote: null },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(<Restaurants />);

    await screen.findByText("No restaurants yet.");

    await user.click(screen.getByRole("button", { name: "Add restaurant" }));

    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name", { exact: false })).toHaveAttribute("aria-invalid", "true");
    expect(postCount).toBe(0);

    await user.type(screen.getByLabelText("Name", { exact: false }), "Sushi Spot");

    expect(screen.queryByText("Name is required.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name", { exact: false })).toHaveAttribute("aria-invalid", "false");
  });
});
