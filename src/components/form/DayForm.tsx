/**
 * Единый редактор дня — один и тот же для создания (/create/relive) и «Изменить» (/m/:id/edit).
 *
 * Обычная вертикальная прокрутка без шагов: сверху дата и название, затем живая обложка и лента снимков,
 * история дня, настроение; «Своя музыка», «Голос», «Место и детали» раскрываются на этом же экране.
 * На широком экране обложка стоит справа от полей и остаётся на виду.
 */
import type { ReactNode } from 'react';
import type { MoodId } from '../../lib/catalog';
import { trackForMood } from '../../lib/catalog';
import type { MemoryInput } from '../../lib/types';
import { countWords, formatDate, plural, titleWordStatus, todayISO } from '../../lib/util';
import { catalogSong } from '../../services/musicSource';
import { Field, inputCls } from '../ui';
import { ContextField } from './ContextField';
import { CoverPreview } from './CoverPreview';
import { MoodPicker } from './MoodPicker';
import { PHOTO_INPUT_ID, PhotosField } from './PhotosField';
import { SongField, hasOwnMusic } from './SongField';
import { VoiceField } from './VoiceField';

export type DayField = 'date' | 'title' | 'photos' | 'text';
export type DayErrors = Partial<Record<DayField, string>>;

/** Порядок полей на экране: фокус уходит к первому ошибочному. */
const FIELD_ORDER: DayField[] = ['date', 'title', 'photos', 'text'];
const FIELD_ID: Record<DayField, string> = { date: 'day-date', title: 'day-title', photos: 'cover-add', text: 'story' };

/** Проверка ввода перед сборкой. Пустое название допустимо — его предложит генератор. */
export function validateDay(input: MemoryInput): DayErrors {
  const e: DayErrors = {};
  if (!input.date) e.date = 'Укажите дату';
  else if (input.date > todayISO()) e.date = 'Воспоминание — о прошедшем дне. Для будущего создайте событие Countdown.';
  if (input.title.trim()) {
    const t = titleWordStatus(input.title);
    if (!t.ok) e.title = t.message;
  }
  if (!input.photos.length) e.photos = 'Добавьте хотя бы один снимок';
  if (input.text.trim().length < 3) e.text = 'Расскажите о дне хотя бы парой слов';
  return e;
}

/** Переводит фокус и прокрутку к первому полю с ошибкой. */
export function focusFirstError(errors: DayErrors) {
  const first = FIELD_ORDER.find((f) => errors[f]);
  if (!first) return;
  const el = document.getElementById(FIELD_ID[first]);
  el?.focus({ preventScroll: true });
  el?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/** Ошибка показывается, пока ввод действительно неверен, и исчезает сразу после исправления. */
export function liveErrors(shown: DayErrors, input: MemoryInput): DayErrors {
  const now = validateDay(input);
  const out: DayErrors = {};
  for (const f of FIELD_ORDER) if (shown[f] && now[f]) out[f] = now[f];
  return out;
}

interface Props {
  input: MemoryInput;
  update: (patch: Partial<MemoryInput>) => void;
  /** Владелец новых файлов: 'draft' для черновика или id дня */
  owner: string;
  errors: DayErrors;
  /** Блок под формой: прогресс сборки, сравнение версий */
  footer?: ReactNode;
}

function Disclosure({ title, meta, open, children }: { title: string; meta: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open || undefined} className="group rounded-[18px] bg-card px-4 py-2 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold">
        {title}
        <span className="truncate text-[13px] font-normal text-muted">{meta}</span>
      </summary>
      <div className="mt-2 pb-3">{children}</div>
    </details>
  );
}

