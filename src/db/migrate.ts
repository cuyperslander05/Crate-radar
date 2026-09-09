import * as dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createPool } from './index.ts';

async function main() {
  const pool = createPool();
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
  await pool.end();
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
