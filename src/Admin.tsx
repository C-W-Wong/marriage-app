import React, { useState, useEffect } from 'react';

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

  const load = () => {
    fetch('/api/guests').then(r => r.json()).then(setGuests);
  };
  useEffect(load, []);

  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      setName('');
      load();
    } catch (err) {
      console.error('Failed to add guest:', err);
    }
  };

  const deleteGuest = async (id: number) => {
    await fetch(`/api/admin/guests/${id}`, { method: 'DELETE', headers: API_HEADERS(password) });
    load();
  };

  const copyLink = (slug: string) => {
    const link = `${window.location.origin}/invite/${slug}`;
    navigator.clipboard.writeText(link);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
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
                <td className="px-4 py-3 text-gray-400">{new Date(g.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteGuest(g.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {guests.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No guests yet</td></tr>
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
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');

  const load = () => {
    fetch('/api/gallery').then(r => r.json()).then(setImages);
  };
  useEffect(load, []);

  const addImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !caption.trim()) return;
    await fetch('/api/admin/gallery', {
      method: 'POST',
      headers: API_HEADERS(password),
      body: JSON.stringify({ url: url.trim(), caption: caption.trim() }),
    });
    setUrl('');
    setCaption('');
    load();
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
      <form onSubmit={addImage} className="flex gap-3">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Image URL"
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[#8b0000] transition-colors"
        />
        <input
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Caption"
          className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[#8b0000] transition-colors"
        />
        <button className="px-5 py-2.5 bg-[#8b0000] text-white rounded-lg text-sm font-medium hover:bg-[#a00000] transition-colors whitespace-nowrap">
          Add
        </button>
      </form>

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
