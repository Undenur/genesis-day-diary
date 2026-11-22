/**
 * Анализ записи дня без внешних сервисов: места, события, люди, время суток и года,
 * конкретные детали, спокойствие/движение и отрицания («совсем не грустно»).
 */
import type { Category, Season, Weather } from '../lib/types';
import { clamp, normalizeRu } from '../lib/util';
import {
  CALM_RE, DETAILS, EVENTS, MOVE_RE, NEGATORS, NEG_INTENSIFIERS, NEG_RE, NOSTALGIA_RE, PEOPLE, PLACES, POS_RE,
  SEASON_WORDS, SENSORY_RE, TIME_OF_DAY,
  type DetailEntry, type EventEntry, type PeopleEntry, type PlaceEntry,
} from './lexicon';

export interface Token {
  raw: string;
  norm: string;
  index: number;
}

export interface Hit<T> {
  entry: T;
  word: string;
  index: number;
}

export interface TextAnalysis {
  tokens: Token[];
  wordCount: number;
  sentences: string[];
  places: Hit<PlaceEntry>[];
  events: Hit<EventEntry>[];
  details: Hit<DetailEntry>[];
  people: Hit<PeopleEntry>[];
  timeOfDay: { key: 'morning' | 'evening' | 'night'; noun: string; adverb: string; word: string } | null;
  seasonHits: { season: Season; word: string }[];
  calmWords: string[];
  movementWords: string[];
  positiveWords: string[];
  negativeWords: string[];
  nostalgiaWords: string[];
  sensoryWords: string[];
  negations: string[];
  exclamations: number;
  /** 0 спокойствие … 1 движение */
  dynamics: number;
  /** -1 … +1 */
  valence: number;
  /** Тёплые/холодные ассоциации текста -1 … +1 */
  warmth: number;
  /** Признаки прошлого 0..1 */
  nostalgia: number;
  /** Близость сюжета 0..1 */
  intimacy: number;
  /** Количество конкретных деталей 0..1 */
  detailDensity: number;
  weatherGuess: Weather;
  categoryGuess: Category;
}

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    out.push({ raw: m[0], norm: normalizeRu(m[0]), index: i++ });
  }
  return out;
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}]/u.test(s));
}

function negatedAt(tokens: Token[], i: number): string | null {
  for (let k = 1; k <= 2; k++) {
    const t = tokens[i - k];
    if (!t) break;
    if (NEGATORS.has(t.norm)) {
      const before = tokens[i - k - 1];
      const start = Math.max(0, i - k - (before && NEG_INTENSIFIERS.has(before.norm) ? 1 : 0));
      return tokens.slice(start, i + 1).map((x) => x.raw).join(' ');
    }
  }
  return null;
}

function findAll<T extends { re: RegExp; key: string }>(tokens: Token[], list: T[]): Hit<T>[] {
  const hits: Hit<T>[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    for (const e of list) {
      if (e.re.test(t.norm) && !seen.has(e.key)) {
        seen.add(e.key);
        hits.push({ entry: e, word: t.raw, index: t.index });
      }
    }
  }
  return hits;
}

