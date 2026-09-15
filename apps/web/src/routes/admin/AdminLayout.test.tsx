import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/mocks/server";

const TEST_PASSWORD = "let-me-in";

function renderApp(initialEntry: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
}

function unlock() {
  sessionStorage.setItem("admin-unlocked", "true");
}

describe("AdminLayout", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubEnv("VITE_ADMIN_PASSWORD", TEST_PASSWORD);
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllEnvs();
  });

  it("shows a password prompt instead of admin content when locked", () => {
    renderApp("/admin");

    expect(
      screen.getByRole("heading", { name: "Admin" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("gates a nested admin route directly, not just /admin", () => {
    renderApp("/admin/restaurants");

    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add restaurant" })).not.toBeInTheDocument();
  });

  it("shows an inline field error on empty submit and stays locked", async () => {
    const user = userEvent.setup();
    renderApp("/admin");

    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("shows a toast and stays locked on a wrong password", async () => {
    const user = userEvent.setup();
    renderApp("/admin");

    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByText("Incorrect password.")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("unlocks and shows admin content on the correct password", async () => {
    const user = userEvent.setup();
    renderApp("/admin");

    await user.type(screen.getByLabelText("Password"), TEST_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    expect(await screen.findByRole("heading", { name: "Admin" })).toBeInTheDocument();
    expect(sessionStorage.getItem("admin-unlocked")).toBe("true");
  });

  it("shows the Admin overview heading at /admin when already unlocked", () => {
    unlock();
    renderApp("/admin");

    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
  });

  it("renders the section links inside a nav landmark", () => {
    unlock();
    renderApp("/admin");

    const nav = within(screen.getByRole("navigation"));
    expect(nav.getByRole("link", { name: "Restaurants" })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Employees" })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Rounds" })).toBeInTheDocument();
  });

  it("navigates to each admin section via the nav links", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/restaurants", () => HttpResponse.json([])),
      http.get("/api/employees", () => HttpResponse.json([])),
    );

    unlock();
    renderApp("/admin");
    const nav = within(screen.getByRole("navigation"));

    await user.click(nav.getByRole("link", { name: "Restaurants" }));
    expect(await screen.findByText("No restaurants yet.")).toBeInTheDocument();

    await user.click(nav.getByRole("link", { name: "Employees" }));
    expect(await screen.findByText("No employees yet.")).toBeInTheDocument();

    await user.click(nav.getByRole("link", { name: "Rounds" }));
    expect(screen.getByRole("heading", { name: "Rounds" })).toBeInTheDocument();
  });

  it("marks the active nav link with aria-current", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/restaurants", () => HttpResponse.json([])));

    unlock();
    renderApp("/admin");
    const nav = within(screen.getByRole("navigation"));

    await user.click(nav.getByRole("link", { name: "Restaurants" }));

    expect(nav.getByRole("link", { name: "Restaurants" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.getByRole("link", { name: "Employees" })).not.toHaveAttribute("aria-current");
  });
});
