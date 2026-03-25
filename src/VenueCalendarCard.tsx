import { MapPin, Calendar, Download, Navigation } from 'lucide-react';
import { WEDDING_CONFIG } from './weddingConfig';

const { event, venue } = WEDDING_CONFIG;

// Shared date/time formatting (used by both ICS and Google Calendar)
const dateStr = event.date.replace(/-/g, '');
const calStart = `${dateStr}T${event.startTime.replace(':', '')}00`;
const calEnd = `${dateStr}T${event.endTime.replace(':', '')}00`;

// Pre-compute static address display
const addressParts = venue.address.split(', ');
const addressLine1 = addressParts[0];
const addressLine2 = addressParts.slice(1).join(', ');

const mapEmbedUrl = `https://maps.google.com/maps?q=${venue.lat},${venue.lng}&z=16&output=embed`;

const icsContent = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Wedding Invitation//EN',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'BEGIN:VEVENT',
  `UID:wedding-${dateStr}@wedding-invite`,
  `DTSTART;TZID=${event.timezone}:${calStart}`,
  `DTEND;TZID=${event.timezone}:${calEnd}`,
  `SUMMARY:${event.title}`,
  `LOCATION:${venue.name}\\, ${venue.address.replace(/,/g, '\\,')}`,
  `DESCRIPTION:${event.description}`,
  'STATUS:CONFIRMED',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const googleCalendarUrl = (() => {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${calStart}/${calEnd}`,
    location: `${venue.name}, ${venue.address}`,
    details: event.description,
    ctz: event.timezone,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
})();

// Detect iOS including iPadOS (which reports as Macintosh in UA)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const navigationUrl = isIOS
  ? `https://maps.apple.com/?daddr=${encodeURIComponent(venue.address)}&ll=${venue.lat},${venue.lng}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(venue.address)}`;

function downloadICS() {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wedding-invitation.ics';
  a.click();
  URL.revokeObjectURL(url);
}

export default function VenueCalendarCard() {
  return (
    <div className="p-8 md:p-10 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-[#8b0000]/5 flex items-center justify-center mb-5">
        <MapPin size={24} className="text-[#8b0000]" />
      </div>
      <h3 className="text-3xl md:text-4xl font-serif font-light text-[#1a1a1a] mb-2">
        The Venue
      </h3>
      <div className="h-px w-16 bg-[#c5a059] mx-auto my-4" />

      <p className="text-xl md:text-2xl font-serif font-light text-[#1a1a1a] leading-tight mt-2">
        {venue.name}
      </p>
      <p className="text-sm md:text-base font-serif text-gray-500 mt-3">
        {addressLine1}<br />
        {addressLine2}
      </p>
      <p className="text-sm font-serif text-gray-400 mt-3 max-w-xs leading-relaxed">
        {venue.description}
      </p>

      <div className="w-full mt-6 rounded-xl overflow-hidden border border-[#c5a059]/20">
        <iframe
          src={mapEmbedUrl}
          width="100%"
          height="200"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Venue Location"
        />
      </div>

      <a
        href={navigationUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#8b0000] text-white rounded-full font-serif text-sm uppercase tracking-widest hover:bg-[#a00000] transition-colors"
      >
        <Navigation size={14} />
        <span>Navigate to Venue</span>
      </a>

      <div className="w-full mt-8 pt-7 border-t border-[#c5a059]/20">
        <div className="flex items-center justify-center gap-2 mb-5">
          <Calendar size={14} className="text-[#c5a059]" />
          <span className="text-xs font-serif uppercase tracking-[0.2em] text-[#c5a059] font-semibold">
            Add to Calendar
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={downloadICS}
            className="flex flex-col items-center justify-center gap-2 px-3 py-3.5 rounded-xl border border-[#c5a059]/20 hover:border-[#c5a059]/40 hover:bg-[#fdfaf6] transition-all"
          >
            <svg className="w-5 h-5 text-[#1a1a1a]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            <span className="text-xs font-serif text-[#1a1a1a]">Apple</span>
          </button>

          <a
            href={googleCalendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-2 px-3 py-3.5 rounded-xl border border-[#c5a059]/20 hover:border-[#c5a059]/40 hover:bg-[#fdfaf6] transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="text-xs font-serif text-[#1a1a1a]">Google</span>
          </a>

          <button
            onClick={downloadICS}
            className="flex flex-col items-center justify-center gap-2 px-3 py-3.5 rounded-xl border border-[#c5a059]/20 hover:border-[#c5a059]/40 hover:bg-[#fdfaf6] transition-all"
          >
            <Download size={20} className="text-[#1a1a1a]" />
            <span className="text-xs font-serif text-[#1a1a1a]">.ics</span>
          </button>
        </div>
      </div>
    </div>
  );
}
