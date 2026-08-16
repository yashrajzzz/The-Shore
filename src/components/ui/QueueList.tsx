'use client';

import Image from 'next/image';
import { GripVertical, Pause, Play, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type QueueItem = { id?: string | number; artwork?: string; title?: string; artist?: string; position?: number; [k: string]: unknown };

function QueueRow({
  item,
  idx,
  isCurrent,
  isPlaying,
  onPlay,
  onRemove,
}: {
  item: QueueItem;
  idx: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: (id: string | number) => void;
  onRemove: (id: string | number) => void;
}) {
  const id = item.id as string | number;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onPlay(id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onPlay(id); }}
      className={`group border-[1.5px] border-ink/70 rounded-xl p-2 shadow-[2px_2px_0_var(--color-ink)] flex items-center gap-2.5 cursor-pointer transition-colors min-w-0 max-w-full ${isCurrent ? 'bg-coral/15' : 'bg-paper/50 hover:bg-coral/5'}`}
      title={isCurrent ? 'Now playing' : 'Play now'}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 p-1 -ml-1 text-ink-soft/40 hover:text-ink-soft cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>

      {item.artwork ? (
        <div className="relative w-8 h-8 shrink-0">
          <Image src={String(item.artwork)} alt="" width={32} height={32} unoptimized className="rounded-lg border-[1.5px] border-ink/40 object-cover w-full h-full" />
          <div className={`absolute inset-0 rounded-lg flex items-center justify-center transition-colors ${isCurrent ? 'bg-ink/40' : 'bg-ink/0 group-hover:bg-ink/40'}`}>
            {isCurrent ? (
              isPlaying
                ? <Pause size={12} className="text-paper" fill="currentColor" />
                : <Play size={12} className="text-paper" fill="currentColor" />
            ) : (
              <Play size={12} className="text-paper opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" />
            )}
          </div>
        </div>
      ) : (
        <div className="w-8 h-8 rounded-lg bg-coral/20 flex items-center justify-center text-[10px] font-bold font-mono border-[1.5px] border-ink/20 shrink-0">{idx + 1}</div>
      )}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className={`text-[11px] font-mono font-bold truncate ${isCurrent ? 'text-coral' : ''}`}>{String(item.title)}</div>
        {item.artist && <div className="text-[9px] font-mono text-ink-soft truncate">{String(item.artist)}</div>}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(id); }}
        className="shrink-0 p-1 rounded-lg text-ink-soft/60 hover:text-coral hover:bg-coral/10 transition-colors"
        aria-label="Remove from queue"
      >
        <X size={14} />
      </button>
    </div>
  );
}

import { restrictToVerticalAxis, restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers';

export function QueueList({
  queue,
  currentQueueId,
  isPlaying,
  onPlay,
  onRemove,
  onReorder,
}: {
  queue: QueueItem[];
  currentQueueId?: string | number;
  isPlaying?: boolean;
  onPlay: (id: string | number) => void;
  onRemove: (id: string | number) => void;
  onReorder: (orderedIds: (string | number)[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queue.findIndex(item => item.id === active.id);
    const newIndex = queue.findIndex(item => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(queue, oldIndex, newIndex);
    onReorder(reordered.map(item => item.id as string | number));
  };

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCenter} 
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
    >
      <SortableContext items={queue.map(item => item.id as string | number)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5 min-w-0 overflow-x-hidden">
          {queue.map((item, idx) => (
            <QueueRow
              key={(item.id ?? idx) as React.Key}
              item={item}
              idx={idx}
              isCurrent={item.id === currentQueueId}
              isPlaying={Boolean(isPlaying)}
              onPlay={onPlay}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
