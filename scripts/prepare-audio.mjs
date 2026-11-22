/**
 * Подготовка каталога настроений: из исходных MP3 (Kevin MacLeod, CC BY 4.0) делает фрагменты для MOMENTA.
 *   — пропуск тишины в начале и выбор удачного начала (для «Драйва» — момент, где вступает ритм);
 *   — ~36 с звучания (история длится до 30 с);
 *   — выравнивание громкости по RMS (−18 dBFS) с мягким ограничителем пиков (−2 dBFS);
 *   — мягкий вход 0,8 с и выход 3 с;
 *   — MP3 128 кбит/с, затем повторное декодирование для проверки.
 *
 * Запуск: node scripts/prepare-audio.mjs <папка с исходными MP3>
 * Исходники в репозиторий не кладутся — только готовые фрагменты в public/audio/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MPEGDecoder } from 'mpg123-decoder';
import { Mp3Encoder } from '@breezystack/lamejs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = process.argv[2];
if (!srcDir) {
  console.error('Укажите папку с исходными MP3');
  process.exit(1);
}

/** Тот же порядок и id, что в src/lib/catalog.ts. start: 'sound' — с первого звука, 'beat' — с вступления ритма. */
const TRACKS = [
  { id: 'km-meditation-impromptu-02', file: 'Meditation Impromptu 02.mp3', start: 'sound' },
  { id: 'km-carefree', file: 'Carefree.mp3', start: 'sound' },
  { id: 'km-gymnopedie-1', file: 'Gymnopedie No 1.mp3', start: 'sound' },
  { id: 'km-bittersweet', file: 'Bittersweet.mp3', start: 'sound' },
  { id: 'km-raving-energy-faster', file: 'Raving Energy (faster).mp3', start: 'beat' },
  { id: 'km-floating-cities', file: 'Floating Cities.mp3', start: 'sound' },
];

const LEN = 36;
const FADE_IN = 0.8;
const FADE_OUT = 3;
const TARGET_RMS_DB = -18;
const CEILING = 0.79; // −2 dBFS: запас под выбросы MP3-кодека
const db = (v) => 20 * Math.log10(Math.max(v, 1e-9));

async function decode(buf) {
  const dec = new MPEGDecoder();
  await dec.ready;
  const r = dec.decode(new Uint8Array(buf));
  dec.free();
  return { channels: r.channelData, sampleRate: r.sampleRate };
}

/** RMS по окнам 50 мс (моно-сумма) */
function windows(ch, sr) {
  const n = Math.floor(sr * 0.05);
  const out = [];
  for (let i = 0; i + n <= ch[0].length; i += n) {
    let s = 0;
    for (let k = 0; k < n; k++) {
      let v = 0;
      for (const c of ch) v += c[i + k];
      v /= ch.length;
      s += v * v;
    }
    out.push(Math.sqrt(s / n));
  }
  return out;
}

function pickStart(ch, sr, mode) {
  const w = windows(ch, sr);
  const sorted = [...w].sort((a, b) => a - b);
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const firstSound = w.findIndex((v) => db(v) > -45);
  if (mode === 'sound') return Math.max(0, firstSound * 0.05 - 0.05);
  // ритм: первое место после звука, где громкость 1-секундного окна достигает 85% от p75
  for (let i = firstSound; i + 20 < w.length; i++) {
    const avg = w.slice(i, i + 20).reduce((s, v) => s + v, 0) / 20;
    if (avg >= p75 * 0.85) return Math.max(0, i * 0.05 - 0.4);
  }
  return firstSound * 0.05;
}

function master(ch, sr, startSec) {
  const a = Math.floor(startSec * sr);
  const len = Math.min(Math.floor(LEN * sr), ch[0].length - a);
  const seg = ch.map((c) => c.slice(a, a + len));
  // RMS только по звучащим окнам
  const w = windows(seg, sr).filter((v) => db(v) > -50);
  const rms = Math.sqrt(w.reduce((s, v) => s + v * v, 0) / Math.max(1, w.length));
  const gain = 10 ** ((TARGET_RMS_DB - db(rms)) / 20);
  // Ограничитель с упреждением 2 мс: усиление снижается до прихода пика и плавно
  // восстанавливается (120 мс), поэтому выбросов выше потолка нет.
  const look = Math.floor(0.002 * sr);
  const peaks = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let p = 0;
    for (const c of seg) p = Math.max(p, Math.abs(c[i] * gain));
    peaks[i] = p;
  }
  const need = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let m = 0;
    for (let k = i; k < Math.min(len, i + look); k++) m = Math.max(m, peaks[k]);
    need[i] = m > CEILING ? CEILING / m : 1;
  }
  const rel = 1 - Math.exp(-1 / (0.12 * sr));
  let g = 1;
  const out = seg.map((c) => new Float32Array(c.length));
  for (let i = 0; i < len; i++) {
    g = need[i] < g ? need[i] : g + (need[i] - g) * rel;
    const t = i / sr;
    const fadeIn = Math.min(1, t / FADE_IN);
    const fadeOut = Math.min(1, (len / sr - t) / FADE_OUT);
    const f = Math.sin((Math.PI / 2) * fadeIn) * Math.sin((Math.PI / 2) * Math.max(0, fadeOut));
    for (let k = 0; k < seg.length; k++) out[k][i] = Math.max(-1, Math.min(1, seg[k][i] * gain * g * f));
  }
  return { out, gainDb: db(gain) };
}

function encode(ch, sr) {
  const stereo = ch.length > 1;
  const enc = new Mp3Encoder(stereo ? 2 : 1, sr, 128);
  const toI16 = (f) => {
    const r = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) r[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
    return r;
  };
  const L = toI16(ch[0]);
  const R = stereo ? toI16(ch[1]) : null;
  const parts = [];
  const block = 1152;
  for (let i = 0; i < L.length; i += block) {
    const b = stereo ? enc.encodeBuffer(L.subarray(i, i + block), R.subarray(i, i + block)) : enc.encodeBuffer(L.subarray(i, i + block));
    if (b.length) parts.push(Buffer.from(b));
  }
  const end = enc.flush();
  if (end.length) parts.push(Buffer.from(end));
  return Buffer.concat(parts);
}

mkdirSync(join(root, 'public', 'audio'), { recursive: true });
const report = [];
for (const t of TRACKS) {
  const src = await decode(readFileSync(join(srcDir, t.file)));
  const start = pickStart(src.channels, src.sampleRate, t.start);
  const { out, gainDb } = master(src.channels, src.sampleRate, start);
  const mp3 = encode(out, src.sampleRate);
  const dest = join(root, 'public', 'audio', `${t.id}.mp3`);
  writeFileSync(dest, mp3);
  // Проверка: файл декодируется, длительность и уровень как ожидалось.
  const check = await decode(mp3);
  const w = windows(check.channels, check.sampleRate).filter((v) => db(v) > -50);
  const rms = Math.sqrt(w.reduce((s, v) => s + v * v, 0) / Math.max(1, w.length));
  let peak = 0;
  for (const c of check.channels) for (const v of c) peak = Math.max(peak, Math.abs(v));
  report.push({
    id: t.id,
    start: `${Math.floor(start / 60)}:${(start % 60).toFixed(1).padStart(4, '0')}`,
    seconds: +(check.channels[0].length / check.sampleRate).toFixed(2),
    gainDb: +gainDb.toFixed(1),
    rmsDb: +db(rms).toFixed(1),
    peakDb: +db(peak).toFixed(1),
    kb: Math.round(mp3.length / 1024),
  });
}
console.table(report);
