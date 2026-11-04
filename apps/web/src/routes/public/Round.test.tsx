import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { Round } from "./Round";

const FOOD_RESTAURANT = { id: 1, name: "Pho 24", menuUrl: null, menuImage: null, note: null };
const DRINK_RESTAURANT = { id: 2, name: "Tra Da Corner", menuUrl: null, menuImage: null, note: null };

const OPEN_ROUND_WITH_DRINK = {
  label: "Week 1",
  deadline: "2999-01-01T00:00:00.000Z",
  status: "open",
  foodItems: [{ id: 10, name: "Pho Bo" }],
  drinkItems: [{ id: 20, name: "Tra Da" }],
  foodRestaurant: FOOD_RESTAURANT,
  drinkRestaurant: DRINK_RESTAURANT,
};

const OPEN_ROUND_FOOD_ONLY = {
  label: "Week 1",
  deadline: "2999-01-01T00:00:00.000Z",
  status: "open",
  foodItems: [{ id: 10, name: "Pho Bo" }],
  foodRestaurant: FOOD_RESTAURANT,
};

const OPEN_ROUND_DRINK_ONLY = {
  label: "Week 1",
  deadline: "2999-01-01T00:00:00.000Z",
  status: "open",
  drinkItems: [{ id: 20, name: "Tra Da" }],
  drinkRestaurant: DRINK_RESTAURANT,
};

const EMPLOYEES = [{ id: 1, fullName: "An Nguyen" }];

