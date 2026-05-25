/**
 * Bulk upload wedding photos from /Users/c.w.wong/Downloads/marriage-photos/groups
 * into Supabase Storage + the `photos` table.
 *
 * For each photo we upload:
 *   <bucket>/<group-id>/original/<filename>     (full-res, for downloads)
 *   <bucket>/<group-id>/thumb/<filename>.webp   (small WebP, for browsing)
 *
 * The script is idempotent: skips files that already have a `photos` row
 * (and uses `upsert: true` against storage as a safety net).
 *
 * Usage:
 *   npx tsx scripts/upload-photos.ts                 # all groups
 *   npx tsx scripts/upload-photos.ts couple          # one group only
 *   PHOTOS_DIR=/some/other/path npx tsx scripts/upload-photos.ts
 *
 * Env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_DB_URL
 *   SUPABASE_PHOTOS_BUCKET (default: wedding-photos)
 */
import 'dotenv/config';
import fs from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import pg from 'pg';
import WebSocket from 'ws';

// Supabase-js initializes a realtime client even when we only use storage/db.
// Node 20 lacks a global WebSocket, so polyfill it before createClient runs.
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = required('SUPABASE_URL');
const SERVICE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');
const DB_URL = required('SUPABASE_DB_URL');
const BUCKET = process.env.SUPABASE_PHOTOS_BUCKET || 'wedding-photos';
const PHOTOS_DIR = process.env.PHOTOS_DIR || '/Users/c.w.wong/Downloads/marriage-photos/groups';

const CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY || 4);
const THUMB_MAX = 1200; // longest side, px

// Folder name -> group id in `photo_groups`.
const FOLDER_TO_GROUP: Record<string, string> = {
  '00-couple-only': 'couple',
  '01-my-parents': 'my-parents',
  '02-my-friends': 'my-friends',
  '03-wife-friends': 'wife-friends',
  '04-wife-family': 'wife-family',
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (!buckets?.find((b) => b.name === BUCKET)) {
    console.log(`Creating private bucket "${BUCKET}"...`);
    // Project default global upload limit is 50 MiB; keep the per-bucket cap below that.
    // All originals are <= ~31 MB so 50 MiB headroom is sufficient.
    const { error: err2 } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024,
    });
    if (err2) throw err2;
  } else {
    console.log(`Bucket "${BUCKET}" already exists.`);
  }
}

type Job = {
  groupId: string;
  filePath: string;
  fileName: string;
  sortOrder: number;
};

async function loadExisting(groupId: string): Promise<Set<string>> {
  const { rows } = await db.query<{ file_name: string }>(
    'select file_name from photos where group_id = $1',
    [groupId]
  );
  return new Set(rows.map((r) => r.file_name));
}

function contentTypeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png':  return 'image/png';
    case 'gif':  return 'image/gif';
    case 'webp': return 'image/webp';
    case 'heic':
    case 'heif': return 'image/heic';
    default:     return 'application/octet-stream';
  }
}

async function uploadOne(job: Job) {
  const buf = await fs.promises.readFile(job.filePath);

  const originalKey = `${job.groupId}/original/${job.fileName}`;
  const thumbKey = `${job.groupId}/thumb/${job.fileName.replace(/\.[^.]+$/, '')}.webp`;

  // Generate thumbnail (skip for HEIC — sharp may not have libheif on macOS).
  let thumbBuf: Buffer | null = null;
  let width: number | null = null;
  let height: number | null = null;
  try {
    const pipeline = sharp(buf, { failOn: 'none' }).rotate();
    const meta = await pipeline.metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
    thumbBuf = await pipeline
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch (err) {
    console.warn(`  thumbnail skipped for ${job.fileName}: ${(err as Error).message}`);
  }

  // Upload original.
  const { error: e1 } = await supabase.storage
    .from(BUCKET)
    .upload(originalKey, buf, {
      contentType: contentTypeFor(job.fileName),
      upsert: true,
      cacheControl: '31536000',
    });
  if (e1) throw new Error(`original upload failed: ${e1.message}`);

  // Upload thumb if we built one.
  if (thumbBuf) {
    const { error: e2 } = await supabase.storage
      .from(BUCKET)
      .upload(thumbKey, thumbBuf, {
        contentType: 'image/webp',
        upsert: true,
        cacheControl: '31536000',
      });
    if (e2) throw new Error(`thumb upload failed: ${e2.message}`);
  }

  // Insert/update DB row.
  await db.query(
    `insert into photos (group_id, storage_path, thumbnail_path, file_name, file_size, width, height, sort_order)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (group_id, file_name) do update
       set storage_path   = excluded.storage_path,
           thumbnail_path = excluded.thumbnail_path,
           file_size      = excluded.file_size,
           width          = excluded.width,
           height         = excluded.height,
           sort_order     = excluded.sort_order`,
    [job.groupId, originalKey, thumbBuf ? thumbKey : null, job.fileName, buf.length, width, height, job.sortOrder]
  );
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency: number, onProgress?: (done: number, total: number) => void) {
  let i = 0;
  let done = 0;
  const total = items.length;
  const runners = new Array(Math.min(concurrency, total)).fill(0).map(async () => {
    while (i < total) {
      const idx = i++;
      try {
        await worker(items[idx]);
      } catch (err) {
        console.error(`  ERROR on item ${idx}:`, (err as Error).message);
      }
      done++;
      onProgress?.(done, total);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const onlyGroup = process.argv[2];

  await db.connect();
  await ensureBucket();

  const folders = (await fs.promises.readdir(PHOTOS_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const folder of folders) {
    const groupId = FOLDER_TO_GROUP[folder];
    if (!groupId) {
      console.log(`Skipping unknown folder: ${folder}`);
      continue;
    }
    if (onlyGroup && onlyGroup !== groupId) continue;

    const dir = join(PHOTOS_DIR, folder);
    const files = (await fs.promises.readdir(dir))
      .filter((n) => !n.startsWith('.'))
      .sort();

    const existing = await loadExisting(groupId);
    const todo: Job[] = [];
    files.forEach((name, idx) => {
      if (existing.has(name)) return;
      todo.push({ groupId, filePath: join(dir, name), fileName: name, sortOrder: idx });
    });

    console.log(`\n[${groupId}] ${files.length} files total, ${todo.length} new to upload.`);
    if (todo.length === 0) continue;

    let lastLog = Date.now();
    await runPool(todo, uploadOne, CONCURRENCY, (done, total) => {
      const now = Date.now();
      if (done === total || now - lastLog > 2000) {
        lastLog = now;
        process.stdout.write(`\r  [${groupId}] ${done}/${total}    `);
      }
    });
    process.stdout.write('\n');
  }

  await db.end();
  console.log('\nUpload complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
