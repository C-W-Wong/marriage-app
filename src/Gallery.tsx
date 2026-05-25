import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download, Check, X, Heart, ImageOff, Loader2, ChevronLeft, ChevronRight,
  UploadCloud, Image as ImageIcon, Film, User, Trash2, Plus, AlertTriangle,
  Lock, Sparkles, Images, Camera, Share2, Play, Music,
} from 'lucide-react';
import { WEDDING_CONFIG } from './weddingConfig';

type Photo = {
  id: string;
  group_id: string;
  file_name: string;
  thumb_url: string | null;
  full_url: string | null;
  width: number | null;
  height: number | null;
  can_download: boolean;
};

type Upload = {
  id: string;
  media_type: 'image' | 'video';
  file_name: string;
  mime_type: string | null;
  thumb_url: string | null;
  view_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  file_size: number | null;
  uploader_name: string | null;
  created_at: string;
  can_download: boolean;
};

type Category = { id: string; display_name: string };

type GalleryResponse = {
  group: { id: string; display_name: string; can_download: boolean; is_master: boolean };
  categories: Category[];
  default_category: string | null;
  photos: Photo[];
  guest_uploads: Upload[];
};

type Tab = 'photos' | 'uploads' | 'share';
const BATCH = 30;
const ALL = 'all';
const CALLIGRAPHY: React.CSSProperties = { fontFamily: 'var(--font-calligraphy), "Ma Shan Zheng", cursive' };

