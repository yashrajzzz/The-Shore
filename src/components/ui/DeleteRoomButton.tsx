'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { destroyRoom } from '@/app/actions/rooms';

export function DeleteRoomButton({ roomId }: { roomId: string }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowModal(true);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowModal(false);
  };

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDeleting(true);
    const res = await destroyRoom(roomId);
    if (res?.error) {
      alert(res.error);
      setIsDeleting(false);
      setShowModal(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isDeleting}
        className="p-2 rounded-lg text-ink-soft hover:text-coral hover:bg-coral/10 transition-colors z-20 relative disabled:opacity-50"
        title="Delete room"
        aria-label="Delete room"
      >
        <Trash2 size={16} />
      </button>

      {showModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/20 backdrop-blur-sm"
          onClick={handleCancel}
        >
          <div 
            className="bg-paper border-[2.5px] border-ink rounded-xl p-6 max-w-sm w-full shadow-[6px_6px_0_var(--color-ink)] animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-full bg-coral/20 border-2 border-ink flex items-center justify-center">
                <AlertTriangle size={20} className="text-coral" />
              </div>
              <button 
                onClick={handleCancel}
                className="text-ink-soft hover:text-ink transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <h3 className="font-pixel text-xl mb-2 text-ink">Delete Room</h3>
            <p className="text-sm font-mono text-ink-soft mb-6">
              Are you sure you want to delete this room? This action cannot be undone.
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancel}
                className="px-4 py-2 font-mono text-xs font-bold bg-cream border-2 border-ink rounded-lg shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isDeleting}
                className="px-4 py-2 font-mono text-xs font-bold bg-coral border-2 border-ink rounded-lg shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] transition-all text-ink disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
