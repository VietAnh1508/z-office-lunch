import { TEST_DATABASE_URL } from "db/testing";
import type { Bindings } from "../bindings";

export const testEnv = {
  ASSETS: {} as unknown,
  HYPERDRIVE: { connectionString: TEST_DATABASE_URL } as unknown,
  MENU_IMAGES: {} as unknown,
} as unknown as Bindings;

export const unreachableEnv = {
  ASSETS: {} as unknown,
  HYPERDRIVE: { connectionString: "postgres://postgres:postgres@localhost:1/nonexistent" } as unknown,
  MENU_IMAGES: {} as unknown,
} as unknown as Bindings;
