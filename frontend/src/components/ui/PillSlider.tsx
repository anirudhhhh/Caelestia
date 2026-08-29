import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

interface PillSliderProps {
  title?: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  badgeLabel?: string;
  startLabel?: string;
  endLabel?: string;
  percentageText?: string;
  onChange?: (val: number) => void;
  interactive?: boolean;
  className?: string;
}

export default function PillSlider({
  title = 'Policy Threshold Plan',
  value,
  min = 0,
  max = 100,
  unit = '',
  badgeLabel,
  startLabel,
  endLabel,
  percentageText,
  onChange,
  interactive = false,
  className,
}: PillSliderProps) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const displayBadge = badgeLabel || `${value}${unit}`;
  const displayPercentage = percentageText || `${Math.round(percentage)}% Completed`;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (interactive && onChange) {
      onChange(parseFloat(e.target.value));
    }
  };

  return (
    <div className={cn('bento-card p-5 sm:p-6 space-y-4', className)}>
      {/* Top Title & Percentage */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm sm:text-base font-extrabold text-[#212328] tracking-tight">{title}</h4>
        <span className="text-xs font-bold text-zinc-500 text-right leading-tight">{displayPercentage}</span>
      </div>

      {/* Track & Floating Thumb/Badge */}
      <div className="relative pt-6 pb-2">
        {/* Floating Tooltip Pill */}
        <motion.div
          animate={{ left: `${percentage}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute -top-1 transform -translate-x-1/2 z-10"
        >
          <div className="px-2.5 py-0.5 rounded-full bg-[#212328] text-white text-[11px] font-extrabold shadow-md flex items-center gap-1 whitespace-nowrap">
            {displayBadge}
          </div>
        </motion.div>

        {/* Outer Rounded Track */}
        <div className="h-3.5 w-full rounded-full bg-[#EAE4DC] overflow-hidden relative shadow-inner">
          {/* Filled Dark Track */}
          <motion.div
            animate={{ width: `${percentage}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="h-full rounded-full bg-[#212328] relative"
          >
            <div className="absolute right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/40" />
          </motion.div>
        </div>

        {interactive && (
          <input
            type="range"
            min={min}
            max={max}
            step={(max - min) / 100}
            value={value}
            onChange={handleSliderChange}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20"
          />
        )}
      </div>

      {/* Start & End labels */}
      <div className="flex items-center justify-between text-[11px] font-extrabold text-zinc-400">
        <span>{startLabel || `${min}${unit}`}</span>
        <span>{endLabel || `${max}${unit}`}</span>
      </div>
    </div>
  );
}
