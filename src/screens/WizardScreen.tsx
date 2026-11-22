/**
 * Мастер «Воспоминание RE:LIVE»: 4 шага. Первый экран — фраза и фото (дата по умолчанию сегодняшняя),
 * песня — отдельно, голос и контекст раскрываются по желанию. Черновик с файлами восстанавливается после перезагрузки.
 */
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ContextField } from '../components/form/ContextField';
import { PhotosField } from '../components/form/PhotosField';
import { SongField } from '../components/form/SongField';
import { VoiceField } from '../components/form/VoiceField';
import { Button, ConfirmDialog, Field, IconButton, Spinner, inputCls, toast } from '../components/ui';
import { countWords, formatDate, plural, titleWordStatus, todayISO } from '../lib/util';
import { getBlob } from '../services/db';
import { processPhoto } from '../services/media';
import { buildRelive, InputError, STEP_LABEL, type ProgressStep } from '../services/pipeline';
import { useData } from '../store/data';
import { DRAFT_OWNER, draftHasContent, useDraft } from '../store/draft';

export const STEPS = ['История и фото', 'Песня', 'Детали', 'Сборка'];
const HEADINGS = ['Что сегодня было?', 'Песня этого дня', 'Голос и детали', 'Всё готово к сборке'];

export default function WizardScreen() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { loaded, load, step, setStep, input, update, reset, restoredAt, setGeneration, saveError } = useDraft();
  const countdowns = useData((s) => s.countdowns);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<ProgressStep | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  // Countdown → черновик: дата, название и обложка события.
  const fromId = params.get('from');
  useEffect(() => {
    if (!loaded || !fromId) return;
    const ev = countdowns.find((c) => c.id === fromId);
    if (!ev) return;
    if (input.countdownId === fromId) {
      setParams({}, { replace: true });
      return;
    }
    if (draftHasContent(input) && pendingFrom !== fromId) {
      setPendingFrom(fromId);
      return;
    }
    if (pendingFrom === fromId) return;
    startFromCountdown(fromId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, fromId, countdowns.length]);

  const startFromCountdown = async (id: string) => {
    const ev = countdowns.find((c) => c.id === id);
    if (!ev) return;
    await reset({ date: ev.datetime.slice(0, 10), title: ev.title, countdownId: ev.id, category: ev.category });
    if (ev.coverBlobId) {
      const blob = await getBlob(ev.coverBlobId);
      if (blob) {
        const p = await processPhoto(blob, `${ev.title}.jpg`, DRAFT_OWNER, 0);
        update({ photos: [p], coverId: p.id });
      }
    }
    setPendingFrom(null);
    setParams({}, { replace: true });
    toast(`Черновик создан из события «${ev.title}»`, 'ok');
  };

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (input.text.trim().length < 3) e.text = 'Расскажите о дне хотя бы парой слов';
      if (!input.photos.length) e.photos = 'Добавьте хотя бы один снимок';
      if (!input.date) e.date = 'Укажите дату';
      else if (input.date > todayISO()) e.date = 'Воспоминание — о прошедшем дне. Для будущего создайте событие Countdown.';
      if (input.title.trim() && !titleWordStatus(input.title).ok) e.title = titleWordStatus(input.title).message;
    }
    return e;
  };

  const next = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep(Math.min(STEPS.length - 1, step + 1));
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    setErrors({});
    if (step === 0) nav(-1);
    else setStep(step - 1);
    window.scrollTo({ top: 0 });
  };

  const build = async () => {
    setBuildError(null);
    const e0 = validateStep(0);
    if (Object.keys(e0).length) {
      setErrors(e0);
      setStep(0);
      return;
    }
    try {
      const { generation, song, warning } = await buildRelive(input, setProgress);
      if (song !== input.song) update({ song });
      setGeneration(generation);
      if (warning) toast(warning, 'warn');
      nav('/create/relive/preview');
    } catch (e) {
      if (e instanceof InputError) {
        setErrors({ [e.field]: e.message });
        setStep(0);
      } else {
        console.error(e);
        setBuildError(`Не удалось собрать RE:LIVE: ${(e as Error).message}. Черновик сохранён — попробуйте ещё раз.`);
      }
    } finally {
      setProgress(null);
    }
  };

  const close = () => {
    if (draftHasContent(input)) toast('Черновик сохранён — продолжите, когда будет удобно', 'ok');
    nav('/');
  };

  if (!loaded) return <div className="grid min-h-dvh place-items-center"><Spinner label="Открываю черновик…" /></div>;

  const titleStatus = input.title.trim() ? titleWordStatus(input.title) : null;
  const words = countWords(input.text);
  // Ошибка поля показывается, пока ввод действительно неверен, и исчезает сразу после исправления.
  const live = {
    date: errors.date && validateStep(0).date ? errors.date : undefined,
    title: errors.title && titleStatus && !titleStatus.ok ? titleStatus.message : undefined,
    text: errors.text && input.text.trim().length < 3 ? errors.text : undefined,
    photos: errors.photos && !input.photos.length ? errors.photos : undefined,
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-[640px] flex-col">
      <header className="sticky top-0 z-30 bg-night/95 px-3 pt-[max(8px,var(--safe-top))] backdrop-blur-md">
        <div className="flex min-h-12 items-center gap-1">
          <IconButton icon={X} label="Закрыть мастер (черновик сохранится)" onClick={close} />
          <p className="flex-1 text-center text-[15px] font-semibold">Воспоминание RE:LIVE</p>
          <button type="button" onClick={() => setConfirmReset(true)} className="min-h-11 rounded-xl px-3 text-[14px] text-muted hover:text-ink">
            Начать заново
          </button>
        </div>
        <div className="px-2 pb-3">
          <ol className="flex gap-1" aria-label="Шаги мастера">
            {STEPS.map((s, i) => (
              <li key={s} className="flex-1">
                <button
                  type="button"
                  aria-label={`Шаг ${i + 1}: ${s}${i < step ? ', пройден' : i === step ? ', текущий' : ''}`}
                  aria-current={i === step ? 'step' : undefined}
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  className={`block h-1.5 w-full rounded-full ${i < step ? 'bg-accent' : i === step ? 'bg-ink' : 'bg-raised'}`}
                />
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[13px] text-muted">
            Шаг {step + 1} из {STEPS.length} · {STEPS[step]}
            {step === 1 || step === 2 ? ' · по желанию' : ''}
          </p>
        </div>
      </header>

      <div className="flex-1 px-5 pb-32 pt-2">
        {restoredAt && step === 0 && draftHasContent(input) && (
          <p className="mb-4 rounded-2xl bg-card px-4 py-3 text-[14px]" role="status">
            Восстановлен черновик от {new Date(restoredAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}: {input.photos.length} {plural(input.photos.length, ['снимок', 'снимка', 'снимков'])}, {words} {plural(words, ['слово', 'слова', 'слов'])}.
          </p>
        )}
        {saveError && <p role="alert" className="mb-4 rounded-2xl bg-err/10 px-4 py-3 text-[14px] text-err">{saveError}</p>}

        <h1 ref={headingRef} tabIndex={-1} className="mb-5 text-[24px] font-semibold leading-tight focus:outline-none">
          {HEADINGS[step]}
        </h1>

        {step === 0 && (
          <div className="flex flex-col gap-6">
            <Field label="Фраза или история дня" htmlFor="story" error={live.text} hint={`${words} ${plural(words, ['слово', 'слова', 'слов'])} · подойдёт и одна фраза, и несколько абзацев`}>
              <textarea
                id="story"
                rows={5}
                className={`${inputCls} min-h-[150px] resize-y leading-relaxed`}
                aria-invalid={!!live.text}
                placeholder="Что сегодня произошло? Кто был рядом? Какая деталь запомнилась?"
                value={input.text}
                onChange={(e) => update({ text: e.target.value })}
              />
            </Field>
            <section aria-labelledby="photos-label">
              <p id="photos-label" className="mb-1.5 text-[14px] font-medium text-muted">
                Фото дня
              </p>
              <PhotosField photos={input.photos} coverId={input.coverId} owner={DRAFT_OWNER} invalid={!!live.photos} onChange={(photos, coverId) => update({ photos, coverId })} />
              {live.photos && <p role="alert" className="mt-2 text-[13px] text-err">● {live.photos}</p>}
            </section>
            <details
              open={metaOpen || !!live.date || !!live.title}
              onToggle={(e) => setMetaOpen((e.target as HTMLDetailsElement).open)}
              className="rounded-[18px] bg-card px-4 py-3 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[15px]">
                <span>
                  <span className="block font-semibold">{input.date === todayISO() ? 'Сегодня' : formatDate(input.date)}</span>
                  <span className="block text-[13px] text-muted">{input.title.trim() ? `«${input.title.trim()}»` : 'Название предложит генератор'}</span>
                </span>
                <span className="text-[13px] text-accent">Дата и название</span>
              </summary>
              <div className="mt-3 flex flex-col gap-4 pb-1">
                <Field label="Дата" htmlFor="date" error={live.date} hint={input.date ? formatDate(input.date) : undefined}>
                  <input id="date" type="date" max={todayISO()} className={inputCls} value={input.date} aria-invalid={!!live.date} onChange={(e) => update({ date: e.target.value })} />
                </Field>
                <Field
                  label="Название (по желанию)"
                  htmlFor="title"
                  error={live.title}
                  hint={titleStatus ? (titleStatus.ok ? `✓ ${titleStatus.message}` : titleStatus.message) : 'Можно оставить пустым — название из 3–7 слов предложит генератор'}
                >
                  <input id="title" className={`${inputCls} font-title`} value={input.title} aria-invalid={titleStatus ? !titleStatus.ok : false} onChange={(e) => update({ title: e.target.value })} placeholder="Например, «Дождь за тёплым стеклом»" />
                </Field>
              </div>
            </details>
          </div>
        )}

        {step === 1 && <SongField song={input.song} owner={DRAFT_OWNER} onChange={(song) => update({ song })} />}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <details open={!!input.voice || undefined} className="rounded-[18px] bg-card px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold">
                Голос автора
                <span className="text-[13px] font-normal text-muted">{input.voice ? `${Math.round(input.voice.durationSec)} с` : 'до 90 с'}</span>
              </summary>
              <div className="mt-3 pb-1">
                <VoiceField voice={input.voice} owner={DRAFT_OWNER} onChange={(voice) => update({ voice })} />
              </div>
            </details>
            <details open={!!(input.place || input.weather || input.category) || undefined} className="rounded-[18px] bg-card px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold">
                Место, погода и сезон
                <span className="text-[13px] font-normal text-muted">{input.place?.name || 'по желанию'}</span>
              </summary>
              <div className="mt-3 pb-1">
                <ContextField input={input} onChange={update} />
              </div>
            </details>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col divide-y divide-line rounded-[18px] bg-card">
              {[
                ['Дата', formatDate(input.date)],
                ['Название', input.title.trim() || 'предложит генератор'],
                ['История', `${words} ${plural(words, ['слово', 'слова', 'слов'])}`],
                ['Фото', `${input.photos.length} ${plural(input.photos.length, ['снимок', 'снимка', 'снимков'])}`],
                ['Песня', input.song ? input.song.title || 'без названия' : 'нет — синтез по тексту'],
                ['Голос', input.voice ? `${Math.round(input.voice.durationSec)} с` : 'нет'],
                ['Место', input.place?.name || 'не указано'],
              ].map(([k, v], i) => (
                <li key={k} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
                  <span className="text-muted">{k}</span>
                  <button type="button" className="truncate text-right underline-offset-4 hover:underline" onClick={() => setStep([0, 0, 0, 0, 1, 2, 2][i])}>
                    {v}
                  </button>
                </li>
              ))}
            </ul>
            {progress && (
              <ol className="flex flex-col gap-2 rounded-[18px] bg-card p-4" aria-live="polite">
                {(Object.keys(STEP_LABEL) as ProgressStep[]).map((k) => {
                  const order = Object.keys(STEP_LABEL).indexOf(k);
                  const cur = Object.keys(STEP_LABEL).indexOf(progress);
                  return (
                    <li key={k} className={`flex items-center gap-2 text-[14px] ${order === cur ? 'font-semibold text-ink' : order < cur ? 'text-ok' : 'text-muted'}`}>
                      {order < cur ? <Check size={16} aria-label="готово" /> : order === cur ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" /> : <span className="h-4 w-4 rounded-full border border-line" aria-hidden="true" />}
                      {STEP_LABEL[k]}
                      {k === 'music' && !input.song ? ' — песни нет, беру темп из текста' : ''}
                    </li>
                  );
                })}
              </ol>
            )}
            {buildError && <p role="alert" className="rounded-2xl bg-err/10 px-4 py-3 text-[14px] text-err">{buildError}</p>}
          </div>
        )}
      </div>

      <footer className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-night/95 px-5 pt-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-[600px] gap-3">
          <Button variant="outline" icon={ArrowLeft} onClick={back} disabled={!!progress} className="flex-none">
            Назад
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" block onClick={next}>
              {(step === 1 && !input.song) || (step === 2 && !(input.voice || input.place || input.weather || input.category)) ? 'Пропустить' : 'Далее'}
              <ArrowRight size={20} aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="primary" block icon={Sparkles} onClick={build} disabled={!!progress} size="lg">
              {progress ? STEP_LABEL[progress] + '…' : buildError ? 'Повторить сборку' : 'Собрать RE:LIVE'}
            </Button>
          )}
        </div>
      </footer>

      <ConfirmDialog
        open={confirmReset}
        title="Начать заново?"
        text="Текущий черновик, его фото, песня и голос будут удалены. Сохранённые дни не пострадают."
        confirmLabel="Очистить черновик"
        onClose={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          await reset();
          setErrors({});
        }}
      />
      <ConfirmDialog
        open={!!pendingFrom}
        danger={false}
        title="Заменить черновик?"
        text="У вас есть незаконченный черновик. Создать новый из события Countdown? Старый черновик будет удалён."
        confirmLabel="Создать из события"
        onClose={() => {
          setPendingFrom(null);
          setParams({}, { replace: true });
        }}
        onConfirm={() => pendingFrom && startFromCountdown(pendingFrom)}
      />
    </div>
  );
}
