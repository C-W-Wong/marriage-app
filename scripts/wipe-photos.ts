/**
 * Wipe all photo rows + every object in the photos storage bucket.
 * Leaves the photo_groups table (and their access_tokens) untouched.
 *
 * Usage:  npx tsx scripts/wipe-photos.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import WebSocket from 'ws';

if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_URL = process.env.SUPABASE_DB_URL!;
const BUCKET = process.env.SUPABASE_PHOTOS_BUCKET || 'wedding-photos';

if (!SUPABASE_URL || !SERVICE_KEY || !DB_URL) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function listAllObjects(prefix = ''): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        // folder — recurse
        out.push(...await listAllObjects(full));
      } else {
        out.push(full);
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

(async () => {
  await db.connect();

  console.log('Listing storage objects…');
  const objects = await listAllObjects();
  console.log(`  Found ${objects.length} objects.`);

  if (objects.length > 0) {
    console.log('Deleting in batches of 500…');
    for (let i = 0; i < objects.length; i += 500) {
      const batch = objects.slice(i, i + 500);
      const { error } = await supabase.storage.from(BUCKET).remove(batch);
      if (error) throw error;
      process.stdout.write(`  ${Math.min(i + 500, objects.length)}/${objects.length}\r`);
    }
    process.stdout.write('\n');
  }

  console.log('Truncating photos table…');
  const { rowCount } = await db.query('delete from photos');
  console.log(`  Deleted ${rowCount} rows.`);

  await db.end();
  console.log('Done.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
