import React from 'react';
import { cn } from '@/lib/utils';

interface BentoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'warm' | 'dark' | 'sand';
  children: React.ReactNode;
  className?: string;
}

export default function BentoCard({
  variant = 'default',
  children,
  className,
  ...props
}: BentoCardProps) {
  const variantStyles = {
    default: 'bento-card p-6',
    warm: 'bento-card-warm p-6',
    dark: 'bento-card-dark p-6',
    sand: 'bento-card-sand p-6',
  };

  return (
    <div className={cn(variantStyles[variant], className)} {...props}>
      {children}
    </div>
  );
}
