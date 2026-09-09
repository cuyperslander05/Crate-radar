import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from 'crypto';
import { env } from './env.ts';

/**
 * Symmetric encryption + signing helpers built on the single APP_SECRET.
 *
 * Two independent keys are derived from it via HKDF-style domain separation so
 * that the encryption key and the signing key never coincide.
 */

const ENC_INFO = 'crate:token-encryption:v1';
const SIG_INFO = 'crate:state-signing:v1';

function deriveKey(info: string): Buffer {
  if (!env.appSecret) {
    throw new Error(
      'APP_SECRET is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return createHash('sha256').update(`${info}:${env.appSecret}`).digest();
}

let encKey: Buffer | null = null;
let sigKey: Buffer | null = null;

const getEncKey = () => (encKey ??= deriveKey(ENC_INFO));
const getSigKey = () => (sigKey ??= deriveKey(SIG_INFO));

const ENC_PREFIX = 'v1:';

/**
 * Encrypts a secret for storage at rest using AES-256-GCM.
 * Output format: "v1:<iv>:<authTag>:<ciphertext>", all base64url.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    ENC_PREFIX + iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

/**
 * Decrypts a value produced by encryptSecret.
 *
 * Values that predate encryption (plain tokens already in the database) are
 * returned unchanged so an existing deployment keeps working; they are
 * re-encrypted the next time the token is written.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext

  const parts = stored.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) return null;

  try {
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getEncKey(),
      Buffer.from(ivB64, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key or tampered ciphertext — treat as "no token" and force relink.
    console.error('Failed to decrypt stored secret; the value will be treated as unlinked.');
    return null;
  }
}

interface StatePayload {
  uid: string;
  nonce: string;
  exp: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Creates a tamper-proof OAuth `state` value binding the flow to one user.
 *
 * Using the bare Firebase uid here would let an attacker complete their own
 * Spotify authorization while naming a victim's uid, attaching their Spotify
 * account to the victim's profile. The HMAC plus a random nonce and a short
 * expiry make the value unforgeable and non-replayable.
 */
export function createOAuthState(uid: string): string {
  const payload: StatePayload = {
    uid,
    nonce: randomBytes(16).toString('base64url'),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const mac = createHmac('sha256', getSigKey()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

/**
 * Verifies an OAuth state value and returns the uid it was issued for, or null
 * when the signature is invalid, the format is wrong, or it has expired.
 */
export function verifyOAuthState(state: string): string | null {
  const dot = state.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = state.slice(0, dot);
  const mac = state.slice(dot + 1);

  const expected = createHmac('sha256', getSigKey()).update(body).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(mac, 'base64url');
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
    if (typeof payload.uid !== 'string' || !payload.uid) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload.uid;
  } catch {
    return null;
  }
}
