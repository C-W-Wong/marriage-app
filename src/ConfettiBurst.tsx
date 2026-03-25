import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

interface Particle {
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
  duration: number;
  delay: number;
  isCircle: boolean;
}

const COLORS = ['#8b0000', '#c5a059', '#8b0000', '#c5a059', '#a00000', '#d4b76a'];

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    x: (Math.random() - 0.5) * 500,
    y: -(Math.random() * 400 + 100),
    color: COLORS[i % COLORS.length],
    size: 4 + Math.random() * 5,
    rotation: Math.random() * 720 - 360,
    duration: 2.5 + Math.random(),
    delay: Math.random() * 0.3,
    isCircle: Math.random() > 0.5,
  }));
}

const DEFAULT_COUNT = typeof window !== 'undefined' && window.innerWidth < 640 ? 20 : 40;

export default function ConfettiBurst({ count = DEFAULT_COUNT }: { count?: number }) {
  const [particles] = useState(() => generateParticles(count));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 1, rotate: p.rotation }}
          transition={{ duration: p.duration, ease: 'easeOut', delay: p.delay }}
          className="absolute left-1/2 top-1/2"
          style={{
            width: p.size,
            height: p.size,
            borderRadius: p.isCircle ? '50%' : '2px',
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
}
