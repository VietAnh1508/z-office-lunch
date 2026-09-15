import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { Round } from "./Round";

const FOOD_RESTAURANT = { id: 1, name: "Pho 24", menuUrl: null, menuImage: null };
const DRINK_RESTAURANT = { id: 2, name: "Tra Da Corner", menuUrl: null, menuImage: null };

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

async function pickEmployee(user: ReturnType<typeof userEvent.setup>, name: string) {
  const input = screen.getByRole("combobox", { name: /your name/i });
  await user.type(input, name);
  await user.click(await screen.findByRole("option", { name }));
}

async function pickFoodItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  const input = screen.getByRole("combobox", { name: /food item/i });
  await user.type(input, name);
  await user.click(await screen.findByRole("option", { name }));
}

async function pickDrinkItem(user: ReturnType<typeof userEvent.setup>, name: string) {
  const input = screen.getByRole("combobox", { name: /drink item/i });
  await user.type(input, name);
  await user.click(await screen.findByRole("option", { name }));
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

  it("renders a food item picker for an open round before the deadline, with no drink field", async () => {
    server.use(
      http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
      http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
      http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
    );

    renderRound("1");

    expect(
      await screen.findByRole("combobox", { name: /food item/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Drink item", { exact: false })).not.toBeInTheDocument();
  });

  it("renders a drink item picker when the round has a drinkRestaurantId", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_WITH_DRINK)),
      http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
      http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
    );

    renderRound("1");

    expect(await screen.findByLabelText("Food item", { exact: false })).toBeInTheDocument();
    const drinkInput = screen.getByLabelText("Drink item", { exact: false });
    expect(drinkInput).toBeInTheDocument();
    await user.click(drinkInput);
    expect(await screen.findByRole("option", { name: "Tra Da" })).toBeInTheDocument();
  });

  it("filters the employee combobox as the user types and selects on click", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
      http.get("/api/employees", () =>
        HttpResponse.json([...EMPLOYEES, { id: 2, fullName: "Binh Tran" }]),
      ),
      http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
    );

    renderRound("1");
    await screen.findByRole("combobox", { name: /food item/i });

    const input = screen.getByRole("combobox", { name: /your name/i });
    await user.type(input, "An N");

    expect(screen.getByRole("option", { name: "An Nguyen" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Binh Tran" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "An Nguyen" }));

    expect(input).toHaveValue("An Nguyen");
  });

  it("closes the employee dropdown when focus moves away without a selection", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
      http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
      http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
    );

    renderRound("1");
    await screen.findByRole("combobox", { name: /food item/i });

    const input = screen.getByRole("combobox", { name: /your name/i });
    await user.type(input, "An");
    expect(screen.getByRole("option", { name: "An Nguyen" })).toBeInTheDocument();

    // Moving focus to the food select without picking an option must close
    // the listbox — otherwise its absolutely-positioned options sit on top
    // of the field the user actually meant to click.
    await user.click(screen.getByLabelText("Food item", { exact: false }));

    expect(screen.queryByRole("option", { name: "An Nguyen" })).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("shows inline validation errors and sends no request when required fields are missing", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
      http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
      http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
    );

    renderRound("1");
    await screen.findByRole("combobox", { name: /food item/i });

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Please select your name.")).toBeInTheDocument();
    expect(screen.getByText("Please select a food item.")).toBeInTheDocument();
  });

  it("submits the food-only pick and shows a success state", async () => {
    const user = userEvent.setup();
    let submittedBody: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
      http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
      http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
      http.post("/api/rounds/1/submissions", async ({ request }) => {
        submittedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1, roundId: 1, ...submittedBody }, { status: 201 });
      }),
    );

    renderRound("1");
    await screen.findByRole("combobox", { name: /food item/i });

    await pickEmployee(user, "An Nguyen");
    await pickFoodItem(user, "Pho Bo");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(
      await screen.findByText("Thanks! Your order has been recorded."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(submittedBody).toEqual({ employeeId: 1, foodRoundMenuItemId: 10 });
    });
  });

  it("submits drink pick and note only when a drink item is selected", async () => {
    const user = userEvent.setup();
    let submittedBody: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_WITH_DRINK)),
      http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
      http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
      http.post("/api/rounds/1/submissions", async ({ request }) => {
        submittedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1, roundId: 1, ...submittedBody }, { status: 201 });
      }),
    );

    renderRound("1");
    await screen.findByRole("combobox", { name: /food item/i });

    await pickEmployee(user, "An Nguyen");
    await pickFoodItem(user, "Pho Bo");
    await pickDrinkItem(user, "Tra Da");
    await user.type(screen.getByLabelText("Drink note", { exact: false }), "Less ice");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(submittedBody).toEqual({
        employeeId: 1,
        foodRoundMenuItemId: 10,
        drinkRoundMenuItemId: 20,
        drinkNote: "Less ice",
      });
    });
  });

  it("succeeds when submitting again for the same employee (resubmission)", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
      http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
      http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
      http.post("/api/rounds/1/submissions", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1, roundId: 1, ...body }, { status: 200 });
      }),
    );

    renderRound("1");
    await screen.findByRole("combobox", { name: /food item/i });

    await pickEmployee(user, "An Nguyen");
    await pickFoodItem(user, "Pho Bo");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(
      await screen.findByText("Thanks! Your order has been recorded."),
    ).toBeInTheDocument();
  });

  describe("menu reference", () => {
    it("shows an 'Open menu' link under the food item picker when the food restaurant has a menuUrl", async () => {
      server.use(
        http.get("/api/rounds/1/public", () =>
          HttpResponse.json({
            ...OPEN_ROUND_FOOD_ONLY,
            foodRestaurant: { ...FOOD_RESTAURANT, menuUrl: "example.com/menu" },
          }),
        ),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
      );

      renderRound("1");

      const link = await screen.findByRole("link", { name: "Open menu ↗" });
      expect(link).toHaveAttribute("href", "https://example.com/menu");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("shows no menu link or image for a restaurant with neither set", async () => {
      server.use(
        http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
      );

      renderRound("1");
      await screen.findByRole("combobox", { name: /food item/i });

      expect(screen.queryByRole("link", { name: /open menu/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("shows both food and drink menu links when both restaurants have a menuUrl", async () => {
      server.use(
        http.get("/api/rounds/1/public", () =>
          HttpResponse.json({
            ...OPEN_ROUND_WITH_DRINK,
            foodRestaurant: { ...FOOD_RESTAURANT, menuUrl: "https://pho24.example.com" },
            drinkRestaurant: { ...DRINK_RESTAURANT, menuUrl: "https://tradacorner.example.com" },
          }),
        ),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
      );

      renderRound("1");

      const links = await screen.findAllByRole("link", { name: "Open menu ↗" });
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute("href", "https://pho24.example.com");
      expect(links[1]).toHaveAttribute("href", "https://tradacorner.example.com");
    });

    it("renders the restaurant's menu image both inline and in the desktop side panel", async () => {
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

      const images = await screen.findAllByAltText("Pho 24 menu");
      expect(images).toHaveLength(2);
      for (const img of images) {
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
      server.use(
        http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
      );

      renderRound("1");

      await screen.findByText("Place your order");
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
      await screen.findByRole("combobox", { name: /food item/i });

      await pickEmployee(user, "An Nguyen");
      await pickFoodItem(user, "Pho Bo");
      // Wait for the background per-employee lookup to actually resolve
      // before submitting -- otherwise this test would pass or fail
      // depending on timing, not on the dialog logic itself.
      await waitFor(() => expect(lookupRequested).toBe(true));
      await user.click(screen.getByRole("button", { name: "Submit" }));

      expect(
        await screen.findByText("You already have a submission for this round"),
      ).toBeInTheDocument();
      expect(screen.getByText(/Pho Bo/)).toBeInTheDocument();
      expect(screen.getByText(/No cilantro/)).toBeInTheDocument();
      expect(posted).toBe(false);
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
      await screen.findByRole("combobox", { name: /food item/i });

      await pickEmployee(user, "An Nguyen");
      await pickFoodItem(user, "Pho Bo");
      await waitFor(() => expect(lookupRequested).toBe(true));
      await user.click(screen.getByRole("button", { name: "Submit" }));
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
      await screen.findByRole("combobox", { name: /food item/i });

      await pickEmployee(user, "An Nguyen");
      await pickFoodItem(user, "Pho Bo");
      await user.type(screen.getByLabelText("Food note", { exact: false }), "Extra spicy");
      await waitFor(() => expect(lookupRequested).toBe(true));
      await user.click(screen.getByRole("button", { name: "Submit" }));
      await screen.findByText("You already have a submission for this round");

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => {
        expect(
          screen.queryByText("You already have a submission for this round"),
        ).not.toBeInTheDocument();
      });
      expect(posted).toBe(false);
      expect(screen.getByLabelText("Food note", { exact: false })).toHaveValue("Extra spicy");
    });
  });
});
