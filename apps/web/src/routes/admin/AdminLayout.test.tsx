import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import App from "@/App";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";

function renderApp(initialEntry: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
}

describe("AdminLayout", () => {
  it("shows the Admin overview heading at /admin", () => {
    renderApp("/admin");

    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
  });

  it("renders the section links inside a nav landmark", () => {
    renderApp("/admin");

    const nav = screen.getByRole("navigation");
    expect(nav).toContainElement(screen.getByRole("link", { name: "Restaurants" }));
    expect(nav).toContainElement(screen.getByRole("link", { name: "Employees" }));
    expect(nav).toContainElement(screen.getByRole("link", { name: "Rounds" }));
  });

  it("navigates to each admin section via the nav links", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/restaurants", () => HttpResponse.json([])),
      http.get("/api/employees", () => HttpResponse.json([])),
    );

    renderApp("/admin");

    await user.click(screen.getByRole("link", { name: "Restaurants" }));
    expect(await screen.findByText("No restaurants yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Employees" }));
    expect(await screen.findByText("No employees yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Rounds" }));
    expect(screen.getByRole("heading", { name: "Rounds" })).toBeInTheDocument();
  });

  it("marks the active nav link with aria-current", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/restaurants", () => HttpResponse.json([])));

    renderApp("/admin");

    await user.click(screen.getByRole("link", { name: "Restaurants" }));

    expect(screen.getByRole("link", { name: "Restaurants" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Employees" })).not.toHaveAttribute("aria-current");
  });
});
