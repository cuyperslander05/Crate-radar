import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env, isProduction } from './env.ts';

/**
 * Initialises the Firebase Admin SDK.
 *
 * verifyIdToken() alone only needs the project id (it validates against
 * Google's public JWKS), but every privileged operation — getUser,
 * setCustomUserClaims, revokeRefreshTokens — requires real service-account
 * credentials. Without them those calls fail at runtime on any host that has no
 * Application Default Credentials, such as a plain VPS or Docker container.
 */

const { projectId, clientEmail, privateKey } = env.firebase;

/** A placeholder or truncated key must not take the whole server down at boot. */
function looksLikePemKey(key: string): boolean {
  return key.includes('-----BEGIN') && key.includes('PRIVATE KEY-----');
}

function warn(message: string) {
  if (isProduction) console.error(`[firebase-admin] ${message}`);
  else console.warn(`[firebase-admin] ${message}`);
}

function resolveCredential() {
  if (clientEmail && privateKey) {
    if (!looksLikePemKey(privateKey)) {
      warn(
        'FIREBASE_PRIVATE_KEY is not a PEM private key (still the .env.example ' +
          'placeholder?). Continuing with project-id only: ID-token verification ' +
          'works, but privileged Admin SDK calls will fail.'
      );
      return undefined;
    }

    try {
      return cert({ projectId, clientEmail, privateKey });
    } catch (error) {
      warn(`Could not parse the service account credentials: ${(error as Error).message}`);
      return undefined;
    }
  }

  warn(
    'FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY are not set. Falling back to ' +
      'Application Default Credentials; privileged Admin SDK calls will fail off-GCP.'
  );

  try {
    return applicationDefault();
  } catch {
    return undefined;
  }
}

if (!getApps().length) {
  const credential = resolveCredential();
  initializeApp(credential ? { projectId, credential } : { projectId });
}

export const adminAuth = getAuth();
