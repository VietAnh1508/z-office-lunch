import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { GenerateMenuFromImage } from "./GenerateMenuFromImage";

function mockMenuItemsList(items: unknown[] = []) {
  server.use(http.get("/api/restaurants/1/menu-items", () => HttpResponse.json(items)));
}

function mockGenerateMenu(
  handler: () => { items: { name: string }[] } | { error: string; status: number },
) {
  server.use(
    http.post("/api/restaurants/1/generate-menu", () => {
      const result = handler();
      if ("error" in result) {
        return HttpResponse.json({ error: result.error }, { status: result.status });
      }
      return HttpResponse.json(result);
    }),
  );
}

function render() {
  return renderWithProviders(<GenerateMenuFromImage restaurantId={1} />);
}

describe("GenerateMenuFromImage", () => {
  beforeEach(() => {
    mockMenuItemsList([]);
  });

  it("does not open the review dialog synchronously on click, only after the request resolves", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    let resolveRequest: (value: Response) => void = () => {};
    server.use(
      http.post(
        "/api/restaurants/1/generate-menu",
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generating menu…" })).toBeDisabled();

    resolveRequest(
      HttpResponse.json({
        items: [{ name: "Pho Bo" }, { name: "Banh Mi" }],
      }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pho Bo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Banh Mi")).toBeInTheDocument();
  });

  it("shows an error toast and does not open the dialog when the request fails", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    server.use(http.post("/api/restaurants/1/generate-menu", () => HttpResponse.error()));

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));

    expect(
      await screen.findByText("Could not generate menu items from the image."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error toast and does not open the dialog when no candidates are found", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockGenerateMenu(() => ({ items: [] }));

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));

    expect(await screen.findByText("No menu items found in the image.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("removing one row never misidentifies another when editing after removal", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockGenerateMenu(() => ({
      items: [{ name: "Pho Bo" }, { name: "Banh Mi" }, { name: "Com Tam" }],
    }));

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));
    await screen.findByRole("dialog");

    const removeButtons = screen.getAllByRole("button", { name: "Remove candidate" });
    await user.click(removeButtons[0]);

    expect(screen.queryByDisplayValue("Pho Bo")).not.toBeInTheDocument();

    const banhMiNameInput = screen.getByDisplayValue("Banh Mi");
    await user.clear(banhMiNameInput);
    await user.type(banhMiNameInput, "Banh Mi Thit");

    expect(screen.getByDisplayValue("Banh Mi Thit")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Com Tam")).toBeInTheDocument();
  });

  it("blocks Save when an edited price is invalid", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockGenerateMenu(() => ({ items: [{ name: "Pho Bo" }] }));
    let saveCalled = false;
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", () => {
        saveCalled = true;
        return HttpResponse.json([], { status: 201 });
      }),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));
    await screen.findByRole("dialog");

    const priceInput = screen.getByLabelText("Candidate price");
    await user.type(priceInput, "-5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Price must be a valid non-negative number."),
    ).toBeInTheDocument();
    expect(saveCalled).toBe(false);
  });

  it("shows a single Save button and saves directly with mode append when the restaurant has zero menu items", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockGenerateMenu(() => ({ items: [{ name: "Pho Bo" }] }));
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          [{ id: 1, restaurantId: 1, name: "Pho Bo", price: "45000", active: true }],
          { status: 201 },
        );
      }),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Add to current menu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replace current menu" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ mode: "append" });
    expect(await screen.findByText("Menu items saved")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows Add/Replace buttons instead of Save when the restaurant already has menu items", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([
      { id: 99, restaurantId: 1, name: "Existing Item", price: null, active: true },
    ]);
    mockGenerateMenu(() => ({ items: [{ name: "Pho Bo" }] }));

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));
    await screen.findByRole("dialog");

    expect(screen.getByRole("button", { name: "Add to current menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace current menu" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("opens a confirmation before replacing, and calls the bulk endpoint with mode override once confirmed", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([
      { id: 99, restaurantId: 1, name: "Existing Item", price: null, active: true },
    ]);
    mockGenerateMenu(() => ({ items: [{ name: "Pho Bo" }] }));
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json([], { status: 201 });
      }),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Replace current menu" }));

    expect(requestBody).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Yes, replace menu" }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ mode: "override" });
    expect(await screen.findByText("Menu items saved")).toBeInTheDocument();
  });

  it("cancelling the replace confirmation sends no request and keeps the review dialog intact", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([
      { id: 99, restaurantId: 1, name: "Existing Item", price: null, active: true },
    ]);
    mockGenerateMenu(() => ({ items: [{ name: "Pho Bo" }] }));
    let saveCalled = false;
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", () => {
        saveCalled = true;
        return HttpResponse.json([], { status: 201 });
      }),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Replace current menu" }));

    await user.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(saveCalled).toBe(false);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pho Bo")).toBeInTheDocument();
  });

  it("calls the bulk endpoint with mode append when Add to current menu is clicked", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([
      { id: 99, restaurantId: 1, name: "Existing Item", price: null, active: true },
    ]);
    mockGenerateMenu(() => ({ items: [{ name: "Pho Bo" }] }));
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json([], { status: 201 });
      }),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Add to current menu" }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ mode: "append" });
  });

  it("blocks Replace/Add when an edited price is invalid, with the restaurant already having menu items", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([
      { id: 99, restaurantId: 1, name: "Existing Item", price: null, active: true },
    ]);
    mockGenerateMenu(() => ({ items: [{ name: "Pho Bo" }] }));
    let saveCalled = false;
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", () => {
        saveCalled = true;
        return HttpResponse.json([], { status: 201 });
      }),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));
    await screen.findByRole("dialog");

    const priceInput = screen.getByLabelText("Candidate price");
    await user.type(priceInput, "-5");
    await user.click(screen.getByRole("button", { name: "Replace current menu" }));

    expect(
      await screen.findByText("Price must be a valid non-negative number."),
    ).toBeInTheDocument();
    expect(saveCalled).toBe(false);
  });

  it("shows an error toast and keeps the review dialog open with edits intact on save failure", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockGenerateMenu(() => ({ items: [{ name: "Pho Bo" }] }));
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", () =>
        HttpResponse.json({ error: "Could not save" }, { status: 500 }),
      ),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu from image" }));
    await screen.findByRole("dialog");

    const nameInput = screen.getByDisplayValue("Pho Bo");
    await user.clear(nameInput);
    await user.type(nameInput, "Pho Ga");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Could not save")).toBeInTheDocument();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pho Ga")).toBeInTheDocument();
  });
});
