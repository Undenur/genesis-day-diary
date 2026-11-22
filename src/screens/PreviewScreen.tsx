/** Предпросмотр собранного RE:LIVE: правка названия, возврат к данным, атомарное сохранение. */
import { Pencil, Save, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { ParamBars } from '../components/relive/WhySheet';
import { Player } from '../components/relive/Player';
import { Button, Field, Sheet, Spinner, inputCls, toast } from '../components/ui';
import { titleWordStatus } from '../lib/util';
import { StorageFullError } from '../services/db';
import { toMemory } from '../services/pipeline';
import { useData } from '../store/data';
import { useDraft } from '../store/draft';

export default function PreviewScreen() {
  const nav = useNavigate();
  const { loaded, load, input, generation, setGeneration, memoryId, setStep } = useDraft();
  const { saveMemory, saveCountdown, countdowns } = useData();
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState('');

  useEffect(() => {
    load();
  }, [load]);

  if (!loaded) return <div className="grid min-h-dvh place-items-center"><Spinner label="Открываю предпросмотр…" /></div>;
  // После сохранения черновик очищается — не уводим обратно в мастер.
  if (!generation) return saving ? null : <Navigate to="/create/relive" replace />;

  const status = titleWordStatus(title);

  const save = async () => {
    if (saving) return; // повторное нажатие не создаёт дубль
    setSaving(true);
    try {
      const memory = toMemory(memoryId, input, generation);
      await saveMemory(memory, { clearDraft: true });
      if (input.countdownId) {
        const ev = countdowns.find((c) => c.id === input.countdownId);
        if (ev) await saveCountdown({ ...ev, memoryId });
      }
      toast(`«${memory.title}» сохранено в архив`, 'ok');
      nav(`/m/${memoryId}`, { replace: true, state: { fromSave: true } });
      await useDraft.getState().reset();
    } catch (e) {
      setSaving(false);
      toast(e instanceof StorageFullError ? e.message : `Не удалось сохранить: ${(e as Error).message}. Черновик на месте.`, 'error');
    }
  };

  return (
    <>
      <Player
        input={input}
        generation={generation}
        onClose={() => {
          setStep(6);
          nav('/create/relive');
        }}
        actions={
          <>
            <Button variant="outline" icon={Undo2} onClick={() => { setStep(1); nav('/create/relive'); }} aria-label="Вернуться к исходным данным" className="flex-none px-3">
              <span className="hidden sm:inline">К данным</span>
            </Button>
            <Button variant="secondary" icon={Pencil} onClick={() => { setTitle(generation.title); setEditTitle(true); }} className="flex-none px-3" aria-label="Изменить название">
              <span className="hidden sm:inline">Название</span>
            </Button>
            <Button variant="primary" icon={saving ? undefined : Save} block onClick={save} disabled={saving}>
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          </>
        }
        side={
          <div className="rounded-[20px] bg-card p-5">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">Предпросмотр</p>
            <h2 className="font-title mt-2 text-[26px] leading-tight">{generation.title}</h2>
            <p className="mt-1 text-[13px] text-muted">{generation.titleSource === 'author' ? 'Название автора' : 'Название предложил генератор'}</p>
            <div className="mt-5">
              <ParamBars g={generation} compact />
            </div>
          </div>
        }
      />
      <Sheet open={editTitle} onClose={() => setEditTitle(false)} title="Название дня">
        <Field label="От 3 до 7 слов" htmlFor="ptitle" error={title.trim() && !status.ok ? status.message : null} hint={status.ok ? `✓ ${status.message}` : undefined}>
          <input id="ptitle" className={`${inputCls} font-title`} value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!status.ok} />
        </Field>
        {generation.suggestedTitle !== title && (
          <button type="button" className="mt-3 text-[14px] text-accent underline underline-offset-4" onClick={() => setTitle(generation.suggestedTitle)}>
            Вернуть вариант генератора: «{generation.suggestedTitle}»
          </button>
        )}
        <Button
          variant="primary"
          block
          className="mt-5"
          disabled={!status.ok}
          onClick={() => {
            setGeneration({ ...generation, title: title.trim(), titleSource: title.trim() === generation.suggestedTitle ? 'generator' : 'author' });
            useDraft.setState((s) => ({ input: { ...s.input, title: title.trim() } }));
            setEditTitle(false);
          }}
        >
          Применить
        </Button>
      </Sheet>
    </>
  );
}
