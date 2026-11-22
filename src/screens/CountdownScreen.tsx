/** Countdown: название, дата и время, обложка, описание и категория. Состоявшееся событие ведёт к созданию или открытию дня. */
import { CirclePlus, ImagePlus, Play, Save, Trash } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CountdownCard } from '../components/CountdownCard';
import { Page } from '../components/Layout';
import { Button, Chip, ConfirmDialog, Field, PageHeader, Spinner, inputCls, toast } from '../components/ui';
import { titleWordStatus } from '../lib/util';
import { remaining } from '../lib/queries';
import type { Category, CountdownEvent } from '../lib/types';
import { CATEGORY_LABEL, todayISO, uuid } from '../lib/util';
import { MediaError, processPhoto } from '../services/media';
import { useData } from '../store/data';

export default function CountdownScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const { countdowns, saveCountdown, removeCountdown, status } = useData();
  const isNew = id === 'new';
  const existing = countdowns.find((c) => c.id === id);
  const newId = useMemo(() => uuid(), []);
  const [form, setForm] = useState<CountdownEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (form) return;
    if (isNew) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      setForm({ id: newId, title: '', datetime: `${todayISO(d)}T18:00`, coverBlobId: null, description: '', category: 'meeting', memoryId: null, createdAt: new Date().toISOString() });
    } else if (existing) setForm({ ...existing });
  }, [isNew, existing, form, newId]);

  if (!form) {
    if (!isNew && status === 'ready') return <Page><PageHeader title="Событие" /><p className="text-muted">Событие не найдено.</p></Page>;
    return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
  }

  const set = (p: Partial<CountdownEvent>) => setForm({ ...form, ...p });
  const r = remaining(form.datetime);

  const pickCover = async (f: File) => {
    setBusy(true);
    try {
      const p = await processPhoto(f, f.name, form.id, 0);
      set({ coverBlobId: p.blobId });
    } catch (e) {
      toast(e instanceof MediaError ? e.message : 'Снимок не удалось добавить', 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Назовите событие';
    if (!form.datetime.slice(0, 10)) e.date = 'Укажите дату';
    setErrors(e);
    if (Object.keys(e).length) return;
    await saveCountdown({ ...form, title: form.title.trim() });
    toast('Событие сохранено', 'ok');
    nav(-1);
  };

  const titleHint = form.title.trim() && !titleWordStatus(form.title).ok ? 'Для будущего воспоминания название понадобится из 3–7 слов — его можно будет поправить.' : undefined;

  return (
    <Page>
      <PageHeader title={isNew ? 'Будущее событие' : 'Событие'} />
      <div className="flex flex-col gap-5 pb-10">
        <CountdownCard ev={form} large={false} />
        {r.past && !isNew && (
          <div className="flex flex-wrap gap-2">
            {form.memoryId ? (
              <Button variant="primary" icon={Play} onClick={() => nav(`/m/${form.memoryId}`)}>
                Открыть воспоминание
              </Button>
            ) : (
              <Button variant="primary" icon={CirclePlus} onClick={() => nav(`/create/relive?from=${form.id}`)}>
                Создать воспоминание
              </Button>
            )}
          </div>
        )}
        <Field label="Название" htmlFor="ctitle" error={errors.title} hint={titleHint}>
          <input id="ctitle" className={inputCls} value={form.title} onChange={(e) => set({ title: e.target.value })} aria-invalid={!!errors.title} placeholder="Например, поездка на Байкал" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата" htmlFor="cdate" error={errors.date}>
            <input id="cdate" type="date" className={inputCls} value={form.datetime.slice(0, 10)} onChange={(e) => set({ datetime: `${e.target.value}T${form.datetime.slice(11, 16) || '12:00'}` })} />
          </Field>
          <Field label="Время" htmlFor="ctime">
            <input id="ctime" type="time" className={inputCls} value={form.datetime.slice(11, 16)} onChange={(e) => set({ datetime: `${form.datetime.slice(0, 10)}T${e.target.value || '12:00'}` })} />
          </Field>
        </div>
        <Field label="Обложка">
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Выбрать обложку" onChange={(e) => e.target.files?.[0] && pickCover(e.target.files[0])} />
          <Button variant="outline" icon={ImagePlus} onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Готовлю снимок…' : form.coverBlobId ? 'Заменить обложку' : 'Выбрать обложку'}
          </Button>
        </Field>
        <Field label="Описание" htmlFor="cdesc">
          <textarea id="cdesc" rows={3} className={inputCls} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Категория">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
              <Chip key={c} active={form.category === c} onClick={() => set({ category: c })}>
                {CATEGORY_LABEL[c]}
              </Chip>
            ))}
          </div>
        </Field>
        <Button variant="primary" size="lg" icon={Save} onClick={save}>
          Сохранить событие
        </Button>
        {!isNew && (
          <Button variant="danger" icon={Trash} onClick={() => setConfirm(true)}>
            Удалить событие
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Удалить событие?"
        text={form.memoryId ? 'Событие исчезнет из Countdown. Созданное из него воспоминание останется в архиве.' : 'Событие и его обложка будут удалены.'}
        confirmLabel="Удалить"
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await removeCountdown(form.id);
          toast('Событие удалено', 'ok');
          nav('/create', { replace: true });
        }}
      />
    </Page>
  );
}
