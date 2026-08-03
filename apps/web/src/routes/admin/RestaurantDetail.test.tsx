import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { RestaurantDetail } from "./RestaurantDetail";

function renderDetail(id: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/admin/restaurants/${id}`]}>
      <Routes>
        <Route path="/admin/restaurants/:id" element={<RestaurantDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RestaurantDetail", () => {
  it("lists menu items for the restaurant, including the price", async () => {
    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([{ id: 1, name: "Pho 24", contactInfo: null, menuSourceNote: null }]),
      ),
      http.get("/api/restaurants/1/menu-items", () =>
        HttpResponse.json([
          { id: 10, restaurantId: 1, type: "food", name: "Pho Bo", price: "5.50", active: true },
        ]),
      ),
    );

    renderDetail("1");

    expect(await screen.findByRole("heading", { name: "Pho 24" })).toBeInTheDocument();
    expect(screen.getByText("Pho Bo")).toBeInTheDocument();
    expect(screen.getByText("5.50", { exact: false })).toBeInTheDocument();
  });

  it("shows a not-found message for an unknown restaurant id", async () => {
    server.use(http.get("/api/restaurants", () => HttpResponse.json([])));

    renderDetail("999");

    expect(await screen.findByText("Restaurant not found.")).toBeInTheDocument();
  });

  it("adds a menu item via the form without a page reload", async () => {
    const user = userEvent.setup();
    let items: Array<{
      id: number;
      restaurantId: number;
      type: string;
      name: string;
      price: string | null;
      active: boolean;
    }> = [];

    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([{ id: 1, name: "Pho 24", contactInfo: null, menuSourceNote: null }]),
      ),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json(items)),
      http.post("/api/restaurants/1/menu-items", async ({ request }) => {
        const body = (await request.json()) as { type: string; name: string; price?: string };
        const created = {
          id: 1,
          restaurantId: 1,
          type: body.type,
          name: body.name,
          price: body.price ?? null,
          active: true,
        };
        items = [...items, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderDetail("1");

    await screen.findByText("No menu items yet.");

    await user.type(screen.getByLabelText("Name", { exact: false }), "Banh Mi");
    await user.click(screen.getByRole("button", { name: "Add menu item" }));

    await waitFor(() => {
      expect(screen.getByText("Banh Mi")).toBeInTheDocument();
    });
  });

  it("toggles a menu item's active state", async () => {
    const user = userEvent.setup();
    let item = { id: 10, restaurantId: 1, type: "food", name: "Pho Bo", price: null, active: true };

    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([{ id: 1, name: "Pho 24", contactInfo: null, menuSourceNote: null }]),
      ),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([item])),
      http.patch("/api/restaurants/1/menu-items/10", () => {
        item = { ...item, active: !item.active };
        return HttpResponse.json(item);
      }),
    );

    renderDetail("1");

    await screen.findByText("Pho Bo");
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByRole("button", { name: "Activate" })).toBeInTheDocument();
  });
});
