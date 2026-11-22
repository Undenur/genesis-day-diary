/**
 * Карточки дня: обложка, дата, название и отдельная кнопка звука.
 * Открытие дня и звук — соседние элементы, а не вложенные: у каждого свой фокус и своё нажатие.
 * При открытии обложка получает имя перехода и «перетекает» в первый кадр плеера (View Transitions).
 */
import { Pause, Volume2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Link } from 'react-router';
import { useBlobUrl } from '../hooks/useBlobUrl';
import type { Memory } from '../lib/types';
import { formatDate, rgba, typo } from '../lib/util';
import { usePreviewSound } from '../services/previewSound';

/** Общее имя перехода «обложка → первый кадр истории». Назначается только нажатой карточке. */
export const RELIVE_TRANSITION = 'relive-cover';

export function coverOf(m: Memory) {
  return m.photos.find((p) => p.id === m.coverId) ?? m.photos[0];
}

/** Перед переходом помечаем обложку нажатой карточки — так имя перехода на странице всегда одно. */
export function markCoverForTransition(e: MouseEvent<HTMLElement>) {
  document.querySelectorAll<HTMLElement>(`[data-vt-active]`).forEach((el) => {
    el.style.viewTransitionName = '';
    delete el.dataset.vtActive;
  });
  const scope = e.currentTarget.closest<HTMLElement>('[data-vt-scope]') ?? e.currentTarget;
  const img = scope.querySelector<HTMLElement>('[data-cover]');
  if (img) {
    img.style.viewTransitionName = RELIVE_TRANSITION;
    img.dataset.vtActive = '1';
  }
}

export function Cover({ m, className = '', thumb = true, eager }: { m: Memory; className?: string; thumb?: boolean; eager?: boolean }) {
  const c = coverOf(m);
  const url = useBlobUrl(thumb ? c?.thumbBlobId : c?.blobId);
  return (
    <div className={`overflow-hidden bg-raised ${className}`} style={{ background: c?.features.palette[0]?.hex }}>
      {url && <img data-cover src={url} alt={c?.alt ?? ''} className="h-full w-full object-cover" loading={eager ? 'eager' : 'lazy'} decoding="async" />}
    </div>
  );
}

export function SoundToggle({ m, tone = 'glass', className = '' }: { m: Memory; tone?: 'glass' | 'card'; className?: string }) {
  const { playingId, toggle } = usePreviewSound();
  const on = playingId === m.id;
  return (
    <button
      type="button"
      onClick={() => toggle(m)}
      aria-pressed={on}
      aria-label={on ? `Остановить звук «${m.title}»` : `Послушать песню дня «${m.title}»`}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform active:scale-90 ${tone === 'glass' ? 'bg-black/50 text-white backdrop-blur-sm' : 'bg-raised text-ink'} ${on ? 'ring-2 ring-accent' : ''} ${className}`}
    >
      {on ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Volume2 size={19} aria-hidden="true" />}
    </button>
  );
}

/** Вертикальная карточка для сетки архива. */
export function MemoryTile({ m, onSelect, selected, hidePrivate }: { m: Memory; onSelect?: () => void; selected?: boolean; hidePrivate?: boolean }) {
  const glow = m.generation.art.glowColor;
  const label = hidePrivate ? `Личная запись, ${formatDate(m.date)}` : `${m.title}, ${formatDate(m.date)}`;
  const body = (
    <>
      <Cover m={m} className={`aspect-[3/4] w-full rounded-[18px] ${hidePrivate ? 'blur-md' : ''}`} />
      <div className="pointer-events-none absolute inset-0 rounded-[18px] bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3 pr-3 text-left">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-white">{formatDate(m.date)}</p>
        <p className="font-title mt-0.5 line-clamp-3 text-[16px] leading-tight text-white [overflow-wrap:break-word] hyphens-auto">{hidePrivate ? 'Личная запись' : typo(m.title)}</p>
      </div>
    </>
  );
  const cls = `relative block w-full rounded-[18px] text-left transition-transform duration-150 active:scale-[0.97] focus-visible:outline-offset-4 ${selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-night' : ''}`;
  return (
    <article className="relative" style={{ boxShadow: `0 14px 40px -18px ${rgba(glow, 0.55)}`, borderRadius: 18 }}>
      {onSelect ? (
        <button type="button" onClick={onSelect} className={cls} aria-label={label} aria-pressed={selected}>
          {body}
        </button>
      ) : (
        <Link to={`/m/${m.id}`} viewTransition onClick={markCoverForTransition} className={cls} aria-label={label}>
          {body}
        </Link>
      )}
      <SoundToggle m={m} className="absolute right-2 top-2 z-10" />
    </article>
  );
}

/** Строка с обложкой и вторичной информацией. */
export function MemoryRow({ m, sub, hidePrivate }: { m: Memory; sub?: string; hidePrivate?: boolean }) {
  return (
    <article className="relative">
      <Link
        to={`/m/${m.id}`}
        viewTransition
        onClick={markCoverForTransition}
        className="flex items-center gap-3 rounded-[18px] bg-card p-2.5 pr-16 transition-transform duration-150 hover:bg-raised active:scale-[0.98]"
      >
        <Cover m={m} className={`h-16 w-16 shrink-0 rounded-xl ${hidePrivate ? 'blur-sm' : ''}`} />
        <div className="min-w-0 flex-1">
          <p className="font-title line-clamp-2 text-[16px] leading-tight [overflow-wrap:break-word] hyphens-auto">{hidePrivate ? 'Личная запись' : typo(m.title)}</p>
          <p className="truncate text-[13px] text-muted">{sub ?? formatDate(m.date)}</p>
        </div>
      </Link>
      <SoundToggle m={m} tone="card" className="absolute right-3 top-1/2 -translate-y-1/2" />
    </article>
  );
}
