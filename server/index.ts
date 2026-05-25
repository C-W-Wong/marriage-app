import 'dotenv/config';
import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import WebSocket from 'ws';
import archiver from 'archiver';

// Supabase-js initializes a realtime client even when we only use storage/db.
// Node 20 has no global WebSocket; polyfill it so createClient doesn't throw.
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const weddingPhotosDir = join(__dirname, 'wedding-photos');
if (!fs.existsSync(weddingPhotosDir)) fs.mkdirSync(weddingPhotosDir, { recursive: true });

const cardsDir = join(__dirname, 'cards');
if (!fs.existsSync(cardsDir)) fs.mkdirSync(cardsDir, { recursive: true });

// #5/#6: Whitelist extensions and validate magic bytes
const ALLOWED_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']);
const ALLOWED_VIDEO_EXTS = new Set(['mp4', 'mov', 'webm']);
const ALLOWED_MEDIA_EXTS = new Set([...ALLOWED_IMAGE_EXTS, ...ALLOWED_VIDEO_EXTS]);

function validateMediaMagicBytes(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    // JPEG: FF D8 FF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
    // GIF: GIF8
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
    // WebP: RIFF....WEBP
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
    // MP4/MOV: ftyp at offset 4
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return true;
    // WebM: 1A 45 DF A3
    if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return true;
    // HEIF/HEIC: ftyp at offset 4 with heic/heix/mif1/msf1 brand
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
      const brand = buf.slice(8, 12).toString('ascii');
      if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

const createImageUpload = (dest: string) => multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dest),
    filename: (_req, file, cb) => {
      // #9: Validate extension against whitelist
      const ext = (file.originalname.split('.').pop() || '').toLowerCase();
      if (!ALLOWED_IMAGE_EXTS.has(ext)) {
        return cb(new Error('File type not allowed'), '');
      }
      cb(null, `${crypto.randomBytes(8).toString('hex')}.${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // #5: Block SVG and non-image types
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      return cb(null, false);
    }
    if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') {
      cb(null, true);
    } else if (file.mimetype === 'application/octet-stream' && ALLOWED_IMAGE_EXTS.has(ext)) {
      // Some devices send HEIC/HEIF with generic mimetype
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`) as any, false);
    }
  },
});

const upload = createImageUpload(uploadsDir);
const photoUpload = createImageUpload(weddingPhotosDir);

// Guest book media upload: images + videos up to 50MB
const guestBookUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = (file.originalname.split('.').pop() || '').toLowerCase();
      if (!ALLOWED_MEDIA_EXTS.has(ext)) return cb(new Error('File type not allowed'), '');
      cb(null, `${crypto.randomBytes(8).toString('hex')}.${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_MEDIA_EXTS.has(ext)) return cb(null, false);
    if (file.mimetype === 'image/svg+xml') return cb(null, false);
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

// Gallery image upload for admin
const galleryDir = join(__dirname, 'gallery-images');
if (!fs.existsSync(galleryDir)) fs.mkdirSync(galleryDir, { recursive: true });
const galleryUpload = createImageUpload(galleryDir);

const app = express();

// #10: Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      frameSrc: ["'self'", "https://maps.google.com", "https://www.google.com", "https://maps.googleapis.com"],
      mediaSrc: ["'self'", "blob:", "https://*.supabase.co"],
      connectSrc: ["'self'", "data:", "https://calendar.google.com", "https://maps.apple.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://*.supabase.co"],
    },
  },
  crossOriginEmbedderPolicy: false, // needed for Google Maps iframe
}));

// #8: CORS - restrict to same origin in production
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGIN || false)
    : true,
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

const staticSecurityHeaders = (res: express.Response) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'");
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
};
app.use('/uploads', express.static(uploadsDir, { setHeaders: staticSecurityHeaders }));
app.use('/gallery-images', express.static(galleryDir, { setHeaders: staticSecurityHeaders }));
app.use('/wedding-photos', express.static(weddingPhotosDir, { setHeaders: staticSecurityHeaders }));
app.use('/cards', express.static(cardsDir, { setHeaders: staticSecurityHeaders }));

// #4: Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many uploads, please wait' },
  standardHeaders: true,
  legacyHeaders: false,
});

// #19: Helper to validate integer route params
function parseIntParam(val: string): number | null {
  const n = parseInt(val, 10);
  return isNaN(n) || n < 0 ? null : n;
}

// #15: Max input length constant
const MAX_NAME_LEN = 200;
const MAX_MESSAGE_LEN = 500;
const MAX_URL_LEN = 2000;

const dataDir = join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(join(dataDir, 'wedding.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS guest_book (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    photo_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS rsvp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    attending INTEGER NOT NULL DEFAULT 1,
    guest_id INTEGER REFERENCES guests(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS guest_book_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL REFERENCES guest_book(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(entry_id, name)
  );
  CREATE TABLE IF NOT EXISTS guest_book_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL REFERENCES guest_book(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    caption TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uploader_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    original_filename TEXT,
    file_size INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrations
const gbColumns = db.prepare("PRAGMA table_info(guest_book)").all() as { name: string }[];
if (!gbColumns.some(c => c.name === 'photo_url')) {
  db.exec('ALTER TABLE guest_book ADD COLUMN photo_url TEXT');
}

const rsvpColumns = db.prepare("PRAGMA table_info(rsvp)").all() as { name: string }[];
if (!rsvpColumns.some(c => c.name === 'guest_id')) {
  db.exec('ALTER TABLE rsvp ADD COLUMN guest_id INTEGER REFERENCES guests(id)');
}

function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${base}-${suffix}`;
}

// Seed gallery if empty
const count = db.prepare('SELECT COUNT(*) as count FROM gallery').get() as { count: number };
if (count.count === 0) {
  const SEED_IMAGES = [
    { url: 'https://picsum.photos/seed/wedding1/800/1000', caption: 'A Moment of Joy' },
    { url: 'https://picsum.photos/seed/wedding2/1000/800', caption: 'Hand in Hand' },
    { url: 'https://picsum.photos/seed/wedding3/800/800', caption: 'The Beginning' },
    { url: 'https://picsum.photos/seed/wedding4/900/1200', caption: 'Forever Starts Now' },
    { url: 'https://picsum.photos/seed/wedding5/1200/900', caption: 'Laughter and Love' },
    { url: 'https://picsum.photos/seed/wedding6/800/1000', caption: 'Pure Happiness' },
  ];
  const insert = db.prepare('INSERT INTO gallery (url, caption, sort_order) VALUES (?, ?, ?)');
  const seedMany = db.transaction((images: typeof SEED_IMAGES) => {
    images.forEach((img, idx) => insert.run(img.url, img.caption, idx));
  });
  seedMany(SEED_IMAGES);
  console.log('Gallery seeded with default images');
}

// --- Admin Auth ---

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function adminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token.length !== ADMIN_PASSWORD.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ADMIN_PASSWORD))) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// --- API Routes ---

