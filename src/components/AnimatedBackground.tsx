import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Thought {
  id: number;
  text: string;
  x: number;
  y: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
}

const thoughts = [
  'Mirror the mind',
  'Neural roots',
  'Knowledge graph',
  'Live session',
  'Signal clarity',
  'Concept nodes',
  'Reasoning loop',
  'Thought capture',
  'Session context',
  'Cognitive interface',
  'Graph sync',
  'Notion export',
  'Live agent',
  'Feasibility signal',
  'Idea mapping',
  'Flow state',
  'Reflect deeper',
  'Semantic links',
  'Focus points',
  'Insight density',
  'Launch boldly',
  'Iterate fast',
  'Structured thought',
  'Stream knowledge',
  'Context locked',
  'System ready',
  'Memory nodes',
  'Edge weight',
  'Signal in',
  'Clarity out',
];

const colors = ['text-white/90', 'text-white/80', 'text-gray-200/90', 'text-gray-300/85', 'text-gray-100/90'];

export function AnimatedBackground() {
  const [items, setItems] = useState<Thought[]>([]);

  useEffect(() => {
    const generate = () =>
      Array.from({ length: 26 }, (_, i) => ({
        id: i,
        text: thoughts[Math.floor(Math.random() * thoughts.length)],
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 3,
        duration: 7 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 0.8 + Math.random() * 0.7,
      }));

    setItems(generate());
    const interval = setInterval(() => setItems(generate()), 14000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {items.map((item) => (
        <motion.div
          key={item.id}
          initial={{
            opacity: 0,
            scale: 0.4,
            x: `${item.x}vw`,
            y: `${item.y}vh`,
            filter: 'blur(10px)',
          }}
          animate={{
            opacity: [0, 0.55, 0.85, 0.55, 0],
            scale: [0.4, 1, 1.3, 1.6, 2.2],
            filter: ['blur(10px)', 'blur(4px)', 'blur(1px)', 'blur(4px)', 'blur(10px)'],
          }}
          transition={{
            duration: item.duration,
            delay: item.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className={`absolute group ${item.color} font-light whitespace-nowrap select-none pointer-events-auto drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]`}
          style={{
            fontSize: `${item.size}rem`,
            left: 0,
            top: 0,
          }}
        >
          {item.text}
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="rounded-md border border-gray-500/60 bg-black/90 px-3 py-2 text-[11px] text-white shadow-lg">
              {item.text}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
