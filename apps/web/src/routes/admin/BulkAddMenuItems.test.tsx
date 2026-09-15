import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { BulkAddMenuItems } from "./BulkAddMenuItems";

function mockBulkCreate(
  handler?: (body: Record<string, unknown>) => void,
): { getBody: () => Record<string, unknown> | null } {
  let requestBody: Record<string, unknown> | null = null;
  server.use(
    http.post("/api/restaurants/1/menu-items/bulk", async ({ request }) => {
      requestBody = (await request.json()) as Record<string, unknown>;
      handler?.(requestBody);
      return HttpResponse.json([], { status: 201 });
    }),
  );
  return { getBody: () => requestBody };
}

function render() {
  return renderWithProviders(<BulkAddMenuItems restaurantId={1} />);
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Bulk-add menu items" }));
  await screen.findByRole("dialog");
}

describe("BulkAddMenuItems", () => {
  it("parses pasted text with blank lines and CRLF endings into review rows", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render();

    await openDialog(user);
    await user.click(screen.getByRole("textbox", { name: /paste menu item names/i }));
    await user.paste("Pho Bo\r\n\r\nBanh Mi\n \nCom Tam");
    await user.click(screen.getByRole("button", { name: "Parse" }));

    expect(await screen.findByDisplayValue("Pho Bo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Banh Mi")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Com Tam")).toBeInTheDocument();
  });

  it("shows an inline error and stays on the paste step for blank/whitespace-only input", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render();

    await openDialog(user);
    await user.click(screen.getByRole("textbox", { name: /paste menu item names/i }));
    await user.paste("   \n  \n");
    await user.click(screen.getByRole("button", { name: "Parse" }));

    expect(await screen.findByText("Enter at least one item name.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("sends mode append when the overwrite checkbox is left unchecked", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const bulk = mockBulkCreate();
    render();

    await openDialog(user);
    await user.click(screen.getByRole("textbox", { name: /paste menu item names/i }));
    await user.paste("Pho Bo");
    await user.click(screen.getByRole("button", { name: "Parse" }));
    await screen.findByDisplayValue("Pho Bo");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(bulk.getBody()).not.toBeNull());
    expect(bulk.getBody()).toMatchObject({ mode: "append" });
  });

  it("sends mode override when the overwrite checkbox is checked", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const bulk = mockBulkCreate();
    render();

    await openDialog(user);
    await user.click(
      screen.getByRole("checkbox", { name: "Overwrite current menu items" }),
    );
    await user.click(screen.getByRole("textbox", { name: /paste menu item names/i }));
    await user.paste("Pho Bo");
    await user.click(screen.getByRole("button", { name: "Parse" }));
    await screen.findByDisplayValue("Pho Bo");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(bulk.getBody()).not.toBeNull());
    expect(bulk.getBody()).toMatchObject({ mode: "override" });
  });

  it("reflects edited names and removed rows in the saved request body", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const bulk = mockBulkCreate();
    render();

    await openDialog(user);
    await user.click(screen.getByRole("textbox", { name: /paste menu item names/i }));
    await user.paste("Pho Bo\nBanh Mi");
    await user.click(screen.getByRole("button", { name: "Parse" }));
    await screen.findByDisplayValue("Pho Bo");

    const removeButtons = screen.getAllByRole("button", { name: "Remove candidate" });
    await user.click(removeButtons[0]);

    const nameInput = screen.getByDisplayValue("Banh Mi");
    await user.clear(nameInput);
    await user.type(nameInput, "Banh Mi Thit");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(bulk.getBody()).not.toBeNull());
    expect(bulk.getBody()).toMatchObject({
      mode: "append",
      items: [{ name: "Banh Mi Thit", price: "" }],
    });
  });

  it("blocks Save when a row has an invalid price", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const bulk = mockBulkCreate();
    render();

    await openDialog(user);
    await user.click(screen.getByRole("textbox", { name: /paste menu item names/i }));
    await user.paste("Pho Bo");
    await user.click(screen.getByRole("button", { name: "Parse" }));
    await screen.findByDisplayValue("Pho Bo");

    const priceInput = screen.getByLabelText("Candidate price");
    await user.type(priceInput, "-5");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Price must be a valid non-negative number."),
    ).toBeInTheDocument();
    expect(bulk.getBody()).toBeNull();
  });

  it("closes the dialog and resets state to a fresh paste step on successful save", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockBulkCreate();
    render();

    await openDialog(user);
    await user.click(screen.getByRole("textbox", { name: /paste menu item names/i }));
    await user.paste("Pho Bo");
    await user.click(screen.getByRole("button", { name: "Parse" }));
    await screen.findByDisplayValue("Pho Bo");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Menu items saved")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await openDialog(user);
    expect(
      screen.getByRole("textbox", { name: /paste menu item names/i }),
    ).toHaveValue("");
    expect(screen.queryByDisplayValue("Pho Bo")).not.toBeInTheDocument();
  });
});