// #12: Guest list requires admin auth now
app.get('/api/guests', adminAuth, async (_req, res) => {
  const guests = db.prepare('SELECT id, slug, name, created_at FROM guests ORDER BY created_at DESC').all() as any[];
  const files = await fs.promises.readdir(cardsDir);
  const existingCards = new Set(files.filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)));
  const result = guests.map(g => ({
    ...g,
    hasCard: existingCards.has(g.slug),
  }));
  res.json(result);
});

app.get('/api/guests/:slug', (req, res) => {
  const guest = db.prepare('SELECT id, slug, name FROM guests WHERE slug = ?').get(req.params.slug);
  if (!guest) { res.status(404).json({ error: 'Guest not found' }); return; }
  res.json(guest);
});

// #7: POST /api/guests requires admin auth
app.post('/api/guests', adminAuth, writeLimiter, (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > MAX_NAME_LEN) {
    res.status(400).json({ error: `Name must be 2-${MAX_NAME_LEN} characters` });
    return;
  }
  const slug = generateSlug(name.trim());
  db.prepare('INSERT INTO guests (slug, name) VALUES (?, ?)').run(slug, name.trim());
  const guest = db.prepare('SELECT id, slug, name FROM guests WHERE slug = ?').get(slug);
  res.status(201).json(guest);
});

// Gallery
app.get('/api/gallery', (_req, res) => {
  const images = db.prepare('SELECT id, url, caption FROM gallery ORDER BY sort_order').all();
  res.json(images);
});

// Guest Book
app.get('/api/guest-book', (_req, res) => {
  // #16: Add pagination
  const entries = db.prepare('SELECT id, name, message, photo_url, created_at FROM guest_book ORDER BY created_at ASC LIMIT 100').all() as any[];
  const entryIds = entries.map(e => e.id);
  if (entryIds.length === 0) { res.json([]); return; }

  const placeholders = entryIds.map(() => '?').join(',');
  const likes = db.prepare(`SELECT entry_id, COUNT(*) as count FROM guest_book_likes WHERE entry_id IN (${placeholders}) GROUP BY entry_id`).all(...entryIds) as any[];
  const replies = db.prepare(`SELECT id, entry_id, name, message, created_at FROM guest_book_replies WHERE entry_id IN (${placeholders}) ORDER BY created_at ASC`).all(...entryIds) as any[];

  const likesMap = Object.fromEntries(likes.map((l: any) => [l.entry_id, l.count]));
  const repliesMap: Record<number, any[]> = {};
  for (const r of replies) {
    (repliesMap[r.entry_id] ??= []).push(r);
  }

  const result = entries.map(e => ({
    ...e,
    likes: likesMap[e.id] || 0,
    replies: repliesMap[e.id] || [],
  }));
  res.json(result);
});

app.post('/api/guest-book', writeLimiter, guestBookUpload.single('photo'), (req, res) => {
  const { name, message } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > MAX_NAME_LEN) {
    res.status(400).json({ error: `Name must be 2-${MAX_NAME_LEN} characters` });
    return;
  }
  if (!message || typeof message !== 'string' || message.trim().length < 5 || message.length > MAX_MESSAGE_LEN) {
    res.status(400).json({ error: `Message must be 5-${MAX_MESSAGE_LEN} characters` });
    return;
  }

  // #6: Validate magic bytes if file uploaded
  let photoUrl: string | null = null;
  if (req.file) {
    const filePath = join(uploadsDir, req.file.filename);
    if (!validateMediaMagicBytes(filePath)) {
      fs.unlinkSync(filePath);
      res.status(400).json({ error: 'Invalid image file' });
      return;
    }
    photoUrl = `/uploads/${req.file.filename}`;
  }

  const result = db.prepare('INSERT INTO guest_book (name, message, photo_url) VALUES (?, ?, ?)').run(name.trim(), message.trim(), photoUrl);
  const entry = db.prepare('SELECT id, name, message, photo_url, created_at FROM guest_book WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(entry);
});

// Guest Book: Like
app.post('/api/guest-book/:id/like', writeLimiter, (req, res) => {
  // #19: Validate id
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid ID' }); return; }

  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > MAX_NAME_LEN) {
    res.status(400).json({ error: `Name must be 1-${MAX_NAME_LEN} characters` });
    return;
  }
  try {
    db.prepare('INSERT INTO guest_book_likes (entry_id, name) VALUES (?, ?)').run(id, name.trim());
  } catch (err: any) {
    // #20: Only toggle on UNIQUE constraint violation
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || err?.message?.includes('UNIQUE')) {
      db.prepare('DELETE FROM guest_book_likes WHERE entry_id = ? AND name = ?').run(id, name.trim());
    } else {
      console.error('Like error:', err);
      res.status(500).json({ error: 'Internal error' });
      return;
    }
  }
  const countRow = db.prepare('SELECT COUNT(*) as count FROM guest_book_likes WHERE entry_id = ?').get(id) as { count: number };
  res.json({ likes: countRow.count });
});

// Guest Book: Reply
app.post('/api/guest-book/:id/reply', writeLimiter, (req, res) => {
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid ID' }); return; }

  const { name, message } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > MAX_NAME_LEN) {
    res.status(400).json({ error: `Name must be 1-${MAX_NAME_LEN} characters` });
    return;
  }
  if (!message || typeof message !== 'string' || message.trim().length < 1 || message.length > 300) {
    res.status(400).json({ error: 'Reply must be 1-300 characters' });
    return;
  }
  const result = db.prepare('INSERT INTO guest_book_replies (entry_id, name, message) VALUES (?, ?, ?)').run(id, name.trim(), message.trim());
  const reply = db.prepare('SELECT id, entry_id, name, message, created_at FROM guest_book_replies WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(reply);
});

// RSVP
app.get('/api/rsvp/:guest_id', (req, res) => {
  const guestId = parseIntParam(req.params.guest_id);
  if (guestId === null) { res.status(400).json({ error: 'Invalid guest ID' }); return; }
  const rsvp = db.prepare('SELECT id, name, attending, created_at FROM rsvp WHERE guest_id = ? ORDER BY created_at DESC LIMIT 1').get(guestId);
  if (!rsvp) { res.status(404).json({ error: 'No RSVP found' }); return; }
  res.json(rsvp);
});

