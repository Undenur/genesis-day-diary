/**
 * Звук истории RE:LIVE. Запускается только действием пользователя.
 * Музыка: локальный файл (HTML Audio + анализ Web Audio) → прямая ссылка (с тайм-аутом) → синтез MOMENTA.
 * Голос автора и системное чтение плавно приглушают музыку до 25% и возвращают уровень после завершения.
 *
 * Надёжность:
 * — история — владелец звука (audioOwner): её запуск останавливает предпрослушивание;
 * — каждый play() получает номер; после любого await устаревший вызов ничего не запускает;
 * — при ошибке ссылки синтез подхватывает текущую позицию истории (getPositionMs).
 */
import { classifyLink } from '../engine/audioAnalysis';
import type { SongInput, SongProfile } from '../lib/types';
import { hashString } from '../lib/util';
import { claimAudio, ownsAudio, releaseAudio } from './audioOwner';
import { probeAudioUrl } from './media';
import { SynthEngine } from './synth';

export type MusicMode = 'file' | 'link' | 'synth' | 'none';
type DuckReason = 'voice' | 'speech';

export interface AudioStatus {
  mode: MusicMode;
  label: string;
  note: string | null;
  serviceUrl: string | null;
}

export interface StoryAudioOptions {
  song: SongInput | null;
  profile: SongProfile | null;
  fileUrl: string | null;
  voiceUrl: string | null;
  fallbackBpm: number;
  seedText: string;
  /** Текущая позиция истории, мс — для подхвата синтезом */
  getPositionMs: () => number;
  /** Звук остановлен извне (другой владелец) — интерфейс должен показать паузу */
  onPreempt?: () => void;
}

export class StoryAudio {
  private o: StoryAudioOptions;
  private ctx: AudioContext | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private voiceEl: HTMLAudioElement | null = null;
  private musicGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private synth: SynthEngine | null = null;
  private buf = new Uint8Array(512);
  private musicVol = 0.8;
  private voiceVol = 1;
  private musicOn = true;
  private playing = false;
  private destroyed = false;
  private seq = 0;
  private token = 0;
  private ducks = new Set<DuckReason>();
  status: AudioStatus;
  onVoiceEnd: (() => void) | null = null;

  constructor(o: StoryAudioOptions) {
    this.o = o;
    this.status = this.initialStatus();
  }

  private initialStatus(): AudioStatus {
    const s = this.o.song;
    const name = s ? [s.title, s.artist].filter(Boolean).join(' — ') : '';
    if (s?.source === 'file' && this.o.fileUrl) return { mode: 'file', label: `Оригинальный трек · ${name || s.fileName}`, note: null, serviceUrl: null };
    if (s?.source === 'link' && s.url) {
      const kind = classifyLink(s.url);
      if (kind === 'audio') return { mode: 'link', label: `Трек по ссылке · ${name || 'аудио'}`, note: null, serviceUrl: s.url };
      return { mode: 'synth', label: this.synthLabel(), note: 'Страница музыкального сервиса не отдаёт звук напрямую — откройте оригинал или слушайте синтез.', serviceUrl: s.url };
    }
    return { mode: 'synth', label: this.synthLabel(), note: s ? 'Файла нет — звучит синтез по описанию трека.' : 'Песни нет — синтез играет в темпе, выведенном из текста.', serviceUrl: null };
  }

  private synthLabel() {
    const p = this.o.profile;
    return `Синтез MOMENTA · ${p?.bpm ?? this.o.fallbackBpm} BPM · ${p?.scale === 'major' ? 'мажор' : 'минор'}`;
  }

  /** Для прямой ссылки проверяем доступность заранее (с тайм-аутом). */
  async prepare(): Promise<AudioStatus> {
    if (this.status.mode === 'link' && this.o.song?.url) {
      const r = await probeAudioUrl(this.o.song.url, 8000);
      if (r !== 'ok' && !this.destroyed) this.fallbackToSynth(r === 'timeout' ? 'Ссылка не ответила за 8 секунд — включён синтез.' : 'Ссылка недоступна или не является аудио — включён синтез.');
    }
    return this.status;
  }

  private ensureCtx() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.targetMusicVolume();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.musicGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = this.voiceVol;
    this.voiceGain.connect(ctx.destination);

