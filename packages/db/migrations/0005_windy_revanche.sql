ALTER TABLE "submissions" DROP CONSTRAINT "submissions_food_round_menu_item_id_round_menu_items_id_fk";
--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_drink_round_menu_item_id_round_menu_items_id_fk";
--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "food_round_menu_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_food_round_menu_item_id_round_menu_items_id_fk" FOREIGN KEY ("food_round_menu_item_id") REFERENCES "public"."round_menu_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_drink_round_menu_item_id_round_menu_items_id_fk" FOREIGN KEY ("drink_round_menu_item_id") REFERENCES "public"."round_menu_items"("id") ON DELETE set null ON UPDATE no action;