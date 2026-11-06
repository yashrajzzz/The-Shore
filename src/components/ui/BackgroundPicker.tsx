'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  deleteUserBackground,
  uploadUserBackground,
} from '@/app/actions/backgrounds';
import {
  BACKGROUND_ACCEPT,
  CATALOG_PAGE_SIZE,
  MAX_BACKGROUNDS_PER_FOLDER,
  isAnimatedBackground,
  isVideoBackground,
  backgroundPoster,
  type BackgroundDevice,
  type BackgroundItem,
} from '@/utils/backgrounds';
import {
  getCachedCatalog,
  getCachedUserLibrary,
  getCatalog,
  getUserLibrary,
  invalidateBackgroundLibrary,
} from '@/utils/backgroundLibraryCache';
import { Button } from './Button';
import { X, Upload, Trash2, Check, Monitor, Smartphone, Film, ImageIcon, Clapperboard } from 'lucide-react';

type Tab = BackgroundDevice;
type Kind = 'animated' | 'static';

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

/** Mounts its children only once scrolled near the viewport — keeps a catalog of hundreds light. */
function LazyMount({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      const t = setTimeout(() => setSeen(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return (
    <div ref={ref} className={className}>
      {seen ? children : null}
    </div>
  );
}

function BackgroundThumbnail({
  item,
  isSelected,
  aspect,
  onToggle,
  onDelete,
  showDelete,
}: {
  item: BackgroundItem;
  isSelected: boolean;
  aspect: string;
  onToggle: () => void;
  onDelete?: () => void;
  showDelete?: boolean;
}) {
  const isVideo = isVideoBackground(item.url);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      className={`relative ${aspect} rounded-lg overflow-hidden border-2 cursor-pointer transition-all group bg-ink/10 ${
        isSelected
          ? 'border-coral shadow-[0_0_0_2px_var(--color-coral)] scale-[0.98]'
          : 'border-ink shadow-[2px_2px_0_var(--color-ink)] hover:-translate-y-0.5'
      }`}
    >
      <LazyMount className="absolute inset-0">
        {isVideo && !backgroundPoster(item.url) ? (
          <video src={`${item.url}#t=0.1`} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        ) : (
          <Image src={backgroundPoster(item.url) ?? item.url} alt={item.name || 'Background'} fill unoptimized loading="lazy" sizes="160px" className="object-cover" />
        )}
      </LazyMount>

      {isVideo && (
        <div className="absolute top-1 left-1 w-5 h-5 bg-ink/70 rounded-full flex items-center justify-center text-paper">
          <Film size={11} />
        </div>
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
          className="absolute bottom-1 right-1 w-8 h-8 sm:w-6 sm:h-6 bg-coral border-2 border-ink rounded-md flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          title="Remove from library"
          aria-label="Remove from library"
        >
          <Trash2 size={12} />
        </button>
      )}

      {item.name && (
        <div className="absolute bottom-0 inset-x-0 bg-ink/60 px-1 py-0.5 pointer-events-none">
          <span className="text-[8px] font-mono text-paper truncate block">{item.name}</span>
        </div>
      )}
    </div>
  );
}

function SelectedStrip({ urls, onRemove }: { urls: string[]; onRemove: (url: string) => void }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 thin-scroll">
      {urls.map((url) => (
        <div key={url} className="relative w-14 h-10 shrink-0 rounded-md overflow-hidden border-2 border-ink bg-ink/10">
          {isVideoBackground(url) && !backgroundPoster(url) ? (
            <video src={`${url}#t=0.1`} className="w-full h-full object-cover" muted playsInline preload="metadata" />
          ) : (
            <Image src={backgroundPoster(url) ?? url} alt="Selected background" fill unoptimized sizes="56px" className="object-cover" />
          )}
          <button
            type="button"
            onClick={() => onRemove(url)}
            aria-label="Remove from selection"
            className="absolute top-0 right-0 w-5 h-5 bg-coral border-l-2 border-b-2 border-ink flex items-center justify-center"
          >
            <X size={10} strokeWidth={3} />
          </button>
        </div>
      ))}
    </div>
  );
}

const TABS: { id: Tab; label: string; Icon: typeof Monitor }[] = [
  { id: 'desktop', label: 'Laptop', Icon: Monitor },
  { id: 'mobile', label: 'Mobile', Icon: Smartphone },
];

type UserLibs = Record<BackgroundDevice, BackgroundItem[] | null>;

export function BackgroundPicker({
  selectedUrls = [],
  onSelectionChange,
  maxSelection = MAX_BACKGROUNDS_PER_FOLDER,
  allowLibraryManagement = true,
  compact = false,
}: BackgroundPickerProps) {
  // Default to the catalog that matches this screen; the user can still browse the other.
  const [tab, setTab] = useState<Tab>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
  );
  const [catalog, setCatalog] = useState<Record<BackgroundDevice, BackgroundItem[] | null>>(() => ({
    desktop: getCachedCatalog('desktop'),
    mobile: getCachedCatalog('mobile'),
  }));
  // Each device has its own 5-slot personal library (5 laptop + 5 mobile = 10 total).
  const [userLibs, setUserLibs] = useState<UserLibs>(() => ({
    desktop: getCachedUserLibrary('desktop')?.items ?? null,
    mobile: getCachedUserLibrary('mobile')?.items ?? null,
  }));
  const [kind, setKind] = useState<Kind>('animated');
  // "Load more" count, tracked per device + kind so each section keeps its own place.
  const [visible, setVisible] = useState<Record<string, number>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load only the tab being looked at (each cached for 5 min, shared across opens).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [cat, lib] = await Promise.allSettled([getCatalog(tab), getUserLibrary(tab)]);
      if (cancelled) return;
      if (cat.status === 'fulfilled') setCatalog((prev) => ({ ...prev, [tab]: cat.value }));
      else setError('Failed to load backgrounds');
      if (lib.status === 'fulfilled') {
        setUserLibs((prev) => ({ ...prev, [tab]: lib.value.items }));
        if (lib.value.error) setError(lib.value.error);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab]);

  const reloadLibrary = useCallback(async (device: BackgroundDevice) => {
    invalidateBackgroundLibrary(device);
    const lib = await getUserLibrary(device, true);
    setUserLibs((prev) => ({ ...prev, [device]: lib.items }));
    if (lib.error) setError(lib.error);
  }, []);

  const toggleSelection = (url: string) => {
    if (!onSelectionChange) return;

    if (selectedUrls.includes(url)) {
      setError('');
      onSelectionChange(selectedUrls.filter((u) => u !== url));
      return;
    }

    if (selectedUrls.length >= maxSelection) {
      setError(`You can pick up to ${maxSelection}. Remove one (tap its ✕ above) to add another.`);
      return;
    }

    setError('');
    onSelectionChange([...selectedUrls, url]);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const device = tab;
    const current = userLibs[device] ?? [];

    if (current.length >= MAX_BACKGROUNDS_PER_FOLDER) {
      setError(`Your ${device === 'mobile' ? 'mobile' : 'laptop'} library is full (${MAX_BACKGROUNDS_PER_FOLDER}/${MAX_BACKGROUNDS_PER_FOLDER}). Delete one to upload more.`);
      return;
    }

    const toUpload = Array.from(files).slice(0, MAX_BACKGROUNDS_PER_FOLDER - current.length);

    setIsUploading(true);
    setError('');

    for (const file of toUpload) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('device', device);
      const result = await uploadUserBackground(formData);

      if (result.error) {
        setError(result.error);
        break;
      }
    }

    await reloadLibrary(device);
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

    await reloadLibrary(tab);
  };

  const all = catalog[tab];
  const animatedCount = all?.filter((i) => isAnimatedBackground(i.url)).length ?? 0;
  const staticCount = (all?.length ?? 0) - animatedCount;
  const items = all ? all.filter((i) => isAnimatedBackground(i.url) === (kind === 'animated')) : null;
  const visibleKey = `${tab}-${kind}`;
  const visibleCount = visible[visibleKey] ?? CATALOG_PAGE_SIZE;
  const mine = userLibs[tab];
  const mineCount = mine?.length ?? 0;
  const shown = (items ?? []).slice(0, visibleCount);
  const hasMore = (items?.length ?? 0) > shown.length;

  // Shapes follow the device the catalog is for: wide for laptop, tall for phone.
  const aspect = tab === 'desktop' ? 'aspect-video' : 'aspect-[9/16]';
  const gridCols = tab === 'desktop' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4';
  const deviceLabel = tab === 'desktop' ? 'laptop' : 'mobile';

  const renderThumb = (item: BackgroundItem, withDelete: boolean) => (
    <BackgroundThumbnail
      key={item.url}
      item={item}
      aspect={aspect}
      isSelected={selectedUrls.includes(item.url)}
      onToggle={() => toggleSelection(item.url)}
      onDelete={() => handleDelete(item)}
      showDelete={withDelete}
    />
  );

  return (
    <div className={`flex flex-col gap-3 ${compact ? '' : 'min-h-[200px]'}`}>
      <div className="flex border-2 border-ink rounded-lg overflow-hidden">
        {TABS.map(({ id, label, Icon }, i) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 py-2.5 sm:py-2 text-[10px] uppercase font-mono font-bold transition-colors flex items-center justify-center gap-1.5 ${i > 0 ? 'border-l-2 border-ink' : ''} ${
              tab === id ? 'bg-coral text-ink' : 'bg-paper text-ink-soft hover:bg-cream'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {onSelectionChange && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-mono text-ink-soft">
            Selected {selectedUrls.length}/{maxSelection} for slideshow
          </p>
          <SelectedStrip urls={selectedUrls} onRemove={toggleSelection} />
        </div>
      )}

      {/* Animated (GIF / video) vs static image sections */}
      <div className="flex gap-2">
        {([
          { id: 'animated', label: 'Animated', count: animatedCount, Icon: Clapperboard },
          { id: 'static', label: 'Images', count: staticCount, Icon: ImageIcon },
        ] as const).map(({ id, label, count, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            aria-pressed={kind === id}
            className={`flex-1 py-2 rounded-full border-2 border-ink text-[10px] font-mono font-bold uppercase flex items-center justify-center gap-1.5 transition-colors ${
              kind === id ? 'bg-yellow shadow-[2px_2px_0_var(--color-ink)]' : 'bg-paper text-ink-soft hover:bg-cream'
            }`}
          >
            <Icon size={12} />
            {label}
            {all && <span className="opacity-60">({count})</span>}
          </button>
        ))}
      </div>

      {/* Curated catalog */}
      {items === null ? (
        <div className="flex items-center justify-center py-8">
          <span className="w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <div className="text-center py-6 text-xs font-mono text-ink-soft">
          No {kind === 'animated' ? 'animated' : 'static'} {deviceLabel} backgrounds yet.
        </div>
      ) : (
        <div className={`grid ${gridCols} gap-2`}>{shown.map((item) => renderThumb(item, false))}</div>
      )}

      {hasMore && (
        <Button
          type="button"
          variant="secondary"
          className="w-full py-2.5 text-xs"
          onClick={() => setVisible((v) => ({ ...v, [visibleKey]: visibleCount + CATALOG_PAGE_SIZE }))}
        >
          Load more ({(items?.length ?? 0) - shown.length} left)
        </Button>
      )}

      {/* The user's own uploads for this device: up to 5 here, 5 on the other tab */}
      <div className="flex flex-col gap-2 border-t-[1.5px] border-ink/20 pt-3">
        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-ink-soft">
          Yours · {deviceLabel} ({mineCount}/{MAX_BACKGROUNDS_PER_FOLDER})
        </p>

        {mine === null ? (
          <div className="flex items-center justify-center py-4">
            <span className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className={`grid ${gridCols} gap-2`}>
            {mine.map((item) => renderThumb(item, allowLibraryManagement && !!item.path))}
            {allowLibraryManagement &&
              Array.from({ length: Math.max(0, MAX_BACKGROUNDS_PER_FOLDER - mineCount) }).map((_, i) => (
                <button
                  type="button"
                  key={`empty-${i}`}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  aria-label={`Upload a ${deviceLabel} background`}
                  className={`${aspect} rounded-lg border-2 border-ink/30 border-dashed bg-paper/30 flex items-center justify-center hover:bg-paper/60 disabled:opacity-50`}
                >
                  <Upload size={14} className="opacity-40" />
                </button>
              ))}
          </div>
        )}

        {allowLibraryManagement && mineCount < MAX_BACKGROUNDS_PER_FOLDER && (
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
              className="w-full py-2.5 text-xs flex items-center justify-center gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload size={14} />
              {isUploading ? 'Uploading...' : `Upload ${deviceLabel} background (${mineCount}/${MAX_BACKGROUNDS_PER_FOLDER})`}
            </Button>
          </>
        )}
      </div>

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
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-ink/30 backdrop-blur-[2px] p-3 sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[85dvh] flex flex-col bg-paper border-[3px] border-ink rounded-2xl shadow-[8px_8px_0_var(--color-ink)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-ink bg-cream">
          <h2 className="font-pixel text-lg text-ink">Choose Background</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 sm:w-8 sm:h-8 rounded-full border-2 border-ink bg-coral flex items-center justify-center"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-4 pt-4 sm:px-5 sm:pt-5">
          <BackgroundPicker
            selectedUrls={selected}
            onSelectionChange={setSelected}
            maxSelection={MAX_BACKGROUNDS_PER_FOLDER}
            compact
          />
          <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 mt-4 bg-paper border-t-2 border-ink flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              className="flex-1"
              onClick={() => { onApply(selected); onClose(); }}
            >
              {selected.length === 0 ? 'Clear' : 'Apply'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
