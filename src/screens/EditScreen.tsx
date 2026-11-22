/**
 * Редактирование дня — тот же единый редактор, что и при создании (DayForm).
 * Описание сохраняется сразу; изменения фото, настроения, музыки и голоса требуют пересборки,
 * новая версия показывается рядом со старой (сравнение), новый заголовок согласуется.
 * Простой просмотр формы ничего не меняет в записи: старые песни (файл, ссылка, описание) остаются как есть.
 */
import { Eye, RefreshCw, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Page } from '../components/Layout';
import { DayForm, validateDay } from '../components/form/DayForm';
import { Player } from '../components/relive/Player';
import { Button, Card, PageHeader, Spinner, toast } from '../components/ui';
import { diffGenerations } from '../lib/diff';
import type { Generation, MemoryInput } from '../lib/types';
import { titleWordStatus } from '../lib/util';
import { StorageFullError } from '../services/db';
import { buildRelive, STEP_LABEL, toMemory, type ProgressStep } from '../services/pipeline';
import { useData } from '../store/data';

export default function EditScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const { memories, saveMemory } = useData();
  const m = memories.find((x) => x.id === id);
  const [form, setForm] = useState<MemoryInput | null>(null);
  const [progress, setProgress] = useState<ProgressStep | null>(null);
  const [pending, setPending] = useState<{ generation: Generation; input: MemoryInput } | null>(null);
  const [titleChoice, setTitleChoice] = useState<'old' | 'new'>('old');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (m && !form) setForm({ ...m });
  }, [m, form]);

  const mediaChanged = useMemo(() => {
    if (!m || !form) return false;
    const ids = (x: MemoryInput) => JSON.stringify([x.photos.map((p) => p.id), x.coverId, x.song, x.voice?.blobId, x.mood ?? null]);
    return ids(m) !== ids(form);
  }, [m, form]);

  if (!m || !form) return <div className="grid min-h-dvh place-items-center"><Spinner label="Открываю день…" /></div>;

  const update = (patch: Partial<MemoryInput>) => {
    setForm({ ...form, ...patch });
    setPending(null);
  };
  const errors = validateDay(form);
  const textChanged = form.text !== m.text;
  const valid = Object.keys(errors).length === 0;
  // Сохранить описание без пересборки можно только с названием: пустое название придумывает генератор при сборке.
  const titleOk = titleWordStatus(form.title).ok;

  const rebuild = async () => {
    if (!valid) return;
    try {
      // Если название придумал генератор — разрешаем ему предложить новое.
      const authorTitle = m.generation.titleSource === 'author' || form.title !== m.title ? form.title : '';
      const { generation, song, warning } = await buildRelive({ ...form, title: authorTitle }, setProgress);
      if (warning) toast(warning, 'warn');
      setPending({ generation, input: { ...form, song } });
      setTitleChoice(generation.title === m.title ? 'old' : 'new');
    } catch (e) {
      toast(`Пересборка не удалась: ${(e as Error).message}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  const persist = async (generation: Generation, input: MemoryInput) => {
    if (saving) return;
    setSaving(true);
    try {
      await saveMemory(toMemory(m.id, input, generation, m));
      toast('Изменения сохранены', 'ok');
      nav(`/m/${m.id}`, { replace: true });
    } catch (e) {
      setSaving(false);
      toast(e instanceof StorageFullError ? e.message : `Не удалось сохранить: ${(e as Error).message}`, 'error');
    }
  };

  const saveDescriptionOnly = () => persist({ ...m.generation, title: form.title.trim(), titleSource: form.title.trim() === m.title ? m.generation.titleSource : 'author' }, form);

  const savePending = () => {
    if (!pending) return;
    const title = titleChoice === 'old' ? m.title : pending.generation.title;
    persist({ ...pending.generation, title, titleSource: titleChoice === 'old' ? m.generation.titleSource : pending.generation.titleSource }, { ...pending.input, title });
  };

  if (preview && pending) {
    return (
      <div className="fixed inset-0 z-[90] overflow-y-auto bg-night">
        <Player input={pending.input} generation={{ ...pending.generation, title: titleChoice === 'old' ? m.title : pending.generation.title }} onClose={() => setPreview(false)} />
      </div>
    );
  }

  return (
    <Page wide>
      <PageHeader title="Изменить день" />
      <div className="flex flex-col gap-6 pb-36">
        <DayForm input={form} update={update} owner={m.id} errors={errors} />

        {pending && (
          <Card className="p-4" as="section">
            <h2 className="text-[17px] font-semibold">Новая версия RE:LIVE</h2>
            <p className="mt-1 text-[13px] text-muted">Изменённые строки отмечены точкой. Тот же ввод всегда даёт тот же результат. Чтобы отменить — просто вернитесь назад.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Параметр</th>
                    <th className="py-1.5 pr-2 font-medium">Было</th>
                    <th className="py-1.5 font-medium">Стало</th>
                  </tr>
                </thead>
                <tbody>
                  {diffGenerations(m.generation, pending.generation).map((r) => (
                    <tr key={r.label} className={`border-t border-line ${r.changed ? 'text-ink' : 'text-muted'}`}>
                      <th scope="row" className="py-1.5 pr-2 font-medium">
                        {r.changed && <span className="mr-1 text-warn" aria-label="изменено">●</span>}
                        {r.label}
                      </th>
                      <td className="py-1.5 pr-2 align-top">{r.before}</td>
                      <td className={`py-1.5 align-top ${r.changed ? 'font-semibold' : ''}`}>{r.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pending.generation.title !== m.title && (
              <fieldset className="mt-4">
                <legend className="mb-2 text-[14px] font-semibold">Какое название оставить?</legend>
                {(['old', 'new'] as const).map((k) => (
                  <label key={k} className="flex min-h-11 items-center gap-3 text-[15px]">
                    <input type="radio" name="tchoice" checked={titleChoice === k} onChange={() => setTitleChoice(k)} className="h-5 w-5 accent-[#91A9D1]" />
                    <span className="font-title">«{k === 'old' ? m.title : pending.generation.title}»</span>
                    <span className="text-[13px] text-muted">{k === 'old' ? 'текущее' : 'новое от генератора'}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </Card>
        )}
      </div>

      <footer className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-night/95 px-5 pt-3 backdrop-blur-md lg:left-60">
        <div className="mx-auto flex max-w-[600px] flex-col gap-2">
          {mediaChanged && !pending && <p className="text-[13px] text-warn">Фото, песня или голос изменились — пересоберите сцену, чтобы сохранить.</p>}
          {!mediaChanged && textChanged && !pending && <p className="text-[13px] text-muted">Текст изменился. Можно сохранить описание как есть или пересобрать сцену — название, подписи и объяснение обновятся.</p>}
          <div className="flex gap-2">
            {pending ? (
              <>
                <Button variant="outline" icon={Eye} onClick={() => setPreview(true)} className="flex-1">
                  Смотреть
                </Button>
                <Button variant="primary" icon={Save} onClick={savePending} disabled={saving} className="flex-[2]">
                  Сохранить версию
                </Button>
              </>
            ) : (
              <>
                {!mediaChanged && (
                  <Button variant="outline" icon={Save} onClick={saveDescriptionOnly} disabled={!valid || !titleOk || saving} className="flex-1">
                    Сохранить описание
                  </Button>
                )}
                <Button variant="primary" icon={RefreshCw} onClick={rebuild} disabled={!valid || !!progress} className="flex-1">
                  {progress ? STEP_LABEL[progress] + '…' : 'Пересобрать сцену'}
                </Button>
              </>
            )}
          </div>
        </div>
      </footer>
    </Page>
  );
}
