import React from 'react';
import { cn } from '@/lib/utils';

interface SegmentedProgressProps {
  current: number;
  total: number;
  color?: 'coral' | 'amber' | 'emerald' | 'dark' | 'violet';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  countLabel?: string;
}

export default function SegmentedProgress({
  current,
  total = 10,
  color = 'coral',
  className,
  size = 'md',
  showCount = false,
  countLabel = 'Sessions completed'
}: SegmentedProgressProps) {
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.min(safeTotal, Math.max(0, current));

  const sizeClasses = {
    sm: 'w-1 h-3.5 rounded-[2px] gap-1',
    md: 'w-1.5 h-4.5 rounded-[2.5px] gap-1.5',
    lg: 'w-2 h-6 rounded-[3px] gap-2',
  };

  const tickColors = {
    coral: 'bg-[#FF6B5E] shadow-[0_0_8px_rgba(255,107,94,0.6)]',
    amber: 'bg-[#FFC83B] shadow-[0_0_8px_rgba(255,200,59,0.6)]',
    emerald: 'bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.6)]',
    violet: 'bg-[#8B5CF6] shadow-[0_0_8px_rgba(139,92,246,0.6)]',
    dark: 'bg-[#212328] shadow-[0_0_6px_rgba(33,35,40,0.4)]',
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {showCount && (
        <span className="text-xs text-zinc-500 font-medium whitespace-nowrap">
          {countLabel}: <strong className="text-zinc-800 font-bold">{safeCurrent}/{safeTotal}</strong>
        </span>
      )}
      <div className="flex items-center gap-1">
        {Array.from({ length: safeTotal }).map((_, idx) => {
          const isActive = idx < safeCurrent;
          return (
            <div
              key={idx}
              className={cn(
                'transition-all duration-300',
                size === 'sm' && 'w-1 h-3.5 rounded-[2px]',
                size === 'md' && 'w-1.5 h-4.5 rounded-[2.5px]',
                size === 'lg' && 'w-2 h-6 rounded-[3px]',
                isActive ? tickColors[color] : 'bg-[#E5DFD5]'
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
