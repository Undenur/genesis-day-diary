/** Песня дня: режимы «Файл», «Ссылка», «Описание». Явно показываем, что будет звучать. */
import { AudioLines, EighthNotes, ExternalLink, FileMusic, Link, Pencil, Trash } from 'lucide-react';
import { useRef, useState } from 'react';
import { buildSongProfile, classifyLink } from '../../engine/audioAnalysis';
import type { Scale, SongInput } from '../../lib/types';
import { uuid } from '../../lib/util';
import { putBlob, StorageFullError } from '../../services/db';
import { DEMO_TRACKS, renderDemoTrack } from '../../services/demo';
import { analyzeAudioBlob, MAX_AUDIO_BYTES, MediaError } from '../../services/media';
import { Chip, Field, Segmented, Spinner, inputCls } from '../ui';

interface Props {
  song: SongInput | null;
  owner: string;
  onChange: (s: SongInput | null) => void;
}

const empty = (source: SongInput['source']): SongInput => ({ source, title: '', artist: '', genre: '', mood: '' });

export function SongField({ song, owner, onChange }: Props) {
  const s = song ?? empty('file');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<SongInput>) => onChange({ ...s, ...patch });

  const attach = async (blob: Blob, name: string, meta: Partial<SongInput> = {}) => {
    setErr(null);
    if (blob.size > MAX_AUDIO_BYTES) {
      setErr(`Файл больше 40 МБ (${(blob.size / 1048576).toFixed(1)} МБ).`);
      return;
    }
    setBusy('Измеряю громкость, пики и темп…');
    try {
      const audio = await analyzeAudioBlob(blob);
      const fileBlobId = await putBlob(blob, owner, `audio-${uuid()}`);
      const title = meta.title ?? (s.title || name.replace(/\.[^.]+$/, ''));
      onChange({ ...s, ...meta, source: 'file', title, fileBlobId, fileName: name, fileType: blob.type, audio });
    } catch (e) {
      setErr(e instanceof MediaError || e instanceof StorageFullError ? e.message : 'Файл не удалось прочитать.');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const pickDemo = async (key: string) => {
    const t = DEMO_TRACKS.find((d) => d.key === key)!;
    setBusy('Рендерю демо-трек…');
    const wav = await renderDemoTrack(t);
    await attach(wav, `${t.title}.wav`, { title: t.title, artist: 'MOMENTA Demo', genre: t.genre, mood: t.mood, scale: t.scale, bpm: undefined });
  };

  const profile = song && (song.title || song.genre || song.mood || song.fileBlobId || song.url || song.bpm) ? buildSongProfile(song) : null;
  const linkKind = s.url ? classifyLink(s.url) : null;
  const genreMood = (
    <>
      <Field label="Жанр" htmlFor="song-genre">
        <input id="song-genre" className={inputCls} value={s.genre} onChange={(e) => set({ genre: e.target.value })} placeholder="фортепиано, электроника, рок…" />
      </Field>
      <Field label="Характер звучания" htmlFor="song-mood">
        <input id="song-mood" className={inputCls} value={s.mood} onChange={(e) => set({ mood: e.target.value })} placeholder="тихое, энергичное, мечтательное…" />
      </Field>
    </>
  );

  const plays =
    !song
      ? null
      : s.source === 'file' && s.fileBlobId
        ? { real: true, text: `Будет звучать оригинальный файл «${s.fileName}»` }
        : s.source === 'link' && linkKind === 'audio'
          ? { real: true, text: 'Будет звучать трек по прямой ссылке. Если ссылка не ответит за 8 секунд — включится синтез.' }
          : s.source === 'link' && s.url
            ? { real: false, text: 'Это страница музыкального сервиса: в карточке будет кнопка «Открыть оригинал», а в истории — синтез MOMENTA по описанию.' }
            : { real: false, text: 'Файла нет — синтез MOMENTA соберёт композицию по BPM, энергии и ладу из описания.' };

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Источник песни"
        value={s.source}
        onChange={(source) => onChange({ ...s, source })}
        options={[
          { value: 'file', label: 'Файл', icon: FileMusic },
          { value: 'link', label: 'Ссылка', icon: Link },
          { value: 'description', label: 'Описание', icon: Pencil },
        ]}
      />

      {s.source === 'file' && (
        <div className="flex flex-col gap-3">
          <input ref={fileRef} type="file" accept="audio/*" className="sr-only" aria-label="Выбрать аудиофайл" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0], e.target.files[0].name)} />
          {s.fileBlobId ? (
            <div className="flex items-center gap-3 rounded-[18px] bg-card p-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-raised text-accent">
                <EighthNotes size={22} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 text-[14px]">
                <p className="truncate font-semibold">{s.fileName}</p>
                {s.audio && (
                  <p className="text-muted">
                    {Math.round(s.audio.durationSec)} с · {s.audio.bpm ? `${s.audio.bpm} BPM (уверенность ${Math.round(s.audio.bpmConfidence * 100)}%)` : 'темп не определён'} · энергия {Math.round(s.audio.energy * 100)}
                  </p>
                )}
              </div>
              <button type="button" aria-label="Убрать файл" className="grid h-11 w-11 place-items-center rounded-full text-err hover:bg-err/10" onClick={() => onChange({ ...s, fileBlobId: undefined, fileName: undefined, audio: undefined })}>
                <Trash size={18} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-[72px] items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-line px-4 text-[15px] font-semibold hover:border-accent">
              <FileMusic size={22} className="text-accent" aria-hidden="true" /> Выбрать аудиофайл
            </button>
          )}
          <div>
            <p className="mb-2 text-[13px] text-muted">Или возьмите демо-трек (создан синтезом MOMENTA, звучит как обычный файл):</p>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {DEMO_TRACKS.map((t) => (
                <Chip key={t.key} icon={AudioLines} onClick={() => pickDemo(t.key)}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      )}

      {s.source === 'link' && (
        <Field label="Ссылка на трек" htmlFor="song-url" hint="Прямая ссылка на .mp3/.ogg/.wav или страница Spotify, Яндекс Музыки, YouTube…">
          <input id="song-url" type="url" inputMode="url" className={inputCls} placeholder="https://…" value={s.url ?? ''} onChange={(e) => set({ url: e.target.value.trim() })} />
          {s.url && linkKind === 'service' && (
            <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-2 text-[14px] text-accent">
              <ExternalLink size={16} aria-hidden="true" /> Открыть оригинал
            </a>
          )}
        </Field>
      )}

      {busy && <Spinner label={busy} />}
      {err && (
        <p role="alert" className="rounded-xl bg-err/10 px-3 py-2 text-[13px] text-err">
          {err}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Название" htmlFor="song-title">
          <input id="song-title" className={inputCls} value={s.title} onChange={(e) => set({ title: e.target.value })} placeholder="Например, «Капли на стекле»" />
        </Field>
        <Field label="Исполнитель" htmlFor="song-artist">
          <input id="song-artist" className={inputCls} value={s.artist} onChange={(e) => set({ artist: e.target.value })} />
        </Field>
        {s.source === 'description' && genreMood}
      </div>
      {/* Дополнительные поля — по необходимости: для файла темп измеряется сам */}
      <details open={!!(s.year || s.bpm || s.scale) || undefined} className="rounded-[18px] bg-card px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold">
          {s.source === 'description' ? 'Год, темп и лад' : 'Жанр, темп и лад'}
          <span className="text-[13px] font-normal text-muted">по желанию</span>
        </summary>
        <div className="mt-3 flex flex-col gap-3 pb-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {s.source !== 'description' && genreMood}
            <Field label="Год" htmlFor="song-year">
              <input id="song-year" type="number" inputMode="numeric" min={1900} max={2100} className={inputCls} value={s.year ?? ''} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label="BPM" htmlFor="song-bpm" hint="Ручной BPM важнее измерения">
              <input id="song-bpm" type="number" inputMode="numeric" min={40} max={220} className={inputCls} value={s.bpm ?? ''} onChange={(e) => set({ bpm: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
          </div>
          <Field label="Лад">
            <div className="flex gap-2">
              {([['', 'Не знаю'], ['major', 'Мажор'], ['minor', 'Минор']] as const).map(([v, l]) => (
                <Chip key={v} active={(s.scale ?? '') === v} onClick={() => set({ scale: (v || undefined) as Scale | undefined })}>
                  {l}
                </Chip>
              ))}
            </div>
          </Field>
        </div>
      </details>

      {plays && (
        <div className={`rounded-2xl px-4 py-3 text-[14px] ${plays.real ? 'bg-ok/10 text-ok' : 'bg-raised text-ink'}`} role="status">
          <p className="font-semibold">{plays.real ? '♪ Оригинальный трек' : '∿ Синтез MOMENTA'}</p>
          <p className={plays.real ? '' : 'text-muted'}>{plays.text}</p>
          {profile && (
            <p className="mt-1 text-muted">
              {profile.bpm} BPM ({profile.bpmSource === 'manual' ? 'вручную' : profile.bpmSource === 'measured' ? 'измерено' : profile.bpmSource === 'description' ? 'по описанию' : 'по умолчанию'}) · энергия {Math.round(profile.energy * 100)} · {profile.scale === 'major' ? 'мажор' : 'минор'}
            </p>
          )}
        </div>
      )}
      {song && (
        <button type="button" className="self-start text-[14px] text-muted underline underline-offset-4" onClick={() => onChange(null)}>
          Убрать песню
        </button>
      )}
    </div>
  );
}
