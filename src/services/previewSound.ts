/**
 * Предпрослушивание: карточка архива и выбор настроения в редакторе.
 * — Один владелец звука (audioOwner): открытие истории или другая карточка останавливают предпрослушивание,
 *   в том числе пока файл ещё загружается — устаревшая загрузка уже не заиграет.
 * — Если предпрослушивание уже звучит, переключение источника идёт мягким кроссфейдом;
 *   при быстрых нажатиях звучит только последний выбор.
 * Источник для карточки выбирает musicSource.resolveMusic — так же, как в RE:LIVE.
 */
import { create } from 'zustand';
import type { Memory } from '../lib/types';
import { claimAudio, ownsAudio, releaseAudio } from './audioOwner';
import { getBlob } from './db';
import { resolveMusic } from './musicSource';

export type PreviewSrc = { url: string; fallbackUrl?: string } | { blobId: string };

interface PreviewState {
  /** Ключ того, что звучит: id дня или 'editor' */
  playingId: string | null;
  toggle: (m: Memory) => Promise<void>;
  /** Запустить (или мягко переключить) источник под ключом */
  play: (key: string, src: PreviewSrc) => Promise<void>;
  stop: () => void;
}

const FADE_IN = 450;
const FADE_OUT = 320;
const VOLUME = 0.85;
const LIMIT_MS = 30000;

interface Voice {
  el: HTMLAudioElement;
  url: string | null; // созданный blob-URL, освобождается после остановки
  fade: ReturnType<typeof setInterval> | null;
}

let current: Voice | null = null;
let token = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function ramp(v: Voice, to: number, ms: number, done?: () => void) {
  if (v.fade) clearInterval(v.fade);
  const from = v.el.volume;
  const steps = Math.max(1, Math.round(ms / 30));
  let i = 0;
  v.fade = setInterval(() => {
    i++;
    v.el.volume = Math.max(0, Math.min(1, from + ((to - from) * i) / steps));
    if (i >= steps) {
      if (v.fade) clearInterval(v.fade);
      v.fade = null;
      done?.();
    }
  }, 30);
}

function release(v: Voice | null, fadeMs = 0) {
  if (!v) return;
  const end = () => {
    v.el.pause();
    v.el.removeAttribute('src');
    if (v.url) URL.revokeObjectURL(v.url);
  };
  if (fadeMs > 0 && !v.el.paused) ramp(v, 0, fadeMs, end);
  else {
    if (v.fade) clearInterval(v.fade);
    end();
  }
}

export const usePreviewSound = create<PreviewState>()((set, get) => {
  /** Остановка по требованию другого владельца (история, другая карточка). */
  const onPreempt = () => {
    if (timer) clearTimeout(timer);
    release(current);
    current = null;
    set({ playingId: null });
  };

  const play = async (key: string, src: PreviewSrc) => {
    const wasPlaying = !!current && !current.el.paused;
    const prev = current;
    current = null;
    // Перехват владельца: если звучало наше же предпрослушивание — уводим его мягко, без резкого стопа.
    const my = claimAudio('preview', onPreempt);
    release(prev, wasPlaying ? FADE_OUT : 0);
    token = my;
    set({ playingId: key });
    let url: string;
    let created: string | null = null;
    if ('blobId' in src) {
      const blob = await getBlob(src.blobId);
      if (!ownsAudio(my)) return; // пока файл грузился, звук перехватили
      if (!blob) {
        get().stop();
        return;
      }
      created = url = URL.createObjectURL(blob);
    } else url = src.url;
    const el = new Audio(url);
    const v: Voice = { el, url: created, fade: null };
    el.volume = 0;
    el.onended = () => ownsAudio(my) && get().stop();
    current = v;
    try {
      await el.play();
    } catch {
      if (!ownsAudio(my)) return;
      // Ссылка не играет — пробуем запасной трек настроения.
      if ('url' in src && src.fallbackUrl && src.fallbackUrl !== src.url) {
        release(v);
        await play(key, { url: src.fallbackUrl });
        return;
      }
      get().stop();
      return;
    }
    if (!ownsAudio(my)) {
      release(v);
      return;
    }
    ramp(v, VOLUME, FADE_IN);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => ownsAudio(my) && get().stop(), LIMIT_MS);
  };

  return {
    playingId: null,
    play,
    stop: () => {
      if (timer) clearTimeout(timer);
      releaseAudio(token);
      release(current, FADE_OUT);
      current = null;
      set({ playingId: null });
    },
    toggle: async (m) => {
      if (get().playingId === m.id) {
        get().stop();
        return;
      }
      const r = resolveMusic(m.song, m.mood, m.text);
      const src: PreviewSrc = r.kind === 'file' && r.blobId ? { blobId: r.blobId } : { url: r.url ?? r.track.url, fallbackUrl: r.track.url };
      await play(m.id, src);
    },
  };
});
