'use client';

import { Loader2 } from 'lucide-react';
import Link, { useLinkStatus } from 'next/link';

import { Button } from './Button';

type ButtonVariant = React.ComponentProps<typeof Button>['variant'];

// Must be rendered inside <Link> so useLinkStatus can see the navigation state.
function Inner({
  variant,
  className,
  children,
}: {
  variant: ButtonVariant;
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useLinkStatus();
  return (
    <Button
      variant={variant}
      className={`${className ?? ''} ${pending ? 'pointer-events-none opacity-80' : ''} gap-2`}
      tabIndex={-1}
      aria-busy={pending}
    >
      {pending && <Loader2 size={16} strokeWidth={2.5} className="animate-spin" aria-hidden />}
      <span>{pending ? 'Loading…' : children}</span>
    </Button>
  );
}

export function AuthLinkButton({
  href,
  variant,
  className,
  children,
}: {
  href: string;
  variant: ButtonVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex-1" aria-label={typeof children === 'string' ? children : undefined}>
      <Inner variant={variant} className={className}>
        {children}
      </Inner>
    </Link>
  );
}
