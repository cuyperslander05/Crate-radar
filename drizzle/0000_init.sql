CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"display_name" text,
	"avatar_url" text,
	"bio" text,
	"sync_rate" integer DEFAULT 100,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jam_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_title" text NOT NULL,
	"host_uid" text NOT NULL REFERENCES "users"("uid"),
	"active_listeners_count" integer DEFAULT 0,
	"status" text DEFAULT 'active',
	"current_track_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL REFERENCES "jam_rooms"("id"),
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album_art_url" text,
	"added_by_uid" text NOT NULL REFERENCES "users"("uid"),
	"upvotes_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
