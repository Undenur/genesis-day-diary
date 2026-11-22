/**
 * «Каким был день?» — шесть настроений, у каждого своя настоящая композиция.
 *
 * — Редактор молчит, пока человек сам не нажмёт «Послушать».
 * — Если предпрослушивание уже звучит, выбор другого настроения мягко переводит звук на новый фрагмент;
 *   при быстрых нажатиях звучит только последний (кроссфейд и отмена — в previewSound).
 * — Если у дня свой файл или ссылка, настроение меняет только подачу, а звучит трек автора.
 */
import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { MOODS, moodOf, type MoodId } from '../../lib/catalog';
import type { SongInput } from '../../lib/types';
import { resolveMusic, trackLabel } from '../../services/musicSource';
import { usePreviewSound, type PreviewSrc } from '../../services/previewSound';

interface Props {
  mood: MoodId | null | undefined;
  song: SongInput | null;
  text: string;
  onChange: (mood: MoodId) => void;
}

export const EDITOR_PREVIEW_KEY = 'editor';

export function MoodPicker({ mood, song, text, onChange }: Props) {
  const playingId = usePreviewSound((s) => s.playingId);
  const play = usePreviewSound((s) => s.play);
  const stop = usePreviewSound((s) => s.stop);
  const listening = playingId === EDITOR_PREVIEW_KEY;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Источник считается так же, как в RE:LIVE и карточке архива.
  const music = useMemo(() => resolveMusic(song, mood, text), [song, mood, text]);
  const src: PreviewSrc = music.kind === 'file' && music.blobId ? { blobId: music.blobId } : { url: music.url ?? music.track.url, fallbackUrl: music.track.url };
  const srcKey = 'blobId' in src ? src.blobId : src.url;

  // Уже слушаем — переключение настроения ведёт к следующему фрагменту. Не слушаем — тишина.
  const lastKey = useRef(srcKey);
  useEffect(() => {
    if (lastKey.current === srcKey) return;
    lastKey.current = srcKey;
    if (usePreviewSound.getState().playingId === EDITOR_PREVIEW_KEY) play(EDITOR_PREVIEW_KEY, src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey]);

  // Уход из редактора останавливает предпрослушивание.
  useEffect(() => () => {
    if (usePreviewSound.getState().playingId === EDITOR_PREVIEW_KEY) usePreviewSound.getState().stop();
  }, []);

  const current = moodOf(mood);
  const index = Math.max(0, MOODS.findIndex((m) => m.id === mood));

  // Радиогруппа: стрелки переводят выбор, Tab выходит из группы.
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + MOODS.length) % MOODS.length;
    onChange(MOODS[j].id);
    refs.current[j]?.focus();
  };

  const own = music.kind === 'file' || music.kind === 'link';
  return (
    <section aria-labelledby="mood-label" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="mood-label" className="text-[14px] font-medium text-muted">
          Каким был день?
        </h2>
        {!current && <span className="text-[13px] text-muted">по желанию</span>}
      </div>
      <div role="radiogroup" aria-labelledby="mood-label" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {MOODS.map((m, i) => {
          const on = m.id === mood;
          return (
            <button
              key={m.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${m.label}: ${m.hint}`}
              tabIndex={i === index ? 0 : -1}
              onClick={() => onChange(m.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 transition-[background-color,border-color,transform] duration-150 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                on ? 'border-accent bg-accent/15 ring-2 ring-accent ring-offset-2 ring-offset-night' : 'border-line bg-card hover:border-accent/60'
              }`}
            >
              <span className="text-[26px] leading-none" aria-hidden="true">
                {m.emoji}
              </span>
              <span className={`text-[12.5px] leading-tight ${on ? 'font-semibold text-ink' : 'text-muted'}`}>{m.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 rounded-[18px] bg-card p-3" aria-live="polite">
        <button
          type="button"
          onClick={() => (listening ? stop() : play(EDITOR_PREVIEW_KEY, src))}
          aria-pressed={listening}
          aria-label={listening ? 'Остановить предпрослушивание' : `Послушать: ${own ? music.label : trackLabel(music.track)}`}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-night transition-transform active:scale-95 motion-reduce:active:scale-100"
        >
          {listening ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="translate-x-px" />}
        </button>
        <div className="min-w-0 flex-1 text-[14px] leading-snug">
          {own ? (
            <>
              <p className="truncate font-semibold">{music.label}</p>
              <p className="text-muted">Звучит ваш трек. Настроение меняет подачу кадра, а не музыку.</p>
            </>
          ) : (
            <>
              <p className="truncate font-semibold">
                {music.track.title} <span className="font-normal text-muted">— {music.track.artist}</span>
              </p>
              <p className="text-muted">
                {current ? `${current.emoji} ${current.label}: ${current.hint}` : `Подберу по тексту: ${moodOf(music.mood)!.emoji} ${moodOf(music.mood)!.label}`}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
