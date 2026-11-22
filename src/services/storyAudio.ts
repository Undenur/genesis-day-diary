/**
 * Звук истории RE:LIVE. Запускается только действием пользователя.
 * Источник выбирает musicSource.resolveMusic: свой файл → прямая ссылка → композиция каталога.
 * Если ссылка недоступна или обрывается, включается локальный трек настроения с той же позиции истории.
 * Голос автора и системное чтение плавно приглушают музыку до 25% и возвращают уровень после.
 *
 * Надёжность:
 * — история — владелец звука (audioOwner): её запуск останавливает предпрослушивание;
 * — каждый play() получает номер; устаревший вызов не запускает и не гасит звук.
 */
import { claimAudio, ownsAudio, releaseAudio } from './audioOwner';
import { probeAudioUrl } from './media';
import { trackLabel, type ResolvedMusic } from './musicSource';

type DuckReason = 'voice' | 'speech';

export interface AudioStatus {
  mode: 'file' | 'link' | 'catalog';
  label: string;
  note: string | null;
  serviceUrl: string | null;
}

export interface StoryAudioOptions {
  music: ResolvedMusic;
  /** Временный URL своего файла (для music.kind === 'file') */
  fileUrl: string | null;
  voiceUrl: string | null;
  /** Текущая позиция истории, мс — для подхвата запасным треком */
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
  private buf = new Uint8Array(512);
  private musicVol = 0.8;
  private voiceVol = 1;
  private musicOn = true;
  private playing = false;
  private destroyed = false;
  private seq = 0;
  private token = 0;
  private ducks = new Set<DuckReason>();
  /** Звучит ли элемент через Web Audio (ссылка без CORS — напрямую) */
  private routed = false;
  status: AudioStatus;
  onVoiceEnd: (() => void) | null = null;
  onStatus: ((s: AudioStatus) => void) | null = null;

  constructor(o: StoryAudioOptions) {
    this.o = o;
    const m = o.music;
    this.status = { mode: m.kind, label: m.label, note: m.note, serviceUrl: m.serviceUrl };
  }

  /** Для прямой ссылки проверяем доступность заранее (тайм-аут 8 с). */
  async prepare(): Promise<AudioStatus> {
    if (this.status.mode === 'link' && this.o.music.url) {
      const r = await probeAudioUrl(this.o.music.url, 8000);
      if (r !== 'ok' && !this.destroyed) this.fallbackToCatalog(r === 'timeout' ? 'Ссылка не ответила за 8 секунд' : 'Ссылка недоступна или не является аудио');
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
    this.attachMusic();
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

  /** Элемент для текущего источника. Чужая ссылка без CORS играет напрямую, без анализа. */
  private attachMusic() {
    if (!this.ctx || !this.musicGain) return;
    const mode = this.status.mode;
    const src = mode === 'file' ? this.o.fileUrl : mode === 'link' ? this.o.music.url : this.o.music.track.url;
    if (!src) return;
    const el = new Audio(src);
    el.loop = true;
    el.preload = 'auto';
    if (mode === 'link') {
      el.volume = this.targetMusicVolume();
      el.onerror = () => this.fallbackToCatalog('Ссылка перестала отвечать');
      this.routed = false;
    } else {
      this.ctx.createMediaElementSource(el).connect(this.musicGain);
      this.routed = true;
    }
    this.musicEl = el;
  }

  private endVoice() {
    this.duck('voice', false);
    this.onVoiceEnd?.();
  }

  /** Ссылка недоступна: включаем композицию настроения с текущей позиции истории. */
  private fallbackToCatalog(reason: string) {
    if (this.status.mode !== 'link') return;
    this.musicEl?.pause();
    this.musicEl?.removeAttribute('src');
    this.musicEl = null;
    const t = this.o.music.track;
    this.status = {
      mode: 'catalog',
      label: `${trackLabel(t)} · запасная композиция`,
      note: `${reason} — звучит «${t.title}» из подборки этого настроения.`,
      serviceUrl: this.o.music.serviceUrl,
    };
    this.onStatus?.({ ...this.status });
    if (this.ctx) {
      this.attachMusic();
      if (this.playing) this.play(this.o.getPositionMs());
    }
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
    const el = this.musicEl;
    if (!el) return;
    const sec = atMs / 1000;
    const d = el.duration;
    try {
      el.currentTime = Number.isFinite(d) && d > 0 ? sec % d : sec;
    } catch {
      /* метаданные ещё не загружены — начнём с текущей позиции */
    }
    try {
      await el.play();
    } catch {
      if (seq === this.seq && this.status.mode === 'link') this.fallbackToCatalog('Браузер не смог воспроизвести ссылку');
      return;
    }
    // Устаревший вызов не трогает элемент, если новый play() уже идёт: останавливаем, только если история на паузе.
    if (!this.playing || this.destroyed) el.pause();
  }

  pause() {
    this.seq++;
    this.playing = false;
    this.musicEl?.pause();
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
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.14);
    if (!this.routed && this.musicEl) this.musicEl.volume = v;
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
    if (!this.playing || !this.musicEl || this.musicEl.paused) return { sec: null, level: 0 };
    return { sec: this.musicEl.currentTime, level: this.level() };
  }

  /** Текущий уровень музыки 0..1. */
  level(): number {
    if (!this.analyser || !this.playing) return 0;
    if (!this.routed) return 0.5; // ссылка без CORS: сигнал недоступен
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
    this.musicEl?.removeAttribute('src');
    this.voiceEl?.removeAttribute('src');
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
