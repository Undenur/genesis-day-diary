/** Фото дня: выбор файлов, миниатюры, порядок (перетаскивание или кнопки), обложка, удаление, описание для скринридера. */
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, Star, Trash } from 'lucide-react';
import { useRef, useState } from 'react';
import { useBlobUrl } from '../../hooks/useBlobUrl';
import type { PhotoRef } from '../../lib/types';
import { MediaError, processPhoto } from '../../services/media';
import { StorageFullError } from '../../services/db';
import { Spinner, inputCls } from '../ui';

interface Props {
  photos: PhotoRef[];
  coverId: string | null;
  owner: string;
  onChange: (photos: PhotoRef[], coverId: string | null) => void;
  invalid?: boolean;
}

export function PhotosField({ photos, coverId, owner, onChange, invalid }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

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
    onChange(next, coverId === id ? (next[0]?.id ?? null) : coverId);
  };

  return (
    <div className="flex flex-col gap-3">
      <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" id="photo-input" onChange={(e) => add(e.target.files)} aria-label="Выбрать фото" />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={!!busy}
        aria-invalid={invalid}
        className={`flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-[18px] border-2 border-dashed px-4 text-[15px] transition-colors ${invalid ? 'border-err text-err' : 'border-line text-ink hover:border-accent'}`}
      >
        <ImagePlus size={26} className="text-accent" aria-hidden="true" />
        <span className="font-semibold">{photos.length ? 'Добавить ещё снимки' : 'Выбрать фото'}</span>
        <span className="text-[13px] text-muted">JPG, PNG, WebP · до 30 МБ · можно несколько</span>
      </button>
      {busy && <Spinner label={busy} />}
      {errors.map((e) => (
        <p key={e} role="alert" className="rounded-xl bg-err/10 px-3 py-2 text-[13px] text-err">
          {e}
        </p>
      ))}
      {photos.length > 1 && <p className="text-[13px] text-muted">Порядок — как в истории. Перетащите карточку или используйте стрелки.</p>}
      <ol className="flex flex-col gap-2.5">
        {photos.map((p, i) => (
          <PhotoRow
            key={p.id}
            p={p}
            index={i}
            total={photos.length}
            cover={p.id === coverId}
            dragging={dragId === p.id}
            onDragStart={() => setDragId(p.id)}
            onDrop={() => dropOn(p.id)}
            onUp={() => move(p.id, -1)}
            onDown={() => move(p.id, 1)}
            onCover={() => onChange(photos, p.id)}
            onRemove={() => remove(p.id)}
            onAlt={(alt) => onChange(photos.map((x) => (x.id === p.id ? { ...x, alt } : x)), coverId)}
          />
        ))}
      </ol>
    </div>
  );
}

function PhotoRow(props: {
  p: PhotoRef;
  index: number;
  total: number;
  cover: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onUp: () => void;
  onDown: () => void;
  onCover: () => void;
  onRemove: () => void;
  onAlt: (s: string) => void;
}) {
  const { p, index, total, cover } = props;
  const url = useBlobUrl(p.thumbBlobId);
  return (
    <li
      draggable
      onDragStart={props.onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={props.onDrop}
      className={`flex gap-3 rounded-[18px] bg-card p-2.5 ${props.dragging ? 'opacity-50' : ''} ${cover ? 'ring-2 ring-accent' : ''}`}
    >
      <span className="flex cursor-grab items-center text-muted" aria-hidden="true">
        <GripVertical size={20} />
      </span>
      <div className="relative h-[84px] w-[64px] shrink-0 overflow-hidden rounded-xl bg-night">
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        <span className="absolute left-1 top-1 rounded-md bg-black/60 px-1.5 text-[11px] font-semibold text-white">{index + 1}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={props.onCover}
            aria-pressed={cover}
            className={`inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[13px] ${cover ? 'bg-accent font-semibold text-night' : 'border border-line text-muted'}`}
          >
            <Star size={15} fill={cover ? 'currentColor' : 'none'} aria-hidden="true" />
            {cover ? 'Обложка' : 'Сделать обложкой'}
          </button>
          <span className="flex-1" />
          <button type="button" aria-label={`Переместить снимок ${index + 1} выше`} disabled={index === 0} onClick={props.onUp} className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-raised disabled:opacity-30">
            <ArrowUp size={18} />
          </button>
          <button type="button" aria-label={`Переместить снимок ${index + 1} ниже`} disabled={index === total - 1} onClick={props.onDown} className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-raised disabled:opacity-30">
            <ArrowDown size={18} />
          </button>
          <button type="button" aria-label={`Удалить снимок ${index + 1}`} onClick={props.onRemove} className="grid h-11 w-11 place-items-center rounded-full text-err hover:bg-err/10">
            <Trash size={18} />
          </button>
        </div>
        <input
          value={p.alt}
          onChange={(e) => props.onAlt(e.target.value)}
          aria-label={`Описание снимка ${index + 1} для скринридера`}
          placeholder="Что на снимке"
          className={`${inputCls} !py-2 !text-[14px]`}
        />
      </div>
    </li>
  );
}