export function analyzeText(text: string): TextAnalysis {
  const tokens = tokenize(text);
  const sentences = splitSentences(text);
  const places = findAll(tokens, PLACES);
  const events = findAll(tokens, EVENTS);
  const details = findAll(tokens, DETAILS);
  const people = findAll(tokens, PEOPLE);
  // Имена рядом: «с Машей», «со Львом» — слово с заглавной буквы после «с/со».
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1];
    if (prev && (prev.norm === 'с' || prev.norm === 'со') && /^[А-ЯЁ][а-яё]+$/.test(t.raw) && !people.some((p) => p.word === t.raw)) {
      people.push({ entry: { key: `имя:${t.norm}`, re: new RegExp(`^${t.norm}$`), phrase: `${prev.raw.toLowerCase()} ${t.raw}`, close: true, group: false }, word: t.raw, index: t.index });
    }
  });

  let timeOfDay: TextAnalysis['timeOfDay'] = null;
  for (const t of tokens) {
    const hit = TIME_OF_DAY.find((e) => e.re.test(t.norm));
    if (hit) {
      // Ночь важнее вечера, вечер важнее утра — запоминаем «самое тёмное» время.
      const rank = { night: 3, evening: 2, morning: 1 } as const;
      if (!timeOfDay || rank[hit.key] > rank[timeOfDay.key]) timeOfDay = { key: hit.key, noun: hit.noun, adverb: hit.adverb, word: t.raw };
    }
  }

  const seasonHits: TextAnalysis['seasonHits'] = [];
  for (const t of tokens) {
    for (const s of Object.keys(SEASON_WORDS) as Season[]) {
      if (SEASON_WORDS[s].test(t.norm)) seasonHits.push({ season: s, word: t.raw });
    }
  }

  const calmWords: string[] = [];
  const movementWords: string[] = [];
  const positiveWords: string[] = [];
  const negativeWords: string[] = [];
  const nostalgiaWords: string[] = [];
  const sensoryWords: string[] = [];
  const negations: string[] = [];

  tokens.forEach((t, i) => {
    const neg = negatedAt(tokens, i);
    if (CALM_RE.test(t.norm)) {
      if (neg) { movementWords.push(neg); negations.push(neg); } else calmWords.push(t.raw);
    }
    if (MOVE_RE.test(t.norm)) {
      if (neg) { calmWords.push(neg); negations.push(neg); } else movementWords.push(t.raw);
    }
    if (POS_RE.test(t.norm)) {
      if (neg) { negativeWords.push(neg); negations.push(neg); } else positiveWords.push(t.raw);
    }
    if (NEG_RE.test(t.norm)) {
      // «совсем не грустно» — грусть не засчитывается, звучит как спокойное тепло.
      if (neg) { positiveWords.push(neg); calmWords.push(neg); negations.push(neg); } else negativeWords.push(t.raw);
    }
    if (NOSTALGIA_RE.test(t.norm) && !neg) nostalgiaWords.push(t.raw);
    if (SENSORY_RE.test(t.norm) && !neg) sensoryWords.push(t.raw);
  });

  const exclamations = (text.match(/!/g) || []).length;
  const eventEnergy = events.length ? Math.max(...events.map((e) => e.entry.energy ?? 0.5)) : 0.45;
  const nightBoost = timeOfDay?.key === 'night' ? 0.06 : 0;
  const dynamics = clamp(
    0.2 + eventEnergy * 0.4 + movementWords.length * 0.09 - calmWords.length * 0.08 + Math.min(exclamations, 4) * 0.03 + nightBoost,
    0.04,
    0.97,
  );
  const valence = clamp((positiveWords.length - negativeWords.length) / (positiveWords.length + negativeWords.length + 1), -1, 1);

  let warmthSum = 0;
  let warmthN = 0;
  for (const d of details) { warmthSum += d.entry.warmth; warmthN++; }
  for (const h of seasonHits) { warmthSum += h.season === 'summer' ? 0.6 : h.season === 'winter' ? -0.6 : h.season === 'autumn' ? 0.3 : 0.1; warmthN++; }
  if (timeOfDay?.key === 'evening') { warmthSum += 0.3; warmthN++; }
  if (timeOfDay?.key === 'night') { warmthSum -= 0.3; warmthN++; }
  warmthSum += valence * 0.4;
  warmthN += 0.5;
  const warmth = clamp(warmthSum / Math.max(1, warmthN), -1, 1);

  const nostalgia = clamp(0.15 + nostalgiaWords.length * 0.18 + (seasonHits.some((s) => s.season === 'autumn') ? 0.12 : 0) + (calmWords.length ? 0.06 : 0), 0, 1);

  const closePeople = people.filter((p) => p.entry.close).length;
  const groupPeople = people.filter((p) => p.entry.group).length;
  const intimacy = clamp(0.45 + closePeople * 0.18 - groupPeople * 0.14 + calmWords.length * 0.04 - movementWords.length * 0.04 + (people.length === 0 ? 0.08 : 0), 0, 1);

  const detailDensity = clamp((details.length + sensoryWords.length * 0.5 + places.length * 0.5) / 7, 0, 1);

  let weatherGuess: Weather = '';
  for (const d of details) {
    if (d.entry.weather) { weatherGuess = d.entry.weather as Weather; break; }
  }

  const catScores: Record<Category, number> = { travel: 0, meeting: 0, holiday: 0, study: 0, personal: 0.5 };
  for (const e of events) catScores[e.entry.category] += 2;
  for (const p of places) if (p.entry.category) catScores[p.entry.category] += 1;
  if (people.some((p) => p.entry.group && p.entry.key !== 'толпа')) catScores.meeting += 1;
  const categoryGuess = (Object.keys(catScores) as Category[]).reduce((a, b) => (catScores[b] > catScores[a] ? b : a), 'personal');

  return {
    tokens,
    wordCount: tokens.length,
    sentences,
    places,
    events,
    details,
    people,
    timeOfDay,
    seasonHits,
    calmWords,
    movementWords,
    positiveWords,
    negativeWords,
    nostalgiaWords,
    sensoryWords,
    negations,
    exclamations,
    dynamics,
    valence,
    warmth,
    nostalgia,
    intimacy,
    detailDensity,
    weatherGuess,
    categoryGuess,
  };
}

