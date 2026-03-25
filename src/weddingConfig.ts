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

export const weddingDate = new Date(`${event.date}T00:00:00-07:00`);
