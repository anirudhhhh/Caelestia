import React from 'react';
import { cn } from '@/lib/utils';

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
}

export default function ShinyText({
  text,
  disabled = false,
  speed = 4,
  className = '',
}: ShinyTextProps) {
  const animationDuration = `${speed}s`;

  return (
    <span
      className={cn(
        'inline-block bg-clip-text text-transparent bg-[linear-gradient(110deg,#F4F4F6_35%,#F59E0B_50%,#F4F4F6_65%)] bg-[length:200%_100%]',
        !disabled && 'animate-shiny-text',
        className
      )}
      style={{
        animationDuration,
      }}
    >
      {text}
    </span>
  );
}
