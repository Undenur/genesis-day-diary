/**
 * Share Again: настоящая карточка PNG с оригинальным фото, названием и первоначальной датой.
 * Исходный день не меняется. Голос и точные координаты передаются только по отдельному выбору.
 */
import type { Memory, ShareLogEntry } from '../lib/types';
import { formatDate, rgba, uuid } from '../lib/util';
import { getBlob } from './db';

export interface ShareOptions {
  includeQuote: boolean;
  includePlace: boolean;
  includeCoords: boolean;
  includeVoice: boolean;
}

export function shareItems(m: Memory, o: ShareOptions): string[] {
  const items = ['Оригинальное фото обложки', `Название «${m.title}»`, `Дата ${formatDate(m.date)}`];
  if (o.includeQuote && m.generation.captions[0]) items.push(`Фраза «${m.generation.captions[0]}»`);
  if (o.includePlace && m.place?.name) items.push(`Место «${m.place.name}»`);
  if (o.includeCoords && m.place?.lat != null) items.push(`Координаты ${m.place.lat}, ${m.place.lng}`);
  if (o.includeVoice && m.voice) items.push(`Голосовая заметка (${Math.round(m.voice.durationSec)} с)`);
  return items;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderShareCard(m: Memory, o: ShareOptions): Promise<Blob> {
  await document.fonts?.ready;
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const cover = m.photos.find((p) => p.id === m.coverId) ?? m.photos[0];
  const blob = cover ? await getBlob(cover.blobId) : null;
  ctx.fillStyle = '#101827';
  ctx.fillRect(0, 0, W, H);
  if (blob) {
    const bmp = await createImageBitmap(blob);
    const k = Math.max(W / bmp.width, H / bmp.height);
    const w = bmp.width * k;
    const h = bmp.height * k;
    ctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
    bmp.close();
  }
  // Локальный градиент под текстом
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, 'rgba(10,14,24,0)');
  g.addColorStop(1, 'rgba(10,14,24,0.88)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const top = ctx.createLinearGradient(0, 0, 0, 200);
  top.addColorStop(0, 'rgba(10,14,24,0.55)');
  top.addColorStop(1, 'rgba(10,14,24,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 200);

  const pad = 80;
  let y = H - pad;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '500 30px "Inter Variable", Inter, system-ui, sans-serif';
  const meta = [formatDate(m.date), o.includePlace && m.place?.name ? m.place.name : null].filter(Boolean).join(' · ');
  if (o.includeCoords && m.place?.lat != null) {
    ctx.fillText(`${m.place.lat.toFixed(4)}, ${m.place.lng?.toFixed(4)}`, pad, y);
    y -= 46;
  }
  ctx.fillText(meta.toUpperCase(), pad, y);
  y -= 64;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 76px "PT Serif", Georgia, serif';
  const lines = wrap(ctx, m.title, W - pad * 2);
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillText(lines[i], pad, y);
    y -= 86;
  }
  if (o.includeQuote && m.generation.captions[0]) {
    ctx.font = 'italic 400 38px "PT Serif", Georgia, serif';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    const q = wrap(ctx, `«${m.generation.captions[0]}»`, W - pad * 2).slice(0, 3);
    y -= 10;
    for (let i = q.length - 1; i >= 0; i--) {
      ctx.fillText(q[i], pad, y);
      y -= 48;
    }
  }
  // Свечение-акцент из палитры дня и знак MOMENTA
  ctx.fillStyle = rgba(m.generation.art.glowColor, 0.95);
  ctx.fillRect(pad, H - pad + 22, 120, 4);
  ctx.strokeStyle = '#AAB8CB';
  ctx.lineWidth = 4;
  roundRect(ctx, pad, 64, 40, 40, 9);
  ctx.strokeStyle = '#91A9D1';
  ctx.fillStyle = '#1C2A40';
  roundRect(ctx, pad + 18, 74, 42, 42, 9, true);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '400 34px "DM Serif Display", Georgia, serif';
  ctx.fillText('MOMENTA', pad + 80, 106);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Не удалось создать PNG'))), 'image/png'));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  ctx.stroke();
}

const LOG_KEY = 'momenta-share-log';

export function shareLog(): ShareLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

function logShare(e: Omit<ShareLogEntry, 'id' | 'at'>) {
  const list = [{ ...e, id: uuid(), at: new Date().toISOString() }, ...shareLog()].slice(0, 50);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(list));
  } catch {
    /* журнал необязателен */
  }
}

/** Системное меню обмена, если оно поддерживает файлы; иначе — скачивание PNG. */
export async function shareMemory(m: Memory, o: ShareOptions): Promise<'share' | 'download' | 'cancel'> {
  const png = await renderShareCard(m, o);
  const safe = m.title.replace(/[^\p{L}\p{N} -]/gu, '').trim().replace(/\s+/g, '-') || 'momenta';
  const files: File[] = [new File([png], `${safe}.png`, { type: 'image/png' })];
  if (o.includeVoice && m.voice) {
    const v = await getBlob(m.voice.blobId);
    if (v) files.push(new File([v], `${safe}-голос.${m.voice.mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: m.voice.mime }));
  }
  const text = `${m.title} · ${formatDate(m.date)}`;
  const items = shareItems(m, o);
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: m.title, text });
      logShare({ memoryId: m.id, items, method: 'share' });
      return 'share';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancel';
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  logShare({ memoryId: m.id, items, method: 'download' });
  return 'download';
}
