/**
 * «Воспоминание RE:LIVE» — один цельный редактор с вертикальной прокруткой (без шагов).
 * Черновик с файлами сохраняется автоматически и восстанавливается после перезагрузки;
 * возврат из предпросмотра открывает тот же ввод. Ошибка сборки показывает конкретное поле и переводит к нему фокус.
 */
import { Check, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { DayForm, focusFirstError, liveErrors, validateDay, type DayErrors } from '../components/form/DayForm';
import { Button, ConfirmDialog, IconButton, Spinner, toast } from '../components/ui';
import { countWords, plural } from '../lib/util';
import { getBlob } from '../services/db';
import { processPhoto } from '../services/media';
import { buildRelive, InputError, STEP_LABEL, type ProgressStep } from '../services/pipeline';
import { useData } from '../store/data';
import { DRAFT_OWNER, draftHasContent, useDraft } from '../store/draft';

export default function WizardScreen() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { loaded, load, input, update, reset, restoredAt, setGeneration, saveError } = useDraft();
  const countdowns = useData((s) => s.countdowns);
  const [errors, setErrors] = useState<DayErrors>({});
  const [progress, setProgress] = useState<ProgressStep | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);

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

  const showErrors = (e: DayErrors) => {
    setErrors(e);
    // Фокус — после того как поле отрисует ошибку. Не rAF: он не срабатывает в фоновой вкладке.
    setTimeout(() => focusFirstError(e), 0);
  };

  const build = async () => {
    setBuildError(null);
    const e = validateDay(input);
    if (Object.keys(e).length) return showErrors(e);
    try {
      const { generation, song, warning } = await buildRelive(input, setProgress);
      if (song !== input.song) update({ song });
      setGeneration(generation);
      if (warning) toast(warning, 'warn');
      nav('/create/relive/preview');
    } catch (err) {
      if (err instanceof InputError) showErrors({ [err.field]: err.message });
      else {
        console.error(err);
        setBuildError(`Не удалось собрать RE:LIVE: ${(err as Error).message}. Черновик сохранён — попробуйте ещё раз.`);
      }
    } finally {
      setProgress(null);
    }
  };

  const close = () => {
    if (draftHasContent(input)) toast('Черновик сохранён — продолжите, когда будет удобно', 'ok');
    // Назад — туда, откуда пришли (архив, главная, событие); при прямом входе — на главную.
    if ((window.history.state?.idx ?? 0) > 0) nav(-1);
    else nav('/');
  };

  if (!loaded) return <div className="grid min-h-dvh place-items-center"><Spinner label="Открываю черновик…" /></div>;

  const words = countWords(input.text);
  const shown = liveErrors(errors, input);
  const steps = Object.keys(STEP_LABEL) as ProgressStep[];

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1180px] flex-col">
      <header className="sticky top-0 z-30 bg-night/95 px-3 pt-[max(8px,var(--safe-top))] backdrop-blur-md">
        <div className="flex min-h-14 items-center gap-1">
          <IconButton icon={X} label="Закрыть редактор (черновик сохранится)" onClick={close} />
          <h1 className="flex-1 text-center text-[16px] font-semibold">Новый день</h1>
          <button type="button" onClick={() => setConfirmReset(true)} className="min-h-11 rounded-xl px-3 text-[14px] text-muted hover:text-ink">
            Начать заново
          </button>
        </div>
      </header>

      <main className="flex-1 px-5 pb-36 pt-3 lg:px-8">
        {restoredAt && draftHasContent(input) && (
          <p className="mb-4 rounded-2xl bg-card px-4 py-3 text-[14px]" role="status">
            Восстановлен черновик от {new Date(restoredAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}: {input.photos.length} {plural(input.photos.length, ['снимок', 'снимка', 'снимков'])}, {words} {plural(words, ['слово', 'слова', 'слов'])}.
          </p>
        )}
        {saveError && <p role="alert" className="mb-4 rounded-2xl bg-err/10 px-4 py-3 text-[14px] text-err">{saveError}</p>}

        <DayForm
          input={input}
          update={update}
          owner={DRAFT_OWNER}
          errors={shown}
          footer={
            <>
              {progress && (
                <ol className="flex flex-col gap-2 rounded-[18px] bg-card p-4" aria-live="polite" aria-label="Сборка RE:LIVE">
                  {steps.map((k, order) => {
                    const cur = steps.indexOf(progress);
                    return (
                      <li key={k} className={`flex items-center gap-2 text-[14px] ${order === cur ? 'font-semibold text-ink' : order < cur ? 'text-ok' : 'text-muted'}`}>
                        {order < cur ? <Check size={16} aria-label="готово" /> : order === cur ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent motion-reduce:animate-none" aria-hidden="true" /> : <span className="h-4 w-4 rounded-full border border-line" aria-hidden="true" />}
                        {STEP_LABEL[k]}
                      </li>
                    );
                  })}
                </ol>
              )}
              {buildError && <p role="alert" className="rounded-2xl bg-err/10 px-4 py-3 text-[14px] text-err">{buildError}</p>}
            </>
          }
        />
      </main>

      <footer className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-night/95 px-5 pt-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 lg:px-3">
          <p className="hidden flex-1 text-[13px] text-muted lg:block">Черновик сохраняется автоматически.</p>
          <Button variant="primary" block icon={Sparkles} onClick={build} disabled={!!progress} size="lg" className="lg:w-auto lg:flex-none lg:px-10">
            {progress ? STEP_LABEL[progress] + '…' : buildError ? 'Повторить сборку' : 'Собрать RE:LIVE'}
          </Button>
        </div>
      </footer>

      <ConfirmDialog
        open={confirmReset}
        title="Начать заново?"
        text="Текущий черновик, его фото, музыка и голос будут удалены. Сохранённые дни не пострадают."
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
