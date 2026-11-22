/**
 * Анализ аудиосигнала (моно Float32Array): RMS, пики энергии, периодичность атак → BPM с уверенностью.
 * Плюс построение SongProfile из измерений, описания и ручных значений (ручной BPM в приоритете).
 */
import type { AudioFeatures, Scale, SongInput, SongProfile, SoundTexture, ValueSource } from '../lib/types';
import { clamp, normalizeRu } from '../lib/util';

export function analyzeSignal(signal: Float32Array, sampleRate: number): AudioFeatures {
  const hop = 512;
  const frame = 1024;
  const frames = Math.max(1, Math.floor((signal.length - frame) / hop));
  const rmsArr = new Float32Array(frames);
  let total = 0;
  for (let f = 0; f < frames; f++) {
    let s = 0;
    const off = f * hop;
    for (let i = 0; i < frame; i++) {
      const v = signal[off + i] || 0;
      s += v * v;
    }
    const r = Math.sqrt(s / frame);
    rmsArr[f] = r;
    total += r;
  }
  const meanRms = total / frames;

  // Огибающая атак: положительная разность логарифма энергии.
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    const d = Math.log(1e-4 + rmsArr[f]) - Math.log(1e-4 + rmsArr[f - 1]);
    onset[f] = d > 0 ? d : 0;
  }
  let oMean = 0;
  for (let f = 0; f < frames; f++) oMean += onset[f];
  oMean /= frames;
  let oVar = 0;
  for (let f = 0; f < frames; f++) oVar += (onset[f] - oMean) ** 2;
  const oStd = Math.sqrt(oVar / frames);

  // Пики энергии: локальные максимумы выше среднего + 1.5σ.
  let peaks = 0;
  const thr = oMean + 1.5 * oStd;
  for (let f = 2; f < frames - 2; f++) {
    if (onset[f] > thr && onset[f] >= onset[f - 1] && onset[f] >= onset[f + 1]) peaks++;
  }
  const durationSec = signal.length / sampleRate;
  const fps = sampleRate / hop;

  // Автокорреляция огибающей атак для 55–180 BPM с мягким приоритетом около 100 BPM.
  const centered = onset.map((v) => v - oMean);
  let bestBpm: number | null = null;
  let bestScore = -Infinity;
  const scores: { bpm: number; ac: number }[] = [];
  let ac0 = 0;
  for (let i = 0; i < frames; i++) ac0 += centered[i] * centered[i];
  for (let bpm = 55; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    const l0 = Math.floor(lag);
    const frac = lag - l0;
    let ac = 0;
    for (let i = 0; i + l0 + 1 < frames; i++) {
      const v = centered[i + l0] * (1 - frac) + centered[i + l0 + 1] * frac;
      ac += centered[i] * v;
    }
    ac /= ac0 || 1;
    scores.push({ bpm, ac });
  }
  for (const s of scores) {
    const prior = Math.exp(-0.5 * (Math.log2(s.bpm / 100) / 0.9) ** 2);
    const sc = s.ac * (0.75 + 0.25 * prior);
    if (sc > bestScore) { bestScore = sc; bestBpm = s.bpm; }
  }
  const acs = scores.map((s) => s.ac);
  const acMean = acs.reduce((a, b) => a + b, 0) / acs.length;
  const acMax = Math.max(...acs);
  const confidence = clamp(acMax > 0 ? (acMax - acMean) / (Math.abs(acMax) + 0.15) : 0);
  if (confidence < 0.12 || durationSec < 4) bestBpm = null;

  // Смещение сетки долей: фаза, на которую чаще всего приходятся атаки.
  let beatOffsetSec = 0;
  if (bestBpm) {
    const period = (60 / bestBpm) * fps;
    let bestPhase = 0;
    let bestSum = -1;
    for (let ph = 0; ph < period; ph++) {
      let sum = 0;
      for (let k = ph; k < frames; k += period) sum += onset[Math.round(k)] || 0;
      if (sum > bestSum) { bestSum = sum; bestPhase = ph; }
    }
    beatOffsetSec = Math.round((bestPhase / fps) * 1000) / 1000;
  }

  const sortedRms = Array.from(rmsArr).sort((a, b) => a - b);
  const p = (q: number) => sortedRms[Math.min(sortedRms.length - 1, Math.floor(q * sortedRms.length))] || 1e-6;
  const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-6));
  const dynamicRangeDb = Math.round(db(p(0.95)) - db(p(0.1)));
  // Энергия: громкость (−40…−8 dBFS) и плотность пиков.
  const loud = clamp((db(meanRms) + 40) / 32);
  const peakRate = peaks / Math.max(1, durationSec);
  const energy = clamp(loud * 0.55 + clamp(peakRate / 4) * 0.45);

  return {
    durationSec: Math.round(durationSec * 10) / 10,
    rms: Math.round(meanRms * 1000) / 1000,
    energy: Math.round(energy * 100) / 100,
    peaksPerSec: Math.round(peakRate * 100) / 100,
    bpm: bestBpm ? Math.round(bestBpm) : null,
    bpmConfidence: Math.round(confidence * 100) / 100,
    dynamicRangeDb,
    beatOffsetSec,
  };
}