app.post('/api/rsvp', writeLimiter, (req, res) => {
  const { name, attending, guest_id } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > MAX_NAME_LEN) {
    res.status(400).json({ error: `Name must be 2-${MAX_NAME_LEN} characters` });
    return;
  }
  const attendingVal = attending ? 1 : 0;
  const guestIdVal = guest_id ? Number(guest_id) : null;

  // #11: Validate guest_id exists if provided
  if (guestIdVal) {
    const guest = db.prepare('SELECT id FROM guests WHERE id = ?').get(guestIdVal);
    if (!guest) { res.status(400).json({ error: 'Invalid guest' }); return; }

    const existing = db.prepare('SELECT id FROM rsvp WHERE guest_id = ?').get(guestIdVal) as any;
    if (existing) {
      db.prepare('UPDATE rsvp SET name = ?, attending = ?, created_at = datetime(\'now\') WHERE guest_id = ?').run(
        name.trim(), attendingVal, guestIdVal
      );
      res.json({ success: true, updated: true });
      return;
    }
  }

  db.prepare('INSERT INTO rsvp (name, attending, guest_id) VALUES (?, ?, ?)').run(
    name.trim(), attendingVal, guestIdVal
  );
  res.status(201).json({ success: true });
});

// Photos
app.get('/api/photos', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Number(req.query.offset) || 0;
  const photos = db.prepare(
    'SELECT id, uploader_name, file_path, created_at FROM photos ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);
  const total = (db.prepare('SELECT COUNT(*) as count FROM photos').get() as { count: number }).count;
  res.json({ photos, total, hasMore: offset + limit < total });
});

// #12: Photo upload only on or after wedding date
app.post('/api/photos', uploadLimiter, photoUpload.array('photos', 10), (req, res) => {
  const weddingDay = new Date('2026-05-20T00:00:00-07:00');
  if (new Date() < weddingDay) {
    res.status(403).json({ error: 'Photo sharing opens on the wedding day!' });
    return;
  }
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > MAX_NAME_LEN) {
    res.status(400).json({ error: `Name must be 2-${MAX_NAME_LEN} characters` });
    return;
  }
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'At least one photo is required' });
    return;
  }

  // #6: Validate magic bytes for each uploaded file, remove invalid ones
  const validFiles: Express.Multer.File[] = [];
  for (const file of files) {
    const filePath = join(weddingPhotosDir, file.filename);
    if (validateMediaMagicBytes(filePath)) {
      validFiles.push(file);
    } else {
      try { fs.unlinkSync(filePath); } catch (e) { console.error('Failed to remove invalid upload:', e); }
    }
  }
  if (validFiles.length === 0) {
    res.status(400).json({ error: 'No valid image files' });
    return;
  }

  const insertStmt = db.prepare(
    'INSERT INTO photos (uploader_name, file_path, original_filename, file_size) VALUES (?, ?, ?, ?)'
  );
  const selectStmt = db.prepare(
    'SELECT id, uploader_name, file_path, created_at FROM photos WHERE id = ?'
  );
  const insertMany = db.transaction((fileList: Express.Multer.File[]) => {
    return fileList.map(file => {
      const filePath = `/wedding-photos/${file.filename}`;
      const result = insertStmt.run(name.trim(), filePath, file.originalname, file.size);
      return selectStmt.get(result.lastInsertRowid);
    });
  });
  const inserted = insertMany(validFiles);
  res.status(201).json(inserted);
});

// --- Wedding photo gallery (Supabase-backed) ---

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || '';
const PHOTOS_BUCKET = process.env.SUPABASE_PHOTOS_BUCKET || 'wedding-photos';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 12; // 12h — enough for a browsing session

let supabaseClient: SupabaseClient | null = null;
let pgPool: pg.Pool | null = null;

function galleryConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_DB_URL);
}

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
}

function getPg(): pg.Pool {
  if (!pgPool) {
    pgPool = new pg.Pool({ connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 4 });
  }
  return pgPool;
}

function notConfigured(res: express.Response) {
  res.status(503).json({ error: 'Photo gallery is not configured on this server yet.' });
}

const galleryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

type PhotoRow = {
  id: string;
  group_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  file_name: string;
  width: number | null;
  height: number | null;
  sort_order: number;
};

type GroupRow = {
  id: string;
  display_name: string;
  access_token: string | null;
  can_download: boolean;
  sort_order: number;
};

async function fetchGroupByToken(token: string): Promise<GroupRow | null> {
  if (!token || typeof token !== 'string' || token.length > 128) return null;
  const { rows } = await getPg().query<GroupRow>(
    'select id, display_name, access_token, can_download, sort_order from photo_groups where access_token = $1',
    [token]
  );
  return rows[0] ?? null;
}

async function fetchGroupPhotos(groupIds: string[]): Promise<PhotoRow[]> {
  if (groupIds.length === 0) return [];
  const { rows } = await getPg().query<PhotoRow>(
    `select id, group_id, storage_path, thumbnail_path, file_name, width, height, sort_order
       from photos where group_id = any($1::text[])
       order by group_id, sort_order, id`,
    [groupIds]
  );
  return rows;
}

