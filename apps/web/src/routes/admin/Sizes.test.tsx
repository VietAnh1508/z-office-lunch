import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { Sizes } from "./Sizes";

type Preset = {
  id: number;
  name: string;
  options: { id: number; label: string; sortOrder: number }[];
};

const DRINK_SIZES: Preset = {
  id: 1,
  name: "Drink sizes",
  options: [
    { id: 10, label: "S", sortOrder: 0 },
    { id: 11, label: "M", sortOrder: 1 },
    { id: 12, label: "L", sortOrder: 2 },
  ],
};

function renderSizes() {
  return renderWithProviders(
    <MemoryRouter>
      <Sizes />
    </MemoryRouter>,
  );
}

describe("Sizes", () => {
  it("shows an empty state when there are no presets", async () => {
    server.use(http.get("/api/size-presets", () => HttpResponse.json([])));

    renderSizes();

    expect(await screen.findByText("No size presets yet.")).toBeInTheDocument();
  });

  it("shows an error when presets cannot be loaded", async () => {
    server.use(http.get("/api/size-presets", () => HttpResponse.error()));

    renderSizes();

    expect(await screen.findByText("Could not load size presets.")).toBeInTheDocument();
  });

  it("lists presets with their options as 'S / M / L'", async () => {
    server.use(http.get("/api/size-presets", () => HttpResponse.json([DRINK_SIZES])));

    renderSizes();

    expect(await screen.findByText("Drink sizes")).toBeInTheDocument();
    expect(screen.getByText("S / M / L")).toBeInTheDocument();
  });

  it("creates a preset from a name and one option per line", async () => {
    const user = userEvent.setup();
    let presets: Preset[] = [];
    let posted: unknown;

    server.use(
      http.get("/api/size-presets", () => HttpResponse.json(presets)),
      http.post("/api/size-presets", async ({ request }) => {
        posted = await request.json();
        const body = posted as { name: string; options: string[] };
        const created = {
          id: 1,
          name: body.name,
          options: body.options.map((label, i) => ({ id: 10 + i, label, sortOrder: i })),
        };
        presets = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderSizes();
    await screen.findByText("No size presets yet.");

    await user.type(screen.getByLabelText("Preset name", { exact: false }), "Drink sizes");
    await user.type(
      screen.getByLabelText("Options", { exact: false }),
      "S{Enter}M{Enter} L {Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Add preset" }));

    expect(await screen.findByText("S / M / L")).toBeInTheDocument();
    expect(posted).toEqual({ name: "Drink sizes", options: ["S", "M", "L"] });
    expect(await screen.findByText("Size preset added")).toBeInTheDocument();
  });

  it("shows inline errors and sends nothing when name and options are empty", async () => {
    const user = userEvent.setup();
    let postCount = 0;

    server.use(
      http.get("/api/size-presets", () => HttpResponse.json([])),
      http.post("/api/size-presets", () => {
        postCount += 1;
        return HttpResponse.json(DRINK_SIZES, { status: 201 });
      }),
    );

    renderSizes();
    await screen.findByText("No size presets yet.");

    await user.click(screen.getByRole("button", { name: "Add preset" }));

    expect(await screen.findByText("Preset name is required.")).toBeInTheDocument();
    expect(screen.getByText("Options are required.")).toBeInTheDocument();
    expect(postCount).toBe(0);
  });

  it("shows the API's message as a toast when creating fails", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/size-presets", () => HttpResponse.json([])),
      http.post("/api/size-presets", () =>
        HttpResponse.json({ error: "Size preset name already exists" }, { status: 409 }),
      ),
    );

    renderSizes();
    await screen.findByText("No size presets yet.");

    await user.type(screen.getByLabelText("Preset name", { exact: false }), "Drink sizes");
    await user.type(screen.getByLabelText("Options", { exact: false }), "S");
    await user.click(screen.getByRole("button", { name: "Add preset" }));

    expect(await screen.findByText("Size preset name already exists")).toBeInTheDocument();
  });

  it("edits a preset: keeps ids of unchanged options, sends new ones without an id", async () => {
    const user = userEvent.setup();
    let preset = DRINK_SIZES;
    let patched: unknown;

    server.use(
      http.get("/api/size-presets", () => HttpResponse.json([preset])),
      http.patch("/api/size-presets/1", async ({ request }) => {
        patched = await request.json();
        preset = {
          ...preset,
          name: "Cup sizes",
          options: [
            { id: 10, label: "S", sortOrder: 0 },
            { id: 12, label: "L", sortOrder: 1 },
            { id: 13, label: "XL", sortOrder: 2 },
          ],
        };
        return HttpResponse.json(preset);
      }),
    );

    renderSizes();
    await screen.findByText("Drink sizes");
    await user.click(screen.getByRole("button", { name: "Edit preset" }));

    const row = within(screen.getByRole("listitem"));
    expect(row.getByLabelText("Options")).toHaveValue("S\nM\nL");
    expect(row.getByText(/submissions in open rounds/i)).toBeInTheDocument();

    const name = row.getByLabelText("Preset name");
    await user.clear(name);
    await user.type(name, "Cup sizes");
    const options = row.getByLabelText("Options");
    await user.clear(options);
    await user.type(options, "S{Enter}L{Enter}XL");
    await user.click(row.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("S / L / XL")).toBeInTheDocument();
    expect(patched).toEqual({
      name: "Cup sizes",
      options: [{ id: 10, label: "S" }, { id: 12, label: "L" }, { label: "XL" }],
    });
    expect(await screen.findByText("Size preset updated")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("blocks saving with a blank name or no options", async () => {
    const user = userEvent.setup();
    let patchCount = 0;

    server.use(
      http.get("/api/size-presets", () => HttpResponse.json([DRINK_SIZES])),
      http.patch("/api/size-presets/1", () => {
        patchCount += 1;
        return HttpResponse.json(DRINK_SIZES);
      }),
    );

    renderSizes();
    await screen.findByText("Drink sizes");
    await user.click(screen.getByRole("button", { name: "Edit preset" }));

    const row = within(screen.getByRole("listitem"));
    await user.clear(row.getByLabelText("Preset name"));
    await user.clear(row.getByLabelText("Options"));
    await user.click(row.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Preset name is required.")).toBeInTheDocument();
    expect(screen.getByText("Options are required.")).toBeInTheDocument();
    expect(patchCount).toBe(0);
  });

  it("cancelling an edit restores display mode and sends nothing", async () => {
    const user = userEvent.setup();
    let patchCount = 0;

    server.use(
      http.get("/api/size-presets", () => HttpResponse.json([DRINK_SIZES])),
      http.patch("/api/size-presets/1", () => {
        patchCount += 1;
        return HttpResponse.json(DRINK_SIZES);
      }),
    );

    renderSizes();
    await screen.findByText("Drink sizes");
    await user.click(screen.getByRole("button", { name: "Edit preset" }));
    await user.type(within(screen.getByRole("listitem")).getByLabelText("Options"), "{Enter}XL");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("S / M / L")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(patchCount).toBe(0);
  });

  it("stays in edit mode and toasts the API message when saving fails", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/size-presets", () => HttpResponse.json([DRINK_SIZES])),
      http.patch("/api/size-presets/1", () =>
        HttpResponse.json({ error: "Size preset name already exists" }, { status: 409 }),
      ),
    );

    renderSizes();
    await screen.findByText("Drink sizes");
    await user.click(screen.getByRole("button", { name: "Edit preset" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Size preset name already exists")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("deletes a preset after confirming in the dialog", async () => {
    const user = userEvent.setup();
    let presets: Preset[] = [DRINK_SIZES];

    server.use(
      http.get("/api/size-presets", () => HttpResponse.json(presets)),
      http.delete("/api/size-presets/1", () => {
        presets = [];
        return HttpResponse.json({ id: 1 });
      }),
    );

    renderSizes();
    await screen.findByText("Drink sizes");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Delete this size preset?");
    await user.click(screen.getByRole("button", { name: "Delete preset" }));

    await waitFor(() => expect(screen.queryByText("Drink sizes")).not.toBeInTheDocument());
    expect(await screen.findByText("Size preset deleted")).toBeInTheDocument();
  });

  it("does not delete when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    let deleteCount = 0;

    server.use(
      http.get("/api/size-presets", () => HttpResponse.json([DRINK_SIZES])),
      http.delete("/api/size-presets/1", () => {
        deleteCount += 1;
        return HttpResponse.json({ id: 1 });
      }),
    );

    renderSizes();
    await screen.findByText("Drink sizes");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Delete this size preset?");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Drink sizes")).toBeInTheDocument();
    expect(deleteCount).toBe(0);
  });

  it("shows the server message as a toast when the preset is in use (409)", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/size-presets", () => HttpResponse.json([DRINK_SIZES])),
      http.delete("/api/size-presets/1", () =>
        HttpResponse.json({ error: "Size preset is in use by a restaurant" }, { status: 409 }),
      ),
    );

    renderSizes();
    await screen.findByText("Drink sizes");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Delete preset" }));

    expect(await screen.findByText("Size preset is in use by a restaurant")).toBeInTheDocument();
    expect(screen.getByText("Drink sizes")).toBeInTheDocument();
  });
});
