'use client';
import { useRouter } from 'next/navigation';
import { Window } from './Window';

interface ClosableWindowProps {
  title: string;
  children: React.ReactNode;
}

export function ClosableWindow({ title, children }: ClosableWindowProps) {
  const router = useRouter();

  const handleClose = () => {
    router.push('/lobby?hide=true');
  };

  return (
    <Window title={title} onClose={handleClose}>
      {children}
    </Window>
  );
}
