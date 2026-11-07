import { Loader2 } from 'lucide-react';

// Fallback shown instantly while the login page loads.
export default function Loading() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-ink text-cream" role="status">
      <Loader2 size={36} strokeWidth={2.5} className="animate-spin" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
