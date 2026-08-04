import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const restaurantType = pgEnum("restaurant_type", ["food", "drink"]);
export const roundStatus = pgEnum("round_status", ["draft", "open", "closed"]);

export const restaurants = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: restaurantType("type").notNull(),
  contactInfo: text("contact_info"),
  menuSourceNote: text("menu_source_note"),
});

export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id")
    .notNull()
    .references(() => restaurants.id),
  name: text("name").notNull(),
  price: numeric("price"),
  imageR2Key: text("image_r2_key"),
  active: boolean("active").notNull().default(true),
});

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  active: boolean("active").notNull().default(true),
});

export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  foodRestaurantId: integer("food_restaurant_id")
    .notNull()
    .references(() => restaurants.id),
  drinkRestaurantId: integer("drink_restaurant_id").references(() => restaurants.id),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  status: roundStatus("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roundMenuItems = pgTable(
  "round_menu_items",
  {
    id: serial("id").primaryKey(),
    roundId: integer("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    menuItemId: integer("menu_item_id")
      .notNull()
      .references(() => menuItems.id),
  },
  (table) => [unique().on(table.roundId, table.menuItemId)],
);

export const submissions = pgTable(
  "submissions",
  {
    id: serial("id").primaryKey(),
    roundId: integer("round_id")
      .notNull()
      .references(() => rounds.id),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id),
    foodRoundMenuItemId: integer("food_round_menu_item_id")
      .notNull()
      .references(() => roundMenuItems.id),
    foodNote: text("food_note"),
    drinkRoundMenuItemId: integer("drink_round_menu_item_id").references(
      () => roundMenuItems.id,
    ),
    drinkNote: text("drink_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.roundId, table.employeeId)],
);
