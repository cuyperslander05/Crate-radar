import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

/**
 * Firebase web-client configuration, sourced entirely from VITE_* environment
 * variables.
 *
 * A checked-in config JSON used to provide the defaults here, but it held the
 * credentials of an unrelated project — so a missing variable silently pointed
 * the app at the wrong Firebase project instead of failing. Requiring the env
 * vars makes a misconfiguration obvious immediately.
 *
 * authDomain must be the project's real "*.firebaseapp.com" domain and must
 * appear under Firebase Console > Authentication > Authorized domains.
 */
const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

const missing = (['projectId', 'authDomain', 'apiKey', 'appId'] as const).filter(
  (key) => !firebaseConfig[key]
);

if (missing.length > 0) {
  throw new Error(
    `Firebase is not configured. Missing: ${missing
      .map((k) => `VITE_FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`)
      .join(', ')}. Copy .env.example to .env and fill in the web app config.`
  );
}

if (firebaseConfig.authDomain === 'localhost') {
  throw new Error(
    'VITE_FIREBASE_AUTH_DOMAIN must be the real *.firebaseapp.com domain, not localhost.'
  );
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export { firebaseConfig as firebaseClientConfig };
