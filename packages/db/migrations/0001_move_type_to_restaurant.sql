ALTER TABLE "menu_items" DROP COLUMN "type";--> statement-breakpoint
DROP TYPE "public"."menu_item_type";--> statement-breakpoint
CREATE TYPE "public"."restaurant_type" AS ENUM('food', 'drink');--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "type" "restaurant_type" DEFAULT 'food' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ALTER COLUMN "type" DROP DEFAULT;
