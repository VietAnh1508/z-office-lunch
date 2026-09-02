import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { recognizeMenuImage } from "@/lib/ocr";
import { GenerateMenuFromImage } from "./GenerateMenuFromImage";

vi.mock("@/lib/ocr");

const mockedRecognize = vi.mocked(recognizeMenuImage);

function mockMenuItemsList(items: unknown[] = []) {
  server.use(
    http.get("/api/restaurants/1/menu-items", () => HttpResponse.json(items)),
    http.get(
      "/api/restaurants/1/menu-image",
      () => new HttpResponse(new Blob(["fake-image"], { type: "image/jpeg" })),
    ),
  );
}

function render() {
  return renderWithProviders(
    <GenerateMenuFromImage restaurantId={1} menuImageSrc="/api/restaurants/1/menu-image?v=abc" />,
  );
}

describe("GenerateMenuFromImage", () => {
  beforeEach(() => {
    mockedRecognize.mockReset();
  });

  it("does not open the review dialog synchronously on click, only after OCR resolves", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([]);
    let resolveRecognize: (value: string) => void = () => {};
    mockedRecognize.mockReturnValue(
      new Promise((resolve) => {
        resolveRecognize = resolve;
      }),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reading menu…" })).toBeDisabled();

    resolveRecognize("Pho Bo 45000\nBanh Mi 20000");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pho Bo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Banh Mi")).toBeInTheDocument();
  });

  it("shows an error toast and does not open the dialog when OCR rejects", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([]);
    mockedRecognize.mockRejectedValue(new Error("ocr failed"));

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu" }));

    expect(await screen.findByText("Could not read the menu image.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error toast and does not open the dialog when no candidates are found", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([]);
    mockedRecognize.mockResolvedValue("   \n   ");

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu" }));

    expect(await screen.findByText("No menu items found in the image.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("removing one row never misidentifies another when editing after removal", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([]);
    mockedRecognize.mockResolvedValue("Pho Bo 45000\nBanh Mi 20000\nCom Tam 30000");

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu" }));
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
    mockMenuItemsList([]);
    mockedRecognize.mockResolvedValue("Pho Bo 45000");
    let saveCalled = false;
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", () => {
        saveCalled = true;
        return HttpResponse.json([], { status: 201 });
      }),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu" }));
    await screen.findByRole("dialog");

    const priceInput = screen.getByDisplayValue("45000");
    await user.clear(priceInput);
    await user.type(priceInput, "-5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Price must be a valid non-negative number."),
    ).toBeInTheDocument();
    expect(saveCalled).toBe(false);
  });

  it("skips the confirmation and saves directly with mode append when the restaurant has zero menu items", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([]);
    mockedRecognize.mockResolvedValue("Pho Bo 45000");
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

    await user.click(screen.getByRole("button", { name: "Generate menu" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ mode: "append" });
    expect(await screen.findByText("Menu items generated")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens an override/append confirmation when the restaurant already has menu items, and Cancel returns to the intact review dialog", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([
      { id: 99, restaurantId: 1, name: "Existing Item", price: null, active: true },
    ]);
    mockedRecognize.mockResolvedValue("Pho Bo 45000");
    let saveCalled = false;
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", () => {
        saveCalled = true;
        return HttpResponse.json([], { status: 201 });
      }),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: "Replace current menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to current menu" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(saveCalled).toBe(false);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Pho Bo")).toBeInTheDocument();
  });

  it("calls the bulk endpoint with mode override when Replace current menu is chosen", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([
      { id: 99, restaurantId: 1, name: "Existing Item", price: null, active: true },
    ]);
    mockedRecognize.mockResolvedValue("Pho Bo 45000");
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json([], { status: 201 });
      }),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Replace current menu" }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ mode: "override" });
    expect(await screen.findByText("Menu items generated")).toBeInTheDocument();
  });

  it("calls the bulk endpoint with mode append when Add to current menu is chosen", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([
      { id: 99, restaurantId: 1, name: "Existing Item", price: null, active: true },
    ]);
    mockedRecognize.mockResolvedValue("Pho Bo 45000");
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json([], { status: 201 });
      }),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Add to current menu" }));

    await waitFor(() => expect(requestBody).not.toBeNull());
    expect(requestBody).toMatchObject({ mode: "append" });
  });

  it("shows an error toast and keeps the review dialog open with edits intact on save failure", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockMenuItemsList([]);
    mockedRecognize.mockResolvedValue("Pho Bo 45000");
    server.use(
      http.post("/api/restaurants/1/menu-items/bulk", () =>
        HttpResponse.json({ error: "Could not save" }, { status: 500 }),
      ),
    );

    render();

    await user.click(screen.getByRole("button", { name: "Generate menu" }));
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
