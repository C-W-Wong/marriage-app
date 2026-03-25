import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Cloud, Umbrella, Sun, Wind, Shirt, Heart } from 'lucide-react';

interface DailyForecast {
  date: string;
  isWeddingDay: boolean;
  highF: number;
  lowF: number;
  description: string;
  icon: string;
  rainProbability: number;
}

interface ClothingAdvice {
  icon: string;
  text: string;
}

interface WeatherData {
  available: boolean;
  daysUntilWedding: number;
  weddingDate: string;
  dailyForecasts: DailyForecast[];
  clothingAdvice?: ClothingAdvice[];
}

const ICON_COLORS = {
  sun: '#c5a059',
  cloud: '#9ca3af',
  bolt: '#c5a059',
} as const;

const SUN_RAYS = [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
  const rad = (angle * Math.PI) / 180;
  return {
    x1: 32 + Math.cos(rad) * 18,
    y1: 32 + Math.sin(rad) * 18,
    x2: 32 + Math.cos(rad) * 24,
    y2: 32 + Math.sin(rad) * 24,
  };
});

const ADVICE_ICONS: Record<string, typeof Umbrella> = {
  umbrella: Umbrella,
  sun: Sun,
  wind: Wind,
  jacket: Shirt,
  shirt: Shirt,
};

const FADE_IN = { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4 } } as const;
const NO_ANIM = {} as const;

function WeatherIcon({ icon, size = 64, animate = true }: { icon: string; size?: number; animate?: boolean }) {
  const code = icon.replace(/[dn]$/, '');
  const fade = animate ? FADE_IN : NO_ANIM;

  if (code === '01') {
    return (
      <motion.svg width={size} height={size} viewBox="0 0 64 64" fill="none" {...fade}>
        <circle cx="32" cy="32" r="12" fill={ICON_COLORS.sun} fillOpacity="0.2" stroke={ICON_COLORS.sun} strokeWidth="2" />
        {SUN_RAYS.map((ray, i) => (
          <line key={i} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} stroke={ICON_COLORS.sun} strokeWidth="2" strokeLinecap="round" />
        ))}
      </motion.svg>
    );
  }

  if (code === '02') {
    return (
      <motion.svg width={size} height={size} viewBox="0 0 64 64" fill="none" {...fade}>
        <circle cx="22" cy="24" r="9" fill={ICON_COLORS.sun} fillOpacity="0.2" stroke={ICON_COLORS.sun} strokeWidth="1.5" />
        <path d="M20 42 C20 42 20 36 26 36 C26 30 34 28 38 32 C42 28 50 30 50 36 C54 36 54 42 50 42 Z"
          fill={ICON_COLORS.cloud} fillOpacity="0.15" stroke={ICON_COLORS.cloud} strokeWidth="1.5" />
      </motion.svg>
    );
  }

  if (code === '03' || code === '04') {
    return (
      <motion.svg width={size} height={size} viewBox="0 0 64 64" fill="none" {...fade}>
        <path d="M14 40 C14 40 14 34 20 34 C20 26 30 24 34 28 C38 24 48 26 48 34 C54 34 54 40 48 40 Z"
          fill={ICON_COLORS.cloud} fillOpacity="0.15" stroke={ICON_COLORS.cloud} strokeWidth="1.5" />
        {code === '04' && (
          <path d="M22 46 C22 46 22 42 26 42 C26 37 32 36 35 38 C37 36 43 37 43 42 C47 42 47 46 43 46 Z"
            fill={ICON_COLORS.cloud} fillOpacity="0.1" stroke={ICON_COLORS.cloud} strokeWidth="1.5" />
        )}
      </motion.svg>
    );
  }

  if (code === '09' || code === '10') {
    return (
      <motion.svg width={size} height={size} viewBox="0 0 64 64" fill="none" {...fade}>
        <path d="M14 34 C14 34 14 28 20 28 C20 20 30 18 34 22 C38 18 48 20 48 28 C54 28 54 34 48 34 Z"
          fill={ICON_COLORS.cloud} fillOpacity="0.15" stroke={ICON_COLORS.cloud} strokeWidth="1.5" />
        {[24, 32, 40].map((x, i) => (
          <motion.line key={i} x1={x} y1={38} x2={x - 2} y2={46} stroke="#6b9fd4" strokeWidth="2" strokeLinecap="round"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: [0, 1, 0], y: [0, 6, 12] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}
          />
        ))}
      </motion.svg>
    );
  }

  if (code === '11') {
    return (
      <motion.svg width={size} height={size} viewBox="0 0 64 64" fill="none" {...fade}>
        <path d="M14 32 C14 32 14 26 20 26 C20 18 30 16 34 20 C38 16 48 18 48 26 C54 26 54 32 48 32 Z"
          fill={ICON_COLORS.cloud} fillOpacity="0.2" stroke={ICON_COLORS.cloud} strokeWidth="1.5" />
        <motion.polygon points="30,34 26,44 32,42 28,52 38,40 32,42 36,34"
          fill={ICON_COLORS.bolt} fillOpacity="0.8"
          animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
        />
      </motion.svg>
    );
  }

  if (code === '13') {
    return (
      <motion.svg width={size} height={size} viewBox="0 0 64 64" fill="none" {...fade}>
        <path d="M14 32 C14 32 14 26 20 26 C20 18 30 16 34 20 C38 16 48 18 48 26 C54 26 54 32 48 32 Z"
          fill={ICON_COLORS.cloud} fillOpacity="0.15" stroke={ICON_COLORS.cloud} strokeWidth="1.5" />
        {[24, 32, 40].map((x, i) => (
          <motion.text key={i} x={x} y={44} textAnchor="middle" fontSize="10" fill={ICON_COLORS.cloud}
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: [0, 1, 0], y: [0, 8, 16] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
          >*</motion.text>
        ))}
      </motion.svg>
    );
  }

  return (
    <motion.svg width={size} height={size} viewBox="0 0 64 64" fill="none" {...fade}>
      {[26, 32, 38].map((y, i) => (
        <motion.line key={i} x1={16} y1={y} x2={48} y2={y}
          stroke={ICON_COLORS.cloud} strokeWidth="2" strokeLinecap="round"
          initial={{ opacity: 0 }} animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
        />
      ))}
    </motion.svg>
  );
}

