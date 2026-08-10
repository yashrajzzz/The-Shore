import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'icon' | 'play' | 'action';
}

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  let baseClasses = "border-[2px] border-ink cursor-pointer transition-transform flex items-center justify-center font-mono";
  
  if (variant === 'primary') {
    baseClasses += " bg-coral rounded-full px-4 py-[7px] text-[12px] font-bold shadow-[3px_3px_0_var(--color-ink)] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[2px_2px_0_var(--color-ink)]";
  } else if (variant === 'secondary') {
    baseClasses += " bg-paper border-[1.5px] rounded-md text-[10px] px-[7px] py-[2px] shadow-none hover:bg-teal-1";
  } else if (variant === 'icon') {
    baseClasses += " bg-paper rounded-full w-8 h-8 text-[13px] shadow-none hover:bg-teal-1";
  } else if (variant === 'play') {
    baseClasses += " bg-coral rounded-full w-[38px] h-[38px] text-[13px] shadow-none hover:bg-coral-deep";
  } else if (variant === 'action') {
    baseClasses += " bg-yellow rounded-lg px-3.5 py-1.5 text-[12px] font-bold shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[1px_1px_0_var(--color-ink)]";
  }

  return (
    <button className={`${baseClasses} ${className}`} {...props}>
      {children}
    </button>
  );
}
