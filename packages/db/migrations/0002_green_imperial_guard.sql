ALTER TABLE "round_menu_items" DROP CONSTRAINT "round_menu_items_round_id_rounds_id_fk";
--> statement-breakpoint
ALTER TABLE "round_menu_items" ADD CONSTRAINT "round_menu_items_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;