const ENERGETIC = /(энерг|драйв|быстр|танц|клуб|техно|электрон|рок|панк|метал|хаус|drum|edm|techno|house|dance|rock|punk|metal|громк|мощн|ярк)/;
const SOFT = /(тих|спокойн|мягк|нежн|камерн|фортепиан|пиано|piano|эмбиент|ambient|lo-?fi|акустик|колыбел|медленн|мечтат|задумчив|светл)/;
const SAD = /(грустн|минор|печальн|меланхол|дожд|ностальг|тоск)/;
const UPBEAT = /(радост|весел|бодр|поп|летн|солнечн|праздн|джаз|фанк|диско)/;

export function textureFrom(genre: string, mood: string, energy: number): SoundTexture {
  const g = normalizeRu(`${genre} ${mood}`);
  if (/(фортепиан|пиано|piano|камерн|классик)/.test(g)) return 'piano';
  if (/(эмбиент|ambient|атмосфер|космич|дрон)/.test(g)) return 'ambient';
  if (/(электрон|техно|хаус|edm|synth|синт|клуб|dance|танц)/.test(g)) return 'electronic';
  if (energy > 0.65) return 'electronic';
  if (energy < 0.3) return 'ambient';
  return 'acoustic';
}

/** Профиль песни. Приоритет: ручной ввод → измерение файла → описание → значение по умолчанию. */
export function buildSongProfile(song: SongInput): SongProfile {
  const notes: string[] = [];
  const desc = normalizeRu(`${song.genre} ${song.mood} ${song.title}`);
  const a = song.audio;

  let bpm = 96;
  let bpmSource: ValueSource = 'default';
  let bpmConfidence = 0;
  if (song.bpm && song.bpm >= 40 && song.bpm <= 220) {
    bpm = song.bpm;
    bpmSource = 'manual';
    bpmConfidence = 1;
    notes.push(
      a?.bpm
        ? `BPM ${bpm} указан вручную — он важнее измерения (по сигналу ${a.bpm}, уверенность ${Math.round(a.bpmConfidence * 100)}%)`
        : `BPM ${bpm} указан вручную`,
    );
  } else if (a?.bpm) {
    bpm = a.bpm;
    bpmSource = 'measured';
    bpmConfidence = a.bpmConfidence;
    notes.push(`BPM ${bpm} измерен по периодичности атак (уверенность ${Math.round(a.bpmConfidence * 100)}%)`);
  } else {
    const m = desc.match(/(\d{2,3})\s*bpm/);
    if (m) { bpm = Number(m[1]); bpmSource = 'description'; bpmConfidence = 0.6; }
    else if (ENERGETIC.test(desc)) { bpm = 128; bpmSource = 'description'; bpmConfidence = 0.35; }
    else if (SOFT.test(desc)) { bpm = 68; bpmSource = 'description'; bpmConfidence = 0.35; }
    else if (UPBEAT.test(desc)) { bpm = 112; bpmSource = 'description'; bpmConfidence = 0.3; }
    notes.push(bpmSource === 'description' ? `BPM ${bpm} оценён по описанию` : `BPM неизвестен — взят нейтральный темп ${bpm}`);
  }

  let energy = 0.5;
  let energySource: ValueSource = 'default';
  if (a) {
    energy = a.energy;
    energySource = 'measured';
    notes.push(`Энергия ${Math.round(energy * 100)} из 100 измерена по RMS и пикам (${a.peaksPerSec} пика/с)`);
  } else {
    let e = 0.5;
    if (ENERGETIC.test(desc)) e += 0.3;
    if (SOFT.test(desc)) e -= 0.28;
    if (UPBEAT.test(desc)) e += 0.12;
    e += clamp((bpm - 100) / 160, -0.2, 0.2);
    energy = clamp(e, 0.05, 0.95);
    energySource = 'description';
    notes.push(`Энергия ${Math.round(energy * 100)} оценена по описанию и темпу`);
  }

  let scale: Scale = 'major';
  let scaleSource: ValueSource = 'default';
  if (song.scale) { scale = song.scale; scaleSource = 'manual'; }
  else if (SAD.test(desc)) { scale = 'minor'; scaleSource = 'description'; }
  else if (/(мажор|радост|солнечн|весел|светл)/.test(desc)) { scale = 'major'; scaleSource = 'description'; }
  else if (energy < 0.35) { scale = 'minor'; scaleSource = 'description'; }

  const attackDensity = a ? clamp(a.peaksPerSec / 4) : clamp(energy * 0.8 + (bpm - 60) / 300);
  const softness = clamp(SOFT.test(desc) ? 0.8 : ENERGETIC.test(desc) ? 0.2 : 1 - energy);

  return {
    bpm,
    bpmSource,
    bpmConfidence,
    energy,
    energySource,
    attackDensity: Math.round(attackDensity * 100) / 100,
    scale,
    scaleSource,
    texture: textureFrom(song.genre, song.mood, energy),
    softness: Math.round(softness * 100) / 100,
    measured: !!a,
    beatOffsetSec: a?.beatOffsetSec ?? 0,
    year: song.year,
    notes,
  };
}

/** Классификация ссылки: страница музыкального сервиса или прямой аудиофайл. */
export function classifyLink(url: string): 'service' | 'audio' | 'unknown' {
  try {
    const u = new URL(url);
    if (/(spotify|music\.apple|music\.yandex|youtube|youtu\.be|soundcloud|deezer|bandcamp|vk\.com|zvuk|tidal|boom\.ru|music\.amazon)/i.test(u.hostname)) return 'service';
    if (/\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)(\?|$)/i.test(u.pathname + u.search)) return 'audio';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
