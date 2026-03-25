import 'dotenv/config';
import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const weddingPhotosDir = join(__dirname, 'wedding-photos');
if (!fs.existsSync(weddingPhotosDir)) fs.mkdirSync(weddingPhotosDir, { recursive: true });

const createImageUpload = (dest: string) => multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dest),
    filename: (_req, file, cb) => {
      const ext = file.originalname.split('.').pop();
      cb(null, `${crypto.randomBytes(8).toString('hex')}.${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

const upload = createImageUpload(uploadsDir);
const photoUpload = createImageUpload(weddingPhotosDir);

const app = express();
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/wedding-photos', express.static(weddingPhotosDir));

const db = new Database(join(__dirname, 'wedding.db'));
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

// --- API Routes ---

// Guests
app.get('/api/guests', (_req, res) => {
  const guests = db.prepare('SELECT id, slug, name, created_at FROM guests ORDER BY created_at DESC').all();
  res.json(guests);
});

app.get('/api/guests/:slug', (req, res) => {
  const guest = db.prepare('SELECT id, slug, name FROM guests WHERE slug = ?').get(req.params.slug);
  if (!guest) { res.status(404).json({ error: 'Guest not found' }); return; }
  res.json(guest);
});

app.post('/api/guests', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters' });
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
  const entries = db.prepare('SELECT id, name, message, photo_url, created_at FROM guest_book ORDER BY created_at DESC').all() as any[];
  const likes = db.prepare('SELECT entry_id, COUNT(*) as count FROM guest_book_likes GROUP BY entry_id').all() as any[];
  const replies = db.prepare('SELECT id, entry_id, name, message, created_at FROM guest_book_replies ORDER BY created_at ASC').all() as any[];

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

app.post('/api/guest-book', upload.single('photo'), (req, res) => {
  const { name, message } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters' });
    return;
  }
  if (!message || typeof message !== 'string' || message.trim().length < 5 || message.length > 500) {
    res.status(400).json({ error: 'Message must be 5-500 characters' });
    return;
  }
  const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const result = db.prepare('INSERT INTO guest_book (name, message, photo_url) VALUES (?, ?, ?)').run(name.trim(), message.trim(), photoUrl);
  const entry = db.prepare('SELECT id, name, message, photo_url, created_at FROM guest_book WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(entry);
});

// Guest Book: Like
app.post('/api/guest-book/:id/like', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  try {
    db.prepare('INSERT INTO guest_book_likes (entry_id, name) VALUES (?, ?)').run(req.params.id, name.trim());
  } catch {
    // UNIQUE constraint — already liked, remove the like (toggle)
    db.prepare('DELETE FROM guest_book_likes WHERE entry_id = ? AND name = ?').run(req.params.id, name.trim());
  }
  const count = db.prepare('SELECT COUNT(*) as count FROM guest_book_likes WHERE entry_id = ?').get(req.params.id) as { count: number };
  res.json({ likes: count.count });
});

// Guest Book: Reply
app.post('/api/guest-book/:id/reply', (req, res) => {
  const { name, message } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  if (!message || typeof message !== 'string' || message.trim().length < 1 || message.length > 300) {
    res.status(400).json({ error: 'Reply must be 1-300 characters' });
    return;
  }
  const result = db.prepare('INSERT INTO guest_book_replies (entry_id, name, message) VALUES (?, ?, ?)').run(req.params.id, name.trim(), message.trim());
  const reply = db.prepare('SELECT id, entry_id, name, message, created_at FROM guest_book_replies WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(reply);
});

// RSVP
app.get('/api/rsvp/:guest_id', (req, res) => {
  const rsvp = db.prepare('SELECT id, name, attending, message, created_at FROM rsvp WHERE guest_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.guest_id);
  if (!rsvp) { res.status(404).json({ error: 'No RSVP found' }); return; }
  res.json(rsvp);
});

app.post('/api/rsvp', (req, res) => {
  const { name, attending, guest_id } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters' });
    return;
  }
  const attendingVal = attending ? 1 : 0;
  const guestIdVal = guest_id ? Number(guest_id) : null;

  if (guestIdVal) {
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

app.post('/api/photos', photoUpload.array('photos', 10), (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters' });
    return;
  }
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'At least one photo is required' });
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
  const inserted = insertMany(files);
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

  // Pick the most common weather condition (mode)
  const condCounts: Record<string, number> = {};
  for (const e of entries) {
    const main = e.weather[0].main;
    condCounts[main] = (condCounts[main] || 0) + 1;
  }
  const predominant = Object.entries(condCounts).sort((a, b) => b[1] - a[1])[0][0];

  // Pick icon from the entry with the predominant condition (prefer daytime 'd' icon)
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

    // Group entries by local date (PDT = UTC-7)
    const byDay: Record<string, any[]> = {};
    for (const entry of data.list) {
      const localDate = new Date((entry.dt * 1000) + (WEDDING_TZ_OFFSET * 60 * 60 * 1000));
      const dateKey = localDate.toISOString().slice(0, 10);
      if (!byDay[dateKey]) byDay[dateKey] = [];
      byDay[dateKey].push(entry);
    }

    // Build daily forecasts
    const dailyForecasts = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entries]) => ({
        date,
        isWeddingDay: date === WEDDING_DATE,
        ...summarizeDay(entries),
      }));

    // Wedding day clothing advice (if wedding day is in range)
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

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

function adminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== ADMIN_PASSWORD) { res.status(401).json({ error: 'Unauthorized' }); return; }
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) { res.json({ ok: true }); return; }
  res.status(401).json({ error: 'Invalid password' });
});

// Admin: Guests
app.delete('/api/admin/guests/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM guests WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Admin: RSVPs
app.get('/api/admin/rsvp', adminAuth, (_req, res) => {
  const rsvps = db.prepare(`
    SELECT rsvp.id, rsvp.name, rsvp.attending, rsvp.created_at,
           guests.name as guest_name, guests.slug as guest_slug
    FROM rsvp LEFT JOIN guests ON rsvp.guest_id = guests.id
    ORDER BY rsvp.created_at DESC
  `).all();
  res.json(rsvps);
});

app.delete('/api/admin/rsvp/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM rsvp WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Admin: Guest Book
app.delete('/api/admin/guest-book/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM guest_book WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Admin: Gallery
app.post('/api/admin/gallery', adminAuth, (req, res) => {
  const { url, caption } = req.body;
  if (!url || !caption) { res.status(400).json({ error: 'URL and caption required' }); return; }
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM gallery').get() as { m: number | null };
  const sortOrder = (maxOrder.m ?? -1) + 1;
  const result = db.prepare('INSERT INTO gallery (url, caption, sort_order) VALUES (?, ?, ?)').run(url, caption, sortOrder);
  const image = db.prepare('SELECT id, url, caption, sort_order FROM gallery WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(image);
});

app.delete('/api/admin/gallery/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.patch('/api/admin/gallery/:id', adminAuth, (req, res) => {
  const { caption, sort_order } = req.body;
  if (caption !== undefined) db.prepare('UPDATE gallery SET caption = ? WHERE id = ?').run(caption, req.params.id);
  if (sort_order !== undefined) db.prepare('UPDATE gallery SET sort_order = ? WHERE id = ?').run(sort_order, req.params.id);
  const image = db.prepare('SELECT id, url, caption, sort_order FROM gallery WHERE id = ?').get(req.params.id);
  res.json(image);
});

// Admin: Photos
app.get('/api/admin/photos', adminAuth, (_req, res) => {
  const photos = db.prepare(
    'SELECT id, uploader_name, file_path, original_filename, file_size, created_at FROM photos ORDER BY created_at DESC'
  ).all();
  res.json(photos);
});

app.delete('/api/admin/photos/:id', adminAuth, (req, res) => {
  const photo = db.prepare('SELECT file_path FROM photos WHERE id = ?').get(req.params.id) as { file_path: string } | undefined;
  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  if (photo) {
    try { fs.unlinkSync(join(weddingPhotosDir, photo.file_path.replace('/wedding-photos/', ''))); } catch {}
  }
  res.json({ ok: true });
});

// Production: serve static files
if (process.env.NODE_ENV === 'production') {
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
