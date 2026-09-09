import { db } from './index.ts';
import { users, publicUserColumns } from './schema.ts';
import { eq } from 'drizzle-orm';

/**
 * Columns returned to the owner of the profile. Adds the fields a user may see
 * about themselves but nobody else may see — and still excludes the Spotify
 * tokens, which the frontend never needs.
 */
const ownProfileColumns = {
  ...publicUserColumns,
  email: users.email,
  hasCompletedOnboarding: users.hasCompletedOnboarding,
} as const;

interface ProfileInput {
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
}

/**
 * Inserts the user on first sign-in, or refreshes their Firebase-sourced
 * display fields on subsequent ones.
 */
export async function getOrCreateUser(uid: string, email: string, profileData?: ProfileInput) {
  const result = await db
    .insert(users)
    .values({
      uid,
      email,
      username: profileData?.username || `user_${uid.slice(0, 5)}`,
      displayName: profileData?.displayName || 'New User',
      avatarUrl: profileData?.avatarUrl || null,
      bio: profileData?.bio || 'New to Radar.',
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email,
        ...(profileData?.displayName && { displayName: profileData.displayName }),
        ...(profileData?.avatarUrl && { avatarUrl: profileData.avatarUrl }),
      },
    })
    .returning(ownProfileColumns);

  return result[0];
}

export async function completeOnboarding(uid: string) {
  const result = await db
    .update(users)
    .set({ hasCompletedOnboarding: true })
    .where(eq(users.uid, uid))
    .returning(ownProfileColumns);
  return result[0] ?? null;
}

/** Applies a validated set of profile field updates. */
export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<ProfileInput, 'username' | 'displayName' | 'bio'>>
) {
  const result = await db
    .update(users)
    .set(updates)
    .where(eq(users.uid, uid))
    .returning(ownProfileColumns);
  return result[0] ?? null;
}

export async function getUserProfile(uid: string) {
  const result = await db.select(ownProfileColumns).from(users).where(eq(users.uid, uid));
  return result[0] ?? null;
}
