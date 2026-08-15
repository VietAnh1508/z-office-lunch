import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { Round } from "./Round";

const OPEN_ROUND_WITH_DRINK = {
  label: "Week 1",
  deadline: "2999-01-01T00:00:00.000Z",
  status: "open",
  foodItems: [{ id: 10, name: "Pho Bo" }],
  drinkItems: [{ id: 20, name: "Tra Da" }],
};

const OPEN_ROUND_FOOD_ONLY = {
  label: "Week 1",
  deadline: "2999-01-01T00:00:00.000Z",
  status: "open",
  foodItems: [{ id: 10, name: "Pho Bo" }],
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
      await screen.findByRole("option", { name: "Pho Bo" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Drink item", { exact: false })).not.toBeInTheDocument();
  });

  it("renders a drink item picker when the round has a drinkRestaurantId", async () => {
    server.use(
      http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_WITH_DRINK)),
      http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
      http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
    );

    renderRound("1");

    expect(await screen.findByLabelText("Food item", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("Drink item", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tra Da" })).toBeInTheDocument();
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
    await screen.findByRole("option", { name: "Pho Bo" });

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
    await screen.findByRole("option", { name: "Pho Bo" });

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
    await screen.findByRole("option", { name: "Pho Bo" });

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
    await screen.findByRole("option", { name: "Pho Bo" });

    await pickEmployee(user, "An Nguyen");
    await user.selectOptions(screen.getByLabelText("Food item", { exact: false }), "10");
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
    await screen.findByRole("option", { name: "Pho Bo" });

    await pickEmployee(user, "An Nguyen");
    await user.selectOptions(screen.getByLabelText("Food item", { exact: false }), "10");
    await user.selectOptions(screen.getByLabelText("Drink item", { exact: false }), "20");
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

  it("shows the API's error message as a toast on a duplicate submission", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
      http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
      http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
      http.post("/api/rounds/1/submissions", () =>
        HttpResponse.json({ error: "you have already submitted for this round" }, { status: 409 }),
      ),
    );

    renderRound("1");
    await screen.findByRole("option", { name: "Pho Bo" });

    await pickEmployee(user, "An Nguyen");
    await user.selectOptions(screen.getByLabelText("Food item", { exact: false }), "10");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(
      await screen.findByText("you have already submitted for this round"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Thanks! Your order has been recorded."),
    ).not.toBeInTheDocument();
  });

  describe("submissions list", () => {
    it("renders existing submissions in a table alongside the form", async () => {
      server.use(
        http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", () =>
          HttpResponse.json([
            {
              id: 1,
              employeeName: "An Nguyen",
              foodName: "Pho Bo",
              foodNote: null,
              drinkName: null,
              drinkNote: null,
            },
          ]),
        ),
      );

      renderRound("1");

      expect(await screen.findByText("An Nguyen")).toBeInTheDocument();
      expect(screen.getByText("Place your order")).toBeInTheDocument();
    });

    it('shows "No submissions yet." alongside the form when there are none', async () => {
      server.use(
        http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", () => HttpResponse.json([])),
      );

      renderRound("1");

      expect(await screen.findByText("No submissions yet.")).toBeInTheDocument();
      expect(screen.getByText("Place your order")).toBeInTheDocument();
    });

    it("refetches the list after a successful submit, with no page reload", async () => {
      const user = userEvent.setup();
      let submissionsCallCount = 0;
      server.use(
        http.get("/api/rounds/1/public", () => HttpResponse.json(OPEN_ROUND_FOOD_ONLY)),
        http.get("/api/employees", () => HttpResponse.json(EMPLOYEES)),
        http.get("/api/rounds/1/submissions", () => {
          submissionsCallCount += 1;
          if (submissionsCallCount === 1) {
            return HttpResponse.json([]);
          }
          return HttpResponse.json([
            {
              id: 1,
              employeeName: "An Nguyen",
              foodName: "Pho Bo",
              foodNote: null,
              drinkName: null,
              drinkNote: null,
            },
          ]);
        }),
        http.post("/api/rounds/1/submissions", async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ id: 1, roundId: 1, ...body }, { status: 201 });
        }),
      );

      renderRound("1");
      await screen.findByText("No submissions yet.");

      await pickEmployee(user, "An Nguyen");
      await user.selectOptions(screen.getByLabelText("Food item", { exact: false }), "10");
      await user.click(screen.getByRole("button", { name: "Submit" }));

      expect(
        await screen.findByText("Thanks! Your order has been recorded."),
      ).toBeInTheDocument();
      expect(await screen.findByText("An Nguyen")).toBeInTheDocument();
    });
  });
});
