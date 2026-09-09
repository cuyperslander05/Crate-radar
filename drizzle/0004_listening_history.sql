-- Listening history, recorded from the now-playing poller so statistics and
-- history accumulate whether or not the user is in a jam room.
CREATE TABLE IF NOT EXISTS "listening_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL REFERENCES "users"("uid") ON DELETE CASCADE,
	"spotify_uri" text NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album_art_url" text,
	"duration_ms" integer,
	"device_name" text,
	"played_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listening_history_uid_played_idx" ON "listening_history" ("uid", "played_at");
