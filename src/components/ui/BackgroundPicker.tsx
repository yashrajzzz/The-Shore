'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  deleteUserBackground,
  uploadUserBackground,
} from '@/app/actions/backgrounds';
import {
  BACKGROUND_ACCEPT,
  MAX_BACKGROUNDS_PER_FOLDER,
  isVideoBackground,
  type BackgroundItem,
} from '@/utils/backgrounds';
import { getBackgroundLibrary, getCachedLibrary, invalidateBackgroundLibrary } from '@/utils/backgroundLibraryCache';
import { Button } from './Button';
import { X, Upload, Trash2, Check } from 'lucide-react';

type BackgroundPickerProps = {
  /** Selected background URLs (for room/create flows). */
  selectedUrls?: string[];
  /** Called when selection changes. */
  onSelectionChange?: (urls: string[]) => void;
  /** Max backgrounds that can be selected at once (room slideshow). */
  maxSelection?: number;
  /** Show upload/delete controls for the user's personal library. */
  allowLibraryManagement?: boolean;
  /** Compact layout for modals. */
  compact?: boolean;
};

function BackgroundThumbnail({
  item,
  isSelected,
  onToggle,
  onDelete,
  showDelete,
}: {
  item: BackgroundItem;
  isSelected: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  showDelete?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
      className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all group ${
        isSelected
          ? 'border-coral shadow-[0_0_0_2px_var(--color-coral)] scale-[0.98]'
          : 'border-ink shadow-[2px_2px_0_var(--color-ink)] hover:-translate-y-0.5'
      }`}
    >
      {isVideoBackground(item.url) ? (
        <video src={item.url} className="w-full h-full object-cover" muted loop playsInline />
      ) : (
        <Image src={item.url} alt={item.name || 'Background'} fill unoptimized className="object-cover" />
      )}

      {isSelected && (
        <div className="absolute top-1 right-1 w-5 h-5 bg-coral border-2 border-ink rounded-full flex items-center justify-center">
          <Check size={12} strokeWidth={3} />
        </div>
      )}

      {showDelete && onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute bottom-1 right-1 w-6 h-6 bg-coral border-2 border-ink rounded-md flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          title="Remove from library"
        >
          <Trash2 size={12} />
        </button>
      )}

      {item.name && (
        <div className="absolute bottom-0 inset-x-0 bg-ink/60 px-1 py-0.5">
          <span className="text-[8px] font-mono text-paper truncate block">{item.name}</span>
        </div>
      )}
    </div>
  );
}

export function BackgroundPicker({
  selectedUrls = [],
  onSelectionChange,
  maxSelection = MAX_BACKGROUNDS_PER_FOLDER,
  allowLibraryManagement = true,
  compact = false,
}: BackgroundPickerProps) {
  const initialCache = getCachedLibrary();
  const [tab, setTab] = useState<'defaults' | 'library'>('defaults');
  const [defaults, setDefaults] = useState<BackgroundItem[]>(initialCache?.defaults ?? []);
  const [userItems, setUserItems] = useState<BackgroundItem[]>(initialCache?.userItems ?? []);
  const [isLoading, setIsLoading] = useState(!initialCache);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(initialCache?.userError ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBackgrounds = useCallback(async (force = false) => {
    if (!getCachedLibrary()) setIsLoading(true);
    setError('');
    try {
      const lib = await getBackgroundLibrary({ force });
      setDefaults(lib.defaults);
      setUserItems(lib.userItems);
      if (lib.userError) setError(lib.userError);
    } catch {
      setError('Failed to load backgrounds');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Cached data (if any) already painted synchronously above; this call
    // resolves instantly from cache when fresh, or revalidates in the
    // background otherwise — either way the picker never re-fetches on
    // every open the way it used to. Deferred via setTimeout so the
    // (async) setState calls inside loadBackgrounds don't run synchronously
    // within the effect body.
    const timer = setTimeout(() => {
      loadBackgrounds();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadBackgrounds]);

  const toggleSelection = (url: string) => {
    if (!onSelectionChange) return;

    if (selectedUrls.includes(url)) {
      onSelectionChange(selectedUrls.filter((u) => u !== url));
      return;
    }

    if (selectedUrls.length >= maxSelection) {
      setError(`You can only select up to ${maxSelection} backgrounds.`);
      return;
    }

    setError('');
    onSelectionChange([...selectedUrls, url]);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (userItems.length >= MAX_BACKGROUNDS_PER_FOLDER) {
      setError(`Your library is full (${MAX_BACKGROUNDS_PER_FOLDER}/${MAX_BACKGROUNDS_PER_FOLDER}). Delete one to upload more.`);
      return;
    }

    const remaining = MAX_BACKGROUNDS_PER_FOLDER - userItems.length;
    const toUpload = Array.from(files).slice(0, remaining);

    setIsUploading(true);
    setError('');

    for (const file of toUpload) {
      const formData = new FormData();
      formData.append('file', file);
      const result = await uploadUserBackground(formData);

      if (result.error) {
        setError(result.error);
        break;
      }
    }

    invalidateBackgroundLibrary();
    await loadBackgrounds(true);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (item: BackgroundItem) => {
    if (!item.path || item.source !== 'user') return;
    if (!confirm('Remove this background from your library?')) return;

    const result = await deleteUserBackground(item.path);
    if (result.error) {
      setError(result.error);
      return;
    }

    if (onSelectionChange && selectedUrls.includes(item.url)) {
      onSelectionChange(selectedUrls.filter((u) => u !== item.url));
    }

    invalidateBackgroundLibrary();
    await loadBackgrounds(true);
  };

  const currentItems = tab === 'defaults' ? defaults : userItems;
  const selectionCount = selectedUrls.length;

  return (
    <div className={`flex flex-col gap-3 ${compact ? '' : 'min-h-[200px]'}`}>
      <div className="flex border-2 border-ink rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setTab('defaults')}
          className={`flex-1 py-2 text-[10px] uppercase font-mono font-bold transition-colors ${
            tab === 'defaults' ? 'bg-coral text-ink' : 'bg-paper text-ink-soft hover:bg-cream'
          }`}
        >
          Defaults ({defaults.length}/{MAX_BACKGROUNDS_PER_FOLDER})
        </button>
        <button
          type="button"
          onClick={() => setTab('library')}
          className={`flex-1 py-2 text-[10px] uppercase font-mono font-bold border-l-2 border-ink transition-colors ${
            tab === 'library' ? 'bg-coral text-ink' : 'bg-paper text-ink-soft hover:bg-cream'
          }`}
        >
          My Library ({userItems.length}/{MAX_BACKGROUNDS_PER_FOLDER})
        </button>
      </div>

      {onSelectionChange && (
        <p className="text-[10px] font-mono text-ink-soft">
          Selected {selectionCount}/{maxSelection} for slideshow
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <span className="w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
        </div>
      ) : currentItems.length === 0 ? (
        <div className="text-center py-6 text-xs font-mono text-ink-soft">
          {tab === 'library'
            ? 'Your library is empty. Upload up to 5 GIFs or images below.'
            : 'No default backgrounds available.'}
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {currentItems.map((item) => (
            <BackgroundThumbnail
              key={item.url}
              item={item}
              isSelected={selectedUrls.includes(item.url)}
              onToggle={() => toggleSelection(item.url)}
              onDelete={() => handleDelete(item)}
              showDelete={allowLibraryManagement && tab === 'library' && !!item.path}
            />
          ))}
          {tab === 'library' &&
            Array.from({ length: Math.max(0, MAX_BACKGROUNDS_PER_FOLDER - userItems.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="aspect-square rounded-lg border-2 border-ink/30 border-dashed bg-paper/30 flex items-center justify-center"
              >
                <span className="text-[10px] font-mono opacity-30">empty</span>
              </div>
            ))}
        </div>
      )}

      {allowLibraryManagement && tab === 'library' && userItems.length < MAX_BACKGROUNDS_PER_FOLDER && (
        <>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            accept={BACKGROUND_ACCEPT}
            multiple
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            className="w-full py-2 text-xs flex items-center justify-center gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload size={14} />
            {isUploading ? 'Uploading...' : `Upload to My Library (${userItems.length}/${MAX_BACKGROUNDS_PER_FOLDER})`}
          </Button>
        </>
      )}

      {error && (
        <div className="bg-pink border-2 border-ink p-2 rounded text-[10px] font-mono text-center">
          {error}
        </div>
      )}
    </div>
  );
}

/** Modal wrapper for picking/applying backgrounds outside a room. */
export function BackgroundPickerModal({
  isOpen,
  onClose,
  onApply,
  initialSelected = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (urls: string[]) => void;
  initialSelected?: string[];
}) {
  if (!isOpen) return null;

  return (
    <BackgroundPickerModalContent
      key={initialSelected.join('|')}
      onClose={onClose}
      onApply={onApply}
      initialSelected={initialSelected}
    />
  );
}

function BackgroundPickerModalContent({
  onClose,
  onApply,
  initialSelected,
}: {
  onClose: () => void;
  onApply: (urls: string[]) => void;
  initialSelected: string[];
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/30 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-lg bg-paper border-[3px] border-ink rounded-2xl shadow-[8px_8px_0_var(--color-ink)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-ink bg-cream">
          <h2 className="font-pixel text-lg text-ink">Choose Background</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border-2 border-ink bg-coral flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <BackgroundPicker
            selectedUrls={selected}
            onSelectionChange={setSelected}
            maxSelection={MAX_BACKGROUNDS_PER_FOLDER}
            compact
          />
          <div className="flex gap-3 mt-5">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              disabled={selected.length === 0}
              onClick={() => { onApply(selected); onClose(); }}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
