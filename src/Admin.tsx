import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CardDesign, generateCardPng, CARD_W, CARD_H } from './InviteCardDesign';

type Tab = 'guests' | 'rsvps' | 'guestbook' | 'gallery' | 'photos';

const API_HEADERS = (password: string) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${password}`,
});

export default function Admin() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState<Tab>('guests');

  // Check sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('admin_pw');
    if (saved) { setPassword(saved); setAuthed(true); }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      sessionStorage.setItem('admin_pw', password);
      setAuthed(true);
    } else {
      setLoginError('Invalid password');
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#fdfaf6] flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-serif text-[#1a1a1a]">Admin</h1>
            <p className="text-sm text-gray-400 font-serif mt-1">Enter password to continue</p>
          </div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-[#8b0000] transition-colors"
            autoFocus
          />
          {loginError && <p className="text-red-500 text-xs text-center">{loginError}</p>}
          <button className="w-full py-3 bg-[#8b0000] text-white rounded-lg text-sm font-medium hover:bg-[#a00000] transition-colors">
            Login
          </button>
        </form>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'guests', label: 'Guests' },
    { key: 'rsvps', label: 'RSVPs' },
    { key: 'guestbook', label: 'Guest Book' },
    { key: 'gallery', label: 'Gallery' },
    { key: 'photos', label: 'Photo Album' },
  ];

  return (
    <div className="min-h-screen bg-[#fdfaf6]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-serif text-[#8b0000]">Wedding Admin</h1>
          <button
            onClick={() => { sessionStorage.removeItem('admin_pw'); setAuthed(false); setPassword(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Logout
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key ? 'border-[#8b0000] text-[#8b0000]' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'guests' && <GuestsTab password={password} />}
        {tab === 'rsvps' && <RsvpsTab password={password} />}
        {tab === 'guestbook' && <GuestBookTab password={password} />}
        {tab === 'gallery' && <GalleryTab password={password} />}
        {tab === 'photos' && <PhotosTab password={password} />}
      </main>
    </div>
  );
}

function GuestsTab({ password }: { password: string }) {
  const [guests, setGuests] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [generatingSlug, setGeneratingSlug] = useState<string | null>(null);
  const [cardTimestamps, setCardTimestamps] = useState<Record<string, number>>({});
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const generatingRef = useRef<Set<string>>(new Set());
  // Pre-loaded card File objects — navigator.share requires sync access from user gesture
  const cardFilesRef = useRef<Map<string, File>>(new Map());

  const preloadCardFile = useCallback(async (slug: string) => {
    if (cardFilesRef.current.has(slug)) return;
    try {
      const res = await fetch(`/cards/${slug}.png`);
      if (!res.ok) return;
      const blob = await res.blob();
      cardFilesRef.current.set(slug, new File([blob], `wedding-invite-${slug}.png`, { type: 'image/png' }));
    } catch { /* ignore */ }
  }, []);

  const load = () => {
    fetch('/api/guests', { headers: API_HEADERS(password) })
      .then(r => r.json())
      .then((data: any[]) => {
        setGuests(data);
        data.filter(g => g.hasCard).forEach(g => preloadCardFile(g.slug));
      });
  };
  useEffect(load, []);

  const generateAndUploadCard = useCallback(async (slug: string): Promise<boolean> => {
    const container = cardContainerRef.current;
    if (!container || generatingRef.current.has(slug)) return false;

    generatingRef.current.add(slug);
    setGeneratingSlug(slug);
    let mount: HTMLDivElement | null = null;
    let root: Root | null = null;
    try {
      mount = document.createElement('div');
      container.appendChild(mount);
      root = createRoot(mount);
      root.render(<CardDesign slug={slug} />);

      // Wait for React render flush + font loading
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await document.fonts.ready;

      const cardNode = mount.firstElementChild as HTMLElement;
      if (!cardNode) throw new Error('Card not rendered');

      const dataUrl = await generateCardPng(cardNode);
      const blob = await (await fetch(dataUrl)).blob();

      const uploadRes = await fetch(`/api/admin/cards/${slug}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${password}`, 'Content-Type': 'image/png' },
        body: blob,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      return true;
    } catch (err) {
      console.error(`Card generation failed for ${slug}:`, err);
      return false;
    } finally {
      root?.unmount();
      if (mount?.parentNode) mount.parentNode.removeChild(mount);
      generatingRef.current.delete(slug);
      setGeneratingSlug(null);
    }
  }, [password]);

  // Auto-generate cards for guests missing one (runs once on initial load)
  const hasRunAutoGen = useRef(false);
  useEffect(() => {
    if (guests.length === 0 || hasRunAutoGen.current) return;
    const missing = guests.filter(g => !g.hasCard);
    if (missing.length === 0) return;
    hasRunAutoGen.current = true;

    let cancelled = false;
    (async () => {
      for (const guest of missing) {
        if (cancelled) break;
        const ok = await generateAndUploadCard(guest.slug);
        if (ok && !cancelled) {
          setGuests(prev => prev.map(g => g.id === guest.id ? { ...g, hasCard: true } : g));
        }
      }
    })();
    return () => { cancelled = true; hasRunAutoGen.current = false; };
  }, [guests.length, generateAndUploadCard]);

  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: API_HEADERS(password),
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      const newGuest = await res.json();
      setName('');
      setGuests(prev => [{ ...newGuest, hasCard: false, created_at: new Date().toISOString() }, ...prev]);

      const ok = await generateAndUploadCard(newGuest.slug);
      if (ok) {
        setGuests(prev => prev.map(g => g.id === newGuest.id ? { ...g, hasCard: true } : g));
      }
    } catch (err) {
      console.error('Failed to add guest:', err);
    }
  };

  const deleteGuest = async (id: number, slug: string) => {
    cardFilesRef.current.delete(slug);
    setGuests(prev => prev.filter(g => g.id !== id));
    await fetch(`/api/admin/guests/${id}`, { method: 'DELETE', headers: API_HEADERS(password) });
  };

  const copyLink = (slug: string) => {
    const link = `${window.location.origin}/invite/${slug}`;
    navigator.clipboard.writeText(link);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  const shareCard = (slug: string) => {
    const file = cardFilesRef.current.get(slug);
    if (!file) return;
    // Call navigator.share synchronously in click handler — gesture must be live
    navigator.share({ files: [file], title: 'Wedding Invitation' }).catch(() => {});
  };

  const regenerateCard = async (slug: string) => {
    cardFilesRef.current.delete(slug);
    const ok = await generateAndUploadCard(slug);
    if (ok) {
      setGuests(prev => prev.map(g => g.slug === slug ? { ...g, hasCard: true } : g));
      setCardTimestamps(prev => ({ ...prev, [slug]: Date.now() }));
      preloadCardFile(slug);
    }
  };

  return (
    <div className="space-y-6">
      {/* Off-screen card renderer */}
      <div
        ref={cardContainerRef}
        style={{ position: 'fixed', left: '-9999px', top: 0, width: `${CARD_W}px`, height: `${CARD_H}px`, overflow: 'hidden' }}
      />

      <form onSubmit={addGuest} className="flex gap-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Guest name (e.g. John & Jane Smith)"
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[#8b0000] transition-colors"
        />
        <button type="submit" className="px-5 py-2.5 bg-[#8b0000] text-white rounded-lg text-sm font-medium hover:bg-[#a00000] transition-colors whitespace-nowrap">
          Add Guest
        </button>
      </form>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Invite Link</th>
              <th className="px-4 py-3">Card</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {guests.map((g: any) => (
              <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-[#1a1a1a]">{g.name}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => copyLink(g.slug)}
                    className="text-xs text-[#8b0000] hover:underline font-mono"
                  >
                    {copied === g.slug ? 'Copied!' : `/invite/${g.slug}`}
                  </button>
                </td>
                <td className="px-4 py-2">
                  {generatingSlug === g.slug ? (
                    <span className="text-xs text-amber-500">Generating...</span>
                  ) : g.hasCard ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={`/cards/${g.slug}.png${cardTimestamps[g.slug] ? `?t=${cardTimestamps[g.slug]}` : ''}`}
                        alt=""
                        className="rounded-sm border border-gray-100"
                        style={{ width: '36px', height: '50px', objectFit: 'cover' }}
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => shareCard(g.slug)}
                          className="text-xs text-[#8b0000] hover:underline text-left"
                        >
                          Share
                        </button>
                        <button
                          onClick={() => regenerateCard(g.slug)}
                          className="text-xs text-gray-400 hover:text-gray-600 text-left"
                        >
                          Regen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => regenerateCard(g.slug)}
                      className="text-xs text-amber-600 hover:underline"
                    >
                      Generate
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400">{new Date(g.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteGuest(g.id, g.slug)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {guests.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No guests yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RsvpsTab({ password }: { password: string }) {
  const [rsvps, setRsvps] = useState<any[]>([]);

  const load = () => {
    fetch('/api/admin/rsvp', { headers: API_HEADERS(password) }).then(r => r.json()).then(setRsvps);
  };
  useEffect(load, []);

  const deleteRsvp = async (id: number) => {
    await fetch(`/api/admin/rsvp/${id}`, { method: 'DELETE', headers: API_HEADERS(password) });
    load();
  };

  const attending = rsvps.filter((r: any) => r.attending);
  const declining = rsvps.filter((r: any) => !r.attending);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-serif text-[#8b0000]">{attending.length}</p>
          <p className="text-xs text-gray-400 mt-1">Attending</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-serif text-gray-500">{declining.length}</p>
          <p className="text-xs text-gray-400 mt-1">Declined</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rsvps.map((r: any) => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-[#1a1a1a]">{r.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    r.attending ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {r.attending ? 'Attending' : 'Declined'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteRsvp(r.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rsvps.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No RSVPs yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GuestBookTab({ password }: { password: string }) {
  const [entries, setEntries] = useState<any[]>([]);

  const load = () => {
    fetch('/api/guest-book').then(r => r.json()).then(setEntries);
  };
  useEffect(load, []);

  const deleteEntry = async (id: number) => {
    await fetch(`/api/admin/guest-book/${id}`, { method: 'DELETE', headers: API_HEADERS(password) });
    load();
  };

  return (
    <div className="space-y-4">
      {entries.length === 0 && (
        <p className="text-center text-gray-400 py-12">No guest book entries yet</p>
      )}
      {entries.map((e: any) => (
        <div key={e.id} className="bg-white rounded-xl border border-gray-100 p-5 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {e.photo_url && (
              <img src={e.photo_url} alt="" className="w-24 h-24 rounded-lg object-cover mb-3" />
            )}
            <p className="text-sm text-[#1a1a1a]">{e.message}</p>
            <p className="text-xs text-gray-400 mt-2">
              — {e.name} &middot; {new Date(e.created_at).toLocaleDateString()}
            </p>
          </div>
          <button onClick={() => deleteEntry(e.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors flex-shrink-0">
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}

function PhotosTab({ password }: { password: string }) {
  const [photos, setPhotos] = useState<any[]>([]);

  const load = () => {
    fetch('/api/admin/photos', { headers: API_HEADERS(password) }).then(r => r.json()).then(setPhotos);
  };
  useEffect(load, []);

  const deletePhoto = async (id: number) => {
    await fetch(`/api/admin/photos/${id}`, { method: 'DELETE', headers: API_HEADERS(password) });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <p className="text-2xl font-serif text-[#8b0000]">{photos.length}</p>
        <p className="text-xs text-gray-400 mt-1">Photos Shared</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {photos.map((photo: any) => (
          <div key={photo.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="aspect-square bg-gray-100">
              <img src={photo.file_path} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="p-3 space-y-1">
              <p className="text-xs text-gray-600 font-medium truncate">{photo.uploader_name}</p>
              <p className="text-[10px] text-gray-400">{new Date(photo.created_at).toLocaleDateString()}</p>
              {photo.file_size && (
                <p className="text-[10px] text-gray-400">{(photo.file_size / 1024 / 1024).toFixed(1)} MB</p>
              )}
              <button onClick={() => deletePhoto(photo.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                Delete
              </button>
            </div>
          </div>
        ))}
        {photos.length === 0 && (
          <p className="col-span-full text-center text-gray-400 py-12">No photos yet</p>
        )}
      </div>
    </div>
  );
}

function GalleryTab({ password }: { password: string }) {
  const [images, setImages] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = () => {
    fetch('/api/gallery').then(r => r.json()).then(setImages);
  };
  useEffect(load, []);

  const addImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !caption.trim()) return;
    setUploadError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('caption', caption.trim());
      const res = await fetch('/api/admin/gallery/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${password}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }));
        setUploadError(data.error || `Upload failed (${res.status})`);
        return;
      }
      setFile(null);
      setCaption('');
      load();
    } catch {
      setUploadError('Network error — please try again');
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async (id: number) => {
    await fetch(`/api/admin/gallery/${id}`, { method: 'DELETE', headers: API_HEADERS(password) });
    load();
  };

  const moveImage = async (id: number, direction: 'up' | 'down') => {
    const idx = images.findIndex((img: any) => img.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= images.length) return;

    const current = images[idx];
    const swap = images[swapIdx];
    await fetch(`/api/admin/gallery/${current.id}`, {
      method: 'PATCH',
      headers: API_HEADERS(password),
      body: JSON.stringify({ sort_order: swap.sort_order }),
    });
    await fetch(`/api/admin/gallery/${swap.id}`, {
      method: 'PATCH',
      headers: API_HEADERS(password),
      body: JSON.stringify({ sort_order: current.sort_order }),
    });
    load();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={addImage} className="flex flex-col sm:flex-row gap-3">
        <label className="flex-1 flex items-center px-4 py-2.5 border border-gray-200 rounded-lg text-sm cursor-pointer hover:border-[#8b0000] transition-colors">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => setFile(e.target.files?.[0] || null)}
          />
          <span className="text-gray-500 truncate">{file ? file.name : 'Choose image...'}</span>
        </label>
        <input
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Caption"
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[#8b0000] transition-colors"
        />
        <button
          disabled={uploading}
          className="px-5 py-2.5 bg-[#8b0000] text-white rounded-lg text-sm font-medium hover:bg-[#a00000] transition-colors whitespace-nowrap disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>
      {uploadError && (
        <p className="text-red-600 text-sm -mt-3">{uploadError}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {images.map((img: any, idx: number) => (
          <div key={img.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden group">
            <div className="aspect-[4/3] bg-gray-100 relative">
              <img src={img.url} alt={img.caption} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div className="p-3 flex items-center justify-between">
              <p className="text-xs text-gray-600 truncate">{img.caption}</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => moveImage(img.id, 'up')}
                  disabled={idx === 0}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveImage(img.id, 'down')}
                  disabled={idx === images.length - 1}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                >
                  ↓
                </button>
                <button onClick={() => deleteImage(img.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {images.length === 0 && (
          <p className="col-span-full text-center text-gray-400 py-12">No images yet</p>
        )}
      </div>
    </div>
  );
}
