/** Share Again: предпросмотр настоящей карточки и состав передаваемых данных перед отправкой. */
import { Download, Lock, Share } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Page } from '../components/Layout';
import { Button, EmptyState, PageHeader, Spinner, toast } from '../components/ui';
import { renderShareCard, shareItems, shareMemory, type ShareOptions } from '../services/share';
import { useData } from '../store/data';

export default function ShareScreen() {
  const { id } = useParams();
  const m = useData((s) => s.memories.find((x) => x.id === id));
  const [o, setO] = useState<ShareOptions>({ includeQuote: true, includePlace: true, includeCoords: false, includeVoice: false });
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!m) return;
    let url: string | null = null;
    let alive = true;
    renderShareCard(m, o).then((b) => {
      if (!alive) return;
      url = URL.createObjectURL(b);
      setPreview(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [m, o]);

  if (!m)
    return (
      <Page>
        <PageHeader title="Share Again" />
        <EmptyState icon={Share} title="День не найден" />
      </Page>
    );

  const canFiles = typeof navigator !== 'undefined' && !!navigator.canShare;
  const toggle = (k: keyof ShareOptions, label: string, note: string, disabled = false) => (
    <label className={`flex min-h-12 items-start gap-3 py-2 ${disabled ? 'opacity-45' : ''}`}>
      <input type="checkbox" className="mt-1 h-5 w-5 accent-[#91A9D1]" checked={o[k]} disabled={disabled} onChange={(e) => setO({ ...o, [k]: e.target.checked })} />
      <span>
        <span className="block text-[15px]">{label}</span>
        <span className="block text-[13px] text-muted">{note}</span>
      </span>
    </label>
  );

  return (
    <Page wide>
      <PageHeader title="Share Again" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="mx-auto w-full max-w-[420px]">
          {preview ? <img src={preview} alt={`Карточка для отправки: ${m.title}`} className="w-full rounded-[20px] shadow-2xl" /> : <div className="grid aspect-[4/5] place-items-center rounded-[20px] bg-card"><Spinner label="Рисую карточку…" /></div>}
        </div>
        <div className="flex flex-col gap-5">
          <section className="rounded-[20px] bg-card p-4">
            <h2 className="mb-1 text-[16px] font-semibold">Что добавить</h2>
            {toggle('includeQuote', 'Фраза из записи', m.generation.captions[0] ? `«${m.generation.captions[0]}»` : 'В записи нет короткой фразы', !m.generation.captions[0])}
            {toggle('includePlace', 'Название места', m.place?.name || 'Место не указано', !m.place?.name)}
            {toggle('includeCoords', 'Точные координаты', 'Отдельный выбор: координаты раскрывают, где вы были', m.place?.lat == null)}
            {toggle('includeVoice', 'Голосовая заметка', m.voice ? 'Отдельный файл рядом с карточкой' : 'В этом дне нет голоса', !m.voice)}
          </section>
          <section className="rounded-[20px] bg-card p-4">
            <h2 className="mb-2 text-[16px] font-semibold">Будет передано</h2>
            <ul className="list-disc pl-5 text-[14px] leading-relaxed">
              {shareItems(m, o).map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-[13px] text-muted">
              <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> Исходный день остаётся личным: его ID, дата, текст и медиа не меняются, копия в архиве не создаётся.
            </p>
          </section>
          <Button
            variant="primary"
            size="lg"
            icon={canFiles ? Share : Download}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await shareMemory(m, o);
                if (r === 'download') toast('PNG сохранён в загрузки', 'ok');
                if (r === 'share') toast('Карточка отправлена', 'ok');
              } catch (e) {
                toast(`Не получилось: ${(e as Error).message}`, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Готовлю…' : canFiles ? 'Поделиться' : 'Скачать PNG'}
          </Button>
          {canFiles && <p className="-mt-3 text-center text-[13px] text-muted">Если системное меню не поддерживает файлы, PNG скачается.</p>}
        </div>
      </div>
    </Page>
  );
}
