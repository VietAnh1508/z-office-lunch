ALTER TABLE "restaurants" RENAME COLUMN "menu_source_note" TO "note";--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "menu_url" text;