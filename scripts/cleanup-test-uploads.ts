import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import WebSocket from 'ws';
if (typeof (globalThis as any).WebSocket === 'undefined') (globalThis as any).WebSocket = WebSocket;

const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  await db.connect();
  const { rows } = await db.query<{ storage_path: string }>('select storage_path from uploaded_media');
  if (rows.length > 0) {
    await supa.storage.from('wedding-photos').remove(rows.map((r) => r.storage_path));
  }
  await db.query('delete from uploaded_media');
  console.log(`Removed ${rows.length} test uploads.`);
  await db.end();
})();
