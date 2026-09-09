ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "spotify_access_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "spotify_refresh_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "spotify_token_expires_at" timestamp;
