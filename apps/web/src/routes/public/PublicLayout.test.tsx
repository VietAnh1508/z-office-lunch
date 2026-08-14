import { screen } from "@testing-library/react";
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

describe("PublicLayout", () => {
  it("shows the app brand link on the public rounds homepage", async () => {
    server.use(http.get("/api/rounds/public", () => HttpResponse.json([])));

    renderApp("/");

    expect(await screen.findByRole("link", { name: "Office Lunch" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows the app brand link on a public round page", async () => {
    server.use(
      http.get("/api/rounds/1/public", () =>
        HttpResponse.json({ error: "round not found" }, { status: 404 }),
      ),
    );

    renderApp("/r/1");

    expect(await screen.findByRole("link", { name: "Office Lunch" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("does not render a nav menu on public pages", async () => {
    server.use(http.get("/api/rounds/public", () => HttpResponse.json([])));

    renderApp("/");

    await screen.findByRole("link", { name: "Office Lunch" });
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
