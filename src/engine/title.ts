/**
 * Название папки дня: строго 3–7 слов в едином дневниковом тоне.
 * Порядок шаблонов: время+место+цель → место+деталь → событие+место → место → событие → фраза автора.
 */
import type { Season } from '../lib/types';
import { countWords } from '../lib/util';
import { SEASON_ADJ, SEASON_ADVERB, TIME_ADJ, type Gender } from './lexicon';
import { extractPhrases, tokenize, type TextAnalysis } from './textAnalysis';

export interface TitleResult {
  title: string;
  reason: string;
}

const STOP_START = new Set(['мы', 'я', 'сегодня', 'и', 'а', 'но', 'вот', 'потом', 'там', 'тут', 'это', 'так', 'ну', 'вчера', 'когда']);
const STOP_END = new Set(['и', 'а', 'но', 'в', 'на', 'с', 'со', 'по', 'за', 'к', 'у', 'о', 'от', 'до', 'из', 'что', 'как', 'под', 'над']);

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function adjFor(gender: Gender, a: TextAnalysis, season: Season): string {
  if (a.timeOfDay) return TIME_ADJ[a.timeOfDay.key][gender];
  return SEASON_ADJ[season][gender];
}

export function suggestTitle(text: string, a: TextAnalysis, season: Season): TitleResult {
  const place = a.places[0]?.entry;
  const event = a.events[0]?.entry;
  const purposeEvent = a.events.find((e) => e.entry.purpose)?.entry;
  // Деталь, которая не дублирует сезон (листья уже скажет «Осенний»).
  const details = a.details.map((d) => d.entry);
  const detail = details.find((d) => !d.season && d.key !== place?.key) ?? details.find((d) => d.key !== place?.key);
  const people = a.people[0]?.entry;

  let title = '';
  let reason = '';

  if (purposeEvent && place) {
    const noun = a.timeOfDay?.noun ?? 'День';
    title = `${noun} ${place.loc} ${purposeEvent.purpose}`;
    reason = `время «${a.timeOfDay?.word ?? 'день'}», место «${a.places[0].word}» и цель «${a.events.find((e) => e.entry.purpose)!.word}»`;
  } else if (place && detail) {
    title = place.key === 'дом'
      ? `${a.timeOfDay?.noun ?? 'Вечер'} дома и ${detail.nom}`
      : `${adjFor(place.gender, a, season)} ${place.nom} и ${detail.nom}`;
    reason = `место «${a.places[0].word}», ${a.timeOfDay ? `время «${a.timeOfDay.word}»` : `сезон «${SEASON_ADVERB[season]}»`} и деталь «${a.details.find((d) => d.entry === detail)!.word}»`;
  } else if (event && place) {
    title = `${adjFor(event.gender, a, season)} ${event.nom} ${place.loc}`;
    reason = `событие «${a.events[0].word}» и место «${a.places[0].word}»`;
  } else if (place) {
    title = `${adjFor(place.gender, a, season)} ${place.nom} ${people?.phrase ?? ''}`.trim();
    reason = `место «${a.places[0].word}»${people ? ` и люди рядом «${a.people[0].word}»` : ''}`;
  } else if (event) {
    title = `${adjFor(event.gender, a, season)} ${event.nom} ${people?.phrase ?? (detail ? `и ${detail.nom}` : '')}`.trim();
    reason = `событие «${a.events[0].word}»${people ? ` и люди «${a.people[0].word}»` : detail ? ` и деталь «${detail.nom}»` : ''}`;
  } else if (detail && a.timeOfDay) {
    const second = details.find((d) => d !== detail);
    title = `${a.timeOfDay.noun}, ${detail.nom}${second ? ` и ${second.nom}` : ` ${people?.phrase ?? SEASON_ADVERB[season]}`}`;
    reason = `время «${a.timeOfDay.word}» и детали дня`;
  } else {
    const phrase = pickAuthorPhrase(text, a);
    title = phrase;
    reason = 'в записи нет знакомых мест и событий — взята фраза автора';
  }

  title = fitWords(cap(title.replace(/\s+/g, ' ').trim()), a, season);
  return { title, reason };
}

function pickAuthorPhrase(text: string, a: TextAnalysis): string {
  const { phrases, finale } = extractPhrases(a);
  const source = phrases[0] ?? finale ?? text;
  const toks = tokenize(source).map((t) => t.raw);
  while (toks.length && STOP_START.has(toks[0].toLowerCase())) toks.shift();
  return toks.slice(0, 6).join(' ');
}

/** Приводит название к 3–7 словам, дополняя контекстом из той же записи. */
export function fitWords(title: string, a: TextAnalysis, season: Season): string {
  let words = title.split(/\s+/).filter(Boolean);
  if (countWords(title) > 7) {
    words = words.slice(0, 7);
    while (words.length > 3 && STOP_END.has(words[words.length - 1].toLowerCase())) words.pop();
  }
  const pads = [
    a.people[0] && !title.includes(a.people[0].entry.phrase) ? a.people[0].entry.phrase : null,
    a.timeOfDay && !title.toLowerCase().includes(a.timeOfDay.noun.toLowerCase()) ? a.timeOfDay.adverb : null,
    SEASON_ADVERB[season],
    'в тот день',
  ].filter(Boolean) as string[];
  // Не повторяем корень, который уже есть в названии («Осеннее озеро осенью»).
  const stem = (w: string) => w.toLowerCase().replace(/ё/g, 'е').slice(0, 4);
  const repeats = (pad: string) => pad.split(' ').some((p) => p.length > 3 && words.some((w) => stem(w) === stem(p)));
  let i = 0;
  while (countWords(words.join(' ')) < 3 && i < pads.length) {
    if (!repeats(pads[i])) words.push(...pads[i].split(' '));
    i++;
  }
  let out = words.join(' ').replace(/[,.;:]+$/, '');
  if (!out) out = 'Один день из жизни';
  return cap(out);
}
