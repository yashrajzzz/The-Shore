'use client';
import { createPortal } from 'react-dom';

/**
 * Renders a full-screen overlay at the top of <body>.
 * Needed because ancestors with backdrop-filter/transform (like the lobby's
 * blurred Window) turn `position: fixed` into "fixed to that ancestor",
 * which clipped pop-up windows inside the card instead of the screen.
 */
export function Portal({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  if (typeof document === 'undefined') return null;
  return createPortal(<div {...props}>{children}</div>, document.body);
}
