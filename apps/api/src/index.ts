import { Hono } from "hono";
import { Client } from "pg";
import type { Bindings } from "./bindings";
import { employeesRoute } from "./routes/employees";
import { menuItemsRoute } from "./routes/menu-items";
import { restaurantsRoute } from "./routes/restaurants";
import { roundsRoute } from "./routes/rounds";

const app = new Hono<{ Bindings: Bindings }>();

app.route("/api/restaurants", restaurantsRoute);
app.route("/api/restaurants", menuItemsRoute);
app.route("/api/employees", employeesRoute);
app.route("/api/rounds", roundsRoute);

app.get("/api/health", async (c) => {
  const client = new Client({ connectionString: c.env.HYPERDRIVE.connectionString });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return c.json({ status: "ok", db: "ok" });
  } catch (e) {
    console.error(JSON.stringify({ message: "db health check failed", error: String(e) }));
    return c.json({ status: "ok", db: "error" }, 500);
  } finally {
    c.executionCtx.waitUntil(client.end());
  }
});

export default app;
