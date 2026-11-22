/** Выборки по общему архиву: поиск, «В этот день», сезоны, песни, Countdown. Все представления используют Memory.id. */
import type { CountdownEvent, Memory, Season } from './types';
import { CATEGORY_LABEL, MONTHS_NOM, SEASON_SEARCH, formatDate, normalizeRu, parseISODate, todayISO } from './util';

export interface ArchiveFilter {
  q: string;
  year: string;
  month: string;
  sort: 'new' | 'old';
}

/** Поиск по названию, тексту, месту, песне, месяцу, году и сезону. */
export function searchMemories(list: Memory[], f: ArchiveFilter): Memory[] {
  const words = normalizeRu(f.q).split(/\s+/).filter(Boolean);
  const out = list.filter((m) => {
    if (f.year && m.date.slice(0, 4) !== f.year) return false;
    if (f.month && String(parseISODate(m.date).getMonth() + 1) !== f.month) return false;
    if (!words.length) return true;
    const hay = normalizeRu(
      [
        m.title,
        m.text,
        m.place?.name,
        m.song?.title,
        m.song?.artist,
        m.song?.genre,
        formatDate(m.date),
        MONTHS_NOM[parseISODate(m.date).getMonth()],
        CATEGORY_LABEL[m.category],
        ...SEASON_SEARCH[m.season],
        m.date.slice(0, 4),
      ]
        .filter(Boolean)
        .join(' '),
    );
    // Совпадение по началу слова: «лёд» находит «ледяной», но не «последним».
    const tokens = hay.split(/[^\p{L}\p{N}]+/u);
    return words.every((w) => tokens.some((t) => t.startsWith(w)));
  });
  return out.sort((a, b) => (f.sort === 'new' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
}

/** Совпадение дня и месяца в предыдущих годах. */
export function onThisDay(list: Memory[], today = todayISO()): Memory[] {
  const md = today.slice(5);
  const y = today.slice(0, 4);
  return list.filter((m) => m.date.slice(5) === md && m.date.slice(0, 4) < y).sort((a, b) => b.date.localeCompare(a.date));
}

export function bySeason(list: Memory[], s: Season) {
  return list.filter((m) => m.season === s);
}

export function songKey(m: Memory): string | null {
  if (!m.song || !(m.song.title || m.song.artist)) return null;
  return encodeURIComponent(normalizeRu(`${m.song.title.trim()}|${m.song.artist.trim()}`));
}

export interface SongEntry {
  key: string;
  title: string;
  artist: string;
  year?: number;
  bpm?: number;
  url?: string;
  memories: Memory[];
}

/** Библиотека My Soundtrack: один трек может вести к нескольким дням. */
export function songLibrary(list: Memory[]): SongEntry[] {
  const map = new Map<string, SongEntry>();
  for (const m of list) {
    const k = songKey(m);
    if (!k || !m.song) continue;
    const e = map.get(k) ?? { key: k, title: m.song.title || 'Без названия', artist: m.song.artist, year: m.song.year, bpm: m.generation.song?.bpm, url: m.song.url, memories: [] };
    e.memories.push(m);
    if (!e.url && m.song.url) e.url = m.song.url;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.memories[0].date.localeCompare(a.memories[0].date));
}

export function remaining(datetime: string, now = Date.now()) {
  const t = new Date(datetime).getTime();
  const diff = t - now;
  const past = diff <= 0;
  const abs = Math.abs(diff);
  return {
    past,
    days: Math.floor(abs / 86400000),
    hours: Math.floor((abs % 86400000) / 3600000),
    minutes: Math.floor((abs % 3600000) / 60000),
  };
}

/** Событие для главной: сначала состоявшееся без воспоминания (до 30 дней), иначе ближайшее будущее. */
export function homeEvent(list: CountdownEvent[], now = Date.now()): CountdownEvent | null {
  const passed = list
    .filter((c) => new Date(c.datetime).getTime() <= now && !c.memoryId && now - new Date(c.datetime).getTime() < 30 * 86400000)
    .sort((a, b) => b.datetime.localeCompare(a.datetime))[0];
  if (passed) return passed;
  return list.filter((c) => new Date(c.datetime).getTime() > now).sort((a, b) => a.datetime.localeCompare(b.datetime))[0] ?? null;
}

export function yearsAgo(iso: string, today = todayISO()) {
  return Number(today.slice(0, 4)) - Number(iso.slice(0, 4));
}
