/**
 * Фото дня — лента под живой обложкой редактора: выбор файлов, порядок (перетаскивание или стрелки),
 * обложка, удаление, описание для скринридера. Снимок выбирается касанием, действия с ним — под лентой.
 */
import { ArrowLeft, ArrowRight, Plus, Star, Trash } from 'lucide-react';
import { useRef, useState } from 'react';
import { useBlobUrl } from '../../hooks/useBlobUrl';
import type { PhotoRef } from '../../lib/types';
import { StorageFullError } from '../../services/db';
import { MediaError, processPhoto } from '../../services/media';
import { Spinner, inputCls } from '../ui';

interface Props {
  photos: PhotoRef[];
  coverId: string | null;
  owner: string;
  onChange: (photos: PhotoRef[], coverId: string | null) => void;
}

/** id скрытого поля выбора файлов: обложка редактора открывает его своей кнопкой. */
export const PHOTO_INPUT_ID = 'photo-input';

export function PhotosField({ photos, coverId, owner, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const errs: string[] = [];
    let list = [...photos];
    let cover = coverId;
    let i = 0;
    for (const f of Array.from(files)) {
      i++;
      setBusy(`Готовлю снимок ${i} из ${files.length}: проверяю, уменьшаю, считаю палитру…`);
      try {
        const p = await processPhoto(f, f.name, owner, list.length);
        list = [...list, p];
        if (!cover) cover = p.id;
        onChange(list, cover);
      } catch (e) {
        errs.push(e instanceof MediaError || e instanceof StorageFullError ? e.message : `«${f.name}»: не удалось обработать.`);
      }
    }
    setBusy(null);
    setErrors(errs);
    if (fileRef.current) fileRef.current.value = '';
  };

  const move = (id: string, dir: -1 | 1) => {
    const i = photos.findIndex((p) => p.id === id);
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next, coverId);
  };

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = photos.findIndex((p) => p.id === dragId);
    const to = photos.findIndex((p) => p.id === targetId);
    const next = [...photos];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next, coverId);
    setDragId(null);
  };

  const remove = (id: string) => {
    const next = photos.filter((p) => p.id !== id);
    setSelected(null);
    onChange(next, coverId === id ? (next[0]?.id ?? null) : coverId);
  };

  const sel = photos.find((p) => p.id === selected) ?? photos.find((p) => p.id === coverId) ?? photos[0];
  const si = sel ? photos.indexOf(sel) : -1;

  return (
    <div className="flex flex-col gap-3">
      <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" id={PHOTO_INPUT_ID} tabIndex={-1} onChange={(e) => add(e.target.files)} aria-label="Выбрать фото" />
      {busy && <Spinner label={busy} />}
      {errors.map((e) => (
        <p key={e} role="alert" className="rounded-xl bg-err/10 px-3 py-2 text-[13px] text-err">
          {e}
        </p>
      ))}
      {photos.length > 0 && (
        <ol className="flex gap-2 overflow-x-auto p-1 no-scrollbar" aria-label="Снимки дня в порядке истории">
          {photos.map((p, i) => (
            <StripThumb
              key={p.id}
              p={p}
              index={i}
              cover={p.id === coverId}
              selected={p.id === sel?.id}
              dragging={dragId === p.id}
              onSelect={() => setSelected(p.id)}
              onDragStart={() => setDragId(p.id)}
              onDrop={() => dropOn(p.id)}
            />
          ))}
          <li>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!!busy}
              aria-label="Добавить ещё снимки"
              className="grid h-[76px] w-[60px] place-items-center rounded-xl border-2 border-dashed border-line text-accent hover:border-accent"
            >
              <Plus size={22} aria-hidden="true" />
            </button>
          </li>
        </ol>
      )}
      {sel && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Действия со снимком ${si + 1}`}>
          <button
            type="button"
            onClick={() => onChange(photos, sel.id)}
            aria-pressed={sel.id === coverId}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[14px] ${sel.id === coverId ? 'bg-accent font-semibold text-night' : 'border border-line text-ink'}`}
          >
            <Star size={15} fill={sel.id === coverId ? 'currentColor' : 'none'} aria-hidden="true" />
            {sel.id === coverId ? 'Обложка' : 'Сделать обложкой'}
          </button>
          <span className="flex-1" />
          <button type="button" aria-label={`Снимок ${si + 1} раньше`} disabled={si === 0} onClick={() => move(sel.id, -1)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-raised disabled:opacity-30">
            <ArrowLeft size={18} />
          </button>
          <button type="button" aria-label={`Снимок ${si + 1} позже`} disabled={si === photos.length - 1} onClick={() => move(sel.id, 1)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-raised disabled:opacity-30">
            <ArrowRight size={18} />
          </button>
          <button type="button" aria-label={`Удалить снимок ${si + 1}`} onClick={() => remove(sel.id)} className="grid h-11 w-11 place-items-center rounded-full text-err hover:bg-err/10">
            <Trash size={18} />
          </button>
          <input
            value={sel.alt}
            onChange={(e) => onChange(photos.map((x) => (x.id === sel.id ? { ...x, alt: e.target.value } : x)), coverId)}
            aria-label={`Описание снимка ${si + 1} для скринридера`}
            placeholder="Что на снимке (для скринридера)"
            className={`${inputCls} basis-full !py-2 !text-[14px]`}
          />
        </div>
      )}
    </div>
  );
}

function StripThumb(props: { p: PhotoRef; index: number; cover: boolean; selected: boolean; dragging: boolean; onSelect: () => void; onDragStart: () => void; onDrop: () => void }) {
  const { p, index, cover, selected } = props;
  const url = useBlobUrl(p.thumbBlobId);
  return (
    <li draggable onDragStart={props.onDragStart} onDragOver={(e) => e.preventDefault()} onDrop={props.onDrop} className={props.dragging ? 'opacity-50' : ''}>
      <button
        type="button"
        onClick={props.onSelect}
        aria-pressed={selected}
        aria-label={`Снимок ${index + 1}${cover ? ', обложка' : ''}${p.alt ? `: ${p.alt}` : ''}`}
        className={`relative block h-[76px] w-[60px] overflow-hidden rounded-xl bg-night ${selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-night' : 'ring-1 ring-white/10'}`}
      >
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        <span className="absolute left-1 top-1 rounded-md bg-black/60 px-1 text-[11px] font-semibold text-white">{index + 1}</span>
        {cover && (
          <span className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-night">
            <Star size={11} fill="currentColor" aria-hidden="true" />
          </span>
        )}
      </button>
    </li>
  );
}
