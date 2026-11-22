/** Медиа: проверка, уменьшение, миниатюры и анализ снимков через Canvas; анализ аудиофайлов через Web Audio. */
import { analyzeSignal } from '../engine/audioAnalysis';
import { analyzePixels } from '../engine/photoAnalysis';
import type { AudioFeatures, PhotoRef } from '../lib/types';
import { uuid } from '../lib/util';
import { putBlob } from './db';

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

export class MediaError extends Error {}

async function decodeImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* пробуем через <img> ниже */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new MediaError('Не удалось подготовить изображение'))), type, q));
}

function drawScaled(src: CanvasImageSource, w: number, h: number, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Проверяет и готовит снимок: уменьшает до 1800 px, делает миниатюру, извлекает признаки. Файлы сразу в IndexedDB. */
export async function processPhoto(file: Blob, name: string, owner: string, index: number): Promise<PhotoRef> {
  const p = await preparePhoto(file, name, index);
  const id = uuid();
  const blobId = await putBlob(p.full, owner, `img-${id}`);
  const thumbBlobId = await putBlob(p.thumb, owner, `thumb-${id}`);
  return { id, blobId, thumbBlobId, name, alt: p.alt, width: p.width, height: p.height, features: p.features };
}

export interface PreparedPhoto {
  full: Blob;
  thumb: Blob;
  alt: string;
  width: number;
  height: number;
  features: PhotoRef['features'];
}

/** Подготовка снимка без записи в базу (для атомарной записи вместе с днём). */
export async function preparePhoto(file: Blob, name: string, index: number): Promise<PreparedPhoto> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new MediaError(`«${name}» больше 30 МБ (${(file.size / 1048576).toFixed(1)} МБ). Уменьшите снимок и попробуйте снова.`);
  }
  if (file.type && !file.type.startsWith('image/')) {
    throw new MediaError(`«${name}» — не изображение (${file.type}). Подойдут JPG, PNG, WebP.`);
  }
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await decodeImage(file);
  } catch {
    throw new MediaError(`«${name}» не удалось открыть: файл повреждён или формат не поддерживается браузером (например, HEIC). Сохраните его как JPG.`);
  }
  const w = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
  const h = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  if (!w || !h) throw new MediaError(`«${name}» пустое изображение.`);

  const full = drawScaled(bmp, w, h, 1800);
  const thumb = drawScaled(bmp, w, h, 480);
  const probe = drawScaled(bmp, w, h, 96);
  const data = probe.getContext('2d')!.getImageData(0, 0, probe.width, probe.height).data;
  const features = analyzePixels(data, probe.width, probe.height, full.width, full.height);
  if ('close' in bmp) bmp.close();

  const [fullBlob, thumbBlob] = await Promise.all([canvasToBlob(full, 'image/jpeg', 0.88), canvasToBlob(thumb, 'image/jpeg', 0.82)]);
  return { full: fullBlob, thumb: thumbBlob, alt: `Снимок дня ${index + 1}`, width: full.width, height: full.height, features };
}

/** Копия существующего Blob под новым id (например, обложка Countdown → первое фото дня). */
export async function cloneBlobAsPhoto(blob: Blob, name: string, owner: string, index: number) {
  return processPhoto(blob, name, owner, index);
}

/** Декодирует аудиофайл и меряет RMS, пики и BPM (первые 90 секунд). */
export async function analyzeAudioBlob(blob: Blob): Promise<AudioFeatures> {
  const buf = await blob.arrayBuffer();
  const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Ctx(1, 44100, 44100);
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(buf);
  } catch {
    throw new MediaError('Аудиофайл не удалось декодировать: формат не поддерживается или файл повреждён.');
  }
  const len = Math.min(audio.length, Math.floor(audio.sampleRate * 90));
  const mono = new Float32Array(len);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const d = audio.getChannelData(ch);
    for (let i = 0; i < len; i++) mono[i] += d[i] / audio.numberOfChannels;
  }
  // Даунсэмплинг до ~22 кГц ускоряет анализ.
  const factor = Math.max(1, Math.floor(audio.sampleRate / 22050));
  const ds = new Float32Array(Math.floor(len / factor));
  for (let i = 0; i < ds.length; i++) ds[i] = mono[i * factor];
  const f = analyzeSignal(ds, audio.sampleRate / factor);
  return { ...f, durationSec: Math.round(audio.duration * 10) / 10 };
}

/** Проверка прямой аудиоссылки: можно ли её проиграть за отведённое время. */
export function probeAudioUrl(url: string, timeoutMs = 8000): Promise<'ok' | 'error' | 'timeout'> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    const done = (r: 'ok' | 'error' | 'timeout') => {
      clearTimeout(timer);
      a.removeAttribute('src');
      a.load();
      resolve(r);
    };
    const timer = setTimeout(() => done('timeout'), timeoutMs);
    a.onloadedmetadata = () => done('ok');
    a.onerror = () => done('error');
    a.src = url;
  });
}
