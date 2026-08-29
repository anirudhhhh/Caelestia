import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface ActivityDay {
  day: number;
  status: 'done' | 'scheduled' | 'current' | 'idle';
  tooltip?: string;
}

interface ActivityCalendarProps {
  title?: string;
  month?: string;
  daysData?: ActivityDay[];
  onSelectDay?: (day: number) => void;
  className?: string;
}

export default function ActivityCalendar({
  title = 'Security Training & Telemetry Days',
  month = 'August',
  daysData,
  onSelectDay,
  className,
}: ActivityCalendarProps) {
  // Default mock days matching the reference visual rhythm
  const defaultDays: ActivityDay[] = [
    { day: 1, status: 'done', tooltip: '142 interactions analyzed' },
    { day: 2, status: 'idle' },
    { day: 3, status: 'idle' },
    { day: 4, status: 'idle' },
    { day: 5, status: 'done', tooltip: 'Policy sync complete' },
    { day: 6, status: 'idle' },
    { day: 7, status: 'idle' },
    { day: 8, status: 'idle' },
    { day: 9, status: 'idle' },
    { day: 10, status: 'idle' },
    { day: 11, status: 'idle' },
    { day: 12, status: 'idle' },
    { day: 13, status: 'idle' },
    { day: 14, status: 'scheduled', tooltip: 'Scheduled red-team audit' },
    { day: 15, status: 'idle' },
    { day: 16, status: 'idle' },
    { day: 17, status: 'scheduled', tooltip: 'Model alignment test' },
    { day: 18, status: 'scheduled', tooltip: 'Vulnerability scan' },
    { day: 19, status: 'scheduled', tooltip: 'Threat taxonomy update' },
    { day: 20, status: 'idle' },
    { day: 21, status: 'idle' },
    { day: 22, status: 'idle' },
    { day: 23, status: 'scheduled', tooltip: 'PII verification sweep' },
    { day: 24, status: 'idle' },
    { day: 25, status: 'idle' },
    { day: 26, status: 'idle' },
    { day: 27, status: 'idle' },
    { day: 28, status: 'current', tooltip: 'Current active session' },
    { day: 29, status: 'idle' },
    { day: 30, status: 'idle' },
  ];

  const days = daysData || defaultDays;
  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className={cn('bento-card-dark p-6 sm:p-7 flex flex-col justify-between', className)}>
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold text-white tracking-tight">{title}</h3>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-zinc-300 hover:bg-white/15 cursor-pointer transition-colors">
          <span>{month}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </div>
      </div>

      {/* Days Grid */}
      <div className="my-4">
        {/* Weekday labels */}
        <div className="grid grid-cols-7 gap-2 text-center mb-3">
          {weekDays.map((w, idx) => (
            <span key={idx} className="text-[11px] font-bold text-zinc-500">
              {w}
            </span>
          ))}
        </div>

        {/* Days cells */}
        <div className="grid grid-cols-7 gap-2 text-center">
          {days.map((item) => {
            const isDone = item.status === 'done';
            const isScheduled = item.status === 'scheduled';
            const isCurrent = item.status === 'current';

            return (
              <button
                key={item.day}
                onClick={() => onSelectDay?.(item.day)}
                title={item.tooltip || `Day ${item.day}`}
                className={cn(
                  'h-8 w-8 sm:h-9 sm:w-9 mx-auto rounded-full flex items-center justify-center text-xs font-bold transition-all relative',
                  isDone && 'bg-[#FFC83B] text-[#212328] shadow-[0_0_12px_rgba(255,200,59,0.5)] font-black',
                  isScheduled && 'border border-zinc-500/60 bg-white/5 text-zinc-300 hover:border-[#FFC83B]',
                  isCurrent && 'border-2 border-white/90 bg-white/10 text-white shadow-md',
                  item.status === 'idle' && 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                )}
              >
                {item.day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Legend */}
      <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[11px] font-medium text-zinc-400">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full border border-white" />
          <span>Current day</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#FFC83B]" />
          <span>Done</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full border border-zinc-500" />
          <span>Scheduled</span>
        </div>
      </div>
    </div>
  );
}
