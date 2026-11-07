'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

import { Button } from './Button';

// In-app replacement for window.confirm(), styled like the rest of the app.
// Rendered through a portal so it isn't trapped inside transformed ancestors
// (e.g. the room sidebar), which would otherwise break `position: fixed`.
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onClick={() => { if (!busy) onCancel(); }}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl border-[3px] border-ink bg-paper p-5 shadow-[6px_6px_0_var(--color-ink)]"
      >
        <h3 className="font-pixel text-xl leading-tight text-ink">{title}</h3>
        {message && <p className="mt-2 font-mono text-xs leading-relaxed text-ink-soft">{message}</p>}
        <div className="mt-5 flex gap-3">
          <Button type="button" variant="secondary" className="flex-1 py-2 text-xs" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="primary" className="flex-1 gap-2 py-2 text-xs" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
