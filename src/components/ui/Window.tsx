import React from 'react';

interface WindowProps {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

export function Window({ title, children, className = '', onClose }: WindowProps) {
  return (
    <div className={`w-full max-w-[1080px] bg-paper/40 backdrop-blur-md border-[2.5px] border-ink rounded-[16px] shadow-[8px_8px_0_var(--color-ink)] overflow-hidden ${className}`}>
      {/* Titlebar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-cream-deep/60 backdrop-blur-md border-b-[2.5px] border-ink">
        <div className="flex gap-[7px]">
          <button 
            onClick={onClose} 
            className="w-3 h-3 rounded-full border-[1.6px] border-ink bg-coral block cursor-pointer hover:bg-coral-deep"
            title={onClose ? "Close" : ""}
            disabled={!onClose}
          />
          <i className="w-3 h-3 rounded-full border-[1.6px] border-ink bg-yellow block" />
          <i className="w-3 h-3 rounded-full border-[1.6px] border-ink bg-teal-3 block" />
        </div>
        <div className="text-[12.5px] text-ink-soft tracking-[0.3px]">
          {title}
        </div>
        <div style={{ width: '40px' }} /> {/* Spacer for balance */}
      </div>
      {children}
    </div>
  );
}