    if (this.status.mode === 'file' && this.o.fileUrl) {
      const el = new Audio(this.o.fileUrl);
      el.loop = true;
      el.preload = 'auto';
      ctx.createMediaElementSource(el).connect(this.musicGain);
      this.musicEl = el;
    } else if (this.status.mode === 'link' && this.o.song?.url) {
      // Чужой сервер может не разрешать CORS — играем напрямую, без анализа.
      const el = new Audio(this.o.song.url);
      el.loop = true;
      el.volume = this.targetMusicVolume();
      el.onerror = () => this.fallbackToSynth('Ссылка перестала отвечать — включён синтез.');
      this.musicEl = el;
    }
    if (this.o.voiceUrl) {
      const v = new Audio(this.o.voiceUrl);
      v.preload = 'auto';
      ctx.createMediaElementSource(v).connect(this.voiceGain);
      v.onended = () => this.endVoice();
      v.onerror = () => this.endVoice();
      this.voiceEl = v;
    }
    return ctx;
  }

  private endVoice() {
    this.duck('voice', false);
    this.onVoiceEnd?.();
  }

  private fallbackToSynth(note: string) {
    this.musicEl?.pause();
    if (this.musicEl) this.musicEl.removeAttribute('src');
    this.musicEl = null;
    this.status = { ...this.status, mode: 'synth', label: this.synthLabel(), note };
    if (this.playing) this.startSynth(this.o.getPositionMs() / 1000);
  }

  private startSynth(offsetSec: number) {
    if (!this.ctx || !this.musicGain) return;
    this.synth?.stop();
    const p = this.o.profile;
    this.synth = new SynthEngine(this.ctx, this.musicGain, {
      bpm: p?.bpm ?? this.o.fallbackBpm,
      energy: p?.energy ?? 0.4,
      scale: p?.scale ?? 'minor',
      texture: p?.texture ?? 'ambient',
      seed: hashString(this.o.seedText),
    });
    this.synth.start(offsetSec);
  }

  /** Запуск с позиции atMs. Устаревший вызов (после pause/повторного play) ничего не включит. */
  async play(atMs: number) {
    if (this.destroyed) return;
    const seq = ++this.seq;
    this.playing = true;
    if (!ownsAudio(this.token)) {
      this.token = claimAudio('story', () => {
        this.pause();
        this.o.onPreempt?.();
      });
    }
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    if (seq !== this.seq || !this.playing || this.destroyed) return;
    const sec = atMs / 1000;
    if (this.musicEl) {
      const el = this.musicEl;
      const d = el.duration;
      el.currentTime = Number.isFinite(d) && d > 0 ? sec % d : sec;
      try {
        await el.play();
      } catch {
        if (seq === this.seq && this.status.mode === 'link') this.fallbackToSynth('Браузер не смог воспроизвести ссылку — включён синтез.');
        return;
      }
      // Устаревший вызов не трогает элемент, если новый play() уже идёт: останавливаем, только если история на паузе.
      if (!this.playing || this.destroyed) el.pause();
    } else if (this.status.mode === 'synth') {
      this.startSynth(sec);
    }
  }

  pause() {
    this.seq++;
    this.playing = false;
    this.musicEl?.pause();
    this.synth?.stop();
    this.synth = null;
    if (this.voiceEl && !this.voiceEl.paused) {
      this.voiceEl.pause();
      this.endVoice();
    }
    releaseAudio(this.token);
  }

  seek(ms: number) {
    if (this.playing) this.play(ms);
  }

  isPlaying() {
    return this.playing;
  }

  setMusicOn(on: boolean) {
    this.musicOn = on;
    this.applyMusicVolume();
  }

  setVolumes(music: number, voice: number) {
    this.musicVol = music;
    this.voiceVol = voice;
    this.applyMusicVolume();
    if (this.voiceGain && this.ctx) this.voiceGain.gain.setTargetAtTime(voice, this.ctx.currentTime, 0.05);
  }

  private targetMusicVolume() {
    return this.musicOn ? this.musicVol * (this.ducks.size ? 0.25 : 1) : 0;
  }

  private applyMusicVolume() {
    const v = this.targetMusicVolume();
    // Плавно: ~0,4 с на приглушение и возврат.
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.14);
    if (this.status.mode === 'link' && this.musicEl) this.musicEl.volume = v;
  }

  /** Приглушение музыки под речь: голос автора или системное чтение. */
  duck(reason: DuckReason, on: boolean) {
    if (on) this.ducks.add(reason);
    else this.ducks.delete(reason);
    this.applyMusicVolume();
  }

  async playVoice() {
    if (!this.o.voiceUrl) return;
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    if (!this.voiceEl || this.destroyed) return;
    this.voiceEl.currentTime = 0;
    this.duck('voice', true);
    try {
      await this.voiceEl.play();
    } catch (e) {
      this.endVoice();
      throw e;
    }
  }

  stopVoice() {
    this.voiceEl?.pause();
    this.duck('voice', false);
  }

  /** Позиция реально звучащего источника (с) и уровень 0..1 — для пульса свечения. */
  probe(): { sec: number | null; level: number } {
    if (!this.playing) return { sec: null, level: 0 };
    let sec: number | null = null;
    if (this.musicEl && !this.musicEl.paused) sec = this.musicEl.currentTime;
    else if (this.synth) sec = this.synth.position();
    return { sec, level: this.level() };
  }

  /** Текущий уровень музыки 0..1. */
  level(): number {
    if (!this.analyser || !this.playing) return 0;
    if (this.status.mode === 'link') return 0.5; // без CORS сигнал недоступен
    this.analyser.getByteTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128;
      s += v * v;
    }
    return Math.min(1, Math.sqrt(s / this.buf.length) * 4);
  }

  destroy() {
    this.pause();
    this.destroyed = true;
    if (this.musicEl) this.musicEl.removeAttribute('src');
    if (this.voiceEl) this.voiceEl.removeAttribute('src');
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
