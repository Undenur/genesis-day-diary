/** Карточки дня: обложка, дата, название и управление звуком. Свечение под карточкой — из палитры самого кадра. */
import { Pause, Volume2 } from 'lucide-react';
import { Link } from 'react-router';
import { useBlobUrl } from '../hooks/useBlobUrl';
import type { Memory } from '../lib/types';
import { formatDate, rgba, typo } from '../lib/util';
import { usePreviewSound } from '../services/previewSound';

export function coverOf(m: Memory) {
  return m.photos.find((p) => p.id === m.coverId) ?? m.photos[0];
}

export function Cover({ m, className = '', thumb = true }: { m: Memory; className?: string; thumb?: boolean }) {
  const c = coverOf(m);
  const url = useBlobUrl(thumb ? c?.thumbBlobId : c?.blobId);
  return (
    <div className={`overflow-hidden bg-raised ${className}`} style={{ background: c?.features.palette[0]?.hex }}>
      {url && <img src={url} alt={c?.alt ?? ''} className="h-full w-full object-cover" loading="lazy" />}
    </div>
  );
}

export function SoundToggle({ m, tone = 'glass' }: { m: Memory; tone?: 'glass' | 'card' }) {
  const { playingId, toggle } = usePreviewSound();
  const on = playingId === m.id;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(m);
      }}
      aria-pressed={on}
      aria-label={on ? `Остановить звук «${m.title}»` : `Послушать песню дня «${m.title}»`}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${tone === 'glass' ? 'bg-black/45 text-white backdrop-blur-md' : 'bg-raised text-ink'} ${on ? 'ring-2 ring-accent' : ''}`}
    >
      {on ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Volume2 size={19} aria-hidden="true" />}
    </button>
  );
}

/** Вертикальная карточка для сетки архива. */
export function MemoryTile({ m, onSelect, selected, hidePrivate }: { m: Memory; onSelect?: () => void; selected?: boolean; hidePrivate?: boolean }) {
  const glow = m.generation.art.glowColor;
  const body = (
    <>
      <Cover m={m} className={`aspect-[3/4] w-full rounded-[18px] ${hidePrivate ? 'blur-md' : ''}`} />
      <div className="pointer-events-none absolute inset-0 rounded-[18px] bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
      <div className="absolute right-2 top-2">
        <SoundToggle m={m} />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3 text-left">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-white/80">{formatDate(m.date)}</p>
        <p className="font-title mt-0.5 line-clamp-3 text-[16px] leading-tight text-white">{hidePrivate ? 'Личная запись' : typo(m.title)}</p>
      </div>
    </>
  );
  const cls = `relative block rounded-[18px] transition-transform focus-visible:outline-offset-4 ${selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-night' : ''}`;
  const style = { boxShadow: `0 14px 40px -18px ${rgba(glow, 0.65)}` };
  if (onSelect)
    return (
      <button type="button" onClick={onSelect} className={cls} style={style} aria-label={`${m.title}, ${formatDate(m.date)}`}>
        {body}
      </button>
    );
  return (
    <Link to={`/m/${m.id}`} className={cls} style={style} aria-label={`${m.title}, ${formatDate(m.date)}`}>
      {body}
    </Link>
  );
}

/** Строка с обложкой и вторичной информацией. */
export function MemoryRow({ m, sub, hidePrivate }: { m: Memory; sub?: string; hidePrivate?: boolean }) {
  return (
    <Link to={`/m/${m.id}`} className="flex items-center gap-3 rounded-[18px] bg-card p-2.5 pr-3 hover:bg-raised">
      <Cover m={m} className={`h-16 w-16 shrink-0 rounded-xl ${hidePrivate ? 'blur-sm' : ''}`} />
      <div className="min-w-0 flex-1">
        <p className="font-title truncate text-[16px]">{hidePrivate ? 'Личная запись' : m.title}</p>
        <p className="truncate text-[13px] text-muted">{sub ?? formatDate(m.date)}</p>
      </div>
      <SoundToggle m={m} tone="card" />
    </Link>
  );
}