export function DayForm({ input, update, owner, errors, footer }: Props) {
  const cover = input.photos.find((p) => p.id === input.coverId) ?? input.photos[0] ?? null;
  const titleStatus = input.title.trim() ? titleWordStatus(input.title) : null;
  const words = countWords(input.text);
  const ownMusic = hasOwnMusic(input.song);

  // Настроение меняет подачу; свой файл или ссылка автора остаются, иначе звучит композиция настроения.
  const setMood = (mood: MoodId) => update({ mood, song: ownMusic ? input.song : catalogSong(trackForMood(mood)) });

  return (
    <div className="editor grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:gap-x-12">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[180px_minmax(0,1fr)] lg:col-start-1">
        <Field label="Дата" htmlFor="day-date" error={errors.date} hint={input.date === todayISO() ? 'Сегодня' : input.date ? formatDate(input.date) : undefined}>
          <input id="day-date" type="date" max={todayISO()} className={inputCls} value={input.date} aria-invalid={!!errors.date} onChange={(e) => update({ date: e.target.value })} />
        </Field>
        <Field
          label="Название (по желанию)"
          htmlFor="day-title"
          error={errors.title}
          hint={titleStatus ? (titleStatus.ok ? `✓ ${titleStatus.message}` : titleStatus.message) : 'Пусто — генератор предложит 3–7 слов'}
        >
          <input
            id="day-title"
            className={`${inputCls} font-title`}
            value={input.title}
            aria-invalid={!!errors.title}
            placeholder="Например, «Дождь за тёплым стеклом»"
            enterKeyHint="next"
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
      </div>

      {/* Живая обложка: на телефоне — под датой, на широком экране — справа и на виду */}
      <div className="lg:col-start-2 lg:row-span-4 lg:row-start-1">
        <div className="flex flex-col gap-3 lg:sticky lg:top-24">
          <CoverPreview
            photo={cover}
            title={input.title}
            date={input.date}
            mood={input.mood}
            photoCount={input.photos.length}
            invalid={!!errors.photos}
            onAdd={() => document.getElementById(PHOTO_INPUT_ID)?.click()}
          />
          {errors.photos && (
            <p id="photos-error" role="alert" className="text-[13px] text-err">
              ● {errors.photos}
            </p>
          )}
          <PhotosField photos={input.photos} coverId={input.coverId} owner={owner} onChange={(photos, coverId) => update({ photos, coverId })} />
        </div>
      </div>

      <div className="lg:col-start-1">
        <Field label="Что было в этот день?" htmlFor="story" error={errors.text} hint={`${words} ${plural(words, ['слово', 'слова', 'слов'])} · подойдёт и одна фраза, и несколько абзацев`}>
          <textarea
            id="story"
            rows={5}
            className={`${inputCls} min-h-[140px] resize-y leading-relaxed`}
            aria-invalid={!!errors.text}
            placeholder="Что сегодня произошло? Кто был рядом? Какая деталь запомнилась?"
            value={input.text}
            onChange={(e) => update({ text: e.target.value })}
          />
        </Field>
      </div>

      <div className="lg:col-start-1">
        <MoodPicker mood={input.mood} song={input.song} text={input.text} onChange={setMood} />
      </div>

      <div className="flex flex-col gap-3 lg:col-start-1">
        <Disclosure title="Своя музыка" meta={ownMusic ? (input.song!.title || input.song!.fileName || 'ссылка') : 'файл или ссылка'} open={ownMusic || input.song?.source === 'description'}>
          <SongField song={input.song} mood={input.mood} text={input.text} owner={owner} onChange={(song) => update({ song })} />
        </Disclosure>
        <Disclosure title="Голос" meta={input.voice ? `${Math.round(input.voice.durationSec)} с` : 'до 90 с'} open={!!input.voice}>
          <VoiceField voice={input.voice} owner={owner} onChange={(voice) => update({ voice })} />
        </Disclosure>
        <Disclosure title="Место и детали" meta={input.place?.name || 'погода, сезон, категория'} open={!!(input.place || input.weather || input.category)}>
          <ContextField input={input} onChange={update} />
        </Disclosure>
        {footer}
      </div>
    </div>
  );
}
