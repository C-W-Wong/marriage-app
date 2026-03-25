import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Heart, Camera, Navigation } from 'lucide-react';
import { WEDDING_CONFIG } from './weddingConfig';
import ConfettiBurst from './ConfettiBurst';

const { event, venue, dayOfMessages } = WEDDING_CONFIG;

type WeddingPhase = 'countdown' | 'dayOf' | 'afterParty';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: event.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getWeddingPhase(): WeddingPhase {
  const todayInTZ = dateFormatter.format(new Date());
  if (todayInTZ < event.date) return 'countdown';
  if (todayInTZ === event.date) return 'dayOf';
  return 'afterParty';
}

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const navigationUrl = isIOS
  ? `https://maps.apple.com/?daddr=${encodeURIComponent(venue.address)}&ll=${venue.lat},${venue.lng}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(venue.address)}`;

const startHour = parseInt(event.startTime.split(':')[0]);
const startMin = event.startTime.split(':')[1];
const displayTime = `${startHour > 12 ? startHour - 12 : startHour}:${startMin} ${startHour >= 12 ? 'PM' : 'AM'}`;

function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(targetDate) - +new Date();
      if (difference > 0) {
        return {
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        };
      }
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  const TimeUnit = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center px-3 md:px-4">
      <span className="text-2xl md:text-3xl font-serif font-light text-[#1a1a1a]">
        {value.toString().padStart(2, '0')}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-[#c5a059] font-serif mt-1">{label}</span>
    </div>
  );

  return (
    <div className="flex items-center justify-center divide-x divide-[#c5a059]/20 mt-8">
      <TimeUnit value={timeLeft.days} label="Days" />
      <TimeUnit value={timeLeft.hours} label="Hrs" />
      <TimeUnit value={timeLeft.minutes} label="Min" />
      <TimeUnit value={timeLeft.seconds} label="Sec" />
    </div>
  );
}

const GoldDivider = () => <div className="h-px w-16 bg-[#c5a059] mx-auto my-5" />;

function PulsingHeart({ size = 22, containerClass }: { size?: number; containerClass: string }) {
  return (
    <motion.div
      animate={{ scale: [1, 1.15, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      className={containerClass}
    >
      <Heart size={size} className="text-[#8b0000] fill-[#8b0000]" />
    </motion.div>
  );
}

export default function WeddingDayStatus({
  onOpenPhotoAlbum,
}: {
  onOpenPhotoAlbum: () => void;
}) {
  const [phase, setPhase] = useState<WeddingPhase>(() => getWeddingPhase());

  useEffect(() => {
    // Phase only changes at midnight — check once per minute instead of every second
    const timer = setInterval(() => {
      setPhase(prev => {
        const next = getWeddingPhase();
        return prev === next ? prev : next;
      });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (phase === 'countdown') {
    return <CountdownTimer targetDate={`${event.date}T${event.startTime}:00`} />;
  }

  if (phase === 'dayOf') {
    return (
      <div className="relative mt-8">
        <ConfettiBurst />

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, type: 'spring', stiffness: 80 }}
          className="flex flex-col items-center text-center"
        >
          <PulsingHeart containerClass="w-12 h-12 rounded-full bg-[#8b0000]/10 flex items-center justify-center mb-4" />

          <h3 className="text-3xl md:text-4xl font-serif font-light text-[#c5a059]">
            {dayOfMessages.celebration}
          </h3>

          <GoldDivider />

          <p className="text-sm md:text-base font-serif text-gray-500">
            {venue.name} &mdash; {displayTime}
          </p>

          <a
            href={navigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#8b0000] text-white rounded-full font-serif text-xs uppercase tracking-widest hover:bg-[#a00000] transition-colors"
          >
            <Navigation size={13} />
            <span>Navigate to Venue</span>
          </a>

          <button
            onClick={onOpenPhotoAlbum}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 border border-[#c5a059]/30 rounded-full font-serif text-xs uppercase tracking-widest text-[#8b0000] hover:border-[#c5a059]/60 transition-colors"
          >
            <Camera size={13} />
            <span>Share Your Photos</span>
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1 }}
      className="flex flex-col items-center text-center mt-8"
    >
      <PulsingHeart
        size={24}
        containerClass="w-14 h-14 rounded-full bg-[#8b0000]/5 flex items-center justify-center mb-5"
      />

      <h3 className="text-2xl md:text-3xl font-serif font-light text-[#1a1a1a]">
        {dayOfMessages.thankYou}
      </h3>

      <GoldDivider />

      <p className="text-sm font-serif text-gray-400 max-w-xs leading-relaxed">
        We are so grateful you were part of our special day.
      </p>

      <button
        onClick={onOpenPhotoAlbum}
        className="mt-5 inline-flex items-center gap-2 px-6 py-3 bg-[#8b0000] text-white rounded-full font-serif text-xs uppercase tracking-widest hover:bg-[#a00000] transition-colors"
      >
        <Camera size={14} />
        <span>Share Your Memories</span>
      </button>
    </motion.div>
  );
}
