import 'dotenv/config';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) { console.error('SUPABASE_DB_URL not set'); process.exit(1); }

const sql = readFileSync(join(__dirname, 'schema-v2.sql'), 'utf8');
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

(async () => {
  await client.connect();
  console.log('Connected. Applying v2 schema...');
  await client.query(sql);

  const { rows } = await client.query(
    'select id, display_name, access_token, can_download, sort_order from photo_groups order by sort_order'
  );
  console.log('\nGroups:');
  console.table(rows);

  await client.end();
  console.log('\nDone.');
})().catch((err) => { console.error(err); process.exit(1); });
