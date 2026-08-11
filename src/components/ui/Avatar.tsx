import React from 'react';

type AvatarColor = 'coral' | 'yellow' | 'teal-2' | 'teal-3' | 'pink' | 'coral-deep';

interface AvatarProps {
  initials: string;
  color: AvatarColor;
  size?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ initials, color, size = 'md', className = '' }: AvatarProps) {
  const sizeClasses = size === 'sm' ? "w-[22px] h-[22px] text-[10px]" : "w-[30px] h-[30px] text-[12px]";
  const colorMap: Record<AvatarColor, string> = {
    'coral': 'bg-coral',
    'yellow': 'bg-yellow',
    'teal-2': 'bg-teal-2',
    'teal-3': 'bg-teal-3',
    'pink': 'bg-pink',
    'coral-deep': 'bg-coral-deep'
  };

  return (
    <div className={`${sizeClasses} ${colorMap[color]} rounded-full border-[2px] border-ink flex items-center justify-center font-bold shrink-0 ${className}`}>
      {initials}
    </div>
  );
}
