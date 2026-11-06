CREATE TABLE "size_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"preset_id" integer NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "size_options_preset_id_label_unique" UNIQUE("preset_id","label")
);
--> statement-breakpoint
CREATE TABLE "size_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "size_presets_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "size_options" ADD CONSTRAINT "size_options_preset_id_size_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."size_presets"("id") ON DELETE cascade ON UPDATE no action;