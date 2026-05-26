export const WEDDING_CONFIG = {
  event: {
    title: "Chris & Eileen's Wedding Ceremony",
    date: '2026-05-20',
    startTime: '08:20',
    endTime: '10:20',
    timezone: 'America/Los_Angeles',
    description: 'We joyfully invite you to celebrate our union!',
  },
  venue: {
    name: 'Old Orange County Courthouse',
    address: '211 West Santa Ana Blvd, Santa Ana, CA 92701',
    lat: 33.7489,
    lng: -117.8681,
  },
  dayOfMessages: {
    celebration: "Today's the Day!",
    thankYou: 'Thank You for Celebrating With Us',
  },
};

// Calendar utilities (shared by VenueCalendarCard and App)
const { event, venue } = WEDDING_CONFIG;
const dateStr = event.date.replace(/-/g, '');
const calStart = `${dateStr}T${event.startTime.replace(':', '')}00`;
const calEnd = `${dateStr}T${event.endTime.replace(':', '')}00`;

export const icsContent = [
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

export function downloadICS() {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wedding-invitation.ics';
  a.click();
  URL.revokeObjectURL(url);
}

export const googleCalendarUrl = (() => {
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

export const outlookCalendarUrl = (() => {
  // outlook.live.com works globally including from mainland China.
  const isoStart = `${event.date}T${event.startTime}:00`;
  const isoEnd = `${event.date}T${event.endTime}:00`;
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: isoStart,
    enddt: isoEnd,
    location: `${venue.name}, ${venue.address}`,
    body: event.description,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
})();

// Direct deep-links to common map apps. Apple Maps + Baidu both work in China;
// Google Maps does not, so we pick the right default for CN visitors.
export const mapsLinks = {
  apple: `https://maps.apple.com/?daddr=${encodeURIComponent(venue.address)}&ll=${venue.lat},${venue.lng}`,
  google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(venue.address)}`,
  // Baidu's marker API expects WGS84 coordinates wrapped in the right query keys.
  baidu: `https://api.map.baidu.com/marker?location=${venue.lat},${venue.lng}&title=${encodeURIComponent(venue.name)}&content=${encodeURIComponent(venue.address)}&output=html&coord_type=wgs84`,
  osm: `https://www.openstreetmap.org/?mlat=${venue.lat}&mlon=${venue.lng}&zoom=16#map=16/${venue.lat}/${venue.lng}`,
};

// Best-effort heuristic for "user is likely on a Chinese network where Google
// services are blocked". navigator.language is the most reliable client-side
// signal; timezone is a fallback that catches a few VPN/expat cases.
export function isLikelyChinaUser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const lang = (navigator.language || '').toLowerCase();
  if (lang.startsWith('zh-cn') || lang === 'zh' || lang.startsWith('zh-hans')) return true;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz === 'Asia/Shanghai' || tz === 'Asia/Chongqing' || tz === 'Asia/Urumqi') return true;
  } catch {
    // ignore — older browsers without Intl
  }
  return false;
}

export const weddingDate = new Date(`${event.date}T00:00:00-07:00`);