function formatDayLabel(dateStr: string, isWeddingDay: boolean): { day: string; weekday: string } {
  const date = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });

  if (isWeddingDay) return { day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), weekday };
  if (date.toDateString() === today.toDateString()) return { day: 'Today', weekday };
  if (date.toDateString() === tomorrow.toDateString()) return { day: 'Tomorrow', weekday };
  return { day: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), weekday };
}

export default function WeatherForecast() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WeatherData | null>(null);

  useEffect(() => {
    fetch('/api/weather')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="w-full">
      <div className="p-8 md:p-10 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-[#8b0000]/5 flex items-center justify-center mb-5">
          <Cloud size={24} className="text-[#8b0000]" />
        </div>
        <h3 className="text-2xl md:text-3xl font-serif font-light text-[#1a1a1a] mb-1">
          Weather Forecast
        </h3>
        <p className="text-sm font-serif text-gray-400 mb-1">Santa Ana, CA</p>
        <div className="h-px w-16 bg-[#c5a059] mx-auto my-4" />

        {loading && (
          <div className="flex flex-col items-center gap-3 py-6 w-full">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-full h-16 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {/* Multi-day forecast */}
        {!loading && data?.available && data.dailyForecasts.length > 0 && (
          <motion.div
            className="flex flex-col w-full gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {data.dailyForecasts.map((day, i) => {
              const label = formatDayLabel(day.date, day.isWeddingDay);
              return (
                <motion.div
                  key={day.date}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    day.isWeddingDay
                      ? 'bg-[#8b0000]/5 border-2 border-[#8b0000]/20 ring-1 ring-[#8b0000]/10'
                      : 'bg-[#fdfaf6] border border-[#c5a059]/10'
                  }`}
                >
                  {/* Day label */}
                  <div className="w-16 flex-shrink-0 text-left">
                    {day.isWeddingDay ? (
                      <div className="flex items-center gap-1">
                        <Heart size={10} className="text-[#8b0000] fill-[#8b0000]" />
                        <span className="text-xs font-serif font-semibold text-[#8b0000]">{label.weekday}</span>
                      </div>
                    ) : (
                      <span className="text-xs font-serif text-gray-500">{label.weekday}</span>
                    )}
                    <p className={`text-[10px] font-serif ${day.isWeddingDay ? 'text-[#8b0000]/70' : 'text-gray-400'}`}>
                      {label.day}
                    </p>
                  </div>

                  {/* Weather icon */}
                  <div className="flex-shrink-0">
                    <WeatherIcon icon={day.icon} size={32} animate={false} />
                  </div>

                  {/* Condition */}
                  <div className="flex-1 min-w-0 text-left">
                    <p className={`text-xs font-serif capitalize truncate ${day.isWeddingDay ? 'text-[#1a1a1a] font-medium' : 'text-gray-600'}`}>
                      {day.description}
                    </p>
                    {day.rainProbability > 0 && (
                      <p className="text-[10px] font-serif text-blue-400">
                        {day.rainProbability}% rain
                      </p>
                    )}
                  </div>

                  {/* Temp range */}
                  <div className="flex-shrink-0 text-right">
                    <span className={`text-sm font-serif font-light ${day.isWeddingDay ? 'text-[#1a1a1a]' : 'text-gray-700'}`}>
                      {day.highF}°
                    </span>
                    <span className="text-xs font-serif text-gray-400 ml-1">
                      {day.lowF}°
                    </span>
                  </div>
                </motion.div>
              );
            })}

            {/* Wedding day clothing advice */}
            {data.clothingAdvice && data.clothingAdvice.length > 0 && (
              <div className="w-full mt-4 pt-5 border-t border-[#c5a059]/20">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Heart size={10} className="text-[#8b0000] fill-[#8b0000]" />
                  <span className="text-xs font-serif uppercase tracking-[0.2em] text-[#c5a059] font-semibold">
                    Wedding Day Tips
                  </span>
                </div>
                <div className="space-y-2">
                  {data.clothingAdvice.map((advice, i) => {
                    const IconComponent = ADVICE_ICONS[advice.icon] || Shirt;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                        className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[#fdfaf6] border border-[#c5a059]/10 text-left"
                      >
                        <div className="text-[#c5a059] mt-0.5 flex-shrink-0">
                          <IconComponent size={16} />
                        </div>
                        <p className="text-sm font-serif text-[#1a1a1a]">{advice.text}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Forecast not available */}
        {!loading && (!data?.available || data.dailyForecasts.length === 0) && (
          <motion.div
            className="flex flex-col items-center gap-4 py-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.svg
              width={72} height={72} viewBox="0 0 64 64" fill="none"
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <circle cx="32" cy="32" r="24" stroke="#c5a059" strokeWidth="1" strokeOpacity="0.3" />
              <circle cx="32" cy="32" r="18" stroke="#c5a059" strokeWidth="1" strokeOpacity="0.2" />
              <path d="M20 36 C20 36 20 28 28 28 C28 22 36 20 38 26 C42 22 50 24 48 30 C52 30 52 36 48 36 Z"
                fill="#c5a059" fillOpacity="0.1" stroke="#c5a059" strokeWidth="1.5" strokeOpacity="0.4" />
              <circle cx="30" cy="42" r="1.5" fill="#c5a059" fillOpacity="0.3" />
              <circle cx="36" cy="44" r="1" fill="#c5a059" fillOpacity="0.2" />
            </motion.svg>

            <div>
              <p className="text-base font-serif text-[#1a1a1a] leading-relaxed">
                Weather forecast will appear<br />closer to the wedding
              </p>
              <p className="text-sm font-serif text-gray-400 mt-2 leading-relaxed">
                Check back within a week of the big day
              </p>
            </div>

            <div className="mt-3 px-5 py-4 rounded-xl bg-[#fdfaf6] border border-[#c5a059]/10 max-w-xs">
              <p className="text-xs font-serif uppercase tracking-[0.15em] text-[#c5a059] font-semibold mb-2">
                Santa Ana, CA — May
              </p>
              <p className="text-sm font-serif text-gray-500 leading-relaxed">
                Typically 68–78°F (20–26°C)<br />with sunny skies
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
