CREATE TYPE "public"."menu_item_type" AS ENUM('food', 'drink');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" integer NOT NULL,
	"type" "menu_item_type" NOT NULL,
	"name" text NOT NULL,
	"price" numeric,
	"image_r2_key" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_info" text,
	"menu_source_note" text
);
--> statement-breakpoint
CREATE TABLE "round_menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"menu_item_id" integer NOT NULL,
	CONSTRAINT "round_menu_items_round_id_menu_item_id_unique" UNIQUE("round_id","menu_item_id")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"food_restaurant_id" integer NOT NULL,
	"drink_restaurant_id" integer,
	"deadline" timestamp with time zone NOT NULL,
	"status" "round_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"food_round_menu_item_id" integer NOT NULL,
	"food_note" text,
	"drink_round_menu_item_id" integer,
	"drink_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_round_id_employee_id_unique" UNIQUE("round_id","employee_id")
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_menu_items" ADD CONSTRAINT "round_menu_items_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_menu_items" ADD CONSTRAINT "round_menu_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_food_restaurant_id_restaurants_id_fk" FOREIGN KEY ("food_restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_drink_restaurant_id_restaurants_id_fk" FOREIGN KEY ("drink_restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_food_round_menu_item_id_round_menu_items_id_fk" FOREIGN KEY ("food_round_menu_item_id") REFERENCES "public"."round_menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_drink_round_menu_item_id_round_menu_items_id_fk" FOREIGN KEY ("drink_round_menu_item_id") REFERENCES "public"."round_menu_items"("id") ON DELETE no action ON UPDATE no action;