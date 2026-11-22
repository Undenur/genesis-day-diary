/**
 * Звук на карточке архива: короткое прослушивание песни дня (файл или синтез).
 * Предпрослушивание — один из владельцев звука (audioOwner): открытие истории или другая карточка
 * его останавливают, в том числе пока файл ещё загружается — устаревшая загрузка уже не заиграет.
 */
import { create } from 'zustand';
import type { Memory } from '../lib/types';
import { hashString } from '../lib/util';
import { claimAudio, ownsAudio, releaseAudio } from './audioOwner';
import { getBlob } from './db';
import { SynthEngine } from './synth';

interface PreviewState {
  playingId: string | null;
  toggle: (m: Memory) => Promise<void>;
  stop: () => void;
}

let el: HTMLAudioElement | null = null;
let url: string | null = null;
let ctx: AudioContext | null = null;
let synth: SynthEngine | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let token = 0;

function cleanup() {
  if (timer) clearTimeout(timer);
  timer = null;
  el?.pause();
  if (el) el.removeAttribute('src');
  el = null;
  if (url) URL.revokeObjectURL(url);
  url = null;
  synth?.stop();
  synth = null;
}

export const usePreviewSound = create<PreviewState>()((set, get) => {
  /** Остановка по требованию другого владельца (история, другая карточка). */
  const onPreempt = () => {
    cleanup();
    set({ playingId: null });
  };

  return {
    playingId: null,
    stop: () => {
      releaseAudio(token);
      onPreempt();
    },
    toggle: async (m) => {
      const was = get().playingId;
      if (was === m.id) {
        get().stop();
        return;
      }
      cleanup();
      const my = claimAudio('preview', onPreempt);
      token = my;
      set({ playingId: m.id });
      const blob = m.song?.source === 'file' && m.song.fileBlobId ? await getBlob(m.song.fileBlobId) : null;
      if (!ownsAudio(my)) return; // пока файл грузился, звук перехватили
      if (blob) {
        url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        el = audio;
        audio.volume = 0.8;
        audio.onended = () => ownsAudio(my) && get().stop();
        try {
          await audio.play();
        } catch {
          if (ownsAudio(my)) get().stop();
          return;
        }
        if (!ownsAudio(my)) audio.pause(); // перехватили во время play()
      } else {
        ctx = ctx ?? new AudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        if (!ownsAudio(my)) return;
        const p = m.generation.song;
        synth = new SynthEngine(ctx, ctx.destination, {
          bpm: p?.bpm ?? Math.round(60000 / m.generation.beatMs),
          energy: p?.energy ?? 0.4,
          scale: p?.scale ?? 'minor',
          texture: p?.texture ?? 'ambient',
          seed: hashString(m.generation.inputHash),
        });
        synth.start(0);
      }
      timer = setTimeout(() => ownsAudio(my) && get().stop(), 20000);
    },
  };
});
