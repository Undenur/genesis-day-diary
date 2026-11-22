/**
 * Звук истории RE:LIVE. Запускается только действием пользователя.
 * Музыка: локальный файл (HTML Audio + анализ Web Audio) → прямая ссылка (с тайм-аутом) → синтез MOMENTA.
 * Голос: отдельная дорожка; пока звучит голос, музыка приглушается до 25%.
 */
import { classifyLink } from '../engine/audioAnalysis';
import type { SongInput, SongProfile } from '../lib/types';
import { hashString } from '../lib/util';
import { probeAudioUrl } from './media';
import { SynthEngine } from './synth';

export type MusicMode = 'file' | 'link' | 'synth' | 'none';

export interface AudioStatus {
  mode: MusicMode;
  label: string;
  note: string | null;
  serviceUrl: string | null;
}

export class StoryAudio {
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
  status: AudioStatus;
  onVoiceEnd: (() => void) | null = null;

  constructor(
    private song: SongInput | null,
    private profile: SongProfile | null,
    private fileUrl: string | null,
    private voiceUrl: string | null,
    private fallbackBpm: number,
    private seedText: string,
  ) {
    this.status = this.initialStatus();
  }

  private initialStatus(): AudioStatus {
    const s = this.song;
    const name = s ? [s.title, s.artist].filter(Boolean).join(' — ') : '';
    if (s?.source === 'file' && this.fileUrl) return { mode: 'file', label: `Оригинальный трек · ${name || s.fileName}`, note: null, serviceUrl: null };
    if (s?.source === 'link' && s.url) {
      const kind = classifyLink(s.url);
      if (kind === 'audio') return { mode: 'link', label: `Трек по ссылке · ${name || 'аудио'}`, note: null, serviceUrl: s.url };
      return { mode: 'synth', label: this.synthLabel(), note: 'Страница музыкального сервиса не отдаёт звук напрямую — откройте оригинал или слушайте синтез.', serviceUrl: s.url };
    }
    return { mode: 'synth', label: this.synthLabel(), note: s ? 'Файла нет — звучит синтез по описанию трека.' : null, serviceUrl: null };
  }

  private synthLabel() {
    const p = this.profile;
    const bpm = p?.bpm ?? this.fallbackBpm;
    return `Синтез MOMENTA · ${bpm} BPM · ${p?.scale === 'major' ? 'мажор' : 'минор'}`;
  }

  /** Для прямой ссылки проверяем доступность заранее (с тайм-аутом). */
  async prepare(): Promise<AudioStatus> {
    if (this.status.mode === 'link' && this.song?.url) {
      const r = await probeAudioUrl(this.song.url, 8000);
      if (r !== 'ok') {
        this.status = {
          mode: 'synth',
          label: this.synthLabel(),
          note: r === 'timeout' ? 'Ссылка не ответила за 8 секунд — включён синтез.' : 'Ссылка недоступна или не является аудио — включён синтез.',
          serviceUrl: this.song.url,
        };
      }
    }
    return this.status;
  }

  private ensureCtx() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicOn ? this.musicVol : 0;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.musicGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = this.voiceVol;
    this.voiceGain.connect(ctx.destination);

    if (this.status.mode === 'file' && this.fileUrl) {
      const el = new Audio(this.fileUrl);
      el.loop = true;
      el.preload = 'auto';
      ctx.createMediaElementSource(el).connect(this.musicGain);
      this.musicEl = el;
    } else if (this.status.mode === 'link' && this.song?.url) {
      // Чужой сервер может не разрешать CORS — играем напрямую, без анализа.
      const el = new Audio(this.song.url);
      el.loop = true;
      el.volume = this.musicOn ? this.musicVol : 0;
      el.onerror = () => this.fallbackToSynth('Ссылка перестала отвечать — включён синтез.');
      this.musicEl = el;
    }
    if (this.voiceUrl) {
      const v = new Audio(this.voiceUrl);
      v.preload = 'auto';
      ctx.createMediaElementSource(v).connect(this.voiceGain);
      v.onended = () => {
        this.duck(false);
        this.onVoiceEnd?.();
      };
      this.voiceEl = v;
    }
    return ctx;
  }

  private fallbackToSynth(note: string) {
    this.musicEl?.pause();
    this.musicEl = null;
    this.status = { ...this.status, mode: 'synth', label: this.synthLabel(), note };
    if (this.playing) this.startSynth(0);
  }

  private startSynth(offsetSec: number) {
    if (!this.ctx || !this.musicGain) return;
    this.synth?.stop();
    const p = this.profile;
    this.synth = new SynthEngine(this.ctx, this.musicGain, {
      bpm: p?.bpm ?? this.fallbackBpm,
      energy: p?.energy ?? 0.4,
      scale: p?.scale ?? 'minor',
      texture: p?.texture ?? 'ambient',
      seed: hashString(this.seedText),
    });
    this.synth.start(offsetSec);
  }

  async play(atMs: number) {
    if (this.destroyed) return;
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    this.playing = true;
    const sec = atMs / 1000;
    if (this.musicEl) {
      const d = this.musicEl.duration;
      this.musicEl.currentTime = Number.isFinite(d) && d > 0 ? sec % d : sec;
      try {
        await this.musicEl.play();
      } catch {
        if (this.status.mode === 'link') this.fallbackToSynth('Браузер не смог воспроизвести ссылку — включён синтез.');
      }
    } else if (this.status.mode === 'synth') {
      this.startSynth(sec);
    }
  }

  pause() {
    this.playing = false;
    this.musicEl?.pause();
    this.synth?.stop();
    this.synth = null;
    if (this.voiceEl && !this.voiceEl.paused) {
      this.voiceEl.pause();
      this.duck(false);
      this.onVoiceEnd?.();
    }
  }

  seek(ms: number) {
    if (!this.playing) return;
    this.play(ms);
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

  private ducked = false;
  private applyMusicVolume() {
    const v = this.musicOn ? this.musicVol * (this.ducked ? 0.25 : 1) : 0;
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.12);
    if (this.status.mode === 'link' && this.musicEl) this.musicEl.volume = v;
  }

  private duck(on: boolean) {
    this.ducked = on;
    this.applyMusicVolume();
  }

  async playVoice() {
    if (!this.voiceUrl) return;
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    if (!this.voiceEl) return;
    this.voiceEl.currentTime = 0;
    this.duck(true);
    await this.voiceEl.play();
  }

  stopVoice() {
    this.voiceEl?.pause();
    this.duck(false);
  }

  /** Текущий уровень музыки 0..1 для пульса свечения. */
  level(): number {
    if (!this.analyser || !this.playing) return 0;
    this.analyser.getByteTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128;
      s += v * v;
    }
    return Math.min(1, Math.sqrt(s / this.buf.length) * 4);
  }

  destroy() {
    this.destroyed = true;
    this.playing = false;
    this.synth?.stop();
    this.musicEl?.pause();
    this.voiceEl?.pause();
    if (this.musicEl) this.musicEl.src = '';
    if (this.voiceEl) this.voiceEl.src = '';
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
