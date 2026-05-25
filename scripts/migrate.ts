/**
 * Apply scripts/schema.sql against the Supabase Postgres database.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts
 *
 * Env required (from .env):
 *   SUPABASE_DB_URL
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL is not set in .env');
  process.exit(1);
}

const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');

const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

(async () => {
  await client.connect();
  console.log('Connected. Applying schema...');
  await client.query(sql);
  const { rows } = await client.query(
    'select id, display_name, access_token, can_download from photo_groups order by sort_order'
  );
  console.log('\nPhoto groups:');
  console.table(rows);
  await client.end();
  console.log('\nDone. Save the access tokens above — they form the gallery share links.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
