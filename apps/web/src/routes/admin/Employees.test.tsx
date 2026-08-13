import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";
import { Employees } from "./Employees";

function renderEmployees() {
  return renderWithProviders(
    <MemoryRouter>
      <Employees />
    </MemoryRouter>,
  );
}

describe("Employees", () => {
  it("renders employees from the API", async () => {
    server.use(
      http.get("/api/employees", () =>
        HttpResponse.json([{ id: 1, fullName: "Jane Doe", active: true }]),
      ),
    );

    renderEmployees();

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
  });

  it("adds an employee via the create form without a page reload", async () => {
    const user = userEvent.setup();
    let employees: Array<{ id: number; fullName: string; active: boolean }> = [];

    server.use(
      http.get("/api/employees", () => HttpResponse.json(employees)),
      http.post("/api/employees", async ({ request }) => {
        const body = (await request.json()) as { fullName: string };
        const created = { id: 1, fullName: body.fullName, active: true };
        employees = [...employees, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    renderEmployees();

    await screen.findByText("No employees yet.");

    await user.type(screen.getByLabelText("Full name", { exact: false }), "Jane Doe");
    await user.click(screen.getByRole("button", { name: "Add employee" }));

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });
    expect(await screen.findByText("Employee added")).toBeInTheDocument();
  });

  it("shows an inline error and does not submit when Full name is empty", async () => {
    const user = userEvent.setup();
    let postCount = 0;

    server.use(
      http.get("/api/employees", () => HttpResponse.json([])),
      http.post("/api/employees", () => {
        postCount += 1;
        return HttpResponse.json({ id: 1, fullName: "Jane Doe", active: true }, { status: 201 });
      }),
    );

    renderEmployees();

    await screen.findByText("No employees yet.");

    await user.click(screen.getByRole("button", { name: "Add employee" }));

    expect(await screen.findByText("Full name is required.")).toBeInTheDocument();
    expect(postCount).toBe(0);
  });

  it("shows the API's error message as a toast when creating an employee fails with a known error", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/employees", () => HttpResponse.json([])),
      http.post("/api/employees", () =>
        HttpResponse.json({ error: "Full name already exists" }, { status: 409 }),
      ),
    );

    renderEmployees();

    await screen.findByText("No employees yet.");

    await user.type(screen.getByLabelText("Full name", { exact: false }), "Jane Doe");
    await user.click(screen.getByRole("button", { name: "Add employee" }));

    expect(await screen.findByText("Full name already exists")).toBeInTheDocument();
  });

  it("shows a fallback error toast when creating an employee fails with a network error", async () => {
    const user = userEvent.setup();

    server.use(
      http.get("/api/employees", () => HttpResponse.json([])),
      http.post("/api/employees", () => HttpResponse.error()),
    );

    renderEmployees();

    await screen.findByText("No employees yet.");

    await user.type(screen.getByLabelText("Full name", { exact: false }), "Jane Doe");
    await user.click(screen.getByRole("button", { name: "Add employee" }));

    expect(await screen.findByText("Could not create employee.")).toBeInTheDocument();
  });

  it("toggles an employee's active state", async () => {
    const user = userEvent.setup();
    let employee = { id: 1, fullName: "Jane Doe", active: true };

    server.use(
      http.get("/api/employees", () => HttpResponse.json([employee])),
      http.patch("/api/employees/1", () => {
        employee = { ...employee, active: !employee.active };
        return HttpResponse.json(employee);
      }),
    );

    renderEmployees();

    await screen.findByText("Jane Doe");
    expect(screen.getByText("Jane Doe")).not.toHaveClass("line-through");

    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByRole("button", { name: "Activate" })).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toHaveClass("line-through");
    expect(await screen.findByText("Employee deactivated")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Activate" }));

    expect(await screen.findByRole("button", { name: "Deactivate" })).toBeInTheDocument();
    expect(await screen.findByText("Employee activated")).toBeInTheDocument();
  });

  it("shows a fallback error toast when toggling an employee's active state fails with a network error", async () => {
    const user = userEvent.setup();
    const employee = { id: 1, fullName: "Jane Doe", active: true };

    server.use(
      http.get("/api/employees", () => HttpResponse.json([employee])),
      http.patch("/api/employees/1", () => HttpResponse.error()),
    );

    renderEmployees();

    await screen.findByText("Jane Doe");

    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Could not update employee.")).toBeInTheDocument();
  });

  it("clicking the edit icon shows an input pre-filled with the current name", async () => {
    const user = userEvent.setup();
    const employee = { id: 1, fullName: "Jane Doe", active: true };

    server.use(http.get("/api/employees", () => HttpResponse.json([employee])));

    renderEmployees();

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: "Edit name" }));

    expect(screen.getByDisplayValue("Jane Doe")).toBeInTheDocument();
  });

  it("saves a new name, updates the list, and returns to display mode", async () => {
    const user = userEvent.setup();
    let employee = { id: 1, fullName: "Jane Doe", active: true };

    server.use(
      http.get("/api/employees", () => HttpResponse.json([employee])),
      http.patch("/api/employees/1/name", async ({ request }) => {
        const body = (await request.json()) as { fullName: string };
        employee = { ...employee, fullName: body.fullName };
        return HttpResponse.json(employee);
      }),
    );

    renderEmployees();

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: "Edit name" }));

    const input = screen.getByDisplayValue("Jane Doe");
    await user.clear(input);
    await user.type(input, "Jane Smith");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Jane Smith")).toBeInTheDocument();
    expect(await screen.findByText("Employee updated")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("shows an inline error and sends no request when saving a blank name", async () => {
    const user = userEvent.setup();
    const employee = { id: 1, fullName: "Jane Doe", active: true };
    let patchCount = 0;

    server.use(
      http.get("/api/employees", () => HttpResponse.json([employee])),
      http.patch("/api/employees/1/name", () => {
        patchCount += 1;
        return HttpResponse.json(employee);
      }),
    );

    renderEmployees();

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: "Edit name" }));

    const input = screen.getByDisplayValue("Jane Doe");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Full name is required.")).toBeInTheDocument();
    expect(patchCount).toBe(0);
  });

  it("cancelling reverts to display mode with the original name and sends no request", async () => {
    const user = userEvent.setup();
    const employee = { id: 1, fullName: "Jane Doe", active: true };
    let patchCount = 0;

    server.use(
      http.get("/api/employees", () => HttpResponse.json([employee])),
      http.patch("/api/employees/1/name", () => {
        patchCount += 1;
        return HttpResponse.json(employee);
      }),
    );

    renderEmployees();

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: "Edit name" }));

    const input = screen.getByDisplayValue("Jane Doe");
    await user.clear(input);
    await user.type(input, "Something Else");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(patchCount).toBe(0);
  });

  it("shows an error toast and stays in edit mode when saving fails", async () => {
    const user = userEvent.setup();
    const employee = { id: 1, fullName: "Jane Doe", active: true };

    server.use(
      http.get("/api/employees", () => HttpResponse.json([employee])),
      http.patch("/api/employees/1/name", () => HttpResponse.error()),
    );

    renderEmployees();

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: "Edit name" }));

    const input = screen.getByDisplayValue("Jane Doe");
    await user.clear(input);
    await user.type(input, "Jane Smith");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Could not update employee.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Jane Smith")).toBeInTheDocument();
  });
});
