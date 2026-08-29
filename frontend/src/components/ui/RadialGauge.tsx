import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

interface RadialGaugeProps {
  value: number;
  max?: number;
  label?: string;
  sublabel?: string;
  tipValue?: string | number;
  color?: string;
  size?: number;
  className?: string;
  actionButton?: {
    label: string;
    onClick?: () => void;
    icon?: React.ReactNode;
  };
}

export default function RadialGauge({
  value,
  max = 100,
  label = 'Goal',
  sublabel,
  tipValue,
  color = '#FF6B5E',
  size = 140,
  className,
  actionButton,
}: RadialGaugeProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  // Calculate SVG arc parameters (semi-circle / 240 degree gauge)
  const strokeWidth = 10;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = Math.PI * radius * 1.5; // ~270 degree arc
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Calculate tip indicator coordinate
  const startAngle = 135; // degrees
  const angleRange = 270;
  const currentAngle = startAngle + (percentage / 100) * angleRange;
  const currentRad = (currentAngle * Math.PI) / 180;
  const cx = size / 2;
  const cy = size / 2;
  const tipX = cx + (radius) * Math.cos(currentRad);
  const tipY = cy + (radius) * Math.sin(currentRad);

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="space-y-3">
        {sublabel && <p className="text-xs text-zinc-500 font-medium">{sublabel}</p>}
        {actionButton && (
          <button
            onClick={actionButton.onClick}
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#212328] text-white text-xs font-bold shadow-md hover:bg-black transition-all active:scale-95"
          >
            <span>{actionButton.label}</span>
            {actionButton.icon && <span className="text-amber-400">{actionButton.icon}</span>}
          </button>
        )}
      </div>

      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-90 transform">
          {/* Background Arc */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="transparent"
            stroke="#EFE8DE"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * 0.25}
            strokeLinecap="round"
          />
          {/* Active Arc */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="transparent"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            strokeLinecap="round"
          />
        </svg>

        {/* Center Metric */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">{label}</span>
          <span className="text-lg sm:text-xl font-extrabold text-[#212328] tracking-tight">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
        </div>

        {/* Floating Tip Badge */}
        {tipValue !== undefined && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className="absolute -top-1 -right-2 px-2 py-0.5 rounded-full bg-white border border-zinc-200 shadow-md text-[10px] font-extrabold text-zinc-800 pointer-events-none"
          >
            {tipValue}
          </motion.div>
        )}
      </div>
    </div>
  );
}
