-- Playback metadata on queue items: without a Spotify URI there is no way to
-- tell the player which track to start.
ALTER TABLE "queue_items" ADD COLUMN IF NOT EXISTS "spotify_uri" text;--> statement-breakpoint
ALTER TABLE "queue_items" ADD COLUMN IF NOT EXISTS "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "queue_items" ADD COLUMN IF NOT EXISTS "played_at" timestamp;--> statement-breakpoint

-- upvotes_count is read on every queue render; make it non-null so the UI never
-- has to handle a null vote total.
UPDATE "queue_items" SET "upvotes_count" = 0 WHERE "upvotes_count" IS NULL;--> statement-breakpoint
ALTER TABLE "queue_items" ALTER COLUMN "upvotes_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "queue_items" ALTER COLUMN "upvotes_count" SET NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "queue_items_room_order_idx" ON "queue_items" ("room_id", "created_at");--> statement-breakpoint

-- One vote per user per track, enforced by the database rather than by trust in
-- the client.
CREATE TABLE IF NOT EXISTS "queue_upvotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"queue_item_id" integer NOT NULL REFERENCES "queue_items"("id") ON DELETE CASCADE,
	"uid" text NOT NULL REFERENCES "users"("uid"),
	"created_at" timestamp DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "queue_upvotes_item_uid_idx" ON "queue_upvotes" ("queue_item_id", "uid");--> statement-breakpoint

-- Live presence, so active_listeners_count stops being a static seed value.
CREATE TABLE IF NOT EXISTS "room_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL REFERENCES "jam_rooms"("id") ON DELETE CASCADE,
	"uid" text NOT NULL REFERENCES "users"("uid"),
	"joined_at" timestamp DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "room_members_room_uid_idx" ON "room_members" ("room_id", "uid");--> statement-breakpoint

-- Presence is per-process state; a restart should not leave phantom listeners.
DELETE FROM "room_members";--> statement-breakpoint
UPDATE "jam_rooms" SET "active_listeners_count" = 0;