async function signPaths(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await getSupabase().storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

type UploadRow = {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
  file_name: string;
  media_type: 'image' | 'video';
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  uploader_name: string | null;
  created_at: string;
};

async function fetchGuestUploads(limit = 500): Promise<UploadRow[]> {
  const { rows } = await getPg().query<UploadRow>(
    `select id, storage_path, thumbnail_path, file_name, media_type, mime_type, file_size,
            width, height, duration_seconds, uploader_name, created_at
       from uploaded_media
       order by created_at desc
       limit $1`,
    [limit]
  );
  return rows;
}

// Public: resolve a token and return everything the gallery page needs.
// Response shape (used for both master 'all' link and per-group links):
//   {
//     group:           { id, display_name, can_download, is_master },
//     categories:      [{ id, display_name }],   // chips for the photos tab
//     default_category: string | null,           // the chip to pre-select
//     photos:          [{ id, group_id, file_name, thumb_url, width, height, can_download }],
//     guest_uploads:   [{ id, media_type, file_name, thumb_url, view_url, ... }]
//   }
app.get('/api/gallery-access/:token', galleryLimiter, async (req, res) => {
  if (!galleryConfigured()) return notConfigured(res);
  try {
    const group = await fetchGroupByToken(req.params.token);
    if (!group) { res.status(404).json({ error: 'Invalid or expired link' }); return; }

    const isMaster = group.id === 'all';

    // Which underlying groups feed this view, and a "categories" list for chips.
    let sourceGroupIds: string[];
    let categories: { id: string; display_name: string }[];
    let defaultCategory: string | null;
    if (isMaster) {
      const all = await getPg().query<{ id: string; display_name: string }>(
        `select id, display_name from photo_groups
         where id <> 'all'
         order by case when id = 'couple' then -1 else sort_order end`
      );
      sourceGroupIds = all.rows.map((r) => r.id);
      categories = all.rows;
      defaultCategory = null; // show "All" by default
    } else {
      sourceGroupIds = ['couple', group.id];
      const all = await getPg().query<{ id: string; display_name: string }>(
        `select id, display_name from photo_groups
         where id = any($1::text[])
         order by case when id = 'couple' then 1 else 0 end`,
        [sourceGroupIds]
      );
      categories = all.rows;
      defaultCategory = group.id;
    }

    const photoRows = await fetchGroupPhotos(sourceGroupIds);
    const uploads = await fetchGuestUploads();

    // Sign both the thumbnail and the original for every photo so the lightbox
    // can show the full-res original instead of the small thumbnail.
    const pathsToSign = new Set<string>();
    for (const p of photoRows) {
      if (p.thumbnail_path) pathsToSign.add(p.thumbnail_path);
      pathsToSign.add(p.storage_path);
    }
    for (const u of uploads) {
      if (u.thumbnail_path) pathsToSign.add(u.thumbnail_path);
      pathsToSign.add(u.storage_path);
    }
    const signed = await signPaths(Array.from(pathsToSign));

    const photos = photoRows.map((p) => {
      const isCouple = p.group_id === 'couple';
      // Master link makes every category downloadable; regular link follows
      // the group's flag for its own photos and view-only for couple.
      const canDownload = isMaster ? true : (isCouple ? false : group.can_download);
      const thumbKey = p.thumbnail_path || p.storage_path;
      return {
        id: p.id,
        group_id: p.group_id,
        file_name: p.file_name,
        thumb_url: signed[thumbKey] || null,
        full_url: signed[p.storage_path] || null,
        width: p.width,
        height: p.height,
        can_download: canDownload,
      };
    });

    // For guest-uploaded IMAGES we ask Supabase to deliver a resized version
    // (width 600px, quality 70) via the image-transform signed-URL endpoint
    // so the grid serves ~50–150 KB WebPs instead of 5–25 MB originals.
    // The transform endpoint is per-call, so parallel them — but wrap each
    // call in a try/catch so a single throw doesn't 500 the whole gallery
    // (we fall back to the full-size signed URL for that one image).
    const imageUploadThumbs = await Promise.all(
      uploads.filter((u) => u.media_type === 'image').map(async (u) => {
        try {
          const { data, error } = await getSupabase().storage
            .from(PHOTOS_BUCKET)
            .createSignedUrl(u.storage_path, SIGNED_URL_TTL_SECONDS, {
              transform: { width: 600, height: 600, resize: 'contain', quality: 70 },
            });
          if (error || !data) {
            console.warn('transform signing returned error for', u.storage_path, error?.message);
            return [u.id, null] as const;
          }
          return [u.id, data.signedUrl] as const;
        } catch (err) {
          console.warn('transform signing threw for', u.storage_path, (err as Error).message);
          return [u.id, null] as const;
        }
      })
    );
    const transformThumbByUploadId = new Map(imageUploadThumbs);

    const guestUploads = uploads.map((u) => {
      const transformThumb = u.media_type === 'image' ? transformThumbByUploadId.get(u.id) : null;
      return {
        id: u.id,
        media_type: u.media_type,
        file_name: u.file_name,
        mime_type: u.mime_type,
        thumb_url: u.media_type === 'image'
          ? (transformThumb ?? signed[u.storage_path] ?? null)
          : (signed[u.storage_path] ?? null),
        view_url: signed[u.storage_path] || null,
        width: u.width,
        height: u.height,
        duration_seconds: u.duration_seconds,
        file_size: u.file_size,
        uploader_name: u.uploader_name,
        created_at: u.created_at,
        // Guest uploads are always downloadable from any link.
        can_download: true,
      };
    });

    res.json({
      group: {
        id: group.id,
        display_name: group.display_name,
        can_download: group.can_download,
        is_master: isMaster,
      },
      categories,
      default_category: defaultCategory,
      photos,
      guest_uploads: guestUploads,
    });
  } catch (err) {
    console.error('Gallery access error:', err);
    res.status(500).json({ error: 'Failed to load gallery' });
  }
});

// Resolve a request for downloadable items (photos from groups + guest uploads)
// against the access token's permissions.  Returns the rows that the caller
// is allowed to download.
async function resolveDownloadable(
  group: GroupRow,
  photoIds: string[],
  uploadIds: string[]
): Promise<{ storage_path: string; file_name: string; id: string }[]> {
  const out: { storage_path: string; file_name: string; id: string }[] = [];

  if (photoIds.length > 0) {
    // Master link downloads everything; regular links download only their own
    // group's photos (couple stays view-only).
    let rows: { id: string; storage_path: string; file_name: string }[];
    if (group.id === 'all') {
      const r = await getPg().query<{ id: string; storage_path: string; file_name: string }>(
        `select id, storage_path, file_name from photos where id = any($1::uuid[])`,
        [photoIds]
      );
      rows = r.rows;
    } else {
      if (!group.can_download) return [];
      const r = await getPg().query<{ id: string; storage_path: string; file_name: string }>(
        `select id, storage_path, file_name from photos
          where group_id = $1 and id = any($2::uuid[])`,
        [group.id, photoIds]
      );
      rows = r.rows;
    }
    out.push(...rows);
  }

  if (uploadIds.length > 0) {
    // Guest uploads are always downloadable from any valid gallery link.
    const r = await getPg().query<{ id: string; storage_path: string; file_name: string }>(
      `select id, storage_path, file_name from uploaded_media where id = any($1::uuid[])`,
      [uploadIds]
    );
    out.push(...r.rows);
  }

  return out;
}

function parseDownloadRequest(body: any): { photoIds: string[]; uploadIds: string[] } | { error: string } {
  const photoIds = Array.isArray(body?.photoIds) ? body.photoIds : [];
  const uploadIds = Array.isArray(body?.uploadIds) ? body.uploadIds : [];
  if (photoIds.length + uploadIds.length === 0) return { error: 'Nothing to download' };
  if (photoIds.length + uploadIds.length > 200) return { error: 'At most 200 items per request' };
  const ok = (id: any) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
  if (!photoIds.every(ok) || !uploadIds.every(ok)) return { error: 'Invalid ID format' };
  return { photoIds, uploadIds };
}

// Public: produce signed download URLs for the items the caller is allowed to grab.
app.post('/api/gallery-access/:token/download', galleryLimiter, async (req, res) => {
  if (!galleryConfigured()) return notConfigured(res);
  try {
    const group = await fetchGroupByToken(req.params.token);
    if (!group) { res.status(404).json({ error: 'Invalid or expired link' }); return; }

    const parsed = parseDownloadRequest(req.body);
    if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }

    const rows = await resolveDownloadable(group, parsed.photoIds, parsed.uploadIds);
    if (rows.length === 0) { res.status(403).json({ error: 'No downloadable items' }); return; }

    const signed = await Promise.all(
      rows.map(async (row) => {
        const { data, error } = await getSupabase().storage
          .from(PHOTOS_BUCKET)
          .createSignedUrl(row.storage_path, 60 * 10, { download: row.file_name });
        if (error) throw error;
        return { id: row.id, file_name: row.file_name, url: data.signedUrl };
      })
    );

    res.json({ photos: signed });
  } catch (err) {
    console.error('Download URL error:', err);
    res.status(500).json({ error: 'Failed to generate download URLs' });
  }
});

