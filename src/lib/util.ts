import type { Category, Season } from './types';

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

/** Детерминированный хеш строки (FNV-1a, 32 бита). */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Детерминированный генератор случайных чисел mulberry32. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Русская форма множественного числа: plural(5, ['день','дня','дней']) */
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** Количество слов: дефисное слово — одно слово, тире и знаки не считаются. */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function titleWordStatus(title: string): { count: number; ok: boolean; message: string } {
  const count = countWords(title);
  if (count === 0) return { count, ok: false, message: 'Введите название' };
  if (count < 3) return { count, ok: false, message: `${count} ${plural(count, ['слово', 'слова', 'слов'])} — нужно от 3 до 7` };
  if (count > 7) return { count, ok: false, message: `${count} ${plural(count, ['слово', 'слова', 'слов'])} — сократите до 7` };
  return { count, ok: true, message: `${count} ${plural(count, ['слово', 'слова', 'слов'])} · подходит` };
}

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export function formatDate(iso: string, withYear = true): string {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;
}

export function seasonFromDate(iso: string): Season {
  const m = parseISODate(iso).getMonth();
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

export const SEASON_LABEL: Record<Season, string> = { winter: 'Зима', spring: 'Весна', summer: 'Лето', autumn: 'Осень' };
export const SEASON_SEARCH: Record<Season, string[]> = {
  winter: ['зима', 'зимой', 'зимний', 'зимние'],
  spring: ['весна', 'весной', 'весенний', 'весенние'],
  summer: ['лето', 'летом', 'летний', 'летние'],
  autumn: ['осень', 'осенью', 'осенний', 'осенние'],
};

export const CATEGORY_LABEL: Record<Category, string> = {
  travel: 'Путешествия',
  meeting: 'Встречи',
  holiday: 'Праздники',
  study: 'Учёба',
  personal: 'Личное',
};

export const WEATHER_LABEL: Record<string, string> = {
  '': 'Не указана',
  sun: 'Солнечно',
  cloud: 'Облачно',
  rain: 'Дождь',
  snow: 'Снег',
  fog: 'Туман',
  wind: 'Ветер',
  storm: 'Гроза',
};

export function normalizeRu(s: string) {
  return s.toLowerCase().replace(/ё/g, 'е');
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function hslToHex(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** Тот же оттенок, но не темнее minL и не бледнее minS — для свечения и геометрии поверх тёмной сцены. */
export function liftColor(hex: string, minL = 0.6, minS = 0.5) {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  if (l >= minL && s >= minS) return hex.toUpperCase();
  return hslToHex(h, Math.max(s, minS), Math.max(l, minL));
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Русское название цвета по HSL — для объяснений. */
export function colorName(h: number, s: number, l: number): string {
  if (s < 0.12) {
    if (l > 0.85) return 'молочный';
    if (l > 0.6) return 'серебристый';
    if (l > 0.3) return 'серый';
    return 'графитовый';
  }
  if (l < 0.18) return h > 180 && h < 280 ? 'глубокий синий' : 'тёмный';
  if (h < 15 || h >= 345) return l > 0.6 ? 'розовый' : 'терракотовый';
  if (h < 35) return l > 0.6 ? 'персиковый' : 'медный';
  if (h < 50) return s > 0.45 ? (l > 0.55 ? 'янтарный' : 'охра') : 'песочный';
  if (h < 70) return l > 0.6 ? 'соломенный' : 'оливково-жёлтый';
  if (h < 95) return 'оливковый';
  if (h < 150) return l > 0.55 ? 'светло-зелёный' : 'лесной зелёный';
  if (h < 185) return 'бирюзовый';
  if (h < 215) return l > 0.55 ? 'небесный' : 'синий';
  if (h < 250) return l > 0.55 ? 'лавандовый' : 'индиго';
  if (h < 290) return 'фиолетовый';
  if (h < 330) return 'пурпурный';
  return 'малиновый';
}

/** Неразрывный пробел после коротких предлогов и союзов: «и» не остаётся в конце строки. */
export function typo(text: string) {
  return text.replace(/(^|[\s«(])(и|в|во|на|с|со|у|к|о|об|а|но|за|из|до|по|от|не|ни|же|под|над)\s+/giu, '$1$2 ');
}

export function fmtSec(ms: number) {
  return (ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' с';
}

export function pct(v: number) {
  return Math.round(v * 100) + '%';
}