export default function Gallery() {
  const token = useMemo(() => {
    const m = window.location.pathname.match(/^\/photos\/([^/]+)$/);
    return m?.[1] ?? '';
  }, []);

  const [data, setData] = useState<GalleryResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'error'>('loading');
  const [tab, setTab] = useState<Tab>('photos');
  const [category, setCategory] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('category') || ALL;
  });
  const [visibleCount, setVisibleCount] = useState(BATCH);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [selectedUploads, setSelectedUploads] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<{ list: 'photos' | 'uploads'; index: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/gallery-access/${encodeURIComponent(token)}`);
      if (res.status === 404) { setStatus('invalid'); return; }
      if (!res.ok) { setStatus('error'); return; }
      const j: GalleryResponse = await res.json();
      setData(j);
      const fromUrl = new URLSearchParams(window.location.search).get('category');
      if (!fromUrl && j.default_category) setCategory(j.default_category);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    fetchData();
  }, [token, fetchData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (category === ALL) params.delete('category');
    else params.set('category', category);
    const search = params.toString();
    const next = window.location.pathname + (search ? `?${search}` : '');
    window.history.replaceState(null, '', next);
  }, [category]);

  useEffect(() => { setVisibleCount(BATCH); }, [tab, category]);

  const filteredPhotos = useMemo(() => {
    if (!data) return [];
    if (category === ALL) return data.photos;
    return data.photos.filter((p) => p.group_id === category);
  }, [data, category]);

  const currentList: (Photo | Upload)[] = tab === 'uploads' ? (data?.guest_uploads ?? []) : filteredPhotos;
  const visible = currentList.slice(0, visibleCount);
  const canLoadMore = visible.length < currentList.length;

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!canLoadMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const ob = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setVisibleCount((c) => c + BATCH);
          break;
        }
      }
    }, { rootMargin: '600px 0px' });
    ob.observe(el);
    return () => ob.disconnect();
  }, [canLoadMore, currentList.length, tab]);

  const downloadIds = useCallback(async (
    photoIds: string[],
    uploadIds: string[],
    opts: { clearAfter?: boolean } = {},
  ) => {
    if (photoIds.length + uploadIds.length === 0) return;
    const clearAfter = opts.clearAfter ?? true;
    const maybeClear = () => { if (clearAfter) clearAllSelections(); };
    setDownloading(true);
    try {
      const res = await fetch(`/api/gallery-access/${encodeURIComponent(token)}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds, uploadIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { photos } = await res.json() as { photos: { id: string; file_name: string; url: string }[] };
      const totalItems = photos.length;

      if (totalItems === 0) {
        showToast('Nothing available to download.');
        return;
      }

      // Single item: try Web Share (best mobile UX → Save to Photos), fall
      // through to a blob download. For ANY multi-select we go straight to the
      // server-side zip — Web Share with many large files is unreliable on
      // iOS Safari and fails silently for some users.
      if (totalItems === 1) {
        const p = photos[0];
        const canShare =
          typeof navigator !== 'undefined' &&
          typeof navigator.canShare === 'function' &&
          typeof navigator.share === 'function';
        if (canShare) {
          try {
            const r = await fetch(p.url);
            if (!r.ok) throw new Error(`fetch ${r.status}`);
            const blob = await r.blob();
            const file = new File([blob], p.file_name, { type: blob.type || 'application/octet-stream' });
            if (navigator.canShare!({ files: [file] })) {
              await navigator.share({ files: [file] });
              showToast('Saved.');
              maybeClear();
              return;
            }
          } catch (err) {
            if ((err as Error).name === 'AbortError') { maybeClear(); return; }
            // fall through to direct download
          }
        }

        let downloaded = false;
        try {
          const r = await fetch(p.url);
          if (!r.ok) throw new Error('fetch failed');
          const blob = await r.blob();
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objectUrl; a.download = p.file_name;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          downloaded = true;
          setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } catch {
          const fallback = window.open(p.url, '_blank', 'noopener,noreferrer');
          if (fallback) downloaded = true;
        }
        showToast(downloaded ? 'Downloaded.' : 'Could not start the download — please try again.');
        if (downloaded) maybeClear();
        return;
      }

      // Multi-item: server-side zip → top-level navigation. Response is
      // Content-Disposition: attachment so the browser treats it as a
      // download, not a navigation, and we stay on the page. window.location
      // is more reliable on mobile Safari than a programmatic anchor click.
      const prep = await fetch(`/api/gallery-access/${encodeURIComponent(token)}/zip-prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds, uploadIds }),
      });
      if (!prep.ok) {
        const err = await prep.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${prep.status}`);
      }
      const { session_id } = await prep.json() as { session_id: string };
      const zipUrl = `/api/gallery-access/${encodeURIComponent(token)}/zip?s=${encodeURIComponent(session_id)}`;
      showToast(`Preparing ${totalItems} items as a zip — check your downloads in a moment.`);
      maybeClear();
      // Top-level nav. The server responds with Content-Disposition: attachment
      // so the browser intercepts before navigating away.
      window.location.href = zipUrl;
    } catch (err) {
      console.error(err);
      showToast(`Download failed: ${(err as Error).message}`);
    } finally {
      setDownloading(false);
    }
  }, [token, showToast]);

  const clearAllSelections = useCallback(() => {
    setSelectedPhotos(new Set());
    setSelectedUploads(new Set());
  }, []);

  const togglePhoto = useCallback((id: string) => {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const toggleUpload = useCallback((id: string) => {
    setSelectedUploads((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const selectAllVisible = useCallback(() => {
    if (tab === 'uploads') {
      const ids = (visible as Upload[]).filter((u) => u.can_download).map((u) => u.id);
      setSelectedUploads((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    } else {
      const ids = (visible as Photo[]).filter((p) => p.can_download).map((p) => p.id);
      setSelectedPhotos((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    }
  }, [tab, visible]);
  const totalSelected = selectedPhotos.size + selectedUploads.size;

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowLeft') setLightbox((l) => l && { ...l, index: Math.max(0, l.index - 1) });
      else if (e.key === 'ArrowRight') {
        const list = lightbox.list === 'photos' ? filteredPhotos : (data?.guest_uploads ?? []);
        setLightbox((l) => l && { ...l, index: Math.min(list.length - 1, l.index + 1) });
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [lightbox?.list, filteredPhotos, data?.guest_uploads]);

  const handleUploadsAdded = useCallback((newOnes: Upload[]) => {
    if (newOnes.length === 0) return;
    setData((d) => d ? { ...d, guest_uploads: [...newOnes, ...d.guest_uploads] } : d);
    // Keep the lightbox pointed at the same item if it's open on uploads.
    setLightbox((l) => l && l.list === 'uploads' ? { ...l, index: l.index + newOnes.length } : l);
  }, []);

  if (status === 'loading') {
    return (
      <Splash>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <span
              style={CALLIGRAPHY}
              aria-hidden
              className="text-[#8b0000] text-5xl select-none"
            >囍</span>
            <Loader2 className="absolute -bottom-2 -right-3 w-5 h-5 animate-spin text-[#c5a059]" />
          </div>
          <p className="font-serif italic text-gray-500">Preparing your gallery…</p>
        </motion.div>
      </Splash>
    );
  }
  if (status === 'invalid' || !data) {
    return (
      <Splash>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-4 max-w-sm text-center"
        >
          <div className="w-16 h-16 rounded-full bg-[#8b0000]/5 border border-[#c5a059]/30 grid place-items-center">
            <ImageOff className="w-7 h-7 text-[#8b0000]" />
          </div>
          <h1 className="font-serif text-2xl text-[#1a1a1a]">Link not valid</h1>
          <p className="font-serif text-gray-500 text-sm">
            This gallery link is incorrect or has expired. Please double-check the link, or reach out to the couple.
          </p>
        </motion.div>
      </Splash>
    );
  }

  const tabs: { key: Tab; label: string; count?: number; icon: typeof Images }[] = [
    { key: 'photos', label: 'Photos', count: filteredPhotos.length, icon: Images },
    { key: 'uploads', label: 'Guest Shares', count: data.guest_uploads.length, icon: Camera },
    { key: 'share', label: 'Share Yours', icon: Share2 },
  ];

  return (
    <div
      className="min-h-screen bg-[#fdfaf6]"
      style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}
    >
      <Header
        groupName={data.group.display_name}
        isMaster={data.group.is_master}
        photoCount={data.photos.length}
        uploadCount={data.guest_uploads.length}
      />

      <main className="max-w-5xl mx-auto px-3 sm:px-4">
        <nav className="relative flex mt-4 sm:mt-5 mb-3 sm:mb-4 border-b border-[#c5a059]/25 overflow-x-auto hearty-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); clearAllSelections(); setLightbox(null); }}
                className={`relative px-4 sm:px-5 py-3.5 sm:py-3 text-[13px] sm:text-sm font-serif transition-colors -mb-px whitespace-nowrap inline-flex items-center gap-1.5 sm:gap-2 min-h-[44px] ${
                  active ? 'text-[#8b0000]' : 'text-gray-500 hover:text-[#1a1a1a]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 transition-colors ${active ? 'text-[#8b0000]' : 'text-gray-400'}`} />
                <span>{t.label}</span>
                {typeof t.count === 'number' && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${
                    active
                      ? 'bg-[#8b0000]/10 text-[#8b0000]'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {t.count}
                  </span>
                )}
                {active && (
                  <motion.span
                    layoutId="gallery-tab-underline"
                    className="absolute left-3 right-3 -bottom-px h-[2px] bg-[#8b0000] rounded-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'photos' && (
              <PhotosTab
                data={data}
                category={category}
                onCategoryChange={(c) => { setCategory(c); clearAllSelections(); setLightbox(null); }}
                visible={visible as Photo[]}
                selected={selectedPhotos}
                onToggle={togglePhoto}
                onSelectAll={selectAllVisible}
                onClearSelection={() => setSelectedPhotos(new Set())}
                openByPhoto={(p) => {
                  const i = filteredPhotos.findIndex((x) => x.id === p.id);
                  if (i >= 0) setLightbox({ list: 'photos', index: i });
                }}
                sentinelRef={sentinelRef}
                canLoadMore={canLoadMore}
                totalFiltered={filteredPhotos.length}
              />
            )}

            {tab === 'uploads' && (
              <UploadsTab
                visible={visible as Upload[]}
                allCount={data.guest_uploads.length}
                selected={selectedUploads}
                onToggle={toggleUpload}
                onSelectAll={selectAllVisible}
                onClearSelection={() => setSelectedUploads(new Set())}
                openByUpload={(u) => {
                  const i = (data.guest_uploads ?? []).findIndex((x) => x.id === u.id);
                  if (i >= 0) setLightbox({ list: 'uploads', index: i });
                }}
                sentinelRef={sentinelRef}
                canLoadMore={canLoadMore}
              />
            )}

            {tab === 'share' && (
              <ShareTab token={token} onUploaded={handleUploadsAdded} showToast={showToast} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {totalSelected > 0 && (
          <DownloadBar
            count={totalSelected}
            disabled={downloading}
            onDownload={() => downloadIds(Array.from(selectedPhotos), Array.from(selectedUploads))}
            onClear={clearAllSelections}
          />
        )}
      </AnimatePresence>

      {lightbox && (() => {
        const list: (Photo | Upload)[] = lightbox.list === 'photos' ? filteredPhotos : data.guest_uploads;
        return (
          <Lightbox
            items={list}
            index={lightbox.index}
            onClose={() => setLightbox(null)}
            onPrev={() => setLightbox((l) => l && { ...l, index: Math.max(0, l.index - 1) })}
            onNext={() => setLightbox((l) => l && { ...l, index: Math.min(list.length - 1, l.index + 1) })}
            onSave={(item) => {
              if ('media_type' in item) downloadIds([], [item.id], { clearAfter: false });
              else downloadIds([item.id], [], { clearAfter: false });
            }}
            downloading={downloading}
          />
        );
      })()}

      <MusicPlayer
        src="/that-sunny-day.mp3"
        duck={(() => {
          if (!lightbox) return false;
          const item = lightbox.list === 'uploads' ? data.guest_uploads[lightbox.index] : null;
          return !!item && (item as Upload).media_type === 'video';
        })()}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22 }}
            className="fixed left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] text-white text-[13px] sm:text-sm font-serif px-4 py-2.5 rounded-full shadow-lg max-w-[90vw] text-center"
            style={{
              bottom: totalSelected > 0
                ? 'calc(5.5rem + env(safe-area-inset-bottom))'
                : 'calc(1.5rem + env(safe-area-inset-bottom))',
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Tab components ----------

function PhotosTab({
  data, category, onCategoryChange,
  visible, selected, onToggle, onSelectAll, onClearSelection,
  openByPhoto, sentinelRef, canLoadMore, totalFiltered,
}: {
  data: GalleryResponse;
  category: string;
  onCategoryChange: (c: string) => void;
  visible: Photo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  openByPhoto: (p: Photo) => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  canLoadMore: boolean;
  totalFiltered: number;
}) {
  const chips = useMemo(() => [
    { id: ALL, display_name: 'All' },
    ...data.categories,
  ], [data.categories]);

  const anyDownloadable = visible.some((p) => p.can_download);
  const downloadableCount = visible.filter((p) => p.can_download).length;
  const allDownloadableSelected = downloadableCount > 0 && downloadableCount === selected.size;

  return (
    <>
      <div className="mb-3 -mx-3 sm:-mx-4 px-3 sm:px-4 overflow-x-auto hearty-scrollbar">
        <div className="flex gap-2 w-max">
          {chips.map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onCategoryChange(c.id)}
                className={`whitespace-nowrap text-[13px] sm:text-sm font-serif px-4 py-2 sm:py-1.5 rounded-full border transition-all min-h-[36px] sm:min-h-0 ${
                  active
                    ? 'bg-[#8b0000] text-white border-[#8b0000] shadow-sm shadow-[#8b0000]/20'
                    : 'bg-white text-[#1a1a1a] border-[#c5a059]/40 hover:bg-[#c5a059]/10 hover:border-[#c5a059]/70 active:scale-95'
                }`}
              >
                {c.display_name}
              </button>
            );
          })}
        </div>
      </div>

      {category === 'couple' && (
        <p className="text-xs sm:text-sm font-serif italic text-gray-500 mb-3 flex items-start gap-2 bg-[#c5a059]/8 border border-[#c5a059]/20 rounded-lg px-3 py-2">
          <Heart className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#8b0000]" />
          {data.group.is_master
            ? <span>Our couple portraits — yours to keep.</span>
            : <span>Couple portraits — for viewing only. Thank you for understanding.</span>}
        </p>
      )}

      {anyDownloadable && (
        <div className="mb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={onSelectAll}
                disabled={allDownloadableSelected}
                className="inline-flex items-center gap-1.5 text-[12px] sm:text-xs font-serif px-3 py-2 sm:py-1.5 rounded-full border border-[#c5a059]/40 text-[#1a1a1a] hover:bg-[#c5a059]/10 disabled:opacity-50 disabled:hover:bg-transparent active:scale-95 transition-all"
              >
                <Check className="w-3 h-3" />
                Select all visible
              </button>
              {selected.size > 0 && (
                <button
                  onClick={onClearSelection}
                  className="inline-flex items-center gap-1.5 text-[12px] sm:text-xs font-serif px-3 py-2 sm:py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                >
                  <X className="w-3 h-3" />
                  Clear ({selected.size})
                </button>
              )}
            </div>
          </div>
          <p className="font-serif text-[11px] italic text-gray-400 mt-2">
            <span className="sm:hidden">Tap to view · long-press to select</span>
            <span className="hidden sm:inline">Tap to view · long-press or shift-click to select</span>
          </p>
        </div>
      )}

      {totalFiltered === 0 ? (
        <EmptyState
          icon={<ImageOff className="w-7 h-7 text-[#c5a059]" />}
          title={category === ALL ? 'Nothing here yet' : 'Empty for now'}
          text={category === ALL ? 'Photos will appear here as the album is curated.' : 'Try another category, or check back soon.'}
        />
      ) : (
        <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((p, i) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, delay: Math.min(i * 0.012, 0.25) }}
              >
                <PhotoTile
                  photo={p}
                  selectable={p.can_download}
                  selected={selected.has(p.id)}
                  onToggle={() => onToggle(p.id)}
                  onOpen={() => openByPhoto(p)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <div ref={sentinelRef} className="h-14 flex items-center justify-center">
        {canLoadMore && (
          <span className="inline-flex items-center gap-2 text-gray-400 text-xs font-serif">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading more…
          </span>
        )}
      </div>
    </>
  );
}

function UploadsTab({
  visible, allCount, selected, onToggle, onSelectAll, onClearSelection,
  openByUpload, sentinelRef, canLoadMore,
}: {
  visible: Upload[];
  allCount: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  openByUpload: (u: Upload) => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  canLoadMore: boolean;
}) {
  return (
    <>
      <p className="text-xs sm:text-sm font-serif italic text-gray-500 mb-3 flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 mt-0.5 text-[#c5a059] shrink-0" />
        <span>Photos and videos shared by everyone at the wedding. Tap to view, long-press or shift-click to select.</span>
      </p>

      {allCount > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button
            onClick={onSelectAll}
            className="inline-flex items-center gap-1.5 text-[12px] sm:text-xs font-serif px-3 py-2 sm:py-1.5 rounded-full border border-[#c5a059]/40 text-[#1a1a1a] hover:bg-[#c5a059]/10 active:scale-95 transition-all"
          >
            <Check className="w-3 h-3" />
            Select all visible
          </button>
          {selected.size > 0 && (
            <button
              onClick={onClearSelection}
              className="inline-flex items-center gap-1.5 text-[12px] sm:text-xs font-serif px-3 py-2 sm:py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
            >
              <X className="w-3 h-3" />
              Clear ({selected.size})
            </button>
          )}
        </div>
      )}

      {allCount === 0 ? (
        <EmptyState
          icon={<Camera className="w-7 h-7 text-[#c5a059]" />}
          title="Be the first to share"
          text="Hop over to the Share Yours tab and add a memory from the day."
        />
      ) : (
        <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((u, i) => (
              <motion.div
                key={u.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, delay: Math.min(i * 0.012, 0.25) }}
              >
                <UploadTile
                  upload={u}
                  selected={selected.has(u.id)}
                  onToggle={() => onToggle(u.id)}
                  onOpen={() => openByUpload(u)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <div ref={sentinelRef} className="h-14 flex items-center justify-center">
        {canLoadMore && (
          <span className="inline-flex items-center gap-2 text-gray-400 text-xs font-serif">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading more…
          </span>
        )}
      </div>
    </>
  );
}

type QueueItem = {
  id: string;
  file: File;
  media_type: 'image' | 'video';
  status: 'queued' | 'uploading' | 'done' | 'error';
  progress: number;
  message?: string;
};

const MAX_FILE_BYTES = 500 * 1024 * 1024;
const IMG_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp'];
const UPLOAD_CONCURRENCY = 3;
const UPLOAD_MAX_RETRIES = 3;

// Retry only on transient failures: network errors, 429, and 5xx.
// 4xx other than 429 is a client error — retrying won't help.
function isTransientError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? '';
  if (/Network error/i.test(msg)) return true;
  if (/HTTP (429|5\d\d)/.test(msg)) return true;
  if (/Upload failed \((429|5\d\d)\)/.test(msg)) return true;
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, onAttempt?: (attempt: number) => void): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
    try {
      onAttempt?.(attempt);
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || attempt === UPLOAD_MAX_RETRIES) throw err;
      // Exponential backoff with jitter: ~1s, ~2s, ~4s.
      const delay = (2 ** (attempt - 1)) * 1000 + Math.random() * 300;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function ShareTab({
  token, onUploaded, showToast,
}: {
  token: string;
  onUploaded: (uploads: Upload[]) => void;
  showToast: (msg: string) => void;
}) {
  const [name, setName] = useState<string>(() => safeReadStored('guest_upload_name') ?? '');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledIds = useRef<Set<string>>(new Set());

  // Auto-pump worker pool. Workers spawn whenever the queue contains items
  // and stay alive until the queue drains, so guests can keep adding files
  // mid-upload and the new ones get picked up automatically.
  const queueRef = useRef<QueueItem[]>([]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  const workersActiveRef = useRef(0);
  const completedSinceFlushRef = useRef(0);
  const busy = queue.some((it) => it.status === 'uploading');

  useEffect(() => {
    if (name) safeWriteStored('guest_upload_name', name);
    else safeRemoveStored('guest_upload_name');
  }, [name]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const added: QueueItem[] = [];
    for (const f of Array.from(files)) {
      const isImg = IMG_MIME.includes(f.type.toLowerCase()) || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name);
      const isVid = VIDEO_MIME.includes(f.type.toLowerCase()) || /\.(mp4|mov|webm|m4v|3gp)$/i.test(f.name);
      if (!isImg && !isVid) {
        added.push({ id: makeQueueId(), file: f, media_type: 'image', status: 'error', progress: 0, message: 'Unsupported file type' });
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        added.push({ id: makeQueueId(), file: f, media_type: isVid ? 'video' : 'image', status: 'error', progress: 0, message: 'File exceeds 500 MB limit' });
        continue;
      }
      added.push({
        id: makeQueueId(), file: f,
        media_type: isVid ? 'video' : 'image',
        status: 'queued', progress: 0,
      });
    }
    setQueue((q) => [...added, ...q]);
  }, []);

  const removeItem = useCallback((id: string) => {
    cancelledIds.current.add(id);
    setQueue((q) => q.filter((it) => it.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue((q) => q.filter((it) => it.status !== 'done'));
  }, []);

  const uploadOne = useCallback(async (item: QueueItem): Promise<Upload | null> => {
    const setItem = (patch: Partial<QueueItem>) =>
      setQueue((q) => q.map((it) => (it.id === item.id ? { ...it, ...patch } : it)));

    if (cancelledIds.current.has(item.id)) return null;
    setItem({ status: 'uploading', progress: 0.01, message: undefined });

    let width: number | undefined, height: number | undefined, duration: number | undefined;
    try {
      if (item.media_type === 'image') {
        const dim = await readImageDimensions(item.file);
        width = dim.width; height = dim.height;
      } else {
        const dim = await readVideoDimensions(item.file);
        width = dim.width; height = dim.height;
        duration = Number.isFinite(dim.duration) ? dim.duration : undefined;
      }
    } catch { /* dimensions are optional */ }
    if (cancelledIds.current.has(item.id)) return null;

    let init: { upload_id: string; signed_url: string; supabase_path: string };
    try {
      init = await withRetry(async () => {
        const initRes = await fetch(`/api/gallery-access/${encodeURIComponent(token)}/upload-init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: item.file.name,
            fileSize: item.file.size,
            mimeType: item.file.type || (item.media_type === 'image' ? 'image/jpeg' : 'video/mp4'),
            mediaType: item.media_type,
            uploaderName: name.trim() || undefined,
          }),
        });
        if (!initRes.ok) {
          const err = await initRes.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${initRes.status}`);
        }
        return initRes.json();
      }, (attempt) => {
        if (attempt > 1) setItem({ message: `Retrying (${attempt}/${UPLOAD_MAX_RETRIES})…` });
      });
    } catch (err) {
      setItem({ status: 'error', message: (err as Error).message });
      return null;
    }

    try {
      await withRetry(async () => {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', init.signed_url);
          xhr.setRequestHeader('Content-Type', item.file.type || (item.media_type === 'image' ? 'image/jpeg' : 'video/mp4'));
          xhr.setRequestHeader('x-upsert', 'true');
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setItem({ progress: 0.02 + 0.93 * (e.loaded / e.total) });
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed (${xhr.status})`));
          };
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(item.file);
        });
      }, (attempt) => {
        if (attempt > 1) setItem({ progress: 0.02, message: `Retrying upload (${attempt}/${UPLOAD_MAX_RETRIES})…` });
      });
    } catch (err) {
      setItem({ status: 'error', message: (err as Error).message });
      return null;
    }

    setItem({ progress: 0.96, message: 'Saving…' });
    try {
      const media = await withRetry(async () => {
        const compRes = await fetch(`/api/gallery-access/${encodeURIComponent(token)}/upload-complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upload_id: init.upload_id, width, height, duration_seconds: duration }),
        });
        if (!compRes.ok) {
          const err = await compRes.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${compRes.status}`);
        }
        const j = await compRes.json() as { media: Upload };
        return j.media;
      });
      setItem({ status: 'done', progress: 1, message: undefined });
      return media;
    } catch (err) {
      setItem({ status: 'error', message: (err as Error).message });
      return null;
    }
  }, [token, name]);

  // Atomically claim the next 'queued' item and flip it to 'uploading' in
  // both the synchronous ref-mirror and the React state. JS is single-
  // threaded, so two workers calling this never grab the same item.
  const claimNext = useCallback((): QueueItem | null => {
    const q = queueRef.current;
    for (let i = 0; i < q.length; i++) {
      const it = q[i];
      if (it.status === 'queued' && !cancelledIds.current.has(it.id)) {
        const claimed = { ...it, status: 'uploading' as const, progress: 0.01 };
        q[i] = claimed;
        setQueue((curr) => curr.map((x) => (x.id === claimed.id ? claimed : x)));
        return it;
      }
    }
    return null;
  }, []);

  const flushCompletionToast = useCallback(() => {
    const n = completedSinceFlushRef.current;
    if (n > 0) {
      completedSinceFlushRef.current = 0;
      showToast(
        n === 1
          ? 'Thanks! Your share is now in the gallery.'
          : `Thanks! ${n} items added to the gallery.`,
      );
    }
  }, [showToast]);

  const runWorker = useCallback(async () => {
    try {
      while (true) {
        const item = claimNext();
        if (!item) return;
        const result = await uploadOne(item);
        if (result) {
          onUploaded([result]);
          completedSinceFlushRef.current++;
        }
      }
    } finally {
      workersActiveRef.current--;
      if (workersActiveRef.current === 0) flushCompletionToast();
    }
  }, [claimNext, uploadOne, onUploaded, flushCompletionToast]);

  const pumpQueue = useCallback(() => {
    while (workersActiveRef.current < UPLOAD_CONCURRENCY) {
      const q = queueRef.current;
      const hasQueued = q.some((it) => it.status === 'queued' && !cancelledIds.current.has(it.id));
      if (!hasQueued) break;
      workersActiveRef.current++;
      void runWorker();
    }
  }, [runWorker]);

  // Whenever the queue changes (file added, retry, etc.) make sure workers
  // are running up to the concurrency cap.
  useEffect(() => { pumpQueue(); }, [queue, pumpQueue]);

  const retryFailed = useCallback(() => {
    setQueue((q) => q.map((it) =>
      it.status === 'error' && it.message !== 'Unsupported file type' && it.message !== 'File exceeds 500 MB limit'
        ? { ...it, status: 'queued', progress: 0, message: undefined }
        : it
    ));
    // The pumpQueue useEffect will fire when the new queue state lands.
  }, []);

  const queuedCount = queue.filter((it) => it.status === 'queued').length;
  const errorCount = queue.filter((it) => it.status === 'error').length;
  const doneCount = queue.filter((it) => it.status === 'done').length;

  const resetDrag = useCallback(() => {
    dragCounter.current = 0;
    setIsDragging(false);
  }, []);

  // If a drag is cancelled outside the dropzone (released over the desktop, alt-tab, etc.)
  // the local dragleave on the button never fires — listen at the window level too.
  useEffect(() => {
    window.addEventListener('dragend', resetDrag);
    window.addEventListener('drop', resetDrag);
    window.addEventListener('blur', resetDrag);
    return () => {
      window.removeEventListener('dragend', resetDrag);
      window.removeEventListener('drop', resetDrag);
      window.removeEventListener('blur', resetDrag);
    };
  }, [resetDrag]);

  const onDragEnter = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.types?.includes('Files')) setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const onDragOver = (e: React.DragEvent<HTMLElement>) => { e.preventDefault(); };
  const onDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    resetDrag();
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div>
      <p className="font-serif italic text-gray-500 text-sm mb-4">
        Share your favourite photos and videos from the day. They'll show up in
        the <strong className="not-italic font-medium text-[#1a1a1a]">Guest Shares</strong> tab for everyone.
      </p>

      <label className="block mb-4">
        <span className="font-serif text-[11px] uppercase tracking-[0.18em] text-gray-500 flex items-center gap-1.5">
          <User className="w-3 h-3" /> Your name (optional)
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 80))}
          placeholder="e.g. Christopher"
          className="mt-1.5 w-full sm:max-w-sm bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-serif outline-none focus:border-[#8b0000] focus:ring-2 focus:ring-[#8b0000]/10 transition-all"
        />
      </label>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`block w-full relative border-2 border-dashed rounded-2xl p-7 sm:p-10 text-center transition-all active:scale-[0.995] ${
          isDragging
            ? 'border-[#8b0000] bg-[#8b0000]/5 scale-[1.01]'
            : 'border-[#c5a059]/40 bg-white hover:border-[#c5a059]/70 hover:bg-[#c5a059]/5'
        }`}
      >
        <motion.div
          animate={{ y: isDragging ? -2 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <UploadCloud className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 transition-colors ${
            isDragging ? 'text-[#8b0000]' : 'text-[#c5a059]'
          }`} />
          <p className="font-serif text-[#1a1a1a] text-base sm:text-lg mb-1">
            {isDragging ? 'Drop to add' : 'Add your photos & videos'}
          </p>
          <p className="font-serif text-[11px] sm:text-xs text-gray-500 mb-4 sm:mb-5 px-2">
            <span className="sm:hidden">Tap to choose · uploads start automatically · up to 500 MB each</span>
            <span className="hidden sm:inline">Drag &amp; drop or choose files · uploads start as soon as you add them · up to 500 MB each · JPG, PNG, HEIC, MP4, MOV</span>
          </p>
          <span
            className="inline-flex items-center gap-2 bg-[#8b0000] text-white font-serif text-sm px-5 py-2.5 rounded-full shadow-sm shadow-[#8b0000]/20 min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> Choose files
          </span>
        </motion.div>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.currentTarget.value = '';
        }}
      />

      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <p className="font-serif text-sm text-[#1a1a1a]">
                <span className="text-[#8b0000] font-medium">{queue.length}</span> file{queue.length === 1 ? '' : 's'} ready
                {errorCount > 0 && <span className="ml-2 text-amber-600">· {errorCount} error{errorCount === 1 ? '' : 's'}</span>}
                {doneCount > 0 && <span className="ml-2 text-emerald-600">· {doneCount} uploaded</span>}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {busy ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-serif text-[#8b0000] bg-[#8b0000]/10 px-3 py-1.5 rounded-full">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Uploading {queuedCount > 0 ? `· ${queuedCount} queued` : '…'}
                  </span>
                ) : queuedCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-serif text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
                    {queuedCount} queued
                  </span>
                ) : null}
                {doneCount > 0 && !busy && (
                  <button
                    onClick={clearCompleted}
                    className="text-xs font-serif text-gray-500 hover:text-[#1a1a1a] px-3 py-2"
                  >
                    Clear uploaded
                  </button>
                )}
                {errorCount > 0 && !busy && (
                  <button
                    onClick={retryFailed}
                    className="inline-flex items-center gap-1.5 text-xs font-serif text-amber-700 hover:text-amber-900 border border-amber-300 hover:border-amber-500 px-3 py-2 rounded-full transition-colors"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Retry {errorCount} failed
                  </button>
                )}
              </div>
            </div>

            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {queue.map((it) => (
                  <motion.li
                    key={it.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3 hover:border-[#c5a059]/40 transition-colors"
                  >
                    <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                      it.status === 'done'
                        ? 'bg-emerald-50 text-emerald-600'
                        : it.status === 'error'
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-[#fdfaf6] text-[#8b0000]'
                    }`}>
                      {it.status === 'done'
                        ? <Check className="w-5 h-5" />
                        : it.media_type === 'video'
                          ? <Film className="w-5 h-5" />
                          : <ImageIcon className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-serif text-sm text-[#1a1a1a] truncate">{it.file.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {it.status === 'error' ? (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {it.message}
                          </p>
                        ) : it.status === 'done' ? (
                          <p className="text-xs text-emerald-600">Uploaded · {formatBytes(it.file.size)}</p>
                        ) : it.status === 'uploading' ? (
                          <ProgressBar value={it.progress} label={it.message ?? `${Math.round(it.progress * 100)}%`} />
                        ) : (
                          <p className="text-xs text-gray-400">{formatBytes(it.file.size)}</p>
                        )}
                      </div>
                    </div>
                    {it.status !== 'uploading' && it.status !== 'done' && (
                      <button
                        onClick={() => removeItem(it.id)}
                        aria-label="Remove"
                        className="text-gray-300 hover:text-[#8b0000] active:scale-90 transition-all p-2 -m-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Tiles, lightbox, download bar ----------

function PhotoTile({ photo, selectable, selected, onToggle, onOpen }: {
  photo: Photo;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const aspect = photo.width && photo.height ? `${photo.width} / ${photo.height}` : '1 / 1';
  const longPress = useLongPress(() => { if (selectable) onToggle(); }, 380);

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-gray-100 group cursor-pointer transition-all duration-200 ${
        selected
          ? 'ring-2 ring-[#8b0000] ring-offset-2 ring-offset-[#fdfaf6] shadow-md shadow-[#8b0000]/15'
          : 'hover:shadow-md hover:shadow-[#c5a059]/20'
      }`}
      style={{ aspectRatio: aspect }}
      onClick={(e) => {
        if (longPress.consumeIfTriggered()) return;
        if (selectable && (e.metaKey || e.ctrlKey || e.shiftKey)) { onToggle(); return; }
        onOpen();
      }}
      {...longPress.bind}
    >
      {photo.thumb_url ? (
        <img
          src={photo.thumb_url}
          alt=""
          loading="lazy"
          draggable={false}
          className={`w-full h-full object-cover select-none transition-transform duration-500 ${
            selected ? 'scale-[1.02]' : 'group-hover:scale-[1.03]'
          }`}
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300">
          <ImageOff className="w-6 h-6" />
        </div>
      )}

      <div className={`absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10 pointer-events-none transition-opacity ${
        selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`} />

      {selectable ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-label={selected ? 'Deselect' : 'Select'}
          className={`absolute top-2 left-2 w-8 h-8 sm:w-7 sm:h-7 rounded-full grid place-items-center transition-all ${
            selected
              ? 'bg-[#8b0000] text-white shadow-md scale-100'
              : 'bg-black/40 text-white opacity-95 sm:opacity-0 sm:group-hover:opacity-100 sm:scale-90 sm:group-hover:scale-100 backdrop-blur'
          }`}
        >
          {selected ? <Check className="w-4 h-4" /> : <span className="w-3 h-3 rounded-full border-2 border-white" />}
        </button>
      ) : (
        <span
          aria-label="View only"
          title="View only"
          className="absolute top-2 left-2 w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-black/40 text-white grid place-items-center backdrop-blur opacity-95"
        >
          <Lock className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  );
}

function UploadTile({ upload, selected, onToggle, onOpen }: {
  upload: Upload;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const aspect = upload.width && upload.height ? `${upload.width} / ${upload.height}` : '1 / 1';
  const selectable = upload.can_download;
  const longPress = useLongPress(() => { if (selectable) onToggle(); }, 380);

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-gray-100 group cursor-pointer transition-all duration-200 ${
        selected
          ? 'ring-2 ring-[#8b0000] ring-offset-2 ring-offset-[#fdfaf6] shadow-md shadow-[#8b0000]/15'
          : 'hover:shadow-md hover:shadow-[#c5a059]/20'
      }`}
      style={{ aspectRatio: aspect }}
      onClick={(e) => {
        if (longPress.consumeIfTriggered()) return;
        if (selectable && (e.metaKey || e.ctrlKey || e.shiftKey)) { onToggle(); return; }
        onOpen();
      }}
      {...longPress.bind}
    >
      {upload.media_type === 'video' ? (
        <>
          <video
            src={upload.view_url ?? undefined}
            preload="metadata"
            muted
            playsInline
            className={`w-full h-full object-cover transition-transform duration-500 ${
              selected ? 'scale-[1.02]' : 'group-hover:scale-[1.03]'
            }`}
          />
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="bg-black/55 text-white rounded-full w-11 h-11 grid place-items-center backdrop-blur shadow-lg group-hover:scale-110 transition-transform">
              <Play className="w-5 h-5 ml-0.5 fill-current" />
            </span>
          </div>
        </>
      ) : upload.thumb_url ? (
        <img
          src={upload.thumb_url}
          alt=""
          loading="lazy"
          draggable={false}
          className={`w-full h-full object-cover select-none transition-transform duration-500 ${
            selected ? 'scale-[1.02]' : 'group-hover:scale-[1.03]'
          }`}
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300">
          <ImageOff className="w-6 h-6" />
        </div>
      )}

      <div className={`absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10 pointer-events-none transition-opacity ${
        selected ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
      }`} />

      {upload.uploader_name && (
        <p className="absolute bottom-1.5 left-1.5 right-1.5 text-[10px] font-serif italic text-white/95 drop-shadow flex items-center gap-1 truncate">
          <Heart className="w-2.5 h-2.5 text-[#c5a059] shrink-0 fill-current" />
          <span className="truncate">{upload.uploader_name}</span>
        </p>
      )}

      {selectable ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-label={selected ? 'Deselect' : 'Select'}
          className={`absolute top-2 left-2 w-8 h-8 sm:w-7 sm:h-7 rounded-full grid place-items-center transition-all ${
            selected
              ? 'bg-[#8b0000] text-white shadow-md scale-100'
              : 'bg-black/40 text-white opacity-95 sm:opacity-0 sm:group-hover:opacity-100 sm:scale-90 sm:group-hover:scale-100 backdrop-blur'
          }`}
        >
          {selected ? <Check className="w-4 h-4" /> : <span className="w-3 h-3 rounded-full border-2 border-white" />}
        </button>
      ) : (
        <span
          aria-label="View only"
          title="View only"
          className="absolute top-2 left-2 w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-black/40 text-white grid place-items-center backdrop-blur opacity-95"
        >
          <Lock className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  );
}

function DownloadBar({ count, disabled, onDownload, onClear }: {
  count: number;
  disabled: boolean;
  onDownload: () => void;
  onClear: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-[#c5a059]/30 shadow-[0_-8px_24px_rgba(139,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="inline-flex items-center justify-center min-w-[34px] h-9 sm:h-8 px-2.5 rounded-full bg-[#8b0000] text-white font-serif text-sm font-medium shrink-0">
            {count}
          </span>
          <div className="hidden sm:block">
            <p className="font-serif text-sm text-[#1a1a1a]">selected</p>
            <button onClick={onClear} className="text-[11px] font-serif text-gray-500 hover:text-[#8b0000] transition-colors">
              Clear all
            </button>
          </div>
          <button
            onClick={onClear}
            className="sm:hidden font-serif text-[12px] text-gray-500 hover:text-[#8b0000] underline-offset-2 hover:underline transition-colors px-1 py-2"
          >
            Clear
          </button>
        </div>
        <button
          onClick={onDownload}
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 bg-[#8b0000] text-white text-[13px] sm:text-sm font-serif px-4 sm:px-5 py-2.5 rounded-full hover:bg-[#a00000] disabled:opacity-60 shadow-sm shadow-[#8b0000]/25 active:scale-[0.98] transition-all min-h-[44px] shrink-0"
        >
          {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span className="sm:hidden">Save</span>
          <span className="hidden sm:inline">Save to my device</span>
        </button>
      </div>
    </motion.div>
  );
}

function Lightbox({ items, index, onClose, onPrev, onNext, onSave, downloading }: {
  items: (Photo | Upload)[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSave: (item: Photo | Upload) => void;
  downloading: boolean;
}) {
  const touchStartX = useRef<number | null>(null);
  const item = items[index];
  if (!item) return null;
  const isUpload = 'media_type' in item;
  const isVideo = isUpload && (item as Upload).media_type === 'video';
  const canDownload = (isUpload ? (item as Upload).can_download : (item as Photo).can_download);
  const src = isUpload
    ? (item as Upload).view_url
    : ((item as Photo).full_url ?? (item as Photo).thumb_url);
  const uploaderName = isUpload ? (item as Upload).uploader_name : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 bg-black/95 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
      onTouchStart={(e) => {
        // Only track single-finger gestures so pinch-zoom doesn't register as a swipe.
        touchStartX.current = e.touches.length === 1 ? e.touches[0].clientX : null;
      }}
      onTouchMove={(e) => {
        if (e.touches.length > 1) touchStartX.current = null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null || e.changedTouches.length !== 1 || e.touches.length > 0) return;
        const dx = e.changedTouches[0].clientX - start;
        if (dx > 50) onPrev();
        else if (dx < -50) onNext();
      }}
      onTouchCancel={() => { touchStartX.current = null; }}
    >
      <motion.div
        key={`lb-${index}`}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="relative max-h-[88vh] max-w-[94vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo && src ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            className="max-h-[88vh] max-w-[94vw] rounded-md shadow-2xl"
          />
        ) : src ? (
          <img
            src={src}
            alt=""
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            className="max-h-[88vh] max-w-[94vw] object-contain select-none rounded-md shadow-2xl"
          />
        ) : (
          <ImageOff className="w-10 h-10 text-white/40" />
        )}
      </motion.div>

      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
        className="absolute top-3 right-3 sm:top-4 sm:right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center backdrop-blur transition-colors active:scale-95"
        style={{ marginTop: 'env(safe-area-inset-top)' }}
      >
        <X className="w-5 h-5" />
      </button>

      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="Previous"
          className="absolute left-1.5 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white grid place-items-center backdrop-blur transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {index < items.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Next"
          className="absolute right-1.5 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white grid place-items-center backdrop-blur transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <div
        className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur rounded-full px-3.5 py-1 text-white/85 text-xs font-serif"
        style={{ marginTop: 'env(safe-area-inset-top)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {index + 1} <span className="text-white/50">/</span> {items.length}
      </div>

      <div
        className="absolute bottom-0 inset-x-0 px-4 pt-10 bg-gradient-to-t from-black/75 to-transparent flex items-end justify-between gap-3"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white/80 font-serif text-xs sm:text-sm min-w-0">
          {uploaderName && (
            <p className="flex items-center gap-1.5 italic">
              <Heart className="w-3 h-3 text-[#c5a059] fill-current" />
              Shared by <span className="text-white">{uploaderName}</span>
            </p>
          )}
          {!canDownload && (
            <p className="text-white/60 italic mt-1 flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              View only
            </p>
          )}
        </div>
        {canDownload && (
          <button
            onClick={() => onSave(item)}
            disabled={downloading}
            className="inline-flex items-center gap-2 bg-white text-[#1a1a1a] text-sm font-serif px-4 py-2.5 rounded-full hover:bg-[#fdfaf6] disabled:opacity-60 active:scale-95 shadow-md transition-all min-h-[44px]"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Save
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ---------- Misc ----------

function Header({ groupName, isMaster, photoCount, uploadCount }: {
  groupName: string;
  isMaster: boolean;
  photoCount: number;
  uploadCount: number;
}) {
  return (
    <header
      className="bg-gradient-to-b from-white/95 to-[#fdfaf6]/85 backdrop-blur border-b border-[#c5a059]/25 sticky top-0 z-20"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-5xl mx-auto px-4 pt-3.5 pb-3 sm:pt-5 sm:pb-4 text-center">
        <div className="flex items-center justify-center gap-2.5 sm:gap-3 mb-1">
          <span aria-hidden className="h-px w-8 sm:w-16 bg-gradient-to-r from-transparent to-[#c5a059]/55" />
          <span
            aria-hidden
            style={CALLIGRAPHY}
            className="text-[#8b0000] text-lg sm:text-2xl leading-none select-none"
          >囍</span>
          <span aria-hidden className="h-px w-8 sm:w-16 bg-gradient-to-l from-transparent to-[#c5a059]/55" />
        </div>

        <p className="font-serif italic text-[9px] sm:text-xs text-[#c5a059] uppercase tracking-[0.28em] sm:tracking-[0.3em]">
          {WEDDING_CONFIG.event.title.replace(' Ceremony', '')}
        </p>
        <h1 className="font-serif text-xl sm:text-3xl text-[#1a1a1a] mt-1 leading-tight">
          {isMaster
            ? <>The complete album</>
            : <>A keepsake for <span className="text-[#8b0000]">{groupName}</span></>}
        </h1>
        <p className="font-serif italic text-[11px] sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
          Thank you for celebrating with us.
        </p>

        {(photoCount > 0 || uploadCount > 0) && (
          <div className="mt-2 flex items-center justify-center gap-2 text-[10px] sm:text-xs font-serif text-gray-400">
            {photoCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Images className="w-3 h-3 text-[#c5a059]" />
                {photoCount} photo{photoCount === 1 ? '' : 's'}
              </span>
            )}
            {photoCount > 0 && uploadCount > 0 && <span className="text-[#c5a059]/50">·</span>}
            {uploadCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Camera className="w-3 h-3 text-[#c5a059]" />
                {uploadCount} guest share{uploadCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fdfaf6] flex flex-col items-center justify-center gap-4 px-6">
      {children}
    </div>
  );
}

// Floating background-music control for the gallery. Tries muted autoplay so
// the audio is "ready" inside a user-permitted state; the first tap unmutes.
// Pauses automatically while a guest-uploaded video is in the lightbox.
function MusicPlayer({ src, duck }: { src: string; duck: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const wasPlayingBeforeDuck = useRef(false);

  // Try to start playback (muted) once on mount.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.35;
    audio.muted = true;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, []);

  // Pause while a video lightbox is active so the music doesn't talk over it.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (duck) {
      wasPlayingBeforeDuck.current = !audio.paused;
      audio.pause();
      setPlaying(false);
    } else if (wasPlayingBeforeDuck.current) {
      wasPlayingBeforeDuck.current = false;
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [duck]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.muted = false;
      audio.play()
        .then(() => { setPlaying(true); setMuted(false); })
        .catch(() => { setPlaying(false); });
    } else if (audio.muted) {
      audio.muted = false;
      setMuted(false);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const showMutedBadge = playing && muted;
  const off = !playing || muted;

  return (
    <>
      <audio ref={audioRef} src={src} loop playsInline preload="auto" />
      <button
        type="button"
        onClick={toggle}
        aria-label={off ? 'Play background music' : 'Pause background music'}
        className={`fixed z-30 right-3 sm:right-5 w-11 h-11 grid place-items-center rounded-full backdrop-blur-md shadow-lg border transition-colors ${
          off
            ? 'bg-white/85 border-[#c5a059]/40 text-[#8b0000] hover:bg-white'
            : 'bg-[#8b0000] border-[#8b0000] text-white hover:bg-[#a00000]'
        }`}
        style={{ top: 'calc(env(safe-area-inset-top) + 5.5rem)' }}
      >
        <Music className="w-5 h-5" />
        {showMutedBadge && (
          <span className="absolute -top-1 -right-1 bg-[#8b0000] text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full leading-none">
            tap
          </span>
        )}
      </button>
    </>
  );
}

function EmptyState({ icon, title, text }: { icon?: ReactNode; title?: string; text: string }) {
  return (
    <div className="py-20 text-center font-serif">
      {icon ? (
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#c5a059]/10 border border-[#c5a059]/25 grid place-items-center">
          {icon}
        </div>
      ) : (
        <ImageOff className="w-8 h-8 mx-auto mb-3 text-gray-300" />
      )}
      {title && <p className="text-[#1a1a1a] text-base mb-1">{title}</p>}
      <p className="text-gray-400 text-sm italic max-w-xs mx-auto">{text}</p>
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="w-full">
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#8b0000] to-[#c5a059] transition-[width] duration-200"
          style={{ width: `${Math.min(100, Math.max(2, value * 100))}%` }}
        />
      </div>
      {label && <p className="text-[11px] text-gray-500 mt-1">{label}</p>}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

function readVideoDimensions(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (fn: () => void) => { if (settled) return; settled = true; URL.revokeObjectURL(url); fn(); };
    v.preload = 'metadata';
    v.onloadedmetadata = () => finish(() => resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration }));
    v.onerror = () => finish(() => reject(new Error('video load failed')));
    // Bail out if the browser can't parse metadata (corrupt / unsupported codec) — keeps the upload queue moving.
    setTimeout(() => finish(() => reject(new Error('video metadata timed out'))), 8_000);
    v.src = url;
  });
}

function safeReadStored(key: string): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; }
  catch { return null; }
}
function safeWriteStored(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode etc. */ }
}
function safeRemoveStored(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function makeQueueId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Long-press handler for touch-first selection. Mouse users already have shift/cmd-click.
// Returns event bindings plus a `consumeIfTriggered` the outer onClick can use to short-circuit
// the synthetic click that some Android browsers still dispatch after a long-press.
function useLongPress(callback: () => void, delay = 380) {
  const timer = useRef<number | null>(null);
  const triggered = useRef(false);
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const clear = useCallback(() => {
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null; }
  }, []);

  // Cancel any pending timer when the host unmounts so the callback can't fire on stale state.
  useEffect(() => () => clear(), [clear]);

  const bind = useMemo(() => ({
    onTouchStart: (e: React.TouchEvent) => {
      triggered.current = false;
      clear();
      // Single-finger gestures only — multi-touch is for pinch/zoom, not selection.
      if (e.touches.length !== 1) return;
      timer.current = window.setTimeout(() => {
        triggered.current = true;
        cbRef.current();
      }, delay);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      clear();
      if (triggered.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onTouchMove: clear,
    onTouchCancel: clear,
  }), [clear, delay]);

  // Outer onClick calls this; if a long-press just fired, swallow the synthetic click and reset.
  const consumeIfTriggered = useCallback(() => {
    if (triggered.current) { triggered.current = false; return true; }
    return false;
  }, []);

  return { bind, consumeIfTriggered };
}