// --- Zip bundle (multi-select download) ---
//
// Two-step flow so the actual download is a top-level GET (works on every browser):
//   1. POST .../zip-prepare  { photoIds } -> { session_id }
//   2. GET  .../zip?s=<id>                 -> streams a .zip with originals

type ZipSession = {
  token: string;
  photoIds: string[];
  uploadIds: string[];
  expires: number;
};
const zipSessions = new Map<string, ZipSession>();
const ZIP_SESSION_TTL_MS = 60 * 1000; // 60s window from prepare to download
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of zipSessions) if (v.expires < now) zipSessions.delete(k);
}, 30_000).unref();

app.post('/api/gallery-access/:token/zip-prepare', galleryLimiter, async (req, res) => {
  if (!galleryConfigured()) return notConfigured(res);
  try {
    const group = await fetchGroupByToken(req.params.token);
    if (!group) { res.status(404).json({ error: 'Invalid or expired link' }); return; }

    const parsed = parseDownloadRequest(req.body);
    if ('error' in parsed) { res.status(400).json({ error: parsed.error }); return; }

    const sessionId = crypto.randomBytes(16).toString('hex');
    zipSessions.set(sessionId, {
      token: req.params.token,
      photoIds: parsed.photoIds,
      uploadIds: parsed.uploadIds,
      expires: Date.now() + ZIP_SESSION_TTL_MS,
    });
    res.json({ session_id: sessionId });
  } catch (err) {
    console.error('Zip prepare error:', err);
    res.status(500).json({ error: 'Failed to prepare download' });
  }
});

