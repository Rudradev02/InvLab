import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || props.name || Math.random().toString(36).substring(2, 9);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-[#5E6B63] mb-1.5">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={twMerge(
            clsx(
              'flex h-10 w-full rounded-md border border-[#E3E1DA] bg-white px-3 py-2 text-sm text-[#202521] placeholder:text-[#5E6B63]/60 focus:outline-none focus:ring-2 focus:ring-[#173D32] focus:border-transparent transition-all disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-[#B3261E] focus:ring-[#B3261E]',
              className
            )
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-[#B3261E]">{error}</p>}
        {helperText && !error && <p className="mt-1 text-xs text-[#5E6B63]">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
