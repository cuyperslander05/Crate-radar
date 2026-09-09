import { db, createPool } from './index.ts';
import { users, jamRooms, queueItems, queueUpvotes, roomMembers } from './schema.ts';

/**
 * Demo data for local development.
 *
 * Every track carries a real Spotify URI: without one the queue cannot drive
 * playback, so seeded rooms would look populated but never play.
 */
const DEMO_TRACKS = [
  {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    spotifyUri: 'spotify:track:0VjIjW4GlUZAMYd2vXMi3b',
    durationMs: 200040,
  },
  {
    title: 'Midnight City',
    artist: 'M83',
    spotifyUri: 'spotify:track:6GByuWOLBHkSPGAlPWSCsn',
    durationMs: 243960,
  },
  {
    title: 'As It Was',
    artist: 'Harry Styles',
    spotifyUri: 'spotify:track:4LRPiXqCikLlN15c3yImP7',
    durationMs: 167303,
  },
];

/**
 * Refuses to wipe a database that holds real accounts.
 *
 * Seeding deletes every user, and real rows here are Firebase-linked sign-ins
 * that cannot be recreated. Pass --force to override on a throwaway database.
 */
async function assertSafeToSeed() {
  if (process.argv.includes('--force')) return;

  const existing = await db.select({ uid: users.uid }).from(users);
  const real = existing.filter((u) => !u.uid.startsWith('demo_uid_'));
  if (real.length === 0) return;

  throw new Error(
    `Refusing to seed: ${real.length} real user account(s) exist and seeding deletes all users.\n` +
      'Re-run with "npm run db:seed -- --force" only if this database is disposable.'
  );
}

async function seed() {
  await assertSafeToSeed();
  console.log('Clearing existing data…');
  // Delete in dependency order so the foreign keys stay satisfied.
  await db.delete(queueUpvotes);
  await db.delete(roomMembers);
  await db.delete(queueItems);
  await db.delete(jamRooms);
  await db.delete(users);

  console.log('Seeding…');
  const [host] = await db
    .insert(users)
    .values({
      uid: 'demo_uid_1',
      email: 'sarah@example.com',
      username: 'sarah_m',
      displayName: 'Sarah',
      bio: 'Music lover',
      hasCompletedOnboarding: true,
    })
    .returning();

  const [guest] = await db
    .insert(users)
    .values({
      uid: 'demo_uid_2',
      email: 'mike@example.com',
      username: 'mike_beats',
      displayName: 'Mike',
      bio: 'Producer',
      hasCompletedOnboarding: true,
    })
    .returning();

  const [room] = await db
    .insert(jamRooms)
    .values({
      roomTitle: 'Indie Session',
      hostUid: host.uid,
      // Presence is live state; a seeded number would immediately be wrong.
      activeListenersCount: 0,
      status: 'active',
    })
    .returning();

  const inserted = await db
    .insert(queueItems)
    .values(
      DEMO_TRACKS.map((track, i) => ({
        ...track,
        roomId: room.id,
        addedByUid: i % 2 === 0 ? host.uid : guest.uid,
        upvotesCount: 0,
      }))
    )
    .returning();

  // Point the room at its first track so playback has somewhere to start.
  await db.update(jamRooms).set({ currentTrackId: inserted[0].id });

  console.log(`Done: 2 users, 1 room, ${inserted.length} tracks.`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await createPool().end();
  });
