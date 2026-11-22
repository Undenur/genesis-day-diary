/**
 * Синтез MOMENTA — автономная музыка по BPM, энергии, ладу и фактуре.
 * Огибающие, гармоническая прогрессия, повтор мотива с вариацией на 5–8 тактах.
 * Работает и в реальном времени (AudioContext), и офлайн (OfflineAudioContext → WAV).
 */
import type { Scale, SynthTexture } from '../lib/types';
import { rng } from '../lib/util';

export interface SynthParams {
  bpm: number;
  energy: number;
  scale: Scale;
  texture: SynthTexture;
  seed: number;
}

const SCALES: Record<Scale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};
const PROGRESSIONS: Record<Scale, number[][]> = {
  major: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 0, 4, 5]],
  minor: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6]],
};

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class SynthEngine {
  private ctx: BaseAudioContext;
  private out: GainNode;
  private bus: GainNode;
  private send: GainNode;
  private noise: AudioBuffer;
  private p: SynthParams;
  private root: number;
  private prog: number[];
  private motif: (number | null)[];
  private eighth: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStep = 0;
  private t0 = 0;
  private rand: () => number;

  constructor(ctx: BaseAudioContext, destination: AudioNode, p: SynthParams) {
    this.ctx = ctx;
    this.p = { ...p, energy: Math.min(1, Math.max(0, p.energy)) };
    this.rand = rng(p.seed || 1);
    this.root = [57, 60, 62, 55, 53, 58][Math.floor(this.rand() * 6)];
    this.prog = PROGRESSIONS[p.scale][Math.floor(this.rand() * 3)];
    this.eighth = 60 / p.bpm / 2;
    // Мотив на 8 восьмых: ступени гаммы или паузы.
    this.motif = Array.from({ length: 8 }, (_, i) => (this.rand() < (i % 2 === 0 ? 0.85 : 0.45) ? Math.floor(this.rand() * 6) - 1 : null));

    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.2;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.send = ctx.createGain();
    this.send.gain.value = p.texture === 'electronic' ? 0.18 : p.texture === 'piano' ? 0.42 : 0.5;
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(p.texture === 'ambient' ? 4 : 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.bus.connect(comp);
    this.send.connect(verb).connect(wet).connect(comp);
    comp.connect(this.out).connect(destination);
    this.noise = this.makeNoise();
  }

  private makeNoise() {
    const len = this.ctx.sampleRate;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = rng(7);
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    return b;
  }

  private impulse(seconds: number) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const b = this.ctx.createBuffer(2, len, sr);
    const r = rng(11);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    return b;
  }

  private chordAt(bar: number) {
    const barsPerChord = this.p.bpm > 112 ? 2 : 1;
    const deg = this.prog[Math.floor(bar / barsPerChord) % this.prog.length];
    const sc = SCALES[this.p.scale];
    const note = (d: number) => this.root + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    return { deg, tones: [note(deg), note(deg + 2), note(deg + 4)], note };
  }

  // ---------- Голоса ----------
  private env(g: GainNode, t: number, a: number, peak: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  private piano(t: number, midi: number, vel: number, len = 2.2) {
    const f = mtof(midi);
    const g = this.ctx.createGain();
    this.env(g, t, 0.006, 0.22 * vel, len);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + len);
    for (const [type, mul, amp] of [['triangle', 1, 1], ['sine', 2, 0.35], ['sine', 3, 0.12]] as const) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      const og = this.ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + len + 0.1);
    }
    lp.connect(g);
    g.connect(this.bus);
    g.connect(this.send);
  }

  private pad(t: number, tones: number[], dur: number, vel: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07 * vel, t + Math.min(1.4, dur * 0.4));
    g.gain.setValueAtTime(0.07 * vel, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700 + this.p.energy * 1600;
    lp.Q.value = 0.6;
    for (const m of tones) {
      for (const det of [-7, 7]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 1);
      }
    }
    lp.connect(g);
    g.connect(this.bus);
    g.connect(this.send);
  }

  private bell(t: number, midi: number, vel: number) {
    const f = mtof(midi);
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, 0.09 * vel, 2.6);
    for (const [mul, amp] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mul;
      const og = this.ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 2.8);
    }
    g.connect(this.send);
    g.connect(this.bus);
  }

  private bass(t: number, midi: number, dur: number, vel: number, saw: boolean) {
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, 0.28 * vel, dur);
    const o = this.ctx.createOscillator();
    o.type = saw ? 'sawtooth' : 'sine';
    o.frequency.value = mtof(midi - 24);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(saw ? 900 : 400, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + dur);
    o.connect(lp).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pluck(t: number, midi: number, vel: number) {
    const g = this.ctx.createGain();
    this.env(g, t, 0.004, 0.12 * vel, 0.9);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(midi);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.5);
    o.connect(lp).connect(g);
    g.connect(this.bus);
    g.connect(this.send);
    o.start(t);
    o.stop(t + 1);
  }

  private arp(t: number, midi: number, vel: number) {
    const g = this.ctx.createGain();
    this.env(g, t, 0.003, 0.06 * vel, 0.18);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi + 12);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800 + this.p.energy * 3000;
    lp.Q.value = 4;
    o.connect(lp).connect(g);
    g.connect(this.bus);
    g.connect(this.send);
    o.start(t);
    o.stop(t + 0.25);
  }

  private kick(t: number, vel: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.4);
  }

  private noiseHit(t: number, freq: number, type: BiquadFilterType, dur: number, vel: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g);
    g.connect(this.bus);
    if (type === 'bandpass') g.connect(this.send);
    s.start(t, (t * 7.31) % 0.5);
    s.stop(t + dur + 0.02);
  }

  // ---------- Партитура ----------
  /** Планирует одну восьмую долю k в абсолютное время t. */
  private step(k: number, t: number) {
    const { energy: e, texture } = this.p;
    const bar = Math.floor(k / 8);
    const pos = k % 8;
    const chord = this.chordAt(bar);
    const phraseBar = bar % 8;
    const vary = phraseBar >= 4 && pos === 7; // вариация конца фразы во второй половине
    const human = 0.85 + ((k * 37) % 11) / 70;
    const motifNote = this.motif[pos];
    const melody = motifNote === null ? null : chord.note(chord.deg + motifNote + (vary ? 2 : 0)) + 12;

    if (texture === 'piano') {
      // Левая рука: бас на сильную долю и ломаный аккорд; правая — повторяющийся мотив.
      const broken: Record<number, number> = { 2: 1, 4: 2, 6: 1 };
      if (pos === 0) this.piano(t, chord.tones[0] - 12, 0.9 * human, 3.2);
      if (pos in broken) this.piano(t, chord.tones[broken[pos]], 0.5 * human, 2);
      if (melody !== null && (pos % 2 === 0 || e > 0.4) && bar % 4 !== 3) this.piano(t, melody, 0.7 * human, 2.4);
      if (e > 0.55 && pos === 4) this.kick(t, 0.35);
    } else if (texture === 'ambient') {
      if (pos === 0 && bar % 2 === 0) this.pad(t, chord.tones, this.eighth * 16, 1);
      if (pos === 0 && bar % 2 === 1) this.pad(t, chord.tones.map((m) => m + 12), this.eighth * 8, 0.5);
      if (pos === 0) this.bass(t, chord.tones[0], this.eighth * 7, 0.7, false);
      if (melody !== null && pos % 2 === 0 && phraseBar % 2 === 0) this.bell(t, melody + 12, 0.8 * human);
      if (pos === 3 && bar % 2 === 1 && melody !== null) this.bell(t, melody + 7, 0.5);
      if (e > 0.3 && pos === 0) this.kick(t, 0.25 + e * 0.2);
      if (e > 0.45 && (pos === 2 || pos === 6)) this.noiseHit(t, 9000, 'highpass', 0.05, 0.05);
    } else if (texture === 'electronic') {
      if (pos % 2 === 0) this.kick(t, 0.85);
      if (pos % 2 === 1) this.noiseHit(t, 8000, 'highpass', 0.05, 0.16 * human);
      if (e > 0.7) this.noiseHit(t + this.eighth / 2, 9500, 'highpass', 0.03, 0.08);
      if (pos === 2 || pos === 6) this.noiseHit(t, 1600, 'bandpass', 0.14, 0.45);
      if (pos % 2 === 1 || pos === 0) this.bass(t, chord.tones[0] + (pos === 7 ? 12 : 0), this.eighth * 0.9, 0.75, true);
      const arpTone = chord.tones[k % 3];
      this.arp(t, arpTone, 0.8 * human);
      this.arp(t + this.eighth / 2, chord.tones[(k + 1) % 3] + (pos > 4 ? 12 : 0), 0.6 * human);
      if (pos === 0 && bar % 2 === 0) this.pad(t, chord.tones.map((m) => m + 12), this.eighth * 16, 0.6);
      if (melody !== null && pos % 2 === 0 && phraseBar >= 4) this.pluck(t, melody + 12, 0.7);
    } else {
      // acoustic
      if (pos === 0 || pos === 3 || pos === 4 || pos === 6) chord.tones.forEach((m, i) => this.pluck(t + i * 0.018, m, (pos === 0 ? 0.9 : 0.6) * human));
      if (pos === 0 || pos === 4) this.bass(t, chord.tones[0], this.eighth * 3, 0.7, false);
      if (melody !== null && pos % 2 === 0 && bar % 4 >= 2) this.pluck(t, melody + 12, 0.8);
      if (e > 0.45) {
        if (pos === 0 || pos === 5) this.kick(t, 0.6);
        if (pos === 2 || pos === 6) this.noiseHit(t, 1800, 'bandpass', 0.12, 0.3);
        if (e > 0.6) this.noiseHit(t, 8000, 'highpass', 0.04, 0.08);
      }
    }
  }

  /** Запуск в реальном времени с позиции offsetSec. */
  start(offsetSec = 0) {
    const ctx = this.ctx;
    this.t0 = ctx.currentTime + 0.06 - offsetSec;
    this.nextStep = Math.max(0, Math.ceil(offsetSec / this.eighth));
    this.out.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.out.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.4);
    const tick = () => {
      while (this.t0 + this.nextStep * this.eighth < ctx.currentTime + 0.25) {
        const t = this.t0 + this.nextStep * this.eighth;
        if (t >= ctx.currentTime - 0.01) this.step(this.nextStep, t);
        this.nextStep++;
      }
    };
    tick();
    this.timer = setInterval(tick, 40);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setValueAtTime(this.out.gain.value || 0.0001, now);
      this.out.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    } catch {
      /* контекст закрыт */
    }
    const out = this.out;
    setTimeout(() => out.disconnect(), 400);
  }

  /** Офлайн: планирует всё сразу на durationSec с плавным началом и концом. */
  renderAll(durationSec: number) {
    this.out.gain.setValueAtTime(0.0001, 0);
    this.out.gain.exponentialRampToValueAtTime(0.9, 0.3);
    this.out.gain.setValueAtTime(0.9, durationSec - 1.6);
    this.out.gain.exponentialRampToValueAtTime(0.0001, durationSec - 0.05);
    const steps = Math.floor((durationSec - 0.5) / this.eighth);
    for (let k = 0; k < steps; k++) this.step(k, 0.05 + k * this.eighth);
  }
}

/** Рендер синтеза в WAV-файл (моно, 16 бит) — для демо-треков и «Скачать трек». */
export async function renderSynthWav(p: SynthParams, seconds = 24, sampleRate = 32000): Promise<Blob> {
  const Ctx = window.OfflineAudioContext;
  const ctx = new Ctx(1, Math.floor(seconds * sampleRate), sampleRate);
  const engine = new SynthEngine(ctx, ctx.destination, p);
  engine.renderAll(seconds);
  const buf = await ctx.startRendering();
  return encodeWav(buf.getChannelData(0), sampleRate);
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  // Простое мастеринг-выравнивание: пик к 0,95, как у обычного выпущенного трека.
  const norm = peak > 0 ? 0.95 / peak : 1;
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] * norm)) * 0x7fff, true);
  return new Blob([buffer], { type: 'audio/wav' });
}
