import * as dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

dotenv.config();

// Mirrors the runtime pool in src/db/index.ts: verify certificates unless a
// local server with a self-signed certificate says otherwise.
const sslStrict = (process.env.SQL_SSL_STRICT ?? 'true').toLowerCase() !== 'false';
const useSsl = (process.env.SQL_SSL ?? 'true').toLowerCase() !== 'false';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.SQL_HOST!,
    port: Number(process.env.SQL_PORT ?? 5432),
    user: process.env.SQL_USER!,
    password: process.env.SQL_PASSWORD!,
    database: process.env.SQL_DB_NAME!,
    ssl: useSsl ? { rejectUnauthorized: sslStrict } : false,
  },
});
