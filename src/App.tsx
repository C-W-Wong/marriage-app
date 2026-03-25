/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, ErrorInfo, Component } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, MapPin, Send, CheckCircle2, Users, User, AlertCircle, ChevronUp, X, MessageSquare, Camera, CloudSun } from 'lucide-react';
import VenueCalendarCard from './VenueCalendarCard';
import { downloadICS, weddingDate } from './weddingConfig';
import WeddingDayStatus from './WeddingDayStatus';
import WeatherForecast from './WeatherForecast';

interface GuestBookReply {
  id: number;
  entry_id: number;
  name: string;
  message: string;
  created_at: string;
}

interface GuestBookEntry {
  id: number;
  name: string;
  message: string;
  photo_url: string | null;
  likes: number;
  replies: GuestBookReply[];
  created_at: string;
}

interface GalleryImage {
  id: number;
  url: string;
  caption: string;
}

interface SharedPhoto {
  id: number;
  uploader_name: string;
  file_path: string;
  created_at: string;
}

const ErrorBoundary: any = class extends (Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#fdfaf6] p-6 text-center">
          <div className="max-w-md space-y-6">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="text-red-500 w-12 h-12" />
            </div>
            <h2 className="text-3xl font-serif text-[#1a1a1a]">Something went wrong</h2>
            <p className="text-gray-500 font-serif">We apologize for the inconvenience. Please try refreshing the page.</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-[#8b0000] text-white rounded-full font-serif uppercase tracking-widest text-sm"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const TypingEffect = ({ text, speed = 100, onComplete }: { text: string, speed?: number, onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);
  const typingAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio('/keyboard-typing.wav');
    audio.volume = 0.5;
    typingAudioRef.current = audio;

    // Play the keyboard sound and stop after 6.5s
    audio.play().catch(() => {});
    const stopTimer = setTimeout(() => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    }, 6500);

    return () => {
      clearTimeout(stopTimer);
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

  useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text[index]);
        setIndex((prev) => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    } else {
      // Stop audio when typing finishes
      if (typingAudioRef.current) {
        typingAudioRef.current.pause();
        typingAudioRef.current.currentTime = 0;
      }
      if (onComplete) onComplete();
    }
  }, [index, text, speed, onComplete]);

  return <span className="typing-cursor">{displayedText}</span>;
};




