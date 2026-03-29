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
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "data:", "https://calendar.google.com", "https://maps.apple.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
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