/**
 * Короткие фразы автора для подписей. Сохраняем оригинальные слова,
 * длинные предложения режем по запятым, оцениваем конкретность.
 */
export function extractPhrases(a: TextAnalysis): { phrases: string[]; finale: string | null } {
  const clauses: { text: string; score: number; order: number }[] = [];
  let order = 0;
  for (const s of a.sentences) {
    // Длинное предложение режем на смысловые части; хвосты короче трёх слов приклеиваем к предыдущей части.
    const raw = s.length > 55 ? s.split(/(?:[,;:]|\s[—–])\s+/) : [s];
    const parts: string[] = [];
    for (const r of raw) {
      if (parts.length && tokenize(r).length < 3) parts[parts.length - 1] += `, ${r}`;
      else parts.push(r);
    }
    for (const p of parts) {
      // Союз в начале части («и склад гудел») убираем — слова автора и смысл остаются.
      const clean = p
        .replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, '')
        .replace(/[.!?…]+$/, '')
        .replace(/^(и|а|но|да)\s+/i, '')
        .trim();
      if (!clean) continue;
      const toks = tokenize(clean);
      if (toks.length < 3) continue;
      const set = new Set(toks.map((t) => t.norm));
      let score = 0;
      for (const d of a.details) if ([...set].some((w) => d.entry.re.test(w))) score += 2;
      for (const pl of a.places) if ([...set].some((w) => pl.entry.re.test(w))) score += 1;
      for (const pe of a.people) if ([...set].some((w) => pe.entry.re.test(w))) score += 1;
      for (const w of set) if (SENSORY_RE.test(w)) score += 1.5;
      const len = toks.length;
      score -= Math.abs(len - 6) * 0.35;
      if (len > 11) score -= 3;
      clauses.push({ text: trimPhrase(clean), score, order: order++ });
    }
  }
  if (!clauses.length) return { phrases: [], finale: null };
  const last = clauses[clauses.length - 1];
  const ranked = clauses.slice(0, -1).sort((x, y) => y.score - x.score || x.order - y.order);
  const phrases = ranked.slice(0, 3).sort((x, y) => x.order - y.order).map((c) => c.text);
  if (clauses.length === 1) return { phrases: [], finale: last.text };
  return { phrases, finale: last.text };
}

function trimPhrase(s: string): string {
  let out = s.charAt(0).toUpperCase() + s.slice(1);
  if (out.length > 90) {
    out = out.slice(0, 88);
    out = out.slice(0, out.lastIndexOf(' ')) + '…';
  }
  return out;
}
