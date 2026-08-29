import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

export interface BubbleMetric {
  id: string;
  label: string;
  value: string | number;
  unit?: string;
  color: 'yellow' | 'coral' | 'charcoal' | 'emerald';
  badgePosition?: 'top-left' | 'center-right' | 'bottom-center' | 'custom';
}

interface BubbleChartProps {
  title?: string;
  subtitle?: string;
  metrics: BubbleMetric[];
  legendItems?: { label: string; color: string }[];
  className?: string;
}

export default function BubbleChart({
  title = 'Real-time Security Forensics',
  subtitle,
  metrics,
  legendItems = [
    { label: 'Token Ingestion', color: '#FFC83B' },
    { label: 'Threat Block Rate', color: '#FF6B5E' },
    { label: 'Inspection Latency', color: '#212328' },
  ],
  className,
}: BubbleChartProps) {
  return (
    <div className={cn('bento-card-warm p-6 sm:p-7 relative flex flex-col justify-between min-h-[300px]', className)}>
      {/* Header */}
      <div className="relative z-10">
        <h3 className="text-base sm:text-lg font-extrabold text-[#212328] tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-600 font-medium mt-0.5">{subtitle}</p>}
      </div>

      {/* Center Organic Blurred Bubbles with Floating Badges */}
      <div className="relative my-4 h-48 w-full flex items-center justify-center">
        {/* Large Yellow Glowing Blurred Blob */}
        <motion.div
          animate={{
            scale: [1, 1.05, 0.98, 1],
            x: [0, 8, -4, 0],
            y: [0, -6, 4, 0],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute right-12 sm:right-24 top-2 w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-[#FFCE38] opacity-75 blur-2xl"
        />

        {/* Coral Glowing Blurred Blob */}
        <motion.div
          animate={{
            scale: [1, 0.95, 1.06, 1],
            x: [0, -6, 6, 0],
            y: [0, 8, -5, 0],
          }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute left-20 sm:left-32 bottom-2 w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-[#FF6E5B] opacity-70 blur-xl"
        />

        {/* Dark Floating Charcoal Bubble Metric (e.g. 2.30 hours / Latency) */}
        {metrics[0] && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="absolute left-12 sm:left-24 top-4 z-20"
          >
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-[#212328] text-white flex flex-col items-center justify-center shadow-xl border border-white/10 hover:scale-105 transition-transform cursor-pointer">
              <span className="text-sm sm:text-base font-extrabold tracking-tight leading-none">{metrics[0].value}</span>
              <span className="text-[10px] text-zinc-400 font-medium mt-0.5">{metrics[0].unit || metrics[0].label}</span>
            </div>
          </motion.div>
        )}

        {/* Center/Right Yellow Floating Stat (e.g. 1.875 kcal / Token Volume) */}
        {metrics[1] && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="absolute right-16 sm:right-32 top-10 z-20 text-center pointer-events-none"
          >
            <div className="text-xl sm:text-2xl font-black text-[#212328] tracking-tight">{metrics[1].value}</div>
            <div className="text-[11px] font-bold text-zinc-700">{metrics[1].unit || metrics[1].label}</div>
          </motion.div>
        )}

        {/* Bottom Coral Floating Stat (e.g. 850 kcal / Blocked Threats) */}
        {metrics[2] && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="absolute left-28 sm:left-44 bottom-6 z-20 text-center pointer-events-none"
          >
            <div className="text-base sm:text-lg font-black text-[#212328] tracking-tight">{metrics[2].value}</div>
            <div className="text-[10px] font-bold text-zinc-700">{metrics[2].unit || metrics[2].label}</div>
          </motion.div>
        )}
      </div>

      {/* Bottom Legend */}
      <div className="relative z-10 flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 border-t border-black/5">
        {legendItems.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-4 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-[11px] font-semibold text-zinc-700">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
