import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// The crypto module derives its keys from APP_SECRET at first use, so the value
// must be present before the module is imported.
process.env.APP_SECRET ??= 'test-secret-0123456789abcdef0123456789abcdef';
process.env.SQL_HOST ??= 'localhost';
process.env.SQL_USER ??= 'test';
process.env.SQL_PASSWORD ??= 'test';
process.env.SQL_DB_NAME ??= 'test';
process.env.FIREBASE_PROJECT_ID ??= 'test-project';

const { encryptSecret, decryptSecret, createOAuthState, verifyOAuthState } = await import(
  './crypto.ts'
);

describe('token encryption', () => {
  test('round-trips a secret', () => {
    const token = 'BQC4YkQ-spotify-access-token';
    assert.equal(decryptSecret(encryptSecret(token)), token);
  });

  test('produces different ciphertext for the same input', () => {
    // A fresh IV per call: identical tokens must not be linkable in the database.
    assert.notEqual(encryptSecret('same'), encryptSecret('same'));
  });

  test('returns null for tampered ciphertext', () => {
    const encrypted = encryptSecret('sensitive');
    const parts = encrypted.split(':');
    parts[3] = Buffer.from('tampered').toString('base64url');
    assert.equal(decryptSecret(parts.join(':')), null);
  });

  test('passes through legacy plaintext values', () => {
    // Rows written before encryption was introduced must keep working.
    assert.equal(decryptSecret('legacy-plain-token'), 'legacy-plain-token');
  });

  test('handles null and undefined', () => {
    assert.equal(decryptSecret(null), null);
    assert.equal(decryptSecret(undefined), null);
  });
});

describe('OAuth state', () => {
  test('round-trips the uid', () => {
    assert.equal(verifyOAuthState(createOAuthState('firebase-uid-123')), 'firebase-uid-123');
  });

  test('rejects a forged state naming another user', () => {
    // This is the account-linking CSRF the signature exists to prevent.
    const forged = Buffer.from(
      JSON.stringify({ uid: 'victim-uid', nonce: 'x', exp: Date.now() + 60_000 })
    ).toString('base64url');
    assert.equal(verifyOAuthState(`${forged}.not-a-real-signature`), null);
  });

  test('rejects an unsigned uid', () => {
    assert.equal(verifyOAuthState('victim-uid'), null);
  });

  test('rejects a state whose body was modified after signing', () => {
    const valid = createOAuthState('attacker-uid');
    const mac = valid.slice(valid.lastIndexOf('.'));
    const swapped = Buffer.from(
      JSON.stringify({ uid: 'victim-uid', nonce: 'x', exp: Date.now() + 60_000 })
    ).toString('base64url');
    assert.equal(verifyOAuthState(swapped + mac), null);
  });

  test('rejects an expired state', () => {
    const original = Date.now;
    try {
      // Issue the state 11 minutes in the past; the TTL is 10 minutes.
      Date.now = () => original() - 11 * 60 * 1000;
      const stale = createOAuthState('uid-1');
      Date.now = original;
      assert.equal(verifyOAuthState(stale), null);
    } finally {
      Date.now = original;
    }
  });

  test('rejects malformed input', () => {
    for (const bad of ['', '.', 'no-dot', 'a.b.c']) {
      assert.equal(verifyOAuthState(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });
});
