'use client';

import { Portal } from './Portal';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from './Button';
import { Window } from './Window';
import { createRoom } from '@/app/actions/rooms';
import { useRoomTransition } from './RoomTransition';

export function CreateRoomModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const { enterRoom } = useRoomTransition();

  function reset() {
    setIsOpen(false);
    setJustConfirmed(false);
    setError('');
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setError('');

    const formData = new FormData(e.currentTarget);


    const result = await createRoom(formData);
    setIsPending(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    if (result?.room?.id) {
      // Brief press/confirm state on the button, then the wave overlay
      // takes over: it covers the whole screen, the room mounts behind
      // it while hidden, and it recedes to reveal the room already loaded.
      setJustConfirmed(true);
      enterRoom(`/room/${result.room.id}`);
    } else {
      reset();
    }
  }

  return (
    <>
      <Button variant="primary" className="px-6 py-2" onClick={() => setIsOpen(true)}>
        + Create Room
      </Button>

      {isOpen && (
        <Portal className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/30 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md">
            <Window title="Create New Room" onClose={() => setIsOpen(false)} className="!bg-paper !backdrop-blur-none">
              <div className="px-4 pt-4 sm:px-6 sm:pt-6">
                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-ink-soft uppercase tracking-wider" htmlFor="name">Room Name</label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      disabled={justConfirmed}
                      className="bg-paper border-[2px] border-ink rounded-lg px-3 py-2.5 text-base sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-2 disabled:opacity-60"
                      placeholder="e.g. #midnightdrive"
                      maxLength={32}
                    />
                  </div>

                  {error && (
                    <div className="bg-pink border-2 border-ink p-2 mt-2 rounded text-xs text-center">
                      {error}
                    </div>
                  )}

                  <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 mt-2 bg-paper border-t-[2.5px] border-ink flex gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1 py-2.5"
                      onClick={() => setIsOpen(false)}
                      disabled={justConfirmed}
                    >
                      Cancel
                    </Button>
                    <motion.div className="flex-1" whileTap={justConfirmed ? undefined : { scale: 0.94 }}>
                      <Button
                        type="submit"
                        variant="primary"
                        className="w-full overflow-hidden py-2.5"
                        disabled={isPending || justConfirmed}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          {justConfirmed ? (
                            <motion.span
                              key="confirmed"
                              initial={{ scale: 0.96, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.22, ease: [0.33, 1, 0.68, 1] }}
                              className="flex items-center gap-1.5"
                            >
                              <Check size={14} strokeWidth={3} />
                              Created!
                            </motion.span>
                          ) : (
                            <motion.span
                              key="idle"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.15 }}
                            >
                              {isPending ? 'Creating...' : 'Create'}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </Button>
                    </motion.div>
                  </div>
                </form>
              </div>
            </Window>
          </div>
        </Portal>
      )}
    </>
  );
}
