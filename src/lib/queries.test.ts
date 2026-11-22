import { describe, expect, it } from 'vitest';
import { buildSongProfile } from '../engine/audioAnalysis';
import { analyzeText } from '../engine/textAnalysis';
import { fitWords, suggestTitle } from '../engine/title';
import { mapDraftStep } from '../store/draft';
import { homeEvent, onThisDay, remaining, searchMemories, songLibrary } from './queries';
import type { CountdownEvent, Memory } from './types';
import { countWords, titleWordStatus, typo } from './util';

const mem = (id: string, date: string, extra: Partial<Memory> = {}): Memory =>
  ({
    id,
    date,
    title: `День ${id}`,
    text: 'Пили чай у окна',
    season: 'autumn',
    category: 'personal',
    photos: [],
    coverId: null,
    song: null,
    voice: null,
    place: null,
    weather: '',
    generation: { song: null } as unknown as Memory['generation'],
    ...extra,
  }) as Memory;

describe('On This Day', () => {
  const list = [mem('a', '2025-11-22'), mem('b', '2024-11-22'), mem('c', '2025-11-21'), mem('d', '2026-11-22')];
  it('находит тот же день и месяц в прошлых годах', () => {
    expect(onThisDay(list, '2026-11-22').map((m) => m.id)).toEqual(['a', 'b']);
  });
  it('честно возвращает пусто без совпадений', () => {
    expect(onThisDay(list, '2026-03-01')).toEqual([]);
  });
});

describe('поиск архива', () => {
  const list = [
    mem('a', '2025-07-21', { season: 'summer', text: 'Поднялись на перевал', song: { source: 'file', title: 'Высота 2800', artist: 'Demo', genre: '', mood: '' } }),
    mem('b', '2025-11-22', { text: 'Шёл дождь, запах корицы' }),
  ];
  const f = { q: '', year: '', month: '', sort: 'new' as const };
  it('по фразе, сезону, месяцу, году и песне', () => {
    expect(searchMemories(list, { ...f, q: 'корицы' }).map((m) => m.id)).toEqual(['b']);
    expect(searchMemories(list, { ...f, q: 'лето' }).map((m) => m.id)).toEqual(['a']);
    expect(searchMemories(list, { ...f, q: 'июль' }).map((m) => m.id)).toEqual(['a']);
    expect(searchMemories(list, { ...f, year: '2025', month: '11' }).map((m) => m.id)).toEqual(['b']);
    expect(searchMemories(list, { ...f, q: 'высота' }).map((m) => m.id)).toEqual(['a']);
    // по началу слова, а не по случайной подстроке («лед» внутри «последним»)
    const tricky = [mem('c', '2025-01-01', { text: 'Последним запомнился запах' }), mem('d', '2025-01-02', { text: 'Ледяной ветер' })];
    expect(searchMemories(tricky, { ...f, q: 'лёд' }).map((m) => m.id)).toEqual(['d']);
  });
  it('библиотека песен связывает трек с днями', () => {
    const lib = songLibrary([...list, mem('c', '2026-01-01', { song: list[0].song })]);
    expect(lib[0].memories.map((m) => m.id).sort()).toEqual(['a', 'c']);
  });
});

describe('Countdown', () => {
  const ev = (id: string, datetime: string, memoryId: string | null = null): CountdownEvent => ({ id, title: id, datetime, coverBlobId: null, description: '', category: 'travel', memoryId, createdAt: '' });
  const now = new Date('2026-11-22T12:00').getTime();
  it('состоявшееся без воспоминания важнее будущего', () => {
    expect(homeEvent([ev('future', '2026-12-10T07:30'), ev('past', '2026-11-21T19:00')], now)?.id).toBe('past');
  });
  it('после создания воспоминания — ближайшее будущее', () => {
    expect(homeEvent([ev('future', '2026-12-10T07:30'), ev('past', '2026-11-21T19:00', 'm1')], now)?.id).toBe('future');
  });
  it('считает остаток', () => {
    const r = remaining('2026-11-25T12:00', now);
    expect(r.past).toBe(false);
    expect(r.days).toBe(3);
  });
});

describe('названия 2/3/7/8 слов', () => {
  it('проверка ручного ввода', () => {
    expect(titleWordStatus('Осенний парк').ok).toBe(false);
    expect(titleWordStatus('Осенний парк и какао').ok).toBe(true);
    expect(titleWordStatus('Один два три четыре пять шесть семь').ok).toBe(true);
    expect(titleWordStatus('Один два три четыре пять шесть семь восемь').ok).toBe(false);
  });
  it('генератор дополняет и обрезает', () => {
    const a = analyzeText('Гуляли с друзьями вечером.');
    expect(countWords(fitWords('Каток', a, 'winter'))).toBeGreaterThanOrEqual(3);
    expect(countWords(fitWords('Один два три четыре пять шесть семь восемь девять', a, 'winter'))).toBe(7);
  });
  it('дополнение не повторяет сезон, который уже есть в названии', () => {
    const a = analyzeText('Тишина и белый свет.');
    expect(fitWords('Осеннее озеро', a, 'autumn')).toBe('Осеннее озеро в тот день');
    const t = 'Первый лёд на озере, тишина и белый свет.';
    // Генератор передаёт сезон из слов текста («лёд» → зима), а не из месяца.
    expect(suggestTitle(t, analyzeText(t), 'winter').title).toBe('Зимнее озеро и лёд');
    expect(analyzeText(t).seasonHits.map((h) => h.season)).toContain('winter');
  });

  it('черновики семишагового мастера открываются на соответствующем шаге', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((s) => mapDraftStep(s))).toEqual([0, 0, 0, 1, 2, 2, 3]);
    expect(mapDraftStep(2, 2)).toBe(2);
  });

  it('имя рядом распознаётся', () => {
    expect(analyzeText('Гуляли по парку с Машей').people.map((p) => p.entry.phrase)).toContain('с Машей');
  });
  it('неразрывный пробел после предлога', () => {
    expect(typo('Осенний парк и какао')).toBe('Осенний парк и какао');
  });
});

describe('профиль песни', () => {
  it('ручной BPM важнее измерения', () => {
    const p = buildSongProfile({ source: 'file', title: 't', artist: '', genre: '', mood: '', bpm: 76, audio: { durationSec: 24, rms: 0.05, energy: 0.3, peaksPerSec: 0.5, bpm: 74, bpmConfidence: 0.4, dynamicRangeDb: 9 } });
    expect(p.bpm).toBe(76);
    expect(p.bpmSource).toBe('manual');
    expect(p.energySource).toBe('measured');
  });
  it('описание даёт оценку и помечает её', () => {
    const p = buildSongProfile({ source: 'description', title: 'Кухонный хор', artist: '', genre: 'акустический поп', mood: 'радостное' });
    expect(p.bpmSource).toBe('description');
    expect(p.bpm).toBe(112);
  });
});
