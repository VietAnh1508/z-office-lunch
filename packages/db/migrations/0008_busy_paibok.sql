CREATE TABLE "menu_item_sizes" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_item_id" integer NOT NULL,
	"size_option_id" integer NOT NULL,
	CONSTRAINT "menu_item_sizes_menu_item_id_size_option_id_unique" UNIQUE("menu_item_id","size_option_id")
);
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "size_preset_id" integer;--> statement-breakpoint
ALTER TABLE "menu_item_sizes" ADD CONSTRAINT "menu_item_sizes_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_sizes" ADD CONSTRAINT "menu_item_sizes_size_option_id_size_options_id_fk" FOREIGN KEY ("size_option_id") REFERENCES "public"."size_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_size_preset_id_size_presets_id_fk" FOREIGN KEY ("size_preset_id") REFERENCES "public"."size_presets"("id") ON DELETE set null ON UPDATE no action;