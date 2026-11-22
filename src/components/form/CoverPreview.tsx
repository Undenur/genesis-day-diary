/**
 * Живая обложка редактора: снимок — главный визуал, мягкое свечение из его же палитры выходит за края карточки.
 *
 * — Цвет свечения берётся только из фото; настроение показано значком и никогда не подменяет цвет кадра.
 * — Ночной снимок сохраняет тени: подложка под подписью — минимальная, достаточная для 4.5:1 (engine/legibility).
 * — Всё считается по уже сохранённым признакам снимка: набор текста не запускает анализ фото и сборку.
 */
import { ImagePlus } from 'lucide-react';
import { useMemo } from 'react';
import { relLuminance, shadeFor, zoneOf } from '../../engine/legibility';
import { useBlobUrl } from '../../hooks/useBlobUrl';
import { moodOf, type MoodId } from '../../lib/catalog';
import type { PhotoRef } from '../../lib/types';
import { formatDate, todayISO } from '../../lib/util';

const SHADE = '#101827';

interface Props {
  photo: PhotoRef | null;
  title: string;
  date: string;
  mood: MoodId | null | undefined;
  photoCount: number;
  invalid?: boolean;
  onAdd: () => void;
}

/** Цвета свечения: самые насыщенные и весомые цвета снимка, без подмешивания цвета настроения. */
export function glowColors(photo: PhotoRef | null): string[] {
  const pal = photo?.features.palette ?? [];
  return [...pal]
    .sort((a, b) => b.weight * (0.35 + b.s) - a.weight * (0.35 + a.s))
    .slice(0, 3)
    .map((c) => c.hex);
}

export function CoverPreview({ photo, title, date, mood, photoCount, invalid, onAdd }: Props) {
  const url = useBlobUrl(photo?.blobId ?? null);
  const thumb = useBlobUrl(photo?.thumbBlobId ?? null);
  const m = moodOf(mood);

  const look = useMemo(() => {
    if (!photo) return null;
    const f = photo.features;
    const zone = zoneOf(f, 'left');
    const shade = shadeFor(zone.p90, relLuminance(SHADE));
    const colors = glowColors(photo);
    // Тёмный кадр светится скромнее: свечение не должно «высветлять» ночь.
    const glow = 0.28 + Math.min(0.32, f.brightness * 0.4 + f.saturation * 0.15);
    return { shade, colors, glow };
  }, [photo]);

  if (!photo || !look) {
    return (
      <button
        type="button"
        id="cover-add"
        onClick={onAdd}
        aria-invalid={invalid}
        aria-describedby={invalid ? 'photos-error' : undefined}
        className={`flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed bg-card/60 px-6 text-center transition-colors ${invalid ? 'border-err text-err' : 'border-line hover:border-accent'}`}
      >
        <ImagePlus size={34} className="text-accent" aria-hidden="true" />
        <span className="text-[17px] font-semibold">Добавить фото дня</span>
        <span className="text-[13px] text-muted">Снимок станет обложкой и задаст цвета RE:LIVE. Можно несколько.</span>
      </button>
    );
  }

  const [c1, c2 = c1, c3 = c2] = look.colors;
  const shownTitle = title.trim();
  return (
    <figure className="relative isolate" aria-label={`Обложка: ${shownTitle || 'название предложит генератор'}, ${formatDate(date)}`}>
      {/* Свечение из палитры снимка — мягко за краями карточки */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 -z-10 blur-3xl transition-[background] duration-700 motion-reduce:transition-none"
        style={{
          opacity: look.glow,
          background: `radial-gradient(60% 50% at 30% 20%, ${c1}, transparent 70%), radial-gradient(55% 45% at 80% 75%, ${c2}, transparent 70%), radial-gradient(40% 40% at 15% 85%, ${c3}, transparent 70%)`,
        }}
      />
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[24px] bg-night shadow-2xl ring-1 ring-white/10">
        {(url || thumb) && (
          <img
            key={photo.id}
            src={url ?? thumb ?? undefined}
            alt={photo.alt || 'Обложка дня'}
            className="cover-in absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-3/5" style={{ background: `linear-gradient(to top, rgba(16,24,39,${look.shade.alpha}), rgba(16,24,39,${look.shade.alpha * 0.6}) 45%, transparent)` }} />
        {m && (
          <span className="absolute right-3 top-3 rounded-full bg-night/70 px-2.5 py-1 text-[13px] backdrop-blur-sm" title={m.label}>
            <span aria-hidden="true">{m.emoji}</span> {m.label}
          </span>
        )}
        {photoCount > 1 && <span className="absolute left-3 top-3 rounded-full bg-night/70 px-2.5 py-1 text-[12px] text-muted backdrop-blur-sm">{photoCount} фото</span>}
        <figcaption className="absolute inset-x-0 bottom-0 p-5 text-white">
          <p className="text-[13px] text-white/85">{date === todayISO() ? 'Сегодня' : formatDate(date)}</p>
          <p className={`font-title mt-1 text-[26px] leading-tight ${shownTitle ? '' : 'italic text-white/70'}`}>{shownTitle || 'Название предложит генератор'}</p>
        </figcaption>
      </div>
    </figure>
  );
}