function renderRound(id: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/r/${id}`]}>
      <Routes>
        <Route path="/r/:roundId" element={<Round />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForForm() {
  await screen.findByRole("textbox", { name: /your name/i });
}

// Picking a name advances straight to the next step.
async function pickEmployee(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("option", { name }));
}

async function pickFoodItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("option", { name }));
  await user.click(screen.getByRole("button", { name: /continue/i }));
}

// Selects only; the caller types a note and/or continues afterwards.
async function pickDrinkItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("option", { name }));
}

// From whatever step is showing, move to the review step and submit.
async function submitOrder(user: ReturnType<typeof userEvent.setup>) {
  const next = screen.queryByRole("button", { name: /continue/i });
  if (next) await user.click(next);
  await user.click(await screen.findByRole("button", { name: "Submit order" }));
}

function serve(round: object, extra: Parameters<typeof server.use> = []) {
  server.use(
    http.get("/api/rounds/1/public", () => HttpResponse.json(round)),
    http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
    http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
    ...extra,
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

  it("shows a distinct error message for a real backend failure, not the not-open-yet message", async () => {
    server.use(
      http.get("/api/rounds/1/public", () =>
        HttpResponse.json({ error: "internal error" }, { status: 500 }),
      ),
    );

    renderRound("1");

    expect(
      await screen.findByText("Something went wrong loading this round. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("This round isn't open yet.")).not.toBeInTheDocument();
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

  it("starts on the name step and shows a food picker after picking a name, with no drink step", async () => {
    const user = userEvent.setup();
    serve(OPEN_ROUND_FOOD_ONLY);

    renderRound("1");
    await waitForForm();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();

    await pickEmployee(user, "An Nguyen");

    expect(await screen.findByRole("listbox", { name: /food item/i })).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.queryByText("Drink")).not.toBeInTheDocument();
  });

  it("walks through food then drink steps when the round has a drink restaurant", async () => {
    const user = userEvent.setup();
    serve(OPEN_ROUND_WITH_DRINK);

    renderRound("1");
    await waitForForm();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();

    await pickEmployee(user, "An Nguyen");
    expect(await screen.findByRole("listbox", { name: /food item/i })).toBeInTheDocument();

    await pickFoodItem(user, "Pho Bo");
    expect(await screen.findByRole("option", { name: "Tra Da" })).toBeInTheDocument();
  });

  it("renders a drink-only round with no food steps", async () => {
    const user = userEvent.setup();
    serve(OPEN_ROUND_DRINK_ONLY);

    renderRound("1");
    await waitForForm();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    await pickEmployee(user, "An Nguyen");

    expect(await screen.findByRole("listbox", { name: /drink item/i })).toBeInTheDocument();
    expect(screen.queryByText("Food")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Food note")).not.toBeInTheDocument();
  });

  it("requires a drink on a drink-only round and sends no food fields", async () => {
    const user = userEvent.setup();
    let submittedBody: Record<string, unknown> | null = null;
    serve(OPEN_ROUND_DRINK_ONLY, [
      http.post("/api/rounds/1/submissions", async ({ request }) => {
        submittedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1, roundId: 1, ...submittedBody }, { status: 201 });
      }),
    ]);

    renderRound("1");
    await waitForForm();
    await pickEmployee(user, "An Nguyen");

    expect(await screen.findByRole("button", { name: /continue/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /skip drink/i })).not.toBeInTheDocument();
    expect(submittedBody).toBeNull();

    await pickDrinkItem(user, "Tra Da");
    await submitOrder(user);

    expect(
      await screen.findByText("Thanks! Your order has been recorded."),
    ).toBeInTheDocument();
    expect(submittedBody).toEqual({ employeeId: 1, drinkRoundMenuItemId: 20 });
  });

  it("filters names as the user types and advances to the next step on click", async () => {
    const user = userEvent.setup();
    serve(OPEN_ROUND_FOOD_ONLY);
    server.use(
      http.get("/api/employees", () =>
        HttpResponse.json([...EMPLOYEES, { id: 2, fullName: "Binh Tran" }]),
      ),
    );

    renderRound("1");
    await waitForForm();

    await user.type(screen.getByRole("textbox", { name: /your name/i }), "An N");

    expect(screen.getByRole("option", { name: "An Nguyen" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Binh Tran" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "An Nguyen" }));

    expect(await screen.findByRole("listbox", { name: /food item/i })).toBeInTheDocument();
    expect(screen.getByText("Hi An 👋")).toBeInTheDocument();
    expect(screen.getByText("An Nguyen")).toBeInTheDocument();
  });

  it("keeps Continue disabled until a food item is picked", async () => {
    const user = userEvent.setup();
    serve(OPEN_ROUND_FOOD_ONLY);

    renderRound("1");
    await waitForForm();
    await pickEmployee(user, "An Nguyen");

    const next = await screen.findByRole("button", { name: /continue/i });
    expect(next).toBeDisabled();

    await user.click(screen.getByRole("option", { name: "Pho Bo" }));
    expect(next).toBeEnabled();
  });

  it("goes back a step and keeps earlier selections", async () => {
    const user = userEvent.setup();
    serve(OPEN_ROUND_FOOD_ONLY);

    renderRound("1");
    await waitForForm();
    await pickEmployee(user, "An Nguyen");
    await user.click(await screen.findByRole("option", { name: "Pho Bo" }));

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(await screen.findByRole("textbox", { name: /your name/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "An Nguyen", selected: true })).toBeInTheDocument();
    expect(screen.getByText("Pho Bo")).toBeInTheDocument();
  });

  it("submits the food-only pick and shows a success state", async () => {
    const user = userEvent.setup();
    let submittedBody: Record<string, unknown> | null = null;
    serve(OPEN_ROUND_FOOD_ONLY, [
      http.post("/api/rounds/1/submissions", async ({ request }) => {
        submittedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1, roundId: 1, ...submittedBody }, { status: 201 });
      }),
    ]);

    renderRound("1");
    await waitForForm();

    await pickEmployee(user, "An Nguyen");
    await pickFoodItem(user, "Pho Bo");
    await submitOrder(user);

    expect(
      await screen.findByText("Thanks! Your order has been recorded."),
    ).toBeInTheDocument();
    expect(screen.getByText("You're all set, An!")).toBeInTheDocument();
    await waitFor(() => {
      expect(submittedBody).toEqual({ employeeId: 1, foodRoundMenuItemId: 10 });
    });
  });

  it("submits drink pick and note only when a drink item is selected", async () => {
    const user = userEvent.setup();
    let submittedBody: Record<string, unknown> | null = null;
    serve(OPEN_ROUND_WITH_DRINK, [
      http.post("/api/rounds/1/submissions", async ({ request }) => {
        submittedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1, roundId: 1, ...submittedBody }, { status: 201 });
      }),
    ]);

    renderRound("1");
    await waitForForm();

    await pickEmployee(user, "An Nguyen");
    await pickFoodItem(user, "Pho Bo");
    await pickDrinkItem(user, "Tra Da");
    await user.type(screen.getByLabelText("Drink note", { exact: false }), "Less ice");
    await submitOrder(user);

    await waitFor(() => {
      expect(submittedBody).toEqual({
        employeeId: 1,
        foodRoundMenuItemId: 10,
        drinkRoundMenuItemId: 20,
        drinkNote: "Less ice",
      });
    });
  });

  it("lets the user skip an optional drink and submits food only", async () => {
    const user = userEvent.setup();
    let submittedBody: Record<string, unknown> | null = null;
    serve(OPEN_ROUND_WITH_DRINK, [
      http.post("/api/rounds/1/submissions", async ({ request }) => {
        submittedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1, roundId: 1, ...submittedBody }, { status: 201 });
      }),
    ]);

    renderRound("1");
    await waitForForm();

    await pickEmployee(user, "An Nguyen");
    await pickFoodItem(user, "Pho Bo");
    await user.click(await screen.findByRole("button", { name: /skip drink/i }));
    await user.click(await screen.findByRole("button", { name: "Submit order" }));

    await waitFor(() => {
      expect(submittedBody).toEqual({ employeeId: 1, foodRoundMenuItemId: 10 });
    });
  });

  it("succeeds when submitting again for the same employee (resubmission)", async () => {
    const user = userEvent.setup();
    serve(OPEN_ROUND_FOOD_ONLY, [
      http.post("/api/rounds/1/submissions", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1, roundId: 1, ...body }, { status: 200 });
      }),
    ]);

    renderRound("1");
    await waitForForm();

    await pickEmployee(user, "An Nguyen");
    await pickFoodItem(user, "Pho Bo");
    await submitOrder(user);

    expect(
      await screen.findByText("Thanks! Your order has been recorded."),
    ).toBeInTheDocument();
  });

  describe("restaurant note", () => {
    it("shows the food restaurant's note on the food step", async () => {
      const user = userEvent.setup();
      serve({
        ...OPEN_ROUND_FOOD_ONLY,
        foodRestaurant: { ...FOOD_RESTAURANT, note: "Cash only" },
      });

      renderRound("1");
      await waitForForm();
      await pickEmployee(user, "An Nguyen");

      expect(await screen.findByText("Cash only")).toBeInTheDocument();
    });

    it("shows the food note on the food step and the drink note on the drink step", async () => {
      const user = userEvent.setup();
      serve({
        ...OPEN_ROUND_WITH_DRINK,
        foodRestaurant: { ...FOOD_RESTAURANT, note: "Cash only" },
        drinkRestaurant: { ...DRINK_RESTAURANT, note: "No ice after 3pm" },
      });

      renderRound("1");
      await waitForForm();
      await pickEmployee(user, "An Nguyen");

      expect(await screen.findByText("Cash only")).toBeInTheDocument();
      expect(screen.queryByText("No ice after 3pm")).not.toBeInTheDocument();

      await pickFoodItem(user, "Pho Bo");

      expect(await screen.findByText("No ice after 3pm")).toBeInTheDocument();
    });

    it("shows only the drink note on a round without a food restaurant", async () => {
      const user = userEvent.setup();
      serve({
        ...OPEN_ROUND_DRINK_ONLY,
        drinkRestaurant: { ...DRINK_RESTAURANT, note: "No ice after 3pm" },
      });

      renderRound("1");
      await waitForForm();
      await pickEmployee(user, "An Nguyen");

      expect(await screen.findByText("No ice after 3pm")).toBeInTheDocument();
    });

    it("renders nothing for a null or blank note", async () => {
      const user = userEvent.setup();
      serve({
        ...OPEN_ROUND_WITH_DRINK,
        foodRestaurant: { ...FOOD_RESTAURANT, note: null },
        drinkRestaurant: { ...DRINK_RESTAURANT, note: "   " },
      });

      renderRound("1");
      await waitForForm();
      await pickEmployee(user, "An Nguyen");
      await screen.findByRole("listbox", { name: /food item/i });
      expect(screen.queryByTestId("restaurant-note")).not.toBeInTheDocument();

      await pickFoodItem(user, "Pho Bo");
      await screen.findByRole("listbox", { name: /drink item/i });
      expect(screen.queryByTestId("restaurant-note")).not.toBeInTheDocument();
    });

    it("turns an https URL in the note into a link that opens in a new tab", async () => {
      const user = userEvent.setup();
      serve({
        ...OPEN_ROUND_FOOD_ONLY,
        foodRestaurant: { ...FOOD_RESTAURANT, note: "Order at https://example.com/menu today" },
      });

      renderRound("1");
      await waitForForm();
      await pickEmployee(user, "An Nguyen");

      const link = await screen.findByRole("link", { name: "https://example.com/menu" });
      expect(link).toHaveAttribute("href", "https://example.com/menu");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("turns a www. URL in the note into an https link", async () => {
      const user = userEvent.setup();
      serve({
        ...OPEN_ROUND_FOOD_ONLY,
        foodRestaurant: { ...FOOD_RESTAURANT, note: "See www.example.com for specials" },
      });

      renderRound("1");
      await waitForForm();
      await pickEmployee(user, "An Nguyen");

      const link = await screen.findByRole("link", { name: "www.example.com" });
      expect(link).toHaveAttribute("href", "https://www.example.com");
    });

    it("does not link plain text or javascript: URLs", async () => {
      const user = userEvent.setup();
      serve({
        ...OPEN_ROUND_FOOD_ONLY,
        foodRestaurant: { ...FOOD_RESTAURANT, note: "Cash only, javascript:alert(1)" },
      });

      renderRound("1");
      await waitForForm();
      await pickEmployee(user, "An Nguyen");

      expect(await screen.findByText(/Cash only/)).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("shows no note on a closed round", async () => {
      serve({
        label: "Week 1",
        deadline: "2000-01-01T00:00:00.000Z",
        status: "closed",
        foodRestaurant: { ...FOOD_RESTAURANT, note: "Cash only" },
      });

      renderRound("1");

      await screen.findByText("This round is closed.");
      expect(screen.queryByText("Cash only")).not.toBeInTheDocument();
    });
  });

  describe("menu reference", () => {
    it("shows an 'Open menu' link on the food step when the food restaurant has a menuUrl", async () => {
      const user = userEvent.setup();
      serve({
        ...OPEN_ROUND_FOOD_ONLY,
        foodRestaurant: { ...FOOD_RESTAURANT, menuUrl: "example.com/menu" },
      });

      renderRound("1");
      await waitForForm();
      await pickEmployee(user, "An Nguyen");

      const link = await screen.findByRole("link", { name: "Open menu ↗" });
      expect(link).toHaveAttribute("href", "https://example.com/menu");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("shows no menu link or image for a restaurant with neither set", async () => {
      const user = userEvent.setup();
      serve(OPEN_ROUND_FOOD_ONLY);

      renderRound("1");
      await waitForForm();
      await pickEmployee(user, "An Nguyen");
      await screen.findByRole("listbox", { name: /food item/i });

      expect(screen.queryByRole("link", { name: /open menu/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("shows the food menu link on the food step and the drink menu link on the drink step", async () => {
      const user = userEvent.setup();
      serve({
        ...OPEN_ROUND_WITH_DRINK,
        foodRestaurant: { ...FOOD_RESTAURANT, menuUrl: "https://pho24.example.com" },
        drinkRestaurant: { ...DRINK_RESTAURANT, menuUrl: "https://tradacorner.example.com" },
      });

      renderRound("1");
      await waitForForm();
      await pickEmployee(user, "An Nguyen");

      expect(await screen.findByRole("link", { name: "Open menu ↗" })).toHaveAttribute(
        "href",
        "https://pho24.example.com",
      );

      await pickFoodItem(user, "Pho Bo");

      await waitFor(() => {
        expect(screen.getByRole("link", { name: "Open menu ↗" })).toHaveAttribute(
          "href",
          "https://tradacorner.example.com",
        );
      });
    });

    it("renders the restaurant's menu image both inline and in the desktop side panel", async () => {
      const user = userEvent.setup();
      serve({
        ...OPEN_ROUND_FOOD_ONLY,
        foodRestaurant: { ...FOOD_RESTAURANT, menuImage: "abc123" },
      });

      renderRound("1");
      await waitForForm();
      await pickEmployee(user, "An Nguyen");

      await waitFor(() => {
        expect(screen.getAllByAltText("Pho 24 menu")).toHaveLength(2);
      });
      for (const img of screen.getAllByAltText("Pho 24 menu")) {
        expect(img).toHaveAttribute("src", "/api/restaurants/1/menu-image?v=abc123");
      }
      expect(screen.getByText("Menu Pho 24")).toBeInTheDocument();
    });

    it("opens a larger view of the panel image via the expand button, closable with the close button", async () => {
      const user = userEvent.setup();
      server.use(
        http.get("/api/rounds/1/public", () =>
          HttpResponse.json({
            ...OPEN_ROUND_FOOD_ONLY,
            foodRestaurant: { ...FOOD_RESTAURANT, menuImage: "abc123" },
          }),
        ),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
      );

      renderRound("1");
      await screen.findAllByAltText("Pho 24 menu");

      // Only the desktop side-panel copy gets an expand button, not the
      // mobile inline copy — so there's exactly one, not two.
      const expandButton = screen.getByRole("button", { name: "View full size" });
      await user.click(expandButton);

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("closes the expanded image dialog on Escape", async () => {
      const user = userEvent.setup();
      server.use(
        http.get("/api/rounds/1/public", () =>
          HttpResponse.json({
            ...OPEN_ROUND_FOOD_ONLY,
            foodRestaurant: { ...FOOD_RESTAURANT, menuImage: "abc123" },
          }),
        ),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
      );

      renderRound("1");
      await user.click(await screen.findByRole("button", { name: "View full size" }));
      await screen.findByRole("dialog");

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("does not render any menu link or image on a closed round even when the restaurant has both", async () => {
      server.use(
        http.get("/api/rounds/1/public", () =>
          HttpResponse.json({
            label: "Week 1",
            deadline: "2000-01-01T00:00:00.000Z",
            status: "closed",
            foodItems: [],
            foodRestaurant: {
              ...FOOD_RESTAURANT,
              menuUrl: "https://pho24.example.com",
              menuImage: "abc123",
            },
          }),
        ),
      );

      renderRound("1");

      await screen.findByText("This round is closed.");
      expect(screen.queryByRole("link", { name: /open menu/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });
  });

  describe("no submissions list or edit affordance", () => {
    it("renders no submissions table or Edit action on the public page", async () => {
      serve(OPEN_ROUND_FOOD_ONLY);

      renderRound("1");

      await screen.findByText("Who's ordering?");
      expect(screen.queryByText("No submissions yet.")).not.toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit submission" })).not.toBeInTheDocument();
    });
  });

  describe("confirm-overwrite dialog on resubmission", () => {
    it("shows a confirm dialog with the existing submission's details instead of submitting immediately", async () => {
      const user = userEvent.setup();
      let posted = false;
      let lookupRequested = false;
      server.use(
        http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_WITH_DRINK)),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get("employeeId") === "1") {
            lookupRequested = true;
            return HttpResponse.json([
              {
                id: 5,
                employeeName: "An Nguyen",
                foodName: "Pho Bo",
                foodNote: "No cilantro",
                drinkName: null,
                drinkNote: null,
                foodRoundMenuItemId: 10,
                drinkRoundMenuItemId: null,
              },
            ]);
          }
          return HttpResponse.json([]);
        }),
        http.post("/api/rounds/1/submissions", () => {
          posted = true;
          return HttpResponse.json({ id: 1 });
        }),
      );

      renderRound("1");
      await waitForForm();

      await pickEmployee(user, "An Nguyen");
      await pickFoodItem(user, "Pho Bo");
      // Wait for the background per-employee lookup to actually resolve
      // before submitting -- otherwise this test would pass or fail
      // depending on timing, not on the dialog logic itself.
      await waitFor(() => expect(lookupRequested).toBe(true));
      await submitOrder(user);

      const dialog = await screen.findByRole("alertdialog");
      expect(
        within(dialog).getByText("You already have a submission for this round"),
      ).toBeInTheDocument();
      expect(within(dialog).getByText(/Pho Bo/)).toBeInTheDocument();
      expect(within(dialog).getByText(/No cilantro/)).toBeInTheDocument();
      expect(posted).toBe(false);
    });

    it("tells a returning employee on the review step that their order will be replaced", async () => {
      const user = userEvent.setup();
      let lookupRequested = false;
      server.use(
        http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get("employeeId") === "1") {
            lookupRequested = true;
            return HttpResponse.json([
              {
                id: 5,
                employeeName: "An Nguyen",
                foodName: "Pho Bo",
                foodNote: null,
                drinkName: null,
                drinkNote: null,
                foodRoundMenuItemId: 10,
                drinkRoundMenuItemId: null,
              },
            ]);
          }
          return HttpResponse.json([]);
        }),
      );

      renderRound("1");
      await waitForForm();

      await pickEmployee(user, "An Nguyen");
      await pickFoodItem(user, "Pho Bo");
      await waitFor(() => expect(lookupRequested).toBe(true));

      expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
    });

    it("submits the form's current values on 'Submit anyway'", async () => {
      const user = userEvent.setup();
      let submittedBody: unknown = null;
      let lookupRequested = false;
      server.use(
        http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get("employeeId") === "1") {
            lookupRequested = true;
            return HttpResponse.json([
              {
                id: 5,
                employeeName: "An Nguyen",
                foodName: "Banh Mi",
                foodNote: null,
                drinkName: null,
                drinkNote: null,
                foodRoundMenuItemId: 99,
                drinkRoundMenuItemId: null,
              },
            ]);
          }
          return HttpResponse.json([]);
        }),
        http.post("/api/rounds/1/submissions", async ({ request }) => {
          submittedBody = await request.json();
          return HttpResponse.json({ id: 1 });
        }),
      );

      renderRound("1");
      await waitForForm();

      await pickEmployee(user, "An Nguyen");
      await pickFoodItem(user, "Pho Bo");
      await waitFor(() => expect(lookupRequested).toBe(true));
      await submitOrder(user);
      await screen.findByText("You already have a submission for this round");
      await user.click(screen.getByRole("button", { name: "Submit anyway" }));

      expect(
        await screen.findByText("Thanks! Your order has been recorded."),
      ).toBeInTheDocument();
      expect(submittedBody).toEqual({
        employeeId: 1,
        foodRoundMenuItemId: 10,
      });
    });

    it("'Cancel' closes the dialog, sends no request, and keeps the entered values", async () => {
      const user = userEvent.setup();
      let posted = false;
      let lookupRequested = false;
      server.use(
        http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get("employeeId") === "1") {
            lookupRequested = true;
            return HttpResponse.json([
              {
                id: 5,
                employeeName: "An Nguyen",
                foodName: "Pho Bo",
                foodNote: null,
                drinkName: null,
                drinkNote: null,
                foodRoundMenuItemId: 10,
                drinkRoundMenuItemId: null,
              },
            ]);
          }
          return HttpResponse.json([]);
        }),
        http.post("/api/rounds/1/submissions", () => {
          posted = true;
          return HttpResponse.json({ id: 1 });
        }),
      );

      renderRound("1");
      await waitForForm();

      await pickEmployee(user, "An Nguyen");
      await user.click(await screen.findByRole("option", { name: "Pho Bo" }));
      await user.type(screen.getByLabelText("Food note", { exact: false }), "Extra spicy");
      await user.click(screen.getByRole("button", { name: /continue/i }));
      await waitFor(() => expect(lookupRequested).toBe(true));
      await user.click(await screen.findByRole("button", { name: "Submit order" }));
      await screen.findByText("You already have a submission for this round");

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => {
        expect(
          screen.queryByText("You already have a submission for this round"),
        ).not.toBeInTheDocument();
      });
      expect(posted).toBe(false);
      // The note is still held in state and shown in the order summary.
      expect(screen.getByText("Extra spicy")).toBeInTheDocument();
    });
  });
});
