/** Voice Note: запись до 90 секунд, таймер, остановка, прослушивание, перезапись, удаление. Без микрофона — готовый файл или пропуск. */
import { FileMusic, Mic, Pause, Play, RotateCcw, Square, Trash } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useBlobUrl } from '../../hooks/useBlobUrl';
import type { VoiceNoteRef } from '../../lib/types';
import { uuid } from '../../lib/util';
import { putBlob } from '../../services/db';
import { Button } from '../ui';

export const VOICE_LIMIT = 90;

interface Props {
  voice: VoiceNoteRef | null;
  owner: string;
  onChange: (v: VoiceNoteRef | null) => void;
}

export function VoiceField({ voice, owner, onChange }: Props) {
  const [state, setState] = useState<'idle' | 'asking' | 'recording' | 'denied' | 'unsupported'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const url = useBlobUrl(voice?.blobId);

  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  // Микрофон закрывается при уходе со страницы.
  useEffect(() => () => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
    cleanup();
    audioEl.current?.pause();
  }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('unsupported');
      return;
    }
    setState('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', ''].find((m) => !m || MediaRecorder.isTypeSupported(m)) ?? '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        const dur = Math.min(VOICE_LIMIT, (Date.now() - startedAt.current) / 1000);
        cleanup();
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        const blobId = await putBlob(blob, owner, `voice-${uuid()}`);
        onChange({ blobId, durationSec: Math.round(dur * 10) / 10, mime: blob.type, createdAt: new Date().toISOString() });
        setState('idle');
      };
      recRef.current = rec;
      startedAt.current = Date.now();
      setElapsed(0);
      rec.start(250);
      setState('recording');
      timer.current = setInterval(() => {
        const s = (Date.now() - startedAt.current) / 1000;
        setElapsed(s);
        if (s >= VOICE_LIMIT) rec.stop();
      }, 200);
    } catch {
      cleanup();
      setState('denied');
    }
  };

  const stop = () => recRef.current?.state === 'recording' && recRef.current.stop();

  const togglePlay = () => {
    if (!url) return;
    if (!audioEl.current) {
      audioEl.current = new Audio(url);
      audioEl.current.onended = () => setPlaying(false);
    }
    if (audioEl.current.src !== url) audioEl.current.src = url;
    if (playing) {
      audioEl.current.pause();
      setPlaying(false);
    } else {
      audioEl.current.currentTime = 0;
      audioEl.current.play();
      setPlaying(true);
    }
  };

  const remove = () => {
    audioEl.current?.pause();
    setPlaying(false);
    onChange(null);
  };

  const attachFile = async (f: File) => {
    const dur = await new Promise<number>((res) => {
      const a = new Audio(URL.createObjectURL(f));
      a.onloadedmetadata = () => {
        res(a.duration);
        URL.revokeObjectURL(a.src);
      };
      a.onerror = () => res(0);
    });
    const blobId = await putBlob(f, owner, `voice-${uuid()}`);
    onChange({ blobId, durationSec: Math.min(VOICE_LIMIT, Math.round(dur * 10) / 10), mime: f.type, createdAt: new Date().toISOString() });
    setState('idle');
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="flex flex-col gap-3">
      <input ref={fileRef} type="file" accept="audio/*" className="sr-only" aria-label="Выбрать аудиофайл голосовой заметки" onChange={(e) => e.target.files?.[0] && attachFile(e.target.files[0])} />

      {state === 'recording' ? (
        <div className="flex flex-col items-center gap-3 rounded-[18px] bg-card p-5" role="status">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-err">
            <span className="h-3 w-3 animate-pulse rounded-full bg-err" aria-hidden="true" /> Идёт запись
          </span>
          <span className="tabular-nums text-[34px] font-semibold">
            {fmt(elapsed)} <span className="text-[16px] text-muted">/ {fmt(VOICE_LIMIT)}</span>
          </span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-night">
            <div className="h-full bg-err" style={{ width: `${(elapsed / VOICE_LIMIT) * 100}%` }} />
          </div>
          <Button variant="primary" icon={Square} onClick={stop} size="lg">
            Остановить
          </Button>
        </div>
      ) : voice ? (
        <div className="flex items-center gap-3 rounded-[18px] bg-card p-3">
          <button type="button" onClick={togglePlay} aria-label={playing ? 'Пауза' : 'Прослушать заметку'} className="grid h-12 w-12 place-items-center rounded-full bg-accent text-night">
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <div className="flex-1 text-[14px]">
            <p className="font-semibold">Голосовая заметка</p>
            <p className="text-muted">{voice.durationSec.toLocaleString('ru-RU')} с · сохранена локально</p>
          </div>
          <button type="button" aria-label="Перезаписать" onClick={start} className="grid h-11 w-11 place-items-center rounded-full hover:bg-raised">
            <RotateCcw size={19} />
          </button>
          <button type="button" aria-label="Удалить заметку" onClick={remove} className="grid h-11 w-11 place-items-center rounded-full text-err hover:bg-err/10">
            <Trash size={19} />
          </button>
        </div>
      ) : (
        <Button variant="secondary" icon={Mic} size="lg" onClick={start} disabled={state === 'asking'}>
          {state === 'asking' ? 'Жду разрешения микрофона…' : 'Записать голос'}
        </Button>
      )}

      {(state === 'denied' || state === 'unsupported') && (
        <div role="alert" className="rounded-2xl bg-warn/10 px-4 py-3 text-[14px] text-warn">
          <p className="font-semibold">{state === 'denied' ? 'Доступ к микрофону не получен' : 'Запись голоса в этом браузере недоступна'}</p>
          <p className="mt-1 text-ink/90">Можно прикрепить готовый аудиофайл или пропустить шаг — день сохранится и без голоса.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={FileMusic} onClick={() => fileRef.current?.click()}>
              Выбрать аудиофайл
            </Button>
          </div>
        </div>
      )}
      {!voice && state === 'idle' && (
        <button type="button" onClick={() => fileRef.current?.click()} className="self-start text-[14px] text-muted underline underline-offset-4">
          Или прикрепить готовую запись
        </button>
      )}
      <p className="text-[13px] text-muted">Одна личная заметка до 90 секунд. Микрофон включается только по кнопке и закрывается после остановки.</p>
    </div>
  );
}
