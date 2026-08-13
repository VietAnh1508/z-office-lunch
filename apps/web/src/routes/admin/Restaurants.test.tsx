import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { Restaurants } from "./Restaurants";

function renderRestaurants() {
  return renderWithProviders(
    <MemoryRouter>
      <Restaurants />
    </MemoryRouter>,
  );
}

describe("Restaurants", () => {
  it("renders restaurants from the API", async () => {
    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([
          { id: 1, name: "Pizza Place", type: "food", contactInfo: "555-1234", menuSourceNote: null },
        ]),
      ),
    );

    renderRestaurants();

    expect(await screen.findByText("Pizza Place")).toBeInTheDocument();
    expect(screen.getByText("food")).toBeInTheDocument();
  });

  it("adds a restaurant via the create form without a page reload", async () => {
    const user = userEvent.setup();
    let restaurants: Array<{
      id: number;
      name: string;
      type: string;
      contactInfo: string | null;
      menuSourceNote: null;
    }> = [{ id: 1, name: "Pizza Place", type: "food", contactInfo: "555-1234", menuSourceNote: null }];

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(restaurants)),
      http.post("/api/restaurants", async ({ request }) => {
        const body = (await request.json()) as { name: string; type: string; contactInfo?: string };
        const created = {
          id: 2,
          name: body.name,
          type: body.type,
          contactInfo: body.contactInfo ?? null,
          menuSourceNote: null,
        };
        restaurants = [...restaurants, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderRestaurants();

    await screen.findByText("Pizza Place");

    await user.type(screen.getByLabelText("Name", { exact: false }), "Sushi Spot");
    await user.click(screen.getByRole("button", { name: "Add restaurant" }));

    await waitFor(() => {
      expect(screen.getByText("Sushi Spot")).toBeInTheDocument();
    });
    expect(await screen.findByText("Restaurant added")).toBeInTheDocument();
  });

  it("shows the API's error message as a toast when creating a restaurant fails with a known error", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json([])),
      http.post("/api/restaurants", () =>
        HttpResponse.json({ error: "Name already exists" }, { status: 409 }),
      ),
    );

    renderRestaurants();

    await screen.findByText("No restaurants yet.");

    await user.type(screen.getByLabelText("Name", { exact: false }), "Sushi Spot");
    await user.click(screen.getByRole("button", { name: "Add restaurant" }));

    expect(await screen.findByText("Name already exists")).toBeInTheDocument();
  });

  it("shows a fallback error toast when creating a restaurant fails with a network error", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json([])),
      http.post("/api/restaurants", () => HttpResponse.error()),
    );

    renderRestaurants();

    await screen.findByText("No restaurants yet.");

    await user.type(screen.getByLabelText("Name", { exact: false }), "Sushi Spot");
    await user.click(screen.getByRole("button", { name: "Add restaurant" }));

    expect(await screen.findByText("Could not create restaurant.")).toBeInTheDocument();
  });

  it("does not leak a toast from one test into the next", async () => {
    renderRestaurants();

    expect(screen.queryByText("Restaurant added")).not.toBeInTheDocument();
    expect(screen.queryByText("Name already exists")).not.toBeInTheDocument();
    expect(screen.queryByText("Could not create restaurant.")).not.toBeInTheDocument();
  });

  it("adds a restaurant with type drink selected", async () => {
    const user = userEvent.setup();
    let restaurants: Array<{
      id: number;
      name: string;
      type: string;
      contactInfo: string | null;
      menuSourceNote: null;
    }> = [];
    let capturedBody: { name: string; type: string; contactInfo?: string } | null = null;

    server.use(
      http.get("/api/restaurants", () => HttpResponse.json(restaurants)),
      http.post("/api/restaurants", async ({ request }) => {
        const body = (await request.json()) as { name: string; type: string; contactInfo?: string };
        capturedBody = body;
        const created = {
          id: 1,
          name: body.name,
          type: body.type,
          contactInfo: body.contactInfo ?? null,
          menuSourceNote: null,
        };
        restaurants = [...restaurants, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderRestaurants();

    await screen.findByText("No restaurants yet.");

    await user.type(screen.getByLabelText("Name", { exact: false }), "Tra Da Corner");
    await user.selectOptions(screen.getByLabelText("Type", { exact: false }), "drink");
    await user.click(screen.getByRole("button", { name: "Add restaurant" }));

    await waitFor(() => {
      expect(screen.getByText("Tra Da Corner")).toBeInTheDocument();
    });
    expect(capturedBody).toEqual(
      expect.objectContaining({ name: "Tra Da Corner", type: "drink" }),
    );
    expect(screen.getByText("drink")).toBeInTheDocument();
  });

  it("keeps showing the previously loaded list if a refetch fails", async () => {
    const user = userEvent.setup();
    let getCallCount = 0;

    server.use(
      http.get("/api/restaurants", () => {
        getCallCount += 1;
        if (getCallCount === 1) {
          return HttpResponse.json([
            { id: 1, name: "Pizza Place", type: "food", contactInfo: null, menuSourceNote: null },
          ]);
        }
        return HttpResponse.json({ error: "internal error" }, { status: 500 });
      }),
      http.post("/api/restaurants", () =>
        HttpResponse.json(
          { id: 2, name: "Sushi Spot", type: "food", contactInfo: null, menuSourceNote: null },
          { status: 201 },
        ),
      ),
    );

    renderRestaurants();

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
          { id: 1, name: "Sushi Spot", type: "food", contactInfo: null, menuSourceNote: null },
          { status: 201 },
        );
      }),
    );

    renderRestaurants();

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
