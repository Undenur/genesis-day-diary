/**
 * «Своя музыка» — по желанию: свой аудиофайл или ссылка. У них приоритет над подборкой настроения.
 * Смена настроения файл не трогает; «Вернуться к подборке» возвращает композицию каталога.
 * Здесь же честно сказано, что именно прозвучит (тот же resolveMusic, что в RE:LIVE и архиве).
 */
import { EighthNotes, ExternalLink, FileMusic, Link, Trash, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { classifyLink } from '../../engine/audioAnalysis';
import { trackForMood, type MoodId } from '../../lib/catalog';
import type { SongInput } from '../../lib/types';
import { uuid } from '../../lib/util';
import { putBlob, StorageFullError } from '../../services/db';
import { analyzeAudioBlob, MAX_AUDIO_BYTES, MediaError } from '../../services/media';
import { catalogSong, effectiveMood, resolveMusic } from '../../services/musicSource';
import { Field, Segmented, Spinner, inputCls } from '../ui';

interface Props {
  song: SongInput | null;
  mood: MoodId | null | undefined;
  text: string;
  owner: string;
  onChange: (s: SongInput | null) => void;
}

type Own = 'file' | 'link';
const empty = (source: Own): SongInput => ({ source, title: '', artist: '', genre: '', mood: '' });

/** Есть ли у дня собственная музыка автора (а не композиция подборки). */
export function hasOwnMusic(song: SongInput | null) {
  return !!song && ((song.source === 'file' && !!song.fileBlobId) || (song.source === 'link' && !!song.url));
}

export function SongField({ song, mood, text, owner, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isOwn = song?.source === 'file' || song?.source === 'link';
  const [tab, setTab] = useState<Own>(song?.source === 'link' ? 'link' : 'file');
  const s = isOwn ? song! : empty(tab);
  const music = resolveMusic(song, mood, text);
  const backToCatalog = () => onChange(catalogSong(trackForMood(effectiveMood(null, mood, text))));

  const attach = async (blob: Blob, name: string) => {
    setErr(null);
    if (blob.size > MAX_AUDIO_BYTES) {
      setErr(`Файл больше 40 МБ (${(blob.size / 1048576).toFixed(1)} МБ).`);
      return;
    }
    setBusy('Измеряю громкость, пики и темп…');
    try {
      const audio = await analyzeAudioBlob(blob);
      const fileBlobId = await putBlob(blob, owner, `audio-${uuid()}`);
      onChange({ ...empty('file'), title: name.replace(/\.[^.]+$/, ''), fileBlobId, fileName: name, fileType: blob.type, audio });
    } catch (e) {
      setErr(e instanceof MediaError || e instanceof StorageFullError ? e.message : 'Файл не удалось прочитать.');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const setLink = (url: string) => {
    if (!url) return onChange(song?.source === 'link' ? null : song);
    onChange({ ...(song?.source === 'link' ? song : empty('link')), url });
  };

  const linkKind = s.source === 'link' && s.url ? classifyLink(s.url) : null;

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Своя музыка"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'file', label: 'Файл', icon: FileMusic },
          { value: 'link', label: 'Ссылка', icon: Link },
        ]}
      />

      {tab === 'file' && (
        <div className="flex flex-col gap-3">
          <input ref={fileRef} type="file" accept="audio/*" className="sr-only" aria-label="Выбрать аудиофайл" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0], e.target.files[0].name)} />
          {song?.source === 'file' && song.fileBlobId ? (
            <div className="flex items-center gap-3 rounded-[18px] bg-night p-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-raised text-accent">
                <EighthNotes size={22} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 text-[14px]">
                <p className="truncate font-semibold">{song.fileName || song.title}</p>
                {song.audio && (
                  <p className="text-muted">
                    {Math.round(song.audio.durationSec)} с · {song.audio.bpm ? `${song.audio.bpm} BPM` : 'темп не определён'} · энергия {Math.round(song.audio.energy * 100)}
                  </p>
                )}
              </div>
              <button type="button" aria-label="Убрать файл и вернуться к подборке" className="grid h-11 w-11 place-items-center rounded-full text-err hover:bg-err/10" onClick={backToCatalog}>
                <Trash size={18} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="flex min-h-[64px] items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-line px-4 text-[15px] font-semibold hover:border-accent">
              <FileMusic size={22} className="text-accent" aria-hidden="true" /> Выбрать MP3, WAV, OGG…
            </button>
          )}
        </div>
      )}

      {tab === 'link' && (
        <Field label="Ссылка на трек" htmlFor="song-url" hint="Прямая ссылка на .mp3/.ogg/.wav или страница Spotify, Яндекс Музыки, YouTube…">
          <input id="song-url" type="url" inputMode="url" className={inputCls} placeholder="https://…" value={song?.source === 'link' ? (song.url ?? '') : ''} onChange={(e) => setLink(e.target.value.trim())} />
        </Field>
      )}

      {isOwn && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Название трека" htmlFor="song-title">
            <input id="song-title" className={inputCls} value={s.title} onChange={(e) => onChange({ ...s, title: e.target.value })} />
          </Field>
          <Field label="Исполнитель" htmlFor="song-artist">
            <input id="song-artist" className={inputCls} value={s.artist} onChange={(e) => onChange({ ...s, artist: e.target.value })} />
          </Field>
        </div>
      )}

      {busy && <Spinner label={busy} />}
      {err && (
        <p role="alert" className="rounded-xl bg-err/10 px-3 py-2 text-[13px] text-err">
          {err}
        </p>
      )}

      <div className={`rounded-2xl px-4 py-3 text-[14px] ${music.note ? 'bg-warn/10' : 'bg-night'}`} role="status">
        <p className="font-semibold">♪ Прозвучит: {music.label}</p>
        {music.kind === 'link' && <p className="text-muted">Если ссылка не ответит, включится «{music.track.title}» из подборки — с того же места.</p>}
        {music.note && <p className="text-muted">{music.note}</p>}
        {linkKind === 'service' && s.url && (
          <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-2 text-accent">
            <ExternalLink size={16} aria-hidden="true" /> Открыть оригинал
          </a>
        )}
      </div>

      {(isOwn || song?.source === 'description') && (
        <button type="button" onClick={backToCatalog} className="inline-flex min-h-11 items-center gap-2 self-start text-[14px] text-accent underline-offset-4 hover:underline">
          <Undo2 size={16} aria-hidden="true" /> Вернуться к подборке
        </button>
      )}
    </div>
  );
}
