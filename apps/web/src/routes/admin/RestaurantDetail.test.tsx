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
        HttpResponse.json([
          { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
        ]),
      ),
      http.get("/api/restaurants/1/menu-items", () =>
        HttpResponse.json([
          { id: 10, restaurantId: 1, name: "Pho Bo", price: "11000", active: true },
        ]),
      ),
    );

    renderDetail("1");

    expect(await screen.findByRole("heading", { name: "Pho 24" })).toBeInTheDocument();
    expect(screen.getByText("food")).toBeInTheDocument();
    expect(screen.getByText("Pho Bo")).toBeInTheDocument();
    expect(screen.getByText("11.000", { exact: false })).toBeInTheDocument();
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
      name: string;
      price: string | null;
      active: boolean;
    }> = [];

    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([
          { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
        ]),
      ),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json(items)),
      http.post("/api/restaurants/1/menu-items", async ({ request }) => {
        const body = (await request.json()) as { name: string; price?: string };
        const created = {
          id: 1,
          restaurantId: 1,
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

    await user.type(screen.getByLabelText("Name", { exact: false, selector: "#menu-item-name" }), "Banh Mi");
    await user.type(screen.getByLabelText("Price", { exact: false }), "25000");
    await user.click(screen.getByRole("button", { name: "Add menu item" }));

    await waitFor(() => {
      expect(screen.getByText("Banh Mi")).toBeInTheDocument();
    });
    expect(await screen.findByText("Menu item added")).toBeInTheDocument();
    expect(screen.getByLabelText("Name", { exact: false, selector: "#menu-item-name" })).toHaveValue("");
    expect(screen.getByLabelText("Price", { exact: false })).toHaveValue("");
  });

  it("shows an inline error and does not submit when price is negative", async () => {
    const user = userEvent.setup();
    let postCalled = false;

    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([
          { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
        ]),
      ),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      http.post("/api/restaurants/1/menu-items", () => {
        postCalled = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    renderDetail("1");

    await screen.findByText("No menu items yet.");

    await user.type(screen.getByLabelText("Name", { exact: false, selector: "#menu-item-name" }), "Banh Mi");
    await user.type(screen.getByLabelText("Price", { exact: false }), "-500");
    await user.click(screen.getByRole("button", { name: "Add menu item" }));

    expect(
      await screen.findByText("Price must be a valid non-negative number."),
    ).toBeInTheDocument();
    expect(postCalled).toBe(false);
  });

  it("shows a fallback error toast when creating a menu item fails with a network error", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([
          { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
        ]),
      ),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      http.post("/api/restaurants/1/menu-items", () => HttpResponse.error()),
    );

    renderDetail("1");

    await screen.findByText("No menu items yet.");

    await user.type(screen.getByLabelText("Name", { exact: false, selector: "#menu-item-name" }), "Banh Mi");
    await user.click(screen.getByRole("button", { name: "Add menu item" }));

    expect(await screen.findByText("Could not create menu item.")).toBeInTheDocument();
  });

  it("shows the API's error message as a toast when creating a menu item fails with a known error", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([
          { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
        ]),
      ),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      http.post("/api/restaurants/1/menu-items", () =>
        HttpResponse.json({ error: "Name already exists" }, { status: 409 }),
      ),
    );

    renderDetail("1");

    await screen.findByText("No menu items yet.");

    await user.type(screen.getByLabelText("Name", { exact: false, selector: "#menu-item-name" }), "Banh Mi");
    await user.click(screen.getByRole("button", { name: "Add menu item" }));

    expect(await screen.findByText("Name already exists")).toBeInTheDocument();
  });

  it("toggles a menu item's active state", async () => {
    const user = userEvent.setup();
    let item = { id: 10, restaurantId: 1, name: "Pho Bo", price: null, active: true };

    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([
          { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
        ]),
      ),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([item])),
      http.patch("/api/restaurants/1/menu-items/10", () => {
        item = { ...item, active: !item.active };
        return HttpResponse.json(item);
      }),
    );

    renderDetail("1");

    await screen.findByText("Pho Bo");
    expect(screen.getByText("Pho Bo")).not.toHaveClass("line-through");

    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByRole("button", { name: "Activate" })).toBeInTheDocument();
    expect(screen.getByText("Pho Bo")).toHaveClass("line-through");
    expect(await screen.findByText("Menu item deactivated")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Activate" }));

    expect(await screen.findByRole("button", { name: "Deactivate" })).toBeInTheDocument();
    expect(await screen.findByText("Menu item activated")).toBeInTheDocument();
  });

  it("shows a fallback error toast when toggling a menu item's active state fails with a network error", async () => {
    const user = userEvent.setup();
    const item = { id: 10, restaurantId: 1, name: "Pho Bo", price: null, active: true };

    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([
          { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
        ]),
      ),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([item])),
      http.patch("/api/restaurants/1/menu-items/10", () => HttpResponse.error()),
    );

    renderDetail("1");

    await screen.findByText("Pho Bo");

    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Could not update menu item.")).toBeInTheDocument();
  });

  it("shows the API's error message as a toast when toggling a menu item's active state fails with a known error", async () => {
    const user = userEvent.setup();
    const item = { id: 10, restaurantId: 1, name: "Pho Bo", price: null, active: true };

    server.use(
      http.get("/api/restaurants", () =>
        HttpResponse.json([
          { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
        ]),
      ),
      http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([item])),
      http.patch("/api/restaurants/1/menu-items/10", () =>
        HttpResponse.json({ error: "Menu item not found" }, { status: 404 }),
      ),
    );

    renderDetail("1");

    await screen.findByText("Pho Bo");

    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Menu item not found")).toBeInTheDocument();
  });

  describe("Details form", () => {
    it("renders pre-filled with the restaurant's existing name/contactInfo/note/menuUrl", async () => {
      server.use(
        http.get("/api/restaurants", () =>
          HttpResponse.json([
            {
              id: 1,
              name: "Pho 24",
              type: "food",
              contactInfo: "090-123-4567",
              note: "Cash only",
              menuUrl: "https://pho24.example.com/menu",
              menuImage: null,
            },
          ]),
        ),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      );

      renderDetail("1");

      expect(await screen.findByLabelText("Name", { exact: false, selector: "#restaurant-detail-name" })).toHaveValue("Pho 24");
      expect(screen.getByLabelText("Contact info", { exact: false })).toHaveValue("090-123-4567");
      expect(screen.getByLabelText("Note", { exact: false })).toHaveValue("Cash only");
      expect(screen.getByLabelText("Menu website", { exact: false })).toHaveValue(
        "https://pho24.example.com/menu",
      );
    });

    it("renders blank inputs when contactInfo/note/menuUrl are null", async () => {
      server.use(
        http.get("/api/restaurants", () =>
          HttpResponse.json([
            { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
          ]),
        ),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      );

      renderDetail("1");

      expect(await screen.findByLabelText("Name", { exact: false, selector: "#restaurant-detail-name" })).toHaveValue("Pho 24");
      expect(screen.getByLabelText("Contact info", { exact: false })).toHaveValue("");
      expect(screen.getByLabelText("Note", { exact: false })).toHaveValue("");
      expect(screen.getByLabelText("Menu website", { exact: false })).toHaveValue("");
    });

    it("does not render an Open menu link when menuUrl is null", async () => {
      server.use(
        http.get("/api/restaurants", () =>
          HttpResponse.json([
            { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
          ]),
        ),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      );

      renderDetail("1");

      await screen.findByLabelText("Name", { exact: false, selector: "#restaurant-detail-name" });
      expect(screen.queryByRole("link", { name: "Open menu ↗" })).not.toBeInTheDocument();
    });

    it("renders an Open menu link with the correct href when menuUrl is set", async () => {
      server.use(
        http.get("/api/restaurants", () =>
          HttpResponse.json([
            {
              id: 1,
              name: "Pho 24",
              type: "food",
              contactInfo: null,
              note: null,
              menuUrl: "https://pho24.example.com/menu",
            },
          ]),
        ),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
      );

      renderDetail("1");

      expect(await screen.findByRole("link", { name: "Open menu ↗" })).toHaveAttribute(
        "href",
        "https://pho24.example.com/menu",
      );
    });

    it("saves changes via PATCH and shows a success toast, updating the page header on a name change", async () => {
      const user = userEvent.setup();
      let patchBody: Record<string, unknown> | null = null;
      let restaurant = {
        id: 1,
        name: "Pho 24",
        type: "food",
        contactInfo: "090-123-4567",
        note: "Cash only",
        menuUrl: "https://pho24.example.com/menu",
      };

      server.use(
        http.get("/api/restaurants", () => HttpResponse.json([restaurant])),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.patch("/api/restaurants/1", async ({ request }) => {
          patchBody = (await request.json()) as Record<string, unknown>;
          restaurant = { ...restaurant, ...patchBody, id: 1, type: "food" };
          return HttpResponse.json(restaurant);
        }),
      );

      renderDetail("1");

      const nameInput = await screen.findByLabelText("Name", { exact: false, selector: "#restaurant-detail-name" });
      await user.clear(nameInput);
      await user.type(nameInput, "Pho 25");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(patchBody).not.toBeNull();
      });
      expect(patchBody).toMatchObject({
        name: "Pho 25",
        contactInfo: "090-123-4567",
        note: "Cash only",
        menuUrl: "https://pho24.example.com/menu",
      });
      expect(await screen.findByText("Restaurant updated")).toBeInTheDocument();
      expect(await screen.findByRole("heading", { name: "Pho 25" })).toBeInTheDocument();
    });

    it("shows an inline error and sends no request when Name is cleared", async () => {
      const user = userEvent.setup();
      let patchCalled = false;

      server.use(
        http.get("/api/restaurants", () =>
          HttpResponse.json([
            { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
          ]),
        ),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.patch("/api/restaurants/1", () => {
          patchCalled = true;
          return HttpResponse.json({ id: 1, name: "Pho 24", type: "food" });
        }),
      );

      renderDetail("1");

      const nameInput = await screen.findByLabelText("Name", { exact: false, selector: "#restaurant-detail-name" });
      await user.clear(nameInput);
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Name is required.")).toBeInTheDocument();
      expect(patchCalled).toBe(false);
    });

    it("shows an error toast when the save fails", async () => {
      const user = userEvent.setup();

      server.use(
        http.get("/api/restaurants", () =>
          HttpResponse.json([
            { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null },
          ]),
        ),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.patch("/api/restaurants/1", () =>
          HttpResponse.json({ error: "restaurant not found" }, { status: 404 }),
        ),
      );

      renderDetail("1");

      await screen.findByLabelText("Name", { exact: false, selector: "#restaurant-detail-name" });
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("restaurant not found")).toBeInTheDocument();
    });

    it("uploads a menu image via the file picker and shows a preview + success toast", async () => {
      const user = userEvent.setup();

      server.use(
        http.get("/api/restaurants", () =>
          HttpResponse.json([
            { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null, menuImage: null },
          ]),
        ),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.post("/api/restaurants/1/menu-image", () =>
          HttpResponse.json({
            id: 1,
            name: "Pho 24",
            type: "food",
            contactInfo: null,
            note: null,
            menuUrl: null,
            menuImage: "restaurants/1/abc",
          }),
        ),
      );

      renderDetail("1");

      await screen.findByLabelText("Name", { exact: false, selector: "#restaurant-detail-name" });
      const file = new File(["hello"], "menu.jpg", { type: "image/jpeg" });
      const input = screen.getByLabelText("Upload menu image", { exact: false });
      await user.upload(input, file);

      expect(await screen.findByText("Menu image uploaded")).toBeInTheDocument();
      expect(await screen.findByAltText("Menu")).toBeInTheDocument();
    });

    it("removes the menu image via the Remove image button and shows a success toast", async () => {
      const user = userEvent.setup();

      server.use(
        http.get("/api/restaurants", () =>
          HttpResponse.json([
            {
              id: 1,
              name: "Pho 24",
              type: "food",
              contactInfo: null,
              note: null,
              menuUrl: null,
              menuImage: "restaurants/1/abc",
            },
          ]),
        ),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.delete("/api/restaurants/1/menu-image", () =>
          HttpResponse.json({
            id: 1,
            name: "Pho 24",
            type: "food",
            contactInfo: null,
            note: null,
            menuUrl: null,
            menuImage: null,
          }),
        ),
      );

      renderDetail("1");

      expect(await screen.findByAltText("Menu")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Remove image" }));

      expect(await screen.findByText("Menu image removed")).toBeInTheDocument();
      expect(screen.queryByAltText("Menu")).not.toBeInTheDocument();
    });

    it("shows an error toast without a preview when the upload fails", async () => {
      const user = userEvent.setup();

      server.use(
        http.get("/api/restaurants", () =>
          HttpResponse.json([
            { id: 1, name: "Pho 24", type: "food", contactInfo: null, note: null, menuUrl: null, menuImage: null },
          ]),
        ),
        http.get("/api/restaurants/1/menu-items", () => HttpResponse.json([])),
        http.post("/api/restaurants/1/menu-image", () => HttpResponse.error()),
      );

      renderDetail("1");

      await screen.findByLabelText("Name", { exact: false, selector: "#restaurant-detail-name" });
      const file = new File(["hello"], "menu.jpg", { type: "image/jpeg" });
      const input = screen.getByLabelText("Upload menu image", { exact: false });
      await user.upload(input, file);

      expect(await screen.findByText("Could not upload menu image.")).toBeInTheDocument();
      expect(screen.queryByAltText("Menu")).not.toBeInTheDocument();
    });
  });
});