app.get('/api/gallery-access/:token/zip', galleryLimiter, async (req, res) => {
  if (!galleryConfigured()) return notConfigured(res);
  const sessionId = String(req.query.s || '');
  const session = zipSessions.get(sessionId);
  if (!session || session.token !== req.params.token || session.expires < Date.now()) {
    res.status(404).type('text/plain').send('Download link expired. Please reselect and try again.');
    return;
  }
  zipSessions.delete(sessionId); // one-shot

  try {
    const group = await fetchGroupByToken(req.params.token);
    if (!group) {
      res.status(403).type('text/plain').send('Forbidden');
      return;
    }

    const rows = await resolveDownloadable(group, session.photoIds, session.uploadIds);
    if (rows.length === 0) { res.status(403).type('text/plain').send('No downloadable items'); return; }

    const safeGroup = group.id.replace(/[^a-z0-9_-]/gi, '_');
    const zipName = `wedding-photos-${safeGroup}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    res.setHeader('Cache-Control', 'no-store');
    // Push headers immediately so mobile browsers know this is a download
    // before the first archive byte streams (which can take several seconds
    // while we fetch the first photo from Supabase).
    res.flushHeaders();

    const archive = archiver('zip', { store: true }); // photos are already compressed
    archive.on('warning', (err) => { if (err.code !== 'ENOENT') console.error('zip warning', err); });
    archive.on('error', (err) => {
      console.error('zip error:', err);
      try { res.destroy(err); } catch {}
    });
    archive.pipe(res);

    // Disambiguate duplicate file names within the zip.
    const used = new Set<string>();
    const uniqueName = (name: string) => {
      if (!used.has(name)) { used.add(name); return name; }
      const dot = name.lastIndexOf('.');
      const base = dot === -1 ? name : name.slice(0, dot);
      const ext = dot === -1 ? '' : name.slice(dot);
      let i = 2;
      while (used.has(`${base} (${i})${ext}`)) i++;
      const n = `${base} (${i})${ext}`;
      used.add(n);
      return n;
    };

    for (const row of rows) {
      const { data, error } = await getSupabase().storage
        .from(PHOTOS_BUCKET)
        .createSignedUrl(row.storage_path, 60 * 5);
      if (error || !data) {
        console.error('signed url failed:', error);
        continue;
      }
      // 60s timeout per file so one stalled Supabase fetch can't hang the
      // entire zip stream after we've already committed Content-Disposition.
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 60_000);
      let resp: Response;
      try {
        resp = await fetch(data.signedUrl, { signal: controller.signal });
      } catch (err) {
        clearTimeout(abortTimer);
        console.error('fetch failed (timeout/abort):', (err as Error).message, row.storage_path);
        continue;
      }
      clearTimeout(abortTimer);
      if (!resp.ok || !resp.body) {
        console.error('fetch failed:', resp.status, row.storage_path);
        continue;
      }
      // Convert web ReadableStream → Node Readable so archiver can consume it.
      const { Readable } = await import('stream');
      const nodeStream = Readable.fromWeb(resp.body as any);
      // Attach listeners BEFORE archive.append so a synchronous 'end' or
      // 'error' on a small / fast stream can't be missed.
      const entryDone = new Promise<void>((resolve, reject) => {
        nodeStream.on('end', resolve);
        nodeStream.on('error', reject);
      });
      archive.append(nodeStream, { name: uniqueName(row.file_name) });
      // Wait for this entry to finish streaming before starting the next one,
      // so we don't open all signed-URL fetches in parallel for large batches.
      try {
        await entryDone;
      } catch (err) {
        console.error('zip entry stream error:', (err as Error).message);
        // Stream errored mid-flight; carry on with the rest of the batch.
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('Zip stream error:', err);
    // Headers may already have been sent, so don't try to send JSON.
    try { res.end(); } catch {}
  }
});

// --- Guest uploads (photos + videos) ---
//
// Two-step flow that lets the browser PUT the file straight to Supabase
// Storage (no double-bandwidth through this server):
//   1. POST .../upload-init     { fileName, fileSize, mimeType, mediaType, uploaderName }
//                               -> { upload_id, signed_url, supabase_path }
//   2. PUT  <signed_url>        (raw file body, content-type set by client)
//   3. POST .../upload-complete { upload_id, width?, height?, duration_seconds? }
//                               -> { media: { ... } }

type PendingUpload = {
  token: string;
  storage_path: string;
  file_name: string;
  media_type: 'image' | 'video';
  mime_type: string;
  file_size: number;
  uploader_name: string | null;
  via_group: string;
  expires: number;
};
const pendingUploads = new Map<string, PendingUpload>();
const UPLOAD_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes to finish a single upload
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingUploads) if (v.expires < now) pendingUploads.delete(k);
}, 60_000).unref();

const UPLOAD_MAX_BYTES = 500 * 1024 * 1024; // matches the bucket cap the user set
const ALLOWED_IMG_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']);
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp']);

function safeExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return m ? m[1] : 'bin';
}

// Guest upload limiter — every uploaded file makes 2 server calls
// (init + complete), so a guest uploading 100 photos with parallelism = 200
// calls. Be generous: 600/min/IP allows ~300 files/min while still blocking
// runaway abuse.
const uploadLimiterGuest = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  message: { error: 'Too many uploads, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/gallery-access/:token/upload-init', uploadLimiterGuest, async (req, res) => {
  if (!galleryConfigured()) return notConfigured(res);
  try {
    const group = await fetchGroupByToken(req.params.token);
    if (!group) { res.status(404).json({ error: 'Invalid or expired link' }); return; }

    const { fileName, fileSize, mimeType, mediaType, uploaderName } = req.body as {
      fileName?: string; fileSize?: number; mimeType?: string;
      mediaType?: 'image' | 'video'; uploaderName?: string;
    };
    if (!fileName || typeof fileName !== 'string' || fileName.length > 200) {
      res.status(400).json({ error: 'fileName is required (max 200 chars)' }); return;
    }
    if (typeof fileSize !== 'number' || fileSize <= 0 || fileSize > UPLOAD_MAX_BYTES) {
      res.status(400).json({ error: `fileSize must be 1..${UPLOAD_MAX_BYTES} bytes` }); return;
    }
    if (mediaType !== 'image' && mediaType !== 'video') {
      res.status(400).json({ error: 'mediaType must be "image" or "video"' }); return;
    }
    if (typeof mimeType !== 'string') {
      res.status(400).json({ error: 'mimeType is required' }); return;
    }
    const allowed = mediaType === 'image' ? ALLOWED_IMG_MIME : ALLOWED_VIDEO_MIME;
    if (!allowed.has(mimeType.toLowerCase())) {
      res.status(400).json({ error: `Unsupported ${mediaType} format` }); return;
    }
    if (uploaderName != null && (typeof uploaderName !== 'string' || uploaderName.length > 80)) {
      res.status(400).json({ error: 'uploaderName must be a string up to 80 chars' }); return;
    }

    const ext = safeExt(fileName);
    const uploadId = crypto.randomUUID();
    const objectId = crypto.randomUUID();
    const storage_path = `guest-uploads/${objectId}.${ext}`;

    const { data, error } = await getSupabase().storage
      .from(PHOTOS_BUCKET)
      .createSignedUploadUrl(storage_path);
    if (error || !data) {
      console.error('createSignedUploadUrl failed:', error);
      res.status(500).json({ error: 'Failed to create upload URL' }); return;
    }

    pendingUploads.set(uploadId, {
      token: req.params.token,
      storage_path,
      file_name: fileName,
      media_type: mediaType,
      mime_type: mimeType,
      file_size: fileSize,
      uploader_name: uploaderName?.trim() || null,
      via_group: group.id,
      expires: Date.now() + UPLOAD_SESSION_TTL_MS,
    });

    res.json({
      upload_id: uploadId,
      signed_url: data.signedUrl,
      supabase_path: storage_path,
    });
  } catch (err) {
    console.error('upload-init error:', err);
    res.status(500).json({ error: 'Failed to initialize upload' });
  }
});

app.post('/api/gallery-access/:token/upload-complete', uploadLimiterGuest, async (req, res) => {
  if (!galleryConfigured()) return notConfigured(res);
  try {
    const { upload_id, width, height, duration_seconds } = req.body as {
      upload_id?: string; width?: number; height?: number; duration_seconds?: number;
    };
    if (!upload_id || typeof upload_id !== 'string') {
      res.status(400).json({ error: 'upload_id is required' }); return;
    }
    const pending = pendingUploads.get(upload_id);
    if (!pending || pending.token !== req.params.token || pending.expires < Date.now()) {
      res.status(404).json({ error: 'Upload session not found or expired' }); return;
    }

    // Verify the object actually landed in storage before we record it.
    const dir = pending.storage_path.slice(0, pending.storage_path.lastIndexOf('/'));
    const fileName = pending.storage_path.slice(pending.storage_path.lastIndexOf('/') + 1);
    const { data: list, error: listErr } = await getSupabase().storage
      .from(PHOTOS_BUCKET)
      .list(dir, { search: fileName, limit: 1 });
    if (listErr) {
      console.error('list after upload failed:', listErr);
      res.status(500).json({ error: 'Failed to verify upload' }); return;
    }
    if (!list || list.length === 0 || list[0].name !== fileName) {
      res.status(400).json({ error: 'File was not received. Please retry.' }); return;
    }

    const w = typeof width === 'number' && width > 0 ? Math.round(width) : null;
    const h = typeof height === 'number' && height > 0 ? Math.round(height) : null;
    const dur = typeof duration_seconds === 'number' && duration_seconds > 0 ? duration_seconds : null;

    // Sign URLs BEFORE we commit / delete the pending session. If signing
    // throws we want the retry to find pendingUploads still populated and
    // succeed; otherwise the client gets a fake "session expired" on what
    // is actually a transient infra hiccup.
    const { data: full, error: fullErr } = await getSupabase().storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(pending.storage_path, SIGNED_URL_TTL_SECONDS);
    if (fullErr || !full?.signedUrl) {
      console.error('createSignedUrl(full) failed:', fullErr);
      res.status(500).json({ error: 'Failed to sign media URL' }); return;
    }

    // Best-effort transform thumbnail. If this throws / returns error we
    // gracefully fall back to the full-size URL (still a valid thumbnail).
    let thumb: string = full.signedUrl;
    if (pending.media_type === 'image') {
      try {
        const { data: t, error: tErr } = await getSupabase().storage
          .from(PHOTOS_BUCKET)
          .createSignedUrl(pending.storage_path, SIGNED_URL_TTL_SECONDS, {
            transform: { width: 600, height: 600, resize: 'contain', quality: 70 },
          });
        if (tErr) console.warn('createSignedUrl(transform) error:', tErr.message);
        if (t?.signedUrl) thumb = t.signedUrl;
      } catch (err) {
        console.warn('createSignedUrl(transform) threw:', (err as Error).message);
      }
    }

    // Now commit. If the DB insert fails the pending session stays and the
    // client can retry without orphaning the storage object.
    const { rows } = await getPg().query<{ id: string; created_at: string }>(
      `insert into uploaded_media
         (storage_path, file_name, media_type, mime_type, file_size,
          width, height, duration_seconds, uploader_name, uploaded_via)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id, created_at`,
      [pending.storage_path, pending.file_name, pending.media_type, pending.mime_type, pending.file_size,
       w, h, dur, pending.uploader_name, pending.via_group]
    );
    const created = rows[0];
    pendingUploads.delete(upload_id);

    res.status(201).json({
      media: {
        id: created.id,
        media_type: pending.media_type,
        file_name: pending.file_name,
        mime_type: pending.mime_type,
        file_size: pending.file_size,
        width: w,
        height: h,
        duration_seconds: dur,
        uploader_name: pending.uploader_name,
        created_at: created.created_at,
        thumb_url: thumb,
        view_url: full?.signedUrl ?? null,
        can_download: true,
      },
    });
  } catch (err) {
    console.error('upload-complete error:', err);
    res.status(500).json({ error: 'Failed to finalize upload' });
  }
});

// Admin: list groups with their share links.
app.get('/api/admin/photo-groups', adminAuth, async (_req, res) => {
  if (!galleryConfigured()) return notConfigured(res);
  try {
    const { rows } = await getPg().query<GroupRow & { photo_count: string }>(
      `select g.id, g.display_name, g.access_token, g.can_download, g.sort_order,
              coalesce((select count(*) from photos p where p.group_id = g.id), 0)::text as photo_count
         from photo_groups g
         order by g.sort_order`
    );
    res.json(rows.map((r) => ({
      id: r.id,
      display_name: r.display_name,
      access_token: r.access_token,
      can_download: r.can_download,
      photo_count: Number(r.photo_count),
    })));
  } catch (err) {
    console.error('List groups error:', err);
    res.status(500).json({ error: 'Failed to list groups' });
  }
});

// Admin: regenerate a group's access token (invalidates the old share link).
app.post('/api/admin/photo-groups/:id/regenerate-token', adminAuth, async (req, res) => {
  if (!galleryConfigured()) return notConfigured(res);
  try {
    const id = req.params.id;
    if (!/^[a-z0-9-]{1,50}$/.test(id)) { res.status(400).json({ error: 'Invalid group id' }); return; }
    const newToken = crypto.randomBytes(16).toString('hex');
    const { rows } = await getPg().query(
      `update photo_groups set access_token = $1 where id = $2 and access_token is not null
       returning id, access_token`,
      [newToken, id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Group not found or not regeneratable' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error('Regenerate token error:', err);
    res.status(500).json({ error: 'Failed to regenerate token' });
  }
});

// --- Weather Forecast ---

const WEDDING_LAT = 33.7489;
const WEDDING_LNG = -117.8681;
const WEDDING_DATE = '2026-05-20';
const WEDDING_TZ_OFFSET = -7; // PDT = UTC-7
const WEDDING_DAY_START_UTC = new Date(`${WEDDING_DATE}T07:00:00Z`); // midnight PDT in UTC

let weatherCache: { data: any; timestamp: number } | null = null;
const WEATHER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getDaysUntilWedding(): number {
  return Math.ceil((WEDDING_DAY_START_UTC.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

type AdviceIcon = 'umbrella' | 'sun' | 'wind' | 'jacket' | 'shirt';

function getClothingAdvice(forecast: { tempF: number; rainProbability: number; windSpeedMph: number; condition: string }) {
  const advice: { icon: AdviceIcon; text: string }[] = [];

  if (forecast.rainProbability > 40) {
    advice.push({ icon: 'umbrella', text: 'Bring an umbrella — chance of rain' });
  }
  if (forecast.tempF > 85) {
    advice.push({ icon: 'sun', text: 'Apply sunscreen & stay hydrated' });
  } else if (forecast.tempF > 75) {
    advice.push({ icon: 'shirt', text: 'Light, breathable clothing recommended' });
  }
  if (forecast.tempF < 60) {
    advice.push({ icon: 'jacket', text: 'Bring a light jacket or shawl' });
  }
  if (forecast.windSpeedMph > 15) {
    advice.push({ icon: 'wind', text: 'It may be breezy — secure loose accessories' });
  }
  if (forecast.condition === 'Clear') {
    advice.push({ icon: 'sun', text: 'Sunglasses recommended for outdoor moments' });
  }
  if (advice.length === 0) {
    advice.push({ icon: 'shirt', text: 'Perfect weather for a wedding!' });
  }
  return advice;
}

function summarizeDay(entries: any[]) {
  const temps = entries.map((e: any) => e.main.temp);
  const highC = Math.round(Math.max(...temps));
  const lowC = Math.round(Math.min(...temps));
  const maxRain = Math.round(Math.max(...entries.map((e: any) => (e.pop || 0) * 100)));
  const windSpeeds = entries.map((e: any) => e.wind.speed);
  const avgWindMph = Math.round((windSpeeds.reduce((a: number, b: number) => a + b, 0) / windSpeeds.length) * 2.237);

  const condCounts: Record<string, number> = {};
  for (const e of entries) {
    const main = e.weather[0].main;
    condCounts[main] = (condCounts[main] || 0) + 1;
  }
  const predominant = Object.entries(condCounts).sort((a, b) => b[1] - a[1])[0][0];

  const dayEntry = entries.find((e: any) => e.weather[0].main === predominant && e.weather[0].icon.endsWith('d'))
    || entries.find((e: any) => e.weather[0].main === predominant)
    || entries[0];

  return {
    highC,
    lowC,
    highF: Math.round(highC * 9 / 5 + 32),
    lowF: Math.round(lowC * 9 / 5 + 32),
    condition: predominant,
    description: dayEntry.weather[0].description,
    icon: dayEntry.weather[0].icon,
    rainProbability: maxRain,
    windSpeedMph: avgWindMph,
  };
}

app.get('/api/weather', async (_req, res) => {
  const daysUntil = getDaysUntilWedding();
  const unavailable = { available: false, daysUntilWedding: daysUntil, weddingDate: WEDDING_DATE, dailyForecasts: [] };

  try {
    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey) { res.json(unavailable); return; }

    if (weatherCache && Date.now() - weatherCache.timestamp < WEATHER_CACHE_TTL) {
      res.json(weatherCache.data);
      return;
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${WEDDING_LAT}&lon=${WEDDING_LNG}&units=metric&appid=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OpenWeatherMap error: ${response.status}`);
    const data = await response.json();

    const byDay: Record<string, any[]> = {};
    for (const entry of data.list) {
      const localDate = new Date((entry.dt * 1000) + (WEDDING_TZ_OFFSET * 60 * 60 * 1000));
      const dateKey = localDate.toISOString().slice(0, 10);
      if (!byDay[dateKey]) byDay[dateKey] = [];
      byDay[dateKey].push(entry);
    }

    const dailyForecasts = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entries]) => ({
        date,
        isWeddingDay: date === WEDDING_DATE,
        ...summarizeDay(entries),
      }));

    const weddingDay = dailyForecasts.find(d => d.isWeddingDay);
    const clothingAdvice = weddingDay
      ? getClothingAdvice({ tempF: weddingDay.highF, rainProbability: weddingDay.rainProbability, windSpeedMph: weddingDay.windSpeedMph, condition: weddingDay.condition })
      : undefined;

    const result = {
      available: dailyForecasts.length > 0,
      daysUntilWedding: daysUntil,
      weddingDate: WEDDING_DATE,
      dailyForecasts,
      clothingAdvice,
    };

    weatherCache = { data: result, timestamp: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('Weather API error:', err);
    res.json(unavailable);
  }
});

