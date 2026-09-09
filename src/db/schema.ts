import { relations, sql } from 'drizzle-orm';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  uid: text('uid').notNull().unique(), // local account id (same as login id)
  email: text('email').notNull(),
  /** bcrypt hash of the password. Empty until the user sets one. */
  passwordHash: text('password_hash'),
  username: text('username'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  syncRate: integer('sync_rate').default(100),
  spotifyAccessToken: text('spotify_access_token'),
  spotifyRefreshToken: text('spotify_refresh_token'),
  spotifyTokenExpiresAt: integer('spotify_token_expires_at', { mode: 'timestamp_ms' }),
  hasCompletedOnboarding: integer('has_completed_onboarding').default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(unixepoch() * 1000)`),
});

export const jamRooms = sqliteTable('jam_rooms', {
  id: integer('id').primaryKey(),
  roomTitle: text('room_title').notNull(),
  hostUid: text('host_uid').references(() => users.uid).notNull(),
  activeListenersCount: integer('active_listeners_count').default(0),
  status: text('status').default('active'),
  currentTrackId: integer('current_track_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(unixepoch() * 1000)`),
});

export const queueItems = sqliteTable(
  'queue_items',
  {
    id: integer('id').primaryKey(),
    roomId: integer('room_id')
      .references(() => jamRooms.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    artist: text('artist').notNull(),
    albumArtUrl: text('album_art_url'),
    /** Spotify track URI ("spotify:track:...") — drives playback. */
    spotifyUri: text('spotify_uri'),
    durationMs: integer('duration_ms'),
    addedByUid: text('added_by_uid')
      .references(() => users.uid)
      .notNull(),
    upvotesCount: integer('upvotes_count').default(0).notNull(),
    /** Set once the track has been played so it drops out of "up next". */
    playedAt: integer('played_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    roomOrderIdx: index('queue_items_room_order_idx').on(table.roomId, table.createdAt),
  })
);

/**
 * One row per (queue item, voter). The unique index is what makes an upvote
 * idempotent — without it a client could inflate a track's ranking by
 * replaying the same request.
 */
export const queueUpvotes = sqliteTable(
  'queue_upvotes',
  {
    id: integer('id').primaryKey(),
    queueItemId: integer('queue_item_id')
      .references(() => queueItems.id, { onDelete: 'cascade' })
      .notNull(),
    uid: text('uid')
      .references(() => users.uid)
      .notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    uniqueVote: uniqueIndex('queue_upvotes_item_uid_idx').on(table.queueItemId, table.uid),
  })
);

/**
 * Live presence in a room. Rows are written when a socket joins and removed on
 * leave/disconnect, so activeListenersCount reflects reality instead of a seed
 * value.
 */
export const roomMembers = sqliteTable(
  'room_members',
  {
    id: integer('id').primaryKey(),
    roomId: integer('room_id')
      .references(() => jamRooms.id, { onDelete: 'cascade' })
      .notNull(),
    uid: text('uid')
      .references(() => users.uid)
      .notNull(),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' })
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    uniqueMember: uniqueIndex('room_members_room_uid_idx').on(table.roomId, table.uid),
  })
);

/**
 * Every track the user has listened to, on any Spotify device.
 */
export const listeningHistory = sqliteTable(
  'listening_history',
  {
    id: integer('id').primaryKey(),
    uid: text('uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    spotifyUri: text('spotify_uri').notNull(),
    title: text('title').notNull(),
    artist: text('artist').notNull(),
    albumArtUrl: text('album_art_url'),
    durationMs: integer('duration_ms'),
    deviceName: text('device_name'),
    playedAt: integer('played_at', { mode: 'timestamp_ms' })
      .default(sql`(unixepoch() * 1000)`).notNull(),
  },
  (table) => ({
    userRecentIdx: index('listening_history_uid_played_idx').on(table.uid, table.playedAt),
  })
);

export const listeningHistoryRelations = relations(listeningHistory, ({ one }) => ({
  user: one(users, {
    fields: [listeningHistory.uid],
    references: [users.uid],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  jamRooms: many(jamRooms),
  upvotes: many(queueUpvotes),
  memberships: many(roomMembers),
  history: many(listeningHistory),
}));

export const jamRoomsRelations = relations(jamRooms, ({ one, many }) => ({
  host: one(users, {
    fields: [jamRooms.hostUid],
    references: [users.uid],
  }),
  queue: many(queueItems),
  members: many(roomMembers),
}));

export const queueItemsRelations = relations(queueItems, ({ one, many }) => ({
  room: one(jamRooms, {
    fields: [queueItems.roomId],
    references: [jamRooms.id],
  }),
  addedBy: one(users, {
    fields: [queueItems.addedByUid],
    references: [users.uid],
  }),
  upvotes: many(queueUpvotes),
}));

export const queueUpvotesRelations = relations(queueUpvotes, ({ one }) => ({
  queueItem: one(queueItems, {
    fields: [queueUpvotes.queueItemId],
    references: [queueItems.id],
  }),
  user: one(users, {
    fields: [queueUpvotes.uid],
    references: [users.uid],
  }),
}));

export const roomMembersRelations = relations(roomMembers, ({ one }) => ({
  room: one(jamRooms, {
    fields: [roomMembers.roomId],
    references: [jamRooms.id],
  }),
  user: one(users, {
    fields: [roomMembers.uid],
    references: [users.uid],
  }),
}));

/**
 * Columns of `users` that are safe to expose to any authenticated client.
 * Spotify tokens, email and password hash are deliberately excluded.
 */
export const publicUserColumns = {
  id: users.id,
  uid: users.uid,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
  bio: users.bio,
  syncRate: users.syncRate,
  createdAt: users.createdAt,
} as const;

/** Same idea, in the shape drizzle's relational `columns` option expects. */
export const publicUserColumnFlags = {
  id: true,
  uid: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  syncRate: true,
  createdAt: true,
} as const;
