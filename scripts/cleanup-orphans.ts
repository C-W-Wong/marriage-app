/**
 * Find Supabase Storage objects that aren't referenced by any DB row and
 * (optionally) delete them.
 *
 * Usage:
 *   npx tsx scripts/cleanup-orphans.ts            # dry run, list only
 *   npx tsx scripts/cleanup-orphans.ts --delete   # actually delete
 *
 * "Orphan" rules:
 *   - guest-uploads/<file>: orphan if no uploaded_media row points to it
 *     AND its file was last modified more than 1 hour ago (avoids killing
 *     an in-flight upload whose upload-complete hasn't fired yet).
 *   - <group-id>/original/<file> or <group-id>/thumb/<file>: orphan if
 *     no `photos` row references that storage_path or thumbnail_path.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import WebSocket from 'ws';

if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

const SUPABASE_URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_URL = process.env.SUPABASE_DB_URL!;
const BUCKET = process.env.SUPABASE_PHOTOS_BUCKET || 'wedding-photos';
const DELETE = process.argv.includes('--delete');
const MIN_AGE_MS = 60 * 60 * 1000; // 1 hour grace for in-flight uploads

const supa = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function listAll(prefix = ''): Promise<{ path: string; updated_at: string | null }[]> {
  const out: { path: string; updated_at: string | null }[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supa.storage.from(BUCKET).list(prefix, {
      limit, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const e of data) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) {
        out.push(...(await listAll(full)));
      } else {
        out.push({ path: full, updated_at: (e as any).updated_at ?? null });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

(async () => {
  await db.connect();

  console.log(`Mode: ${DELETE ? 'DELETE' : 'dry-run (use --delete to apply)'}`);
  console.log('Listing storage objects…');
  const objects = await listAll();
  console.log(`  Storage: ${objects.length} objects`);

  console.log('Loading DB references…');
  const photoPaths = new Set<string>();
  const photoRows = await db.query<{ storage_path: string; thumbnail_path: string | null }>(
    'select storage_path, thumbnail_path from photos'
  );
  for (const r of photoRows.rows) {
    photoPaths.add(r.storage_path);
    if (r.thumbnail_path) photoPaths.add(r.thumbnail_path);
  }
  const uploadPaths = new Set<string>();
  const uploadRows = await db.query<{ storage_path: string; thumbnail_path: string | null }>(
    'select storage_path, thumbnail_path from uploaded_media'
  );
  for (const r of uploadRows.rows) {
    uploadPaths.add(r.storage_path);
    if (r.thumbnail_path) uploadPaths.add(r.thumbnail_path);
  }
  console.log(`  photos rows: ${photoRows.rows.length}, paths tracked: ${photoPaths.size}`);
  console.log(`  uploaded_media rows: ${uploadRows.rows.length}, paths tracked: ${uploadPaths.size}`);

  const now = Date.now();
  const orphans: string[] = [];
  let recentSkipped = 0;
  for (const o of objects) {
    if (photoPaths.has(o.path) || uploadPaths.has(o.path)) continue;
    // Grace period for guest-uploads (in-flight uploads).
    if (o.path.startsWith('guest-uploads/') && o.updated_at) {
      const age = now - new Date(o.updated_at).getTime();
      if (age < MIN_AGE_MS) { recentSkipped++; continue; }
    }
    orphans.push(o.path);
  }

  console.log(`\n${orphans.length} orphan(s) found${recentSkipped ? ` (${recentSkipped} recent guest uploads skipped — within 1h grace)` : ''}.`);
  if (orphans.length === 0) { await db.end(); return; }

  // Show first 20 for sanity.
  for (const p of orphans.slice(0, 20)) console.log('  -', p);
  if (orphans.length > 20) console.log(`  …and ${orphans.length - 20} more`);

  if (DELETE) {
    console.log('\nDeleting in batches of 500…');
    for (let i = 0; i < orphans.length; i += 500) {
      const batch = orphans.slice(i, i + 500);
      const { error } = await supa.storage.from(BUCKET).remove(batch);
      if (error) throw error;
      process.stdout.write(`  ${Math.min(i + 500, orphans.length)}/${orphans.length}\r`);
    }
    process.stdout.write('\n');
    console.log('Done.');
  } else {
    console.log('\nRe-run with --delete to remove them.');
  }

  await db.end();
})().catch((err) => { console.error(err); process.exit(1); });