// --- Admin Routes ---

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string' ||
      password.length !== ADMIN_PASSWORD.length ||
      !crypto.timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD))) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  res.json({ ok: true });
});

// Admin: Guests
app.delete('/api/admin/guests/:id', adminAuth, (req, res) => {
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid ID' }); return; }
  const guest = db.prepare('SELECT slug FROM guests WHERE id = ?').get(id) as { slug: string } | undefined;
  if (guest) {
    try { fs.unlinkSync(join(cardsDir, `${guest.slug}.png`)); } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  // Clean up related records to avoid orphans
  db.prepare('DELETE FROM rsvp WHERE guest_id = ?').run(id);
  db.prepare('DELETE FROM guests WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Admin: Invite cards — upload generated card PNG
app.post('/api/admin/cards/:slug', adminAuth, express.raw({ type: 'image/png', limit: '5mb' }), async (req, res) => {
  const { slug } = req.params;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    res.status(400).json({ error: 'Invalid slug' }); return;
  }
  const guest = db.prepare('SELECT id FROM guests WHERE slug = ?').get(slug);
  if (!guest) { res.status(404).json({ error: 'Guest not found' }); return; }
  if (!Buffer.isBuffer(req.body)) { res.status(400).json({ error: 'Expected PNG binary' }); return; }
  const cardPath = join(cardsDir, `${slug}.png`);
  await fs.promises.writeFile(cardPath, req.body);
  res.json({ ok: true, url: `/cards/${slug}.png` });
});

// Admin: RSVPs
app.get('/api/admin/rsvp', adminAuth, (_req, res) => {
  // #16: Add limit
  const rsvps = db.prepare(`
    SELECT rsvp.id, rsvp.name, rsvp.attending, rsvp.created_at,
           guests.name as guest_name, guests.slug as guest_slug
    FROM rsvp LEFT JOIN guests ON rsvp.guest_id = guests.id
    ORDER BY rsvp.created_at DESC LIMIT 500
  `).all();
  res.json(rsvps);
});

app.delete('/api/admin/rsvp/:id', adminAuth, (req, res) => {
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid ID' }); return; }
  db.prepare('DELETE FROM rsvp WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Admin: Guest Book
app.delete('/api/admin/guest-book/:id', adminAuth, (req, res) => {
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid ID' }); return; }
  db.prepare('DELETE FROM guest_book WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Admin: Gallery
app.post('/api/admin/gallery', adminAuth, writeLimiter, (req, res) => {
  const { url, caption } = req.body;
  // #15: Validate lengths; #9: Validate URL scheme
  if (!url || typeof url !== 'string' || url.length > MAX_URL_LEN) {
    res.status(400).json({ error: 'Valid URL required' }); return;
  }
  if (!caption || typeof caption !== 'string' || caption.length > MAX_MESSAGE_LEN) {
    res.status(400).json({ error: 'Caption required (max 500 chars)' }); return;
  }
  // #9/#13: Only allow https URLs
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'Only HTTPS URLs allowed' }); return;
    }
  } catch {
    res.status(400).json({ error: 'Invalid URL format' }); return;
  }

  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM gallery').get() as { m: number | null };
  const sortOrder = (maxOrder.m ?? -1) + 1;
  const result = db.prepare('INSERT INTO gallery (url, caption, sort_order) VALUES (?, ?, ?)').run(url, caption, sortOrder);
  const image = db.prepare('SELECT id, url, caption, sort_order FROM gallery WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(image);
});

// Admin: Gallery file upload
app.post('/api/admin/gallery/upload', adminAuth, galleryUpload.single('image'), (req, res) => {
  const { caption } = req.body;
  if (!caption || typeof caption !== 'string' || caption.length > MAX_MESSAGE_LEN) {
    res.status(400).json({ error: 'Caption required (max 500 chars)' }); return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'Image file required' }); return;
  }
  const filePath = join(galleryDir, req.file.filename);
  if (!validateMediaMagicBytes(filePath)) {
    fs.unlinkSync(filePath);
    res.status(400).json({ error: 'Invalid image file' }); return;
  }
  const url = `/gallery-images/${req.file.filename}`;
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM gallery').get() as { m: number | null };
  const sortOrder = (maxOrder.m ?? -1) + 1;
  const result = db.prepare('INSERT INTO gallery (url, caption, sort_order) VALUES (?, ?, ?)').run(url, caption, sortOrder);
  const image = db.prepare('SELECT id, url, caption, sort_order FROM gallery WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(image);
});

app.delete('/api/admin/gallery/:id', adminAuth, (req, res) => {
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid ID' }); return; }
  db.prepare('DELETE FROM gallery WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.patch('/api/admin/gallery/:id', adminAuth, (req, res) => {
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid ID' }); return; }
  const { caption, sort_order } = req.body;
  if (caption !== undefined) {
    if (typeof caption !== 'string' || caption.length > MAX_MESSAGE_LEN) {
      res.status(400).json({ error: 'Caption too long' }); return;
    }
    db.prepare('UPDATE gallery SET caption = ? WHERE id = ?').run(caption, id);
  }
  if (sort_order !== undefined) {
    const order = parseIntParam(String(sort_order));
    if (order === null) { res.status(400).json({ error: 'Invalid sort order' }); return; }
    db.prepare('UPDATE gallery SET sort_order = ? WHERE id = ?').run(order, id);
  }
  const image = db.prepare('SELECT id, url, caption, sort_order FROM gallery WHERE id = ?').get(id);
  res.json(image);
});

// Admin: Photos
app.get('/api/admin/photos', adminAuth, (_req, res) => {
  // #16: Add limit
  const photos = db.prepare(
    'SELECT id, uploader_name, file_path, original_filename, file_size, created_at FROM photos ORDER BY created_at DESC LIMIT 500'
  ).all();
  res.json(photos);
});

app.delete('/api/admin/photos/:id', adminAuth, (req, res) => {
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid ID' }); return; }

  const photo = db.prepare('SELECT file_path FROM photos WHERE id = ?').get(id) as { file_path: string } | undefined;
  db.prepare('DELETE FROM photos WHERE id = ?').run(id);
  if (photo) {
    // #14: Path traversal protection
    const filename = photo.file_path.replace('/wedding-photos/', '');
    const resolved = resolve(weddingPhotosDir, filename);
    if (resolved.startsWith(resolve(weddingPhotosDir))) {
      try { fs.unlinkSync(resolved); } catch (e) { console.error('Failed to delete photo file:', e); }
    } else {
      console.error('Path traversal attempt blocked:', photo.file_path);
    }
  }
  res.json({ ok: true });
});

// Multer error handler
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large (max 10MB)' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }
  if (err?.message?.startsWith('File type not allowed')) {
    res.status(400).json({ error: 'Only JPG, PNG, GIF, WebP, and HEIC images are allowed' });
    return;
  }
  next(err);
});

// #18: HTTPS redirect in production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      res.redirect(301, `https://${req.headers.host}${req.url}`);
      return;
    }
    next();
  });

  const distPath = join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
