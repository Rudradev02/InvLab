import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'neutral',
  children,
  ...props
}) => {
  const variants = {
    success: 'bg-[#E6F2EA] text-[#2F7D4F] border-[#c2e4cd]',
    warning: 'bg-[#FBF0DC] text-[#9A5B00] border-[#f4dbb1]',
    error: 'bg-[#FBE9E7] text-[#B3261E] border-[#f8c9c4]',
    info: 'bg-[#E5EFF6] text-[#1F5F8B] border-[#c0dbee]',
    neutral: 'bg-[#F1F1EC] text-[#5E6B63] border-[#E3E1DA]',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border tracking-wide uppercase',
          variants[variant],
          className
        )
      )}
      {...props}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
};