const GuestBookCard = ({ entry, userName, onUpdate }: { key?: number; entry: GuestBookEntry; userName: string; onUpdate: (e: GuestBookEntry) => void }) => {
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyName, setReplyName] = useState(userName);
  const [submitting, setSubmitting] = useState(false);

  const handleLike = async () => {
    const name = userName || prompt('Your name to like:');
    if (!name) return;
    const res = await fetch(`/api/guest-book/${entry.id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const { likes } = await res.json();
      onUpdate({ ...entry, likes });
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = replyName || userName;
    if (!name || !replyText.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/guest-book/${entry.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, message: replyText.trim() }),
    });
    if (res.ok) {
      const reply = await res.json();
      onUpdate({ ...entry, replies: [...entry.replies, reply] });
      setReplyText('');
    }
    setSubmitting(false);
  };

  const isVideo = entry.photo_url && /\.(mp4|mov|webm)$/i.test(entry.photo_url);

  return (
    <div className="bg-[#fdfaf6] p-5 rounded-2xl border border-[#c5a059]/10 relative">
      {entry.photo_url && (
        <div className="w-full rounded-2xl mb-3 overflow-hidden border border-[#c5a059]/10 shadow-sm bg-gray-50">
          {isVideo ? (
            <video src={entry.photo_url} controls playsInline className="w-full max-h-80" />
          ) : (
            <img src={entry.photo_url} alt="" className="w-full max-h-80 object-contain" />
          )}
        </div>
      )}
      <p className="text-gray-700 font-serif italic mb-3 leading-relaxed text-sm">"{entry.message}"</p>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[#8b0000] font-serif font-medium text-xs">— {entry.name}</span>
        <span className="text-[10px] text-gray-400 uppercase tracking-widest">
          {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : 'Just now'}
        </span>
      </div>

      {/* Like & Reply actions */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#c5a059]/10">
        <button onClick={handleLike} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#8b0000] transition-colors">
          <Heart size={13} className={entry.likes > 0 ? 'fill-[#8b0000] text-[#8b0000]' : ''} />
          <span>{entry.likes > 0 ? entry.likes : 'Like'}</span>
        </button>
        <button onClick={() => setShowReplies(!showReplies)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#8b0000] transition-colors">
          <MessageSquare size={13} />
          <span>{entry.replies.length > 0 ? `${entry.replies.length} ${entry.replies.length === 1 ? 'reply' : 'replies'}` : 'Reply'}</span>
        </button>
      </div>

      {/* Replies thread */}
      {showReplies && (
        <div className="mt-3 pt-3 border-t border-[#c5a059]/10 space-y-3">
          {entry.replies.map(reply => (
            <div key={reply.id} className="pl-4 border-l-2 border-[#c5a059]/15">
              <p className="text-xs text-gray-600 font-serif">{reply.message}</p>
              <p className="text-[10px] text-gray-400 mt-1">
                — {reply.name} &middot; {new Date(reply.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
          <form onSubmit={handleReply} className="flex flex-col gap-2">
            {!userName && (
              <input
                value={replyName}
                onChange={e => setReplyName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#8b0000] transition-colors font-serif"
              />
            )}
            <div className="flex gap-2">
              <input
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                maxLength={300}
                className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#8b0000] transition-colors font-serif"
              />
              <button
                type="submit"
                disabled={submitting || !replyText.trim()}
                className="px-3 py-2 bg-[#8b0000] text-white rounded-lg text-xs disabled:opacity-40 hover:bg-[#a00000] transition-colors"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// #18: TikTok-style swipeable wishes
const SwipeableWishes = ({ entries, userName, onUpdate, onViewAll }: {
  entries: GuestBookEntry[];
  userName: string;
  onUpdate: (e: GuestBookEntry) => void;
  onViewAll: () => void;
}) => {
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(0);
  const display = entries.slice(0, 20);
  if (display.length === 0) return null;
  const safeIdx = Math.min(idx, display.length - 1);

  const goNext = () => { if (safeIdx < display.length - 1) { setDir(1); setIdx(safeIdx + 1); } };
  const goPrev = () => { if (safeIdx > 0) { setDir(-1); setIdx(safeIdx - 1); } };

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait" custom={dir}>
        <motion.div
          key={display[safeIdx].id}
          custom={dir}
          initial={{ y: dir > 0 ? 200 : -200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: dir > 0 ? -200 : 200, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.15}
          onDragEnd={(_, info) => {
            if (info.offset.y < -60) goNext();
            else if (info.offset.y > 60) goPrev();
          }}
          className="cursor-grab active:cursor-grabbing"
        >
          <GuestBookCard entry={display[safeIdx]} userName={userName} onUpdate={onUpdate} />
        </motion.div>
      </AnimatePresence>
      <div className="flex justify-center items-center gap-1.5 mt-4">
        {display.slice(0, 10).map((_, i) => (
          <button
            key={i}
            onClick={() => { setDir(i > safeIdx ? 1 : -1); setIdx(i); }}
            className={`rounded-full transition-all ${i === safeIdx ? 'w-5 h-1.5 bg-[#8b0000]' : 'w-1.5 h-1.5 bg-gray-300'}`}
          />
        ))}
        {display.length > 10 && <span className="text-[10px] text-gray-300 ml-1">+{display.length - 10}</span>}
      </div>
      <p className="text-center text-[10px] text-gray-300 mt-2 font-serif">Swipe up or down to read more</p>
      {entries.length > 1 && (
        <div className="text-center mt-3">
          <button onClick={onViewAll} className="text-xs font-serif uppercase tracking-widest text-[#8b0000] hover:underline transition-colors">
            View all {entries.length} wishes
          </button>
        </div>
      )}
    </div>
  );
};

const PLAYLIST = [
  { src: '/take-turns.mp3', title: 'Take Turns' },
  { src: '/every-road.mp3', title: 'Every Road' },
  { src: '/that-sunny-day.mp3', title: 'That Sunny Day' },
];

const CAN_HOVER = window.matchMedia('(hover: hover)').matches;

const IS_MOBILE = !window.matchMedia('(hover: hover)').matches;
const PETAL_CONFIGS = Array.from({ length: IS_MOBILE ? 6 : 15 }, (_, i) => ({
  startLeft: `${Math.random() * 100}%`,
  endLeft: `${Math.random() * 100 + (Math.random() * 20 - 10)}%`,
  duration: 12 + Math.random() * 8,
  delay: Math.random() * 10,
  isGold: i % 2 !== 0,
}));

const WAVE_HEIGHTS = {
  collapsed: [0, 1, 2].map(i => ({
    heights: [`3px`, `${10 + Math.random() * 4}px`, `5px`, `${8 + Math.random() * 6}px`, `3px`],
    duration: 0.7 + i * 0.2,
  })),
  expanded: [0, 1, 2, 3].map(i => ({
    heights: [`4px`, `${12 + Math.random() * 4}px`, `6px`, `${10 + Math.random() * 6}px`, `4px`],
    duration: 0.8 + i * 0.15,
  })),
};

export default function App() {
  const isWeddingDay = new Date() >= weddingDate;
  const shouldSkipIntro = (() => {
    if (isWeddingDay) return true;
    try {
      const expiry = localStorage.getItem('intro_expiry');
      return expiry ? Date.now() < Number(expiry) : false;
    } catch { return false; }
  })();
  const [step, setStep] = useState<'intro' | 'doors' | 'invitation'>(shouldSkipIntro ? 'invitation' : 'intro');
  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [guestInfo, setGuestInfo] = useState<{ id: number; slug: string; name: string } | null>(null);
  const [guestStatus, setGuestStatus] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [visibleSections, setVisibleSections] = useState({ gallery: false, rsvp: false, guestbook: false, photoalbum: false });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [hasRsvped, setHasRsvped] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [guestBookEntries, setGuestBookEntries] = useState<GuestBookEntry[]>([]);
  const [guestBookData, setGuestBookData] = useState({ name: '', message: '' });
  const [guestBookPhoto, setGuestBookPhoto] = useState<File | null>(null);
  const [guestBookErrors, setGuestBookErrors] = useState({ name: '', message: '' });

  // Photo Album state
  const [photoAlbumPhotos, setPhotoAlbumPhotos] = useState<SharedPhoto[]>([]);
  const [photoAlbumHasMore, setPhotoAlbumHasMore] = useState(false);
  const [photoAlbumLoading, setPhotoAlbumLoading] = useState(false);
  const [photoAlbumUploading, setPhotoAlbumUploading] = useState(false);
  const [photoAlbumUploadProgress, setPhotoAlbumUploadProgress] = useState(0);
  const [lightboxPhoto, setLightboxPhoto] = useState<SharedPhoto | null>(null);
  const photoAlbumSentinelRef = useRef<HTMLDivElement | null>(null);

  const validateGuestBook = (field: string, value: string) => {
    let error = '';
    if (field === 'name') {
      if (!value.trim()) error = 'Name is required';
      else if (value.trim().length < 2) error = 'Name must be at least 2 characters';
    } else if (field === 'message') {
      if (!value.trim()) error = 'Message is required';
      else if (value.trim().length < 5) error = 'Message must be at least 5 characters';
      else if (value.length > 500) error = 'Message must be less than 500 characters';
    }
    setGuestBookErrors(prev => ({ ...prev, [field]: error }));
    return error === '';
  };

  const handleGuestBookChange = (field: string, value: string) => {
    setGuestBookData(prev => ({ ...prev, [field]: value }));
    validateGuestBook(field, value);
  };

  const [guestBookStatus, setGuestBookStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleGuestBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isNameValid = validateGuestBook('name', guestBookData.name);
    const isMessageValid = validateGuestBook('message', guestBookData.message);

    if (!isNameValid || !isMessageValid) return;

    setGuestBookStatus('submitting');
    try {
      const formData = new FormData();
      formData.append('name', guestBookData.name);
      formData.append('message', guestBookData.message);
      if (guestBookPhoto) formData.append('photo', guestBookPhoto);
      const res = await fetch('/api/guest-book', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to post');
      const newEntry = await res.json();
      setGuestBookEntries(prev => [{ ...newEntry, likes: 0, replies: [] }, ...prev]);
      setGuestBookStatus('success');
      setGuestBookData({ name: '', message: '' });
      setGuestBookPhoto(null);
      setTimeout(() => setGuestBookStatus('idle'), 3000);
    } catch {
      setGuestBookStatus('error');
    }
  };
  const [rsvpData, setRsvpData] = useState({
    name: '',
    attending: true,
  });
  const [rsvpErrors, setRsvpErrors] = useState({
    name: '',
  });
  const canUploadPhotos = hasRsvped && rsvpData.attending && !!(guestInfo?.name || guestBookData.name);

  const validateRsvp = (field: string, value: any) => {
    let error = '';
    switch (field) {
      case 'name':
        if (!value.trim()) error = 'Name is required';
        else if (value.trim().length < 2) error = 'Name must be at least 2 characters';
        break;
    }
    setRsvpErrors(prev => ({ ...prev, [field]: error }));
    return error === '';
  };

  const handleRsvpChange = (field: string, value: any) => {
    setRsvpData(prev => ({ ...prev, [field]: value }));
    validateRsvp(field, value);
  };
  const audioRef = useRef<HTMLAudioElement>(null);

  // #10: Preload typing sound immediately
  useEffect(() => {
    const preload = new Audio('/keyboard-typing.wav');
    preload.preload = 'auto';
    preload.load();
  }, []);
  const [trackIndex, setTrackIndex] = useState(0);

  useEffect(() => {
    const match = window.location.pathname.match(/^\/invite\/(.+)$/);
    const slug = match?.[1];

    if (!slug) {
      setGuestStatus('invalid');
      return;
    }

    fetch(`/api/guests/${encodeURIComponent(slug)}`)
      .then(res => { if (!res.ok) throw new Error('Not found'); return res.json(); })
      .then(data => {
        setGuestInfo(data);
        setRsvpData(prev => ({ ...prev, name: data.name }));
        setGuestBookData(prev => ({ ...prev, name: data.name }));
        setGuestStatus('valid');
        // Check for existing RSVP
        fetch(`/api/rsvp/${data.id}`)
          .then(r => { if (!r.ok) throw new Error(); return r.json(); })
          .then(rsvp => {
            setRsvpData(prev => ({ ...prev, attending: !!rsvp.attending }));
            setHasRsvped(true);
          })
          .catch(() => {});
      })
      .catch(() => setGuestStatus('invalid'));
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 500);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (visibleSections.gallery || visibleSections.rsvp || visibleSections.guestbook || visibleSections.photoalbum || showVenueModal || showWeatherModal || lightboxPhoto) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [visibleSections.gallery, visibleSections.rsvp, visibleSections.guestbook, visibleSections.photoalbum, showVenueModal, showWeatherModal, lightboxPhoto]);

  useEffect(() => {
    if (visibleSections.gallery && galleryImages.length === 0) {
      fetch('/api/gallery')
        .then(res => res.json())
        .then(data => setGalleryImages(data))
        .catch(err => console.error('Failed to load gallery:', err));
    }
  }, [visibleSections.gallery]);

  const loadGuestBook = () => {
    fetch('/api/guest-book')
      .then(res => res.json())
      .then(data => setGuestBookEntries(data))
      .catch(err => console.error('Failed to load guest book:', err));
  };

  useEffect(() => {
    if (step === 'invitation') loadGuestBook();
  }, [step]);

  // Photo Album
  const photoAlbumLoadingRef = useRef(false);

  const loadPhotoAlbum = useCallback(async (reset = false) => {
    if (photoAlbumLoadingRef.current) return;
    photoAlbumLoadingRef.current = true;
    setPhotoAlbumLoading(true);
    try {
      const offset = reset ? 0 : photoAlbumPhotos.length;
      const res = await fetch(`/api/photos?limit=20&offset=${offset}`);
      const data = await res.json();
      setPhotoAlbumPhotos(prev => reset ? data.photos : [...prev, ...data.photos]);
      setPhotoAlbumHasMore(data.hasMore);
    } catch (err) {
      console.error('Failed to load photos:', err);
    } finally {
      photoAlbumLoadingRef.current = false;
      setPhotoAlbumLoading(false);
    }
  }, [photoAlbumPhotos.length]);

  useEffect(() => {
    if (visibleSections.photoalbum && photoAlbumPhotos.length === 0) {
      loadPhotoAlbum(true);
    }
  }, [visibleSections.photoalbum]);

  useEffect(() => {
    if (!visibleSections.photoalbum || !photoAlbumHasMore) return;
    const el = photoAlbumSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadPhotoAlbum();
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleSections.photoalbum, photoAlbumHasMore]);

  const handlePhotoAlbumUpload = async (files: FileList) => {
    const name = guestInfo?.name || guestBookData.name;
    if (!name || name.trim().length < 2) return;

    setPhotoAlbumUploading(true);
    setPhotoAlbumUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      Array.from(files).forEach(file => formData.append('photos', file));

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/photos');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setPhotoAlbumUploadProgress((e.loaded / e.total) * 100);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const newPhotos = JSON.parse(xhr.responseText);
            setPhotoAlbumPhotos(prev => [...newPhotos, ...prev]);
            resolve();
          } else {
            reject(new Error('Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(formData);
      });

      setPhotoAlbumUploadProgress(100);
      setTimeout(() => setPhotoAlbumUploadProgress(0), 1500);
    } catch (err) {
      console.error('Upload failed:', err);
    }
    setPhotoAlbumUploading(false);
  };

  const handleRsvpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isNameValid = validateRsvp('name', rsvpData.name);
    if (!isNameValid) return;

    setRsvpStatus('submitting');
    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rsvpData, guest_id: guestInfo?.id }),
      });
      if (!res.ok) throw new Error('Failed to submit RSVP');
      setRsvpStatus('success');
      setHasRsvped(true);
      loadGuestBook();
    } catch {
      setRsvpStatus('error');
    }
  };

  const introText = guestInfo
    ? `Dear ${guestInfo.name},\n\nWe cordially invite you to celebrate the union of Chris Wong & Eileen Liu and the beginning of our life together.\n\n— With love, Chris & Eileen`
    : "Dear Friend,\n\nWe cordially invite you to celebrate the union of Chris Wong & Eileen Liu and the beginning of our life together.\n\n— With love, Chris & Eileen";

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isReady) return;

    if (isPlaying) {
      audio.play().catch(error => {
        if (error.name !== 'AbortError') {
          setIsPlaying(false);
        }
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, isReady]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    audio.play().catch(() => {});
  }, [trackIndex]);

  useEffect(() => {
    if (step === 'doors') {
      const timer = setTimeout(() => {
        setStep('invitation');
        setIsPlaying(true);
      }, 3500);
      return () => clearTimeout(timer);
    }
    // #16: Cache intro completion for 12 hours
    if (step === 'invitation') {
      try { localStorage.setItem('intro_expiry', String(Date.now() + 12 * 60 * 60 * 1000)); } catch {}
    }
  }, [step]);

  if (guestStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfaf6]">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4">
          <span className="text-5xl font-brush text-[#8b0000]/30 block">囍</span>
          <div className="w-5 h-5 border-2 border-[#c5a059]/30 border-t-[#c5a059] rounded-full animate-spin mx-auto" />
        </motion.div>
      </div>
    );
  }

  if (guestStatus === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfaf6] p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-sm space-y-6">
          <span className="text-6xl font-brush text-[#8b0000]/20 block">囍</span>
          <h1 className="text-2xl font-serif text-[#1a1a1a]">Invitation Required</h1>
          <p className="text-sm font-serif text-gray-400 leading-relaxed">
            This wedding invitation is personal and requires a valid invite link. Please use the link that was shared with you.
          </p>
          <p className="text-xs font-serif text-gray-300">
            If you believe this is an error, please contact the couple.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={`min-h-screen flex flex-col items-center ${step === 'invitation' ? 'justify-start overflow-y-auto' : 'justify-center overflow-hidden'} p-4 sm:p-6 md:p-8 relative bg-[#fdfaf6] scroll-smooth`}>
      
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 pointer-events-none opacity-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] md:w-[40%] md:h-[40%] rounded-full bg-[#8b0000] blur-[80px] md:blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] md:w-[40%] md:h-[40%] rounded-full bg-[#c5a059] blur-[80px] md:blur-[120px]" />
      </div>

      {/* Large Background Watermark '囍' - Adjusted for mobile */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.03, scale: 1 }}
        transition={{ duration: 3 }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden"
      >
        <span className="text-[100vw] md:text-[60vw] font-brush text-[#8b0000] select-none leading-none">囍</span>
      </motion.div>

      <AnimatePresence mode="wait">
        {step === 'intro' && (
          <motion.div
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 1.5 }}
            className="text-center z-10 max-w-lg px-4"
          >
            <div className="mb-4 md:mb-6">
              <motion.span 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-6xl md:text-8xl font-brush text-[#8b0000]/40 block mb-2 md:mb-4"
              >
                囍
              </motion.span>
            </div>
            {!hasStarted ? (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  // #3: Unlock audio for Safari — must happen in user gesture
                  const audio = audioRef.current;
                  if (audio) {
                    audio.play().then(() => audio.pause()).catch(() => {});
                  }
                  setHasStarted(true);
                }}
                className="px-10 py-4 bg-[#8b0000] text-white rounded-full font-serif uppercase tracking-[0.3em] text-sm shadow-xl hover:bg-[#a00000] transition-all"
              >
                Open Invitation
              </motion.button>
            ) : (
              <h1 className="text-2xl md:text-4xl font-serif text-[#8b0000] mb-8 leading-relaxed italic whitespace-pre-line">
                <TypingEffect
                  text={introText}
                  speed={35}
                  onComplete={() => setTimeout(() => setStep('doors'), 2000)}
                />
              </h1>
            )}
          </motion.div>
        )}

        {step === 'intro' && hasStarted && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 3 }}
            onClick={() => setStep('doors')}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-40 text-[#c5a059]/60 hover:text-[#c5a059] font-serif text-xs uppercase tracking-widest transition-colors"
          >
            Skip
          </motion.button>
        )}

        {step === 'doors' && (
          <motion.div
            key="doors"
            className="fixed inset-0 z-50 flex perspective-[2000px] overflow-hidden bg-white"
          >
            {/* Light Leak Background */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1 }}
              className="absolute inset-0 bg-gradient-to-b from-white via-[#fdfaf6] to-white flex items-center justify-center"
            >
              <motion.div 
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 2, ease: "easeOut" }}
                className="w-full h-full bg-white blur-[100px]"
              />
            </motion.div>

            {/* Left Door */}
            <motion.div
              initial={{ rotateY: 0 }}
              animate={{ rotateY: -110 }}
              transition={{ duration: 2.5, ease: [0.4, 0, 0.2, 1], delay: 0.5 }}
              style={{ transformOrigin: 'left' }}
              className="w-1/2 h-full bg-[#8b0000] border-r-4 border-[#c5a059] relative z-20 shadow-[20px_0_50px_rgba(0,0,0,0.5)]"
            >
              {/* Door Panels */}
              <div className="absolute inset-8 border-2 border-[#c5a059]/20 rounded-sm flex flex-col justify-between p-4">
                <div className="h-1/3 border border-[#c5a059]/10" />
                <div className="h-1/3 border border-[#c5a059]/10" />
              </div>
              {/* Handle */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-24 bg-[#c5a059] rounded-full shadow-lg" />
            </motion.div>
            
            {/* Right Door */}
            <motion.div
              initial={{ rotateY: 0 }}
              animate={{ rotateY: 110 }}
              transition={{ duration: 2.5, ease: [0.4, 0, 0.2, 1], delay: 0.5 }}
              style={{ transformOrigin: 'right' }}
              className="w-1/2 h-full bg-[#8b0000] border-l-4 border-[#c5a059] relative z-20 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
            >
              {/* Door Panels */}
              <div className="absolute inset-8 border-2 border-[#c5a059]/20 rounded-sm flex flex-col justify-between p-4">
                <div className="h-1/3 border border-[#c5a059]/10" />
                <div className="h-1/3 border border-[#c5a059]/10" />
              </div>
              {/* Handle */}
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-24 bg-[#c5a059] rounded-full shadow-lg" />
            </motion.div>

            {/* Central '囍' Emblem that splits */}
            <motion.div
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
            >
              <div className="w-24 h-24 rounded-full border-4 border-[#c5a059] flex items-center justify-center bg-[#8b0000] shadow-2xl">
                <span className="text-5xl font-brush text-[#c5a059]">囍</span>
              </div>
            </motion.div>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ delay: 1 }}
              onClick={() => setStep('invitation')}
              className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[60] text-[#c5a059]/60 hover:text-[#c5a059] font-serif text-xs uppercase tracking-widest transition-colors"
            >
              Skip
            </motion.button>
          </motion.div>
        )}

        {step === 'invitation' && (
          <motion.div
            key="invitation-container"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full flex flex-col items-center pb-32"
          >
            <motion.div
              key="invitation-card"
              layout
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="w-full max-w-2xl bg-white/90 backdrop-blur-md border border-[#c5a059]/30 rounded-[2rem] md:rounded-[3rem] shadow-2xl overflow-hidden relative z-10 mx-auto"
            >
            {/* Elegant Border Pattern */}
            <div className="absolute top-0 left-0 w-full h-1.5 md:h-2 bg-gradient-to-r from-[#8b0000] via-[#c5a059] to-[#8b0000]" />
            <div className="absolute bottom-0 left-0 w-full h-1.5 md:h-2 bg-gradient-to-r from-[#8b0000] via-[#c5a059] to-[#8b0000]" />

            <div className="p-6 sm:p-10 md:p-16 flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 100 }}
                className="mb-6 md:mb-8 relative"
              >
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-[#c5a059] flex items-center justify-center bg-white shadow-inner">
                  <span className="text-4xl md:text-5xl font-brush text-[#8b0000] leading-none mt-1">囍</span>
                </div>
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -top-1 -right-1 md:-top-2 md:-right-2"
                >
                  <Heart className="text-[#8b0000] w-5 h-5 md:w-6 md:h-6 fill-[#8b0000]" />
                </motion.div>
              </motion.div>

              <div className="space-y-4 md:space-y-6 w-full">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <motion.h2 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="text-4xl sm:text-5xl md:text-7xl font-serif italic text-[#1a1a1a] tracking-tight mb-1"
                  >
                    Chris & Eileen
                  </motion.h2>
                  {!isWeddingDay && (
                  <motion.h3
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="text-lg md:text-2xl font-serif text-[#8b0000] uppercase tracking-[0.2em] md:tracking-[0.3em] font-light"
                  >
                    Are Getting Married
                  </motion.h3>
                  )}
                </motion.div>

                {!isWeddingDay && (<>
                <motion.div
                  initial={{ opacity: 0, scaleX: 0 }}
                  whileInView={{ opacity: 1, scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.6 }}
                  className="h-px w-24 md:w-32 bg-[#c5a059] mx-auto my-6 md:my-8"
                />

                <div className="flex flex-col items-center space-y-3">
                  <p className="text-3xl md:text-5xl font-serif font-light">May 20, 2026</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl md:text-2xl font-serif text-[#8b0000]">Wednesday at 08:20 AM</p>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setShowWeatherModal(true)}
                      className="p-1.5 rounded-full bg-[#c5a059]/10 hover:bg-[#c5a059]/20 transition-colors"
                      title="Weather Forecast"
                    >
                      <CloudSun size={16} className="text-[#c5a059]" />
                    </motion.button>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowVenueModal(true)}
                    className="flex items-center gap-1.5 text-[#c5a059] hover:text-[#8b0000] font-serif text-xs uppercase tracking-widest transition-colors mt-1"
                  >
                    <MapPin size={12} />
                    <span>Old Orange County Courthouse</span>
                  </motion.button>
                  <button
                    onClick={downloadICS}
                    className="flex items-center gap-1.5 text-[#c5a059] hover:text-[#8b0000] font-serif text-xs uppercase tracking-widest transition-colors"
                  >
                    <span>Add to Calendar</span>
                  </button>
                </div>
                </>)}

                <div className="flex flex-col items-center space-y-3">
                  <WeddingDayStatus onOpenPhotoAlbum={() => setVisibleSections(prev => ({ ...prev, photoalbum: true }))} />
                </div>

                <motion.div
                  initial={{ opacity: 0, scaleX: 0 }}
                  whileInView={{ opacity: 1, scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.8 }}
                  className="h-px w-24 md:w-32 bg-[#c5a059] mx-auto my-6 md:my-8"
                />

                {hasRsvped ? (
                  <div className="w-full text-center space-y-3">
                    <div className="flex items-center justify-center gap-2 text-sm font-serif">
                      <CheckCircle2 size={16} className="text-green-500" />
                      <span className="text-gray-500">
                        You've RSVP'd — {rsvpData.attending ? 'Attending' : 'Not Attending'}
                      </span>
                    </div>
                    <button
                      onClick={() => setVisibleSections(prev => ({ ...prev, rsvp: true }))}
                      className="text-xs font-serif uppercase tracking-widest text-[#8b0000] hover:underline transition-colors"
                    >
                      Change Response
                    </button>
                  </div>
                ) : (
                  <div className="w-full grid grid-cols-2 gap-3 md:gap-4">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        handleRsvpChange('attending', true);
                        setVisibleSections(prev => ({ ...prev, rsvp: true }));
                      }}
                      className="py-4 md:py-5 rounded-xl bg-[#8b0000] text-white font-serif text-sm uppercase tracking-widest shadow-lg hover:bg-[#a00000] transition-colors flex items-center justify-center gap-2"
                    >
                      <Heart size={14} className="fill-white" />
                      <span>Attending</span>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        handleRsvpChange('attending', false);
                        setVisibleSections(prev => ({ ...prev, rsvp: true }));
                      }}
                      className="py-4 md:py-5 rounded-xl border border-gray-200 text-gray-500 font-serif text-sm uppercase tracking-widest hover:border-gray-300 transition-colors flex items-center justify-center gap-2"
                    >
                      <span>Not Attending</span>
                    </motion.button>
                  </div>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.6 }}
                  className="mt-8 md:mt-12 pt-8 md:pt-12 border-t border-[#c5a059]/20"
                >
                  <p className="text-lg md:text-2xl font-serif italic text-gray-600 max-w-sm md:max-w-lg mx-auto leading-relaxed">
                    "Two souls with but a single thought, two hearts that beat as one."
                  </p>
                </motion.div>

              </div>
            </div>

            {/* Decorative Corner Elements - Adjusted for mobile */}
            <div className="absolute top-4 left-4 md:top-6 md:left-6 w-10 h-10 md:w-16 md:h-16 border-t-2 border-l-2 border-[#c5a059]/30 rounded-tl-xl md:rounded-tl-2xl" />
            <div className="absolute top-4 right-4 md:top-6 md:right-6 w-10 h-10 md:w-16 md:h-16 border-t-2 border-r-2 border-[#c5a059]/30 rounded-tr-xl md:rounded-tr-2xl" />
            <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 w-10 h-10 md:w-16 md:h-16 border-b-2 border-l-2 border-[#c5a059]/30 rounded-bl-xl md:rounded-bl-2xl" />
            <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 w-10 h-10 md:w-16 md:h-16 border-b-2 border-r-2 border-[#c5a059]/30 rounded-br-xl md:rounded-br-2xl" />
            
          </motion.div>

          {/* Inline Wishes Section */}
          {/* #18: TikTok-style swipeable wishes */}
          {guestBookEntries.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="w-full max-w-2xl mt-10 z-10"
            >
              <div className="text-center mb-6">
                <p className="text-xs font-serif uppercase tracking-[0.3em] text-[#c5a059]">Wishes from loved ones</p>
              </div>
              <SwipeableWishes
                entries={guestBookEntries}
                userName={guestInfo?.name || guestBookData.name}
                onUpdate={(updated) => setGuestBookEntries(prev => prev.map(e => e.id === updated.id ? updated : e))}
                onViewAll={() => setVisibleSections(prev => ({ ...prev, guestbook: true }))}
              />
            </motion.div>
          )}

          {/* Leave a Wish prompt */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-2xl mt-8 mb-4 z-10"
          >
            <button
              onClick={() => setVisibleSections(prev => ({ ...prev, guestbook: true }))}
              className="w-full py-5 rounded-2xl border border-dashed border-[#c5a059]/30 hover:border-[#c5a059]/60 transition-colors flex items-center justify-center gap-2 group"
            >
              <MessageSquare size={16} className="text-[#c5a059]/60 group-hover:text-[#8b0000] transition-colors" />
              <span className="text-sm font-serif text-gray-400 group-hover:text-[#8b0000] transition-colors">
                Leave a wish for the couple
              </span>
            </button>
          </motion.div>

          {/* Share Photos prompt */}

          {/* Photo Gallery Modal */}
          <AnimatePresence>
            {visibleSections.gallery && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setVisibleSections(prev => ({ ...prev, gallery: false }))}
                  className="absolute inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm"
                />
                <motion.section
                  id="gallery-section"
                  key="gallery-section"
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="w-full max-w-6xl max-h-[90vh] bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl relative z-10 overflow-y-auto hearty-scrollbar p-6 md:p-12"
                >
                  <button
                    onClick={() => setVisibleSections(prev => ({ ...prev, gallery: false }))}
                    className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 transition-colors z-20"
                  >
                    <X className="w-6 h-6 text-gray-500" />
                  </button>

                  <div className="text-center mb-12 md:mb-16">
                    <motion.h2 
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8 }}
                      className="text-4xl md:text-6xl font-serif text-[#1a1a1a] mb-4"
                    >
                      Our Story in Frames
                    </motion.h2>
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: 96 }}
                      transition={{ duration: 1, delay: 0.4 }}
                      className="h-px bg-[#c5a059] mx-auto mb-6" 
                    />
                    <motion.p 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8, delay: 0.6 }}
                      className="text-gray-500 font-serif italic text-lg"
                    >
                      Capturing the moments that led us here
                    </motion.p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
                    {galleryImages.map((img, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1 }}
                        className={`relative group overflow-hidden rounded-2xl shadow-xl aspect-[4/5] border border-[#c5a059]/10 ${
                          idx % 3 === 1 ? 'lg:translate-y-16' : ''
                        }`}
                      >
                        <img
                          src={img.url}
                          alt={img.caption}
                          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#8b0000]/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8">
                          <motion.p 
                            initial={{ y: 20, opacity: 0 }}
                            whileInView={{ y: 0, opacity: 1 }}
                            className="text-white font-serif italic text-xl"
                          >
                            {img.caption}
                          </motion.p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.section>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {visibleSections.rsvp && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setVisibleSections(prev => ({ ...prev, rsvp: false }))}
                  className="absolute inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm"
                />
                <motion.section
                  id="rsvp-section"
                  key="rsvp-section"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 30 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="w-full max-w-4xl max-h-[90vh] bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl relative z-10 overflow-y-auto hearty-scrollbar p-6 sm:p-10 md:p-16"
                >
                  <button
                    onClick={() => setVisibleSections(prev => ({ ...prev, rsvp: false }))}
                    className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 transition-colors z-20"
                  >
                    <X className="w-6 h-6 text-gray-500" />
                  </button>
                  <div className="text-center mb-8 md:mb-12">
                    <motion.h2 
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8 }}
                      className="text-4xl md:text-6xl font-serif text-[#1a1a1a] mb-4"
                    >
                      RSVP
                    </motion.h2>
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: 96 }}
                      transition={{ duration: 1, delay: 0.4 }}
                      className="h-px bg-[#c5a059] mx-auto mb-6" 
                    />
                    <motion.p 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8, delay: 0.6 }}
                      className="text-gray-500 font-serif italic text-base md:text-lg"
                    >
                      We would love to have you with us
                    </motion.p>
                  </div>

                  <AnimatePresence mode="wait">
                  {rsvpStatus === 'success' ? (
                    <motion.div
                      key="rsvp-success"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="text-center py-12 space-y-6"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
                        className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto"
                      >
                        <CheckCircle2 className="text-green-500 w-12 h-12" />
                      </motion.div>
                      <motion.h3
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="text-2xl md:text-3xl font-serif text-[#1a1a1a]"
                      >
                        Thank You!
                      </motion.h3>
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="text-gray-500 font-serif"
                      >
                        {rsvpData.attending
                          ? "Your response has been received. We can't wait to celebrate with you!"
                          : "We're sorry you can't make it, but we appreciate you letting us know."}
                      </motion.p>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="pt-4 border-t border-gray-100 space-y-4"
                      >
                        <p className="text-sm font-serif text-gray-400 italic">
                          Would you like to leave a wish for the couple?
                        </p>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            setVisibleSections(prev => ({ ...prev, rsvp: false, guestbook: true }));
                            setRsvpStatus('idle');
                          }}
                          className="px-6 py-3 bg-[#8b0000] text-white rounded-full font-serif uppercase tracking-widest text-xs shadow-lg hover:bg-[#a00000] transition-colors inline-flex items-center gap-2"
                        >
                          <MessageSquare size={14} />
                          <span>Leave a Wish</span>
                        </motion.button>
                      </motion.div>
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setVisibleSections(prev => ({ ...prev, rsvp: false }));
                          setRsvpStatus('idle');
                        }}
                        className="text-gray-400 font-serif text-xs uppercase tracking-widest hover:text-gray-600 transition-colors"
                      >
                        Close
                      </motion.button>
                    </motion.div>
                  ) : (
                    <motion.form
                      key="rsvp-form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      onSubmit={handleRsvpSubmit}
                      className="space-y-6 md:space-y-8"
                    >
                      <div className="space-y-2">
                        <label className="flex items-center space-x-2 text-[10px] md:text-xs uppercase tracking-widest text-[#c5a059] font-serif font-semibold">
                          <User size={14} />
                          <span>Full Name</span>
                        </label>
                        <motion.input
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.5, delay: 0.7 }}
                          whileFocus={{ borderBottomColor: '#8b0000', scale: 1.01 }}
                          required
                          type="text"
                          value={rsvpData.name}
                          onChange={(e) => handleRsvpChange('name', e.target.value)}
                          className={`w-full bg-transparent border-b py-2 md:py-3 outline-none transition-colors font-serif text-base md:text-lg ${
                            rsvpErrors.name ? 'border-red-500' : 'border-gray-200'
                          }`}
                          placeholder="Your Name"
                        />
                        {rsvpErrors.name && (
                          <motion.p 
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-red-500 text-[10px] md:text-xs font-serif mt-1"
                          >
                            {rsvpErrors.name}
                          </motion.p>
                        )}
                      </div>

                      <div className="space-y-3 md:space-y-4">
                        <label className="flex items-center space-x-2 text-[10px] md:text-xs uppercase tracking-widest text-[#c5a059] font-serif font-semibold">
                          <CheckCircle2 size={14} />
                          <span>Attendance</span>
                        </label>
                        <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={() => handleRsvpChange('attending', true)}
                            className={`flex-1 py-3 md:py-4 rounded-xl border transition-all font-serif text-sm md:text-base ${
                              rsvpData.attending
                                ? 'bg-[#8b0000] text-white border-[#8b0000] shadow-lg'
                                : 'border-gray-200 text-gray-500 hover:border-[#8b0000]'
                            }`}
                          >
                            Joyfully Accepts
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={() => handleRsvpChange('attending', false)}
                            className={`flex-1 py-3 md:py-4 rounded-xl border transition-all font-serif text-sm md:text-base ${
                              !rsvpData.attending
                                ? 'bg-gray-800 text-white border-gray-800 shadow-lg'
                                : 'border-gray-200 text-gray-500 hover:border-gray-800'
                            }`}
                          >
                            Regretfully Declines
                          </motion.button>
                        </div>
                      </div>

                      <div className="pt-4 md:pt-8 flex justify-center">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          disabled={rsvpStatus === 'submitting'}
                          className="w-28 h-28 md:w-32 md:h-32 rounded-full border-2 border-[#8b0000] text-[#8b0000] font-serif uppercase tracking-widest text-xs hover:bg-[#8b0000] hover:text-white transition-all duration-300 flex items-center justify-center disabled:opacity-50"
                        >
                          {rsvpStatus === 'submitting' ? (
                            <div className="w-5 h-5 border-2 border-[#8b0000]/30 border-t-[#8b0000] rounded-full animate-spin" />
                          ) : (
                            <span>Confirm</span>
                          )}
                        </motion.button>
                        {rsvpStatus === 'error' && (
                          <p className="text-red-500 text-center mt-4 font-serif text-sm">
                            Something went wrong. Please try again.
                          </p>
                        )}
                      </div>
                    </motion.form>
                  )}
                  </AnimatePresence>
                </motion.section>
              </div>
            )}
          </AnimatePresence>

          {/* Guest Book Modal */}
          <AnimatePresence>
            {visibleSections.guestbook && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setVisibleSections(prev => ({ ...prev, guestbook: false }))}
                  className="absolute inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm"
                />
                <motion.section
                  id="guestbook-section"
                  key="guestbook-section"
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="w-full max-w-4xl max-h-[90vh] bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl relative z-10 overflow-y-auto hearty-scrollbar p-6 sm:p-10 md:p-16"
                >
                  <button
                    onClick={() => setVisibleSections(prev => ({ ...prev, guestbook: false }))}
                    className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 transition-colors z-20"
                  >
                    <X className="w-6 h-6 text-gray-500" />
                  </button>
                  
                  <div className="text-center mb-8 md:mb-12">
                    <motion.h2 
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8 }}
                      className="text-4xl md:text-6xl font-serif text-[#1a1a1a] mb-4"
                    >
                      Guest Book
                    </motion.h2>
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: 96 }}
                      transition={{ duration: 1, delay: 0.4 }}
                      className="h-px bg-[#c5a059] mx-auto mb-6" 
                    />
                    <motion.p 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8, delay: 0.6 }}
                      className="text-gray-500 font-serif italic text-base md:text-lg"
                    >
                      Leave a wish for the happy couple
                    </motion.p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* Form Section */}
                    <div className="space-y-8">
                      {guestBookStatus === 'success' ? (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-green-50 border border-green-100 rounded-3xl p-8 text-center"
                        >
                          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                          <h3 className="text-2xl font-serif text-green-800 mb-2">Thank You!</h3>
                          <p className="text-green-600 font-serif">Your message has been added to our guest book.</p>
                        </motion.div>
                      ) : (
                        <form onSubmit={handleGuestBookSubmit} className="space-y-6">
                          <div className="space-y-2">
                            <label className="flex items-center space-x-2 text-[10px] md:text-xs uppercase tracking-widest text-[#c5a059] font-serif font-semibold">
                              <User size={14} />
                              <span>Your Name</span>
                            </label>
                            <input
                              required
                              type="text"
                              value={guestBookData.name}
                              onChange={(e) => handleGuestBookChange('name', e.target.value)}
                              readOnly={!!guestInfo}
                              className={`w-full bg-transparent border-b py-3 outline-none transition-colors font-serif text-lg ${
                                guestInfo ? 'text-gray-500 cursor-default' : ''
                              } ${
                                guestBookErrors.name ? 'border-red-500' : 'border-gray-200 focus:border-[#8b0000]'
                              }`}
                              placeholder="Enter your name"
                            />
                            {guestBookErrors.name && (
                              <motion.p 
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-red-500 text-[10px] md:text-xs font-serif mt-1"
                              >
                                {guestBookErrors.name}
                              </motion.p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="flex items-center space-x-2 text-[10px] md:text-xs uppercase tracking-widest text-[#c5a059] font-serif font-semibold">
                                <MessageSquare size={14} />
                                <span>Your Message</span>
                              </label>
                              <span className={`text-[10px] font-serif ${guestBookData.message.length > 500 ? 'text-red-500' : 'text-gray-400'}`}>
                                {guestBookData.message.length}/500
                              </span>
                            </div>
                            <textarea
                              required
                              value={guestBookData.message}
                              onChange={(e) => handleGuestBookChange('message', e.target.value)}
                              className={`w-full bg-transparent border-b py-3 outline-none transition-colors font-serif text-lg resize-none ${
                                guestBookErrors.message ? 'border-red-500' : 'border-gray-200 focus:border-[#8b0000]'
                              }`}
                              placeholder="Write your wishes here..."
                              rows={3}
                            />
                            {guestBookErrors.message && (
                              <motion.p 
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-red-500 text-[10px] md:text-xs font-serif mt-1"
                              >
                                {guestBookErrors.message}
                              </motion.p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <label className="flex items-center space-x-2 text-[10px] md:text-xs uppercase tracking-widest text-[#c5a059] font-serif font-semibold">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                              <span>Photo (Optional)</span>
                            </label>
                            {guestBookPhoto ? (
                              <div className="flex items-center gap-3 py-2">
                                {guestBookPhoto.type.startsWith('video/') ? (
                                  <video
                                    src={URL.createObjectURL(guestBookPhoto)}
                                    className="w-16 h-16 rounded-lg object-cover border border-[#c5a059]/20"
                                  />
                                ) : (
                                  <img
                                    src={URL.createObjectURL(guestBookPhoto)}
                                    alt="Preview"
                                    className="w-16 h-16 rounded-lg object-cover border border-[#c5a059]/20"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-serif text-gray-600 truncate">{guestBookPhoto.name}</p>
                                  <p className="text-[10px] text-gray-400">{(guestBookPhoto.size / 1024 / 1024).toFixed(1)} MB</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setGuestBookPhoto(null)}
                                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                                >
                                  Remove
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <label className="flex-1 flex items-center justify-center py-4 border border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[#c5a059]/40 transition-colors">
                                  <input
                                    type="file"
                                    accept="image/*,video/mp4,video/quicktime,video/webm"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file && file.size > 50 * 1024 * 1024) {
                                        e.target.value = '';
                                        return;
                                      }
                                      if (file) setGuestBookPhoto(file);
                                    }}
                                  />
                                  <span className="text-xs font-serif text-gray-400">Photo or Video</span>
                                </label>
                                <label className="flex items-center justify-center px-4 py-4 border border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[#c5a059]/40 transition-colors">
                                  <input
                                    type="file"
                                    accept="video/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file && file.size > 50 * 1024 * 1024) {
                                        e.target.value = '';
                                        return;
                                      }
                                      if (file) setGuestBookPhoto(file);
                                    }}
                                  />
                                  <span className="text-xs font-serif text-gray-400">Record</span>
                                </label>
                              </div>
                            )}
                          </div>
                          <motion.button
                            whileHover={{ scale: 1.02, backgroundColor: '#a00000' }}
                            whileTap={{ scale: 0.98 }}
                            disabled={guestBookStatus === 'submitting'}
                            className="w-full py-4 bg-[#8b0000] text-white rounded-full font-serif tracking-widest uppercase text-sm shadow-xl flex items-center justify-center space-x-3 disabled:opacity-50"
                          >
                            {guestBookStatus === 'submitting' ? (
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <>
                                <span>Post Message</span>
                                <Heart size={16} />
                              </>
                            )}
                          </motion.button>
                        </form>
                      )}
                    </div>

                    {/* Messages Section */}
                    <div className="space-y-6 max-h-[500px] overflow-y-auto hearty-scrollbar pr-4">
                      <h3 className="text-xl font-serif text-[#1a1a1a] border-b border-gray-100 pb-4">Recent Wishes</h3>
                      {guestBookEntries.length === 0 ? (
                        <p className="text-gray-400 font-serif italic text-center py-12">No messages yet. Be the first!</p>
                      ) : (
                        <div className="space-y-6">
                          {guestBookEntries.map((entry) => (
                            <GuestBookCard
                              key={entry.id}
                              entry={entry}
                              userName={guestInfo?.name || guestBookData.name}
                              onUpdate={(updated) => setGuestBookEntries(prev => prev.map(e => e.id === updated.id ? updated : e))}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.section>
              </div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Shared Photo Album Modal */}
      <AnimatePresence>
        {visibleSections.photoalbum && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setVisibleSections(prev => ({ ...prev, photoalbum: false }))}
              className="absolute inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm"
            />
            <motion.section
              id="photoalbum-section"
              key="photoalbum-section"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="w-full max-w-6xl max-h-[90vh] bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl relative z-10 overflow-y-auto hearty-scrollbar p-6 md:p-12"
            >
              <button
                onClick={() => setVisibleSections(prev => ({ ...prev, photoalbum: false }))}
                className="absolute top-4 right-4 md:top-6 md:right-6 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors z-20"
              >
                <X size={16} />
              </button>

              <div className="text-center mb-8">
                <p className="text-[10px] font-serif uppercase tracking-[0.3em] text-[#c5a059] mb-2">Shared Moments</p>
                <h2 className="text-3xl md:text-4xl text-[#1a1a1a]" style={{ fontFamily: "'Zhi Mang Xing', cursive" }}>
                  Photo Album
                </h2>
                <p className="text-sm font-serif text-gray-400 mt-3 max-w-md mx-auto leading-relaxed">
                  Share your favourite moments from the big day! We'll be posting photos here too — come back after the wedding to relive the memories together.
                </p>
              </div>

              {/* Upload area — #12: only available on/after wedding date */}
              <div className="mb-8 space-y-3">
                {!isWeddingDay ? (
                  <div className="py-8 rounded-2xl border-2 border-dashed border-[#c5a059]/20 bg-[#fdfaf6] text-center">
                    <Camera size={24} className="text-[#c5a059]/40 mx-auto mb-2" />
                    <p className="text-sm font-serif text-gray-400">Photo sharing opens on the wedding day</p>
                    <p className="text-[10px] font-serif text-gray-300 mt-1">Come back on May 20 to share your moments!</p>
                  </div>
                ) : (
                  <>
                    {!canUploadPhotos && (
                      <p className="text-xs font-serif text-gray-400 text-center">
                        {!hasRsvped || !rsvpData.attending
                          ? 'Only attending guests can upload photos. Please RSVP as attending first.'
                          : 'Please leave a wish first so we know your name, or visit via your invite link.'}
                      </p>
                    )}
                    <label className={`flex flex-col items-center justify-center py-8 border-2 border-dashed border-[#c5a059]/30 rounded-2xl transition-colors bg-[#fdfaf6] ${canUploadPhotos && !photoAlbumUploading ? 'cursor-pointer hover:border-[#c5a059]/60' : 'opacity-50 cursor-not-allowed'}`}>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handlePhotoAlbumUpload(e.target.files);
                            e.target.value = '';
                          }
                        }}
                        disabled={photoAlbumUploading || !canUploadPhotos}
                      />
                      <Camera size={24} className="text-[#c5a059] mb-2" />
                      <span className="text-sm font-serif text-gray-500">Tap to share your photos</span>
                      <span className="text-[10px] font-serif text-gray-400 mt-1">You can select multiple photos</span>
                    </label>
                  </>
                )}

                {/* Progress bar */}
                {photoAlbumUploading && (
                  <div className="space-y-1">
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-[#8b0000] to-[#c5a059] rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${photoAlbumUploadProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <p className="text-[10px] font-serif text-gray-400 text-center">
                      {photoAlbumUploadProgress < 50 ? 'Compressing...' : photoAlbumUploadProgress < 100 ? 'Uploading...' : 'Done!'}
                    </p>
                  </div>
                )}
              </div>

              {/* Masonry grid */}
              {photoAlbumPhotos.length === 0 ? (
                photoAlbumLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-[#c5a059]/30 border-t-[#8b0000] rounded-full animate-spin" />
                  </div>
                ) : (
                  <p className="text-gray-400 font-serif italic text-center py-12">No photos yet. Be the first to share!</p>
                )
              ) : (
                <div className="columns-2 md:columns-3 gap-3 md:gap-4">
                  {photoAlbumPhotos.map((photo) => (
                    <motion.div
                      key={photo.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="break-inside-avoid mb-3 md:mb-4 cursor-pointer group"
                      onClick={() => setLightboxPhoto(photo)}
                    >
                      <div className="relative overflow-hidden rounded-xl border border-[#c5a059]/10 shadow-sm">
                        <img
                          src={photo.file_path}
                          alt={`Photo by ${photo.uploader_name}`}
                          className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                          <p className="text-white text-xs font-serif truncate">{photo.uploader_name}</p>
                          <p className="text-white/60 text-[10px]">
                            {new Date(photo.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Infinite scroll sentinel */}
              {photoAlbumHasMore && (
                <div ref={photoAlbumSentinelRef} className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[#c5a059]/30 border-t-[#8b0000] rounded-full animate-spin" />
                </div>
              )}
            </motion.section>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxPhoto && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLightboxPhoto(null)}
              className="absolute inset-0 bg-black/90"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
              className="relative z-10 max-w-[90vw] max-h-[90vh] flex flex-col items-center"
            >
              <button
                onClick={() => setLightboxPhoto(null)}
                className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white transition-colors"
              >
                <X className="w-8 h-8" />
              </button>
              <img
                src={lightboxPhoto.file_path}
                alt={`Photo by ${lightboxPhoto.uploader_name}`}
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
              <div className="mt-3 text-center">
                <p className="text-white text-sm font-serif">{lightboxPhoto.uploader_name}</p>
                <p className="text-white/60 text-xs">
                  {new Date(lightboxPhoto.created_at).toLocaleDateString()}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Venue Modal */}
      <AnimatePresence>
        {showVenueModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowVenueModal(false)}
              className="absolute inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="w-full max-w-lg max-h-[90vh] bg-white rounded-[2rem] shadow-2xl relative z-10 overflow-y-auto"
            >
              <button
                onClick={() => setShowVenueModal(false)}
                className="absolute top-5 right-5 p-2 rounded-full hover:bg-gray-100 transition-colors z-20"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>

              <VenueCalendarCard />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Weather Modal */}
      <AnimatePresence>
        {showWeatherModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWeatherModal(false)}
              className="absolute inset-0 bg-[#1a1a1a]/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="w-full max-w-lg max-h-[90vh] bg-white rounded-[2rem] shadow-2xl relative z-10 overflow-y-auto"
            >
              <button
                onClick={() => setShowWeatherModal(false)}
                className="absolute top-5 right-5 p-2 rounded-full hover:bg-gray-100 transition-colors z-20"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>

              <WeatherForecast />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Back to Top Button */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-24 md:bottom-[88px] right-4 md:right-6 z-[59] w-10 h-10 rounded-full bg-white border border-[#c5a059]/30 text-[#8b0000] shadow-xl flex items-center justify-center hover:bg-[#8b0000] hover:text-white transition-all duration-300"
          >
            <ChevronUp size={24} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Floating Action Menu */}
      {step === 'invitation' && (
        <div className="fixed bottom-5 left-5 md:bottom-6 md:left-6 z-[60]">
          {/* Backdrop */}
          <AnimatePresence>
            {fabOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setFabOpen(false)}
                className="fixed inset-0 bg-black/20 backdrop-blur-[2px]"
              />
            )}
          </AnimatePresence>

          {/* Action items */}
          <AnimatePresence>
            {fabOpen && (
              <div className="absolute bottom-16 left-0 flex flex-col gap-3">
                {([
                  { icon: Users, label: 'Gallery', action: () => setVisibleSections(prev => ({ ...prev, gallery: true })) },
                  { icon: Camera, label: 'Photo Album', action: () => setVisibleSections(prev => ({ ...prev, photoalbum: true })) },
                ]).map((item, i) => (
                  <motion.button
                    key={item.label}
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.8 }}
                    transition={{ delay: (2 - i) * 0.05, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => { item.action(); setFabOpen(false); }}
                    className="flex items-center gap-3 group"
                  >
                    <span className="text-[10px] font-serif uppercase tracking-widest text-white/90 bg-[#1a0a0a]/80 backdrop-blur-sm px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg">
                      {item.label}
                    </span>
                    <div className="w-11 h-11 rounded-full bg-white border border-[#c5a059]/30 shadow-lg flex items-center justify-center text-[#8b0000] hover:bg-[#8b0000] hover:text-white transition-colors">
                      <item.icon size={18} />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </AnimatePresence>

          {/* Main FAB button */}
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1, type: 'spring', stiffness: 300, damping: 20 }}
            onClick={() => setFabOpen(prev => !prev)}
            className="relative w-12 h-12 rounded-full bg-[#8b0000] text-white shadow-[0_4px_20px_rgba(139,0,0,0.35)] flex items-center justify-center hover:bg-[#a00000] transition-colors"
          >
            <motion.div
              animate={{ rotate: fabOpen ? 45 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </motion.div>
          </motion.button>
        </div>
      )}

      {/* Music Player Bar */}
      {step === 'invitation' && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          onHoverStart={() => { if (CAN_HOVER) setPlayerOpen(true); }}
          onHoverEnd={() => { if (CAN_HOVER) setPlayerOpen(false); }}
          onTap={() => { if (!CAN_HOVER) setPlayerOpen(prev => !prev); }}
          className="fixed bottom-5 right-5 md:bottom-6 md:right-6 z-[60] cursor-pointer"
        >
          <motion.div
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="relative bg-[#1a0a0a] overflow-hidden shadow-[0_8px_40px_rgba(139,0,0,0.3)]"
            style={{ borderRadius: 20 }}
          >
            {/* Ambient glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#8b0000]/20 via-transparent to-[#c5a059]/10 pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#c5a059]/40 to-transparent" />

            <AnimatePresence mode="wait">
              {!playerOpen ? (
                <motion.div
                  key="collapsed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="relative px-3.5 py-2.5 flex items-center gap-2.5"
                >
                  {/* Spinning disc */}
                  <motion.div
                    animate={isPlaying ? { rotate: 360 } : {}}
                    transition={isPlaying ? { duration: 3, repeat: Infinity, ease: 'linear' } : { duration: 0 }}
                    className="w-7 h-7 rounded-full bg-gradient-to-br from-[#8b0000] to-[#4a0000] flex items-center justify-center flex-shrink-0 border border-[#c5a059]/15"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-[#c5a059]/50" />
                  </motion.div>
                  {/* Sound bars */}
                  <div className="flex items-end gap-[2px] h-3.5 flex-shrink-0">
                    {WAVE_HEIGHTS.collapsed.map((w, i) => (
                      <motion.div
                        key={i}
                        animate={isPlaying ? { height: w.heights } : { height: '3px' }}
                        transition={isPlaying ? { duration: w.duration, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
                        className="w-[2px] rounded-full bg-[#c5a059]/50"
                      />
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="expanded"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="relative px-4 py-3 flex items-center gap-3 w-64"
                >
                  {/* Album art / Play button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsPlaying(prev => !prev); }}
                    className="relative w-10 h-10 rounded-xl flex-shrink-0 group"
                    aria-label={isPlaying ? 'Pause music' : 'Play music'}
                  >
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#8b0000] to-[#4a0000]" />
                    <motion.div
                      animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                      transition={isPlaying ? { duration: 3, repeat: Infinity, ease: 'linear' } : { duration: 0 }}
                      className="absolute inset-1 rounded-lg border border-[#c5a059]/20 flex items-center justify-center"
                    >
                      <div className="w-2 h-2 rounded-full bg-[#c5a059]/60" />
                    </motion.div>
                    <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white">
                        {isPlaying ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="7 3 20 12 7 21"/></svg>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Track info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-serif text-white/90 truncate tracking-wide">{PLAYLIST[trackIndex].title}</p>
                  </div>

                  {/* Sound wave visualizer */}
                  <div className="flex items-end gap-[3px] h-4 flex-shrink-0">
                    {WAVE_HEIGHTS.expanded.map((w, i) => (
                      <motion.div
                        key={i}
                        animate={isPlaying ? { height: w.heights } : { height: '4px' }}
                        transition={isPlaying ? { duration: w.duration, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
                        className="w-[2px] rounded-full bg-[#c5a059]/60"
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}

      {/* Floating Petals/Particles Effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {PETAL_CONFIGS.map((petal, i) => (
          <motion.div
            key={i}
            initial={{ top: -20, left: petal.startLeft, rotate: 0, opacity: 0 }}
            animate={{ top: '110%', left: petal.endLeft, rotate: 360, opacity: [0, 0.5, 0] }}
            transition={{ duration: petal.duration, repeat: Infinity, ease: "linear", delay: petal.delay }}
            className={`absolute w-2 h-4 md:w-3 md:h-5 ${petal.isGold ? 'bg-[#c5a059]/15' : 'bg-[#8b0000]/10'} rounded-[50%_50%_50%_0] blur-[0.5px]`}
          />
        ))}
      </div>

      {/* Background Music */}
      <audio
        ref={audioRef}
        src={PLAYLIST[trackIndex].src}
        preload="auto"
        onCanPlayThrough={() => setIsReady(true)}
        onEnded={() => setTrackIndex(prev => (prev + 1) % PLAYLIST.length)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          const audio = audioRef.current;
          if (audio && audio.currentTime < audio.duration) setIsPlaying(false);
        }}
        onError={(e) => {
          const target = e.target as HTMLAudioElement;
          console.error("Audio playback error details:", {
            code: target.error?.code,
            message: target.error?.message
          });
          setIsReady(false);
          setIsPlaying(false);
        }}
      />
      </div>
    </ErrorBoundary>
  );
}
