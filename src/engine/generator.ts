/**
 * Emotion DNA + генератор сцен RE:LIVE.
 *
 * Контракт: на входе история, признаки фотографий и профиль песни;
 * на выходе название, палитра, пять параметров 0..100, план кадров с длительностями
 * и объяснения решений. Один и тот же ввод → один и тот же результат (seed = хеш ввода).
 *
 * Нормализация: каждый вклад приводится к 0..1, параметр = round(100 · Σ wᵢ·vᵢ / Σ wᵢ).
 * Если источника нет (нет песни) — его вес перераспределяется пропорционально остальным.
 * Значения, взятые из описания трека, а не из сигнала, помечаются estimated = true.
 */
import type {
  ArtDirection, ArtEffect, ArtStyle, Explanation, Generation, ParamDetail, ParamKey, ParamPart,
  PhotoFeatures, Scene, Season, Shot, SongProfile, Weather,
} from '../lib/types';
import { clamp, colorName, hashString, lerp, liftColor, plural, rng, round } from '../lib/util';
import { freeSide, hueDist } from './photoAnalysis';
import { analyzeText, extractPhrases, type TextAnalysis } from './textAnalysis';
import { suggestTitle } from './title';

export const ALGORITHM_VERSION = 'momenta-dna-1.0';

export interface GeneratorInput {
  text: string;
  date: string;
  authorTitle: string;
  season: Season;
  weather: Weather;
  placeName: string;
  photos: PhotoFeatures[];
  coverIndex: number;
  song: SongProfile | null;
  songLabel: string;
}

/** Веса источников для каждого параметра (сумма = 1). */
export const WEIGHTS: Record<ParamKey, { text: number; photo: number; music: number }> = {
  warmth: { photo: 0.6, text: 0.25, music: 0.15 },
  energy: { music: 0.45, text: 0.35, photo: 0.2 },
  density: { photo: 0.4, text: 0.3, music: 0.3 },
  nostalgia: { text: 0.35, photo: 0.3, music: 0.35 },
  intimacy: { text: 0.45, photo: 0.3, music: 0.25 },
};

const f2 = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const sec = (ms: number) => (ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' с';
const quote = (words: string[], n = 2) => words.slice(0, n).map((w) => `«${w.toLowerCase()}»`).join(', ');

export function generateRelive(input: GeneratorInput): Generation {
  const inputHash = hashString(
    JSON.stringify({
      t: input.text,
      d: input.date,
      a: input.authorTitle,
      s: input.season,
      w: input.weather,
      p: input.placeName,
      ph: input.photos.map((p) => [p.palette.map((c) => c.hex), p.brightness, p.contrast, p.detailGrid, p.warmth]),
      c: input.coverIndex,
      m: input.song,
    }),
  );
  const seed = inputHash;
  const rand = rng(seed);
  const a = analyzeText(input.text);
  const cover = input.photos[input.coverIndex] ?? input.photos[0];
  const song = input.song;

  // Сезон для названия и эффектов: слова текста важнее месяца.
  const textSeason = majoritySeason(a);
  const season = textSeason ?? input.season;

  // ---------- Emotion DNA ----------
  const photoAgg = aggregatePhotos(input.photos, input.coverIndex);
  const dateYear = Number(input.date.slice(0, 4)) || 2025;
  const musicEst = song ? song.energySource !== 'measured' : true;

  const sources = {
    warmth: {
      photo: { v: (photoAgg.warmth + 1) / 2, note: `тёплые/холодные тона кадров ${f2(photoAgg.warmth)}` },
      text: { v: (a.warmth + 1) / 2, note: a.details.length || a.seasonHits.length ? `ассоциации текста: ${quote([...a.details.map((d) => d.word), ...a.seasonHits.map((s) => s.word)])}` : 'нейтральный текст' },
      music: song ? { v: musicWarmth(song), note: `${song.scale === 'major' ? 'мажор' : 'минор'}, мягкость ${f2(song.softness)}` } : null,
    },
    energy: {
      music: song ? { v: song.energy, note: `энергия трека ${f2(song.energy)}${song.energySource === 'measured' ? ' (измерено)' : ' (оценка по описанию)'}` } : null,
      text: { v: a.dynamics, note: a.movementWords.length || a.calmWords.length ? `динамика текста ${f2(a.dynamics)}: ${quote([...a.movementWords, ...a.calmWords])}` : `динамика текста ${f2(a.dynamics)}` },
      photo: { v: photoAgg.activity, note: `визуальная активность ${f2(photoAgg.activity)}` },
    },
    density: {
      photo: { v: photoAgg.density, note: `детализация кадров ${f2(photoAgg.activity)}, снимков: ${input.photos.length}` },
      text: { v: a.detailDensity, note: `конкретных деталей в тексте: ${a.details.length}` },
      music: song ? { v: song.attackDensity, note: `плотность атак ${f2(song.attackDensity)}` } : null,
    },
    nostalgia: {
      text: { v: a.nostalgia, note: a.nostalgiaWords.length ? `слова о прошлом: ${quote(a.nostalgiaWords)}` : 'мало слов о прошлом' },
      photo: { v: photoAgg.nostalgia, note: `насыщенность ${f2(cover.saturation)}, контраст ${f2(cover.contrast)}` },
      music: song ? { v: musicNostalgia(song, dateYear), note: `${song.scale === 'minor' ? 'минор' : 'мажор'}, ${song.bpm} BPM${song.year ? `, ${song.year} год` : ''}` } : null,
    },
    intimacy: {
      text: { v: a.intimacy, note: a.people.length ? `рядом: ${quote(a.people.map((p) => p.word))}` : 'никто не назван — камерный рассказ' },
      photo: { v: photoAgg.intimacy, note: `детали в центре кадра ${f2(cover.detailGrid[4])}` },
      music: song ? { v: clamp(song.softness * 0.6 + (1 - song.energy) * 0.4), note: `мягкость звучания ${f2(song.softness)}` } : null,
    },
  } as const;

  const paramDetails = {} as Record<ParamKey, ParamDetail>;
  const params = {} as Record<ParamKey, number>;
  for (const key of Object.keys(WEIGHTS) as ParamKey[]) {
    const parts: ParamPart[] = [];
    const srcs = sources[key] as Record<'text' | 'photo' | 'music', { v: number; note: string } | null>;
    let wSum = 0;
    for (const src of ['text', 'photo', 'music'] as const) {
      const s = srcs[src];
      if (!s) continue;
      wSum += WEIGHTS[key][src];
    }
    let acc = 0;
    for (const src of ['text', 'photo', 'music'] as const) {
      const s = srcs[src];
      if (!s) continue;
      const w = WEIGHTS[key][src] / wSum; // перераспределение веса при отсутствии источника
      acc += w * clamp(s.v);
      parts.push({ source: src, weight: round(w, 2), value: round(clamp(s.v), 2), estimated: src === 'music' && musicEst, note: s.note });
    }
    params[key] = Math.round(acc * 100);
    paramDetails[key] = { value: params[key], parts };
  }

  const E = params.energy / 100;
  const D = params.density / 100;
  const N = params.nostalgia / 100;
  const I = params.intimacy / 100;
  const W = params.warmth / 100;

  const explanations: Explanation[] = [];

  // ---------- Название ----------
  const suggested = suggestTitle(input.text, a, season);
  const authorTitle = input.authorTitle.trim();
  const title = authorTitle || suggested.title;
  explanations.push(
    authorTitle
      ? { topic: 'title', source: 'author', text: `Название «${authorTitle}» задал автор. Генератор предложил бы «${suggested.title}» — по признакам: ${suggested.reason}.` }
      : { topic: 'title', source: 'text', text: `Название «${suggested.title}» собрано из записи: ${suggested.reason}.` },
  );

  // ---------- Палитра ----------
  const palette = cover.palette.map((c) => c.hex);
  const glow = pickGlow(cover, W);
  // Оттенок — из кадра; слишком тёмный тон осветляется, чтобы свечение было видно и на ночной сцене.
  const glowHex = liftColor(glow.hex, 0.56, 0.42);
  const accent = liftColor(cover.palette.find((c) => c.hex !== glow.hex && c.s > 0.15)?.hex ?? glow.hex, 0.5, 0.35);
  explanations.push({
    topic: 'palette',
    source: 'photo',
    text: `Свечение — ${colorName(glow.h, glow.s, glow.l)} ${glow.hex}${glowHex !== glow.hex ? ` (осветлён до ${glowHex})` : ''}: взят из обложки, где занимает ${Math.round(glow.weight * 100)}% площади. Warmth ${params.warmth} ${W >= 0.55 ? 'сдвигает выбор к тёплым тонам кадра' : W <= 0.45 ? 'сдвигает выбор к холодным тонам кадра' : 'держит баланс тёплого и холодного'}.`,
  });

  // ---------- Ритм ----------
  const bpm = song?.bpm ?? Math.round(64 + a.dynamics * 64);
  const beatMs = 60000 / bpm;
  const barMs = beatMs * 4;

  // ---------- Художественный приём ----------
  const night = a.timeOfDay?.key === 'night' || a.events.some((e) => ['концерт', 'вечеринка', 'фестиваль'].includes(e.entry.key)) || a.places.some((p) => p.entry.key === 'клуб');
  const percussive = !!song && (song.attackDensity > 0.45 || song.texture === 'electronic');
  const scores: Record<ArtStyle, number> = {
    kandinsky: E * 0.5 + (night ? 0.2 : 0) + (percussive ? 0.2 : 0) + cover.contrast * 0.25 + (a.movementWords.length ? 0.1 : 0),
    impressionism: (1 - E) * 0.45 + (cover.brightness > 0.3 && cover.brightness < 0.8 ? 0.12 : 0) + (1 - cover.contrast) * 0.2 + (song ? (1 - song.attackDensity) * 0.2 : 0.1) + (a.calmWords.length ? 0.1 : 0),
    minimal: I * 0.35 + (input.photos.length <= 2 ? 0.2 : 0) + (1 - D) * 0.3 + (a.calmWords.length ? 0.05 : 0),
  };
  const style = (Object.keys(scores) as ArtStyle[]).reduce((x, y) => (scores[y] > scores[x] ? y : x));
  explanations.push({ topic: 'style', source: 'estimate', text: styleReason(style, { E, D, I, night, percussive, contrast: cover.contrast, calm: a.calmWords, song, photos: input.photos.length }) });

  // ---------- Эффекты (каждому — сигнал во входных данных) ----------
  const effects = pickEffects(a, input, cover, season, W);
  for (const e of effects) explanations.push({ topic: 'effect', source: e.source, text: e.reason });

  // ---------- Оформление ----------
  const side = freeSide(cover);
  const capRegion = side.side === 'left' ? cover.regionBrightness.left : cover.regionBrightness.right;
  const shadeStrength = round(clamp(0.3 + capRegion * 0.45 + cover.regionBrightness.bottom * 0.25, 0.3, 0.92), 2);
  explanations.push({
    topic: 'layout',
    source: 'photo',
    text: `${
      Math.abs(side.left - side.right) < 0.06
        ? `Детали снимка распределены почти поровну (слева ${f2(side.left)}, справа ${f2(side.right)}) — подпись стоит ${side.side === 'left' ? 'слева' : 'справа'}, где деталей чуть меньше.`
        : `Подпись стоит ${side.side === 'left' ? 'слева' : 'справа'}, потому что основные детали снимка ${side.side === 'left' ? 'справа' : 'слева'} (детализация ${side.side === 'left' ? `справа ${f2(side.right)} против ${f2(side.left)} слева` : `слева ${f2(side.left)} против ${f2(side.right)} справа`}).`
    } Затемнение под текстом ${Math.round(shadeStrength * 100)}% — яркость этой области ${f2(capRegion)}.`,
  });

  let transitionMs = lerp(1750, 380, E) * (1 + (song ? (song.softness - 0.5) * 0.3 : 0)) * (1 + N * 0.15);
  const slowWords = a.calmWords.filter((w) => /неспешн|медленн|нетороп|плавн|лениво|размерен/i.test(w));
  if (slowWords.length) transitionMs *= 1.18;
  transitionMs = clamp(Math.round(transitionMs / (beatMs / 4)) * (beatMs / 4), 280, 2400);
  explanations.push({
    topic: 'rhythm',
    source: song ? 'music' : 'estimate',
    text: `${song ? `Трек на ${bpm} BPM` : `Без песни темп ${bpm} BPM выведен из динамики текста`}: доля ${sec(beatMs)}, такт ${sec(barMs)} — шаг монтажа кратен такту. Переход ${sec(transitionMs)}: Energy ${params.energy}${song ? `, мягкость трека ${f2(song.softness)}` : ''}${slowWords.length ? `, слово ${quote(slowWords, 1)} удлинило растворение` : ''}.`,
  });

  const filterFor = (s: ArtStyle) => {
    const hue = round((0.5 - W) * 14, 1);
    if (s === 'kandinsky') return `saturate(${round(1.12 + E * 0.25, 2)}) contrast(${round(1.06 + E * 0.14, 2)}) brightness(0.97) hue-rotate(${hue}deg)`;
    if (s === 'impressionism') return `saturate(${round(1.02 + W * 0.12, 2)}) contrast(0.9) brightness(1.05) sepia(${round(N * 0.28, 2)}) hue-rotate(${hue}deg)`;
    return `saturate(0.86) contrast(1.03) brightness(1.02) sepia(${round(N * 0.16, 2)}) hue-rotate(${hue}deg)`;
  };

  const art: ArtDirection = {
    style,
    effects: effects.map((e) => e.effect),
    palette,
    glowColor: glowHex,
    accent,
    grain: round(clamp(N * 0.85 + (style === 'impressionism' ? 0.12 : 0)), 2),
    softness: round(clamp(N * 0.6 + (song?.softness ?? 0.5) * 0.4), 2),
    glowAmp: round(0.15 + E * 0.85, 2),
    motionAmp: round(0.3 + E * 0.7, 2),
    particleCount: Math.round(10 + D * 50),
    tiltDeg: round((E - 0.5) * 2 * (style === 'kandinsky' ? 14 : 5) * (rand() > 0.5 ? 1 : -1), 1),
    titleGap: Math.round(10 + (1 - D) * 22),
    titleSize: Math.round(28 + I * 14),
    transitionMs: Math.round(transitionMs),
    pulseMs: Math.round(beatMs),
    captionAlign: side.side,
    shadeStrength,
    photoFilter: filterFor(style),
  };

  explanations.push({
    topic: 'param',
    source: 'estimate',
    text: `Nostalgia ${params.nostalgia} → зерно ${Math.round(art.grain * 100)}% и мягкость ${Math.round(art.softness * 100)}%. Intimacy ${params.intimacy} → кадрирование ближе и подпись ${art.titleSize} px. Density ${params.density} → ${art.particleCount} ${plural(art.particleCount, ['деталь', 'детали', 'деталей'])} в сцене и интервал ${art.titleGap} px между заголовком и подписью.`,
  });

  if (a.negations.length) {
    explanations.push({ topic: 'caption', source: 'text', text: `Отрицание учтено: ${quote(a.negations, 3)} — смысл не перевёрнут, слово не засчитано как противоположная эмоция.` });
  }

  // ---------- Сцены ----------
  const { phrases, finale } = extractPhrases(a);
  const scenes = buildScenes(input, { E, D, I, barMs, beatMs, rand, phrases, finale });
  const totalMs = scenes.reduce((s, x) => s + x.durationMs, 0);
  explanations.push({
    topic: 'rhythm',
    source: 'estimate',
    text: `${scenes.length} ${scenes.length === 3 ? 'сцены' : scenes.length === 4 ? 'сцены' : 'сцен'} на ${sec(totalMs)}: ${scenes.map((s) => `${s.bars} ${s.bars === 1 ? 'такт' : s.bars < 5 ? 'такта' : 'тактов'}`).join(' · ')}. Цель по Energy ${params.energy}: ${E > 0.55 ? 'короче и плотнее' : 'длиннее и спокойнее'}.`,
  });
  const captions = scenes.map((s) => s.caption).filter(Boolean) as string[];
  if (captions.length) {
    explanations.push({ topic: 'caption', source: 'text', text: `Подписи — фразы автора без пересказа: ${captions.map((c) => `«${c}»`).join(' / ')}.` });
  }
  explanations.push({
    topic: 'sound',
    source: song ? 'music' : 'estimate',
    text: song ? song.notes.join('. ') + `. Пульс свечения — каждые ${sec(beatMs)}, амплитуда ${Math.round(art.glowAmp * 100)}%.` : 'Песня не указана: синтез MOMENTA соберёт фон из темпа и настроения текста.',
  });

  return {
    algorithmVersion: ALGORITHM_VERSION,
    seed,
    inputHash: inputHash.toString(16),
    title,
    titleSource: authorTitle ? 'author' : 'generator',
    suggestedTitle: suggested.title,
    params,
    paramDetails,
    art,
    scenes,
    totalMs,
    beatMs: round(beatMs, 1),
    captions,
    explanations,
    song,
    textSummary: {
      places: a.places.map((p) => p.word),
      events: a.events.map((e) => e.word),
      people: a.people.map((p) => p.word),
      details: a.details.map((d) => d.word),
      timeOfDay: a.timeOfDay?.word ?? null,
      seasonWords: a.seasonHits.map((s) => s.word),
      calmWords: a.calmWords,
      movementWords: a.movementWords,
      negations: a.negations,
      dynamics: round(a.dynamics, 2),
      valence: round(a.valence, 2),
    },
  };
}

function majoritySeason(a: TextAnalysis): Season | null {
  if (!a.seasonHits.length) return null;
  const c: Record<string, number> = {};
  for (const h of a.seasonHits) c[h.season] = (c[h.season] || 0) + 1;
  return Object.keys(c).reduce((x, y) => (c[y] > c[x] ? y : x)) as Season;
}

function aggregatePhotos(photos: PhotoFeatures[], coverIndex: number) {
  const cover = photos[coverIndex] ?? photos[0];
  const others = photos.filter((_, i) => i !== coverIndex);
  const avg = (fn: (p: PhotoFeatures) => number) => (others.length ? others.reduce((s, p) => s + fn(p), 0) / others.length : fn(cover));
  const mix = (fn: (p: PhotoFeatures) => number) => fn(cover) * 0.6 + avg(fn) * 0.4;
  const warmth = mix((p) => p.warmth);
  const activity = mix((p) => p.activity);
  const sat = mix((p) => p.saturation);
  const con = mix((p) => p.contrast);
  const g = cover.detailGrid;
  const edgeMean = (g.reduce((s, v) => s + v, 0) - g[4]) / 8;
  return {
    warmth,
    activity,
    density: clamp(activity * 0.7 + (Math.min(photos.length, 6) / 6) * 0.3),
    nostalgia: clamp((1 - sat) * 0.5 + (1 - con) * 0.3 + Math.max(0, warmth) * 0.2),
    intimacy: clamp(0.35 + (g[4] - edgeMean) * 0.6 + (photos.length <= 2 ? 0.15 : -0.04 * (photos.length - 2))),
  };
}

function musicWarmth(s: SongProfile) {
  const tex = { piano: 0.2, acoustic: 0.2, ambient: 0.08, electronic: -0.05 }[s.texture];
  return clamp(0.35 + (s.scale === 'major' ? 0.12 : -0.04) + s.softness * 0.25 + tex);
}

function musicNostalgia(s: SongProfile, dateYear: number) {
  const age = s.year ? clamp((dateYear - s.year) / 40) : 0;
  return clamp(0.2 + (s.scale === 'minor' ? 0.22 : 0) + (s.bpm < 80 ? 0.18 : 0) + age * 0.35 + s.softness * 0.12);
}

function pickGlow(cover: PhotoFeatures, W: number) {
  const cands = cover.palette.filter((c) => c.s > 0.18 && c.l > 0.25 && c.l < 0.8);
  const pool = cands.length ? cands : cover.palette;
  const warmScore = (c: { h: number }) => 1 - Math.min(hueDist(c.h, 35), 180) / 180;
  const bias = (W - 0.5) * 2; // >0 — к тёплым, <0 — к холодным
  // Площадь цвета важна, но для свечения предпочитаем насыщенные тона кадра.
  const score = (c: PhotoFeatures['palette'][number]) => c.weight + c.s * 0.3 + bias * (warmScore(c) - 0.5) * 0.6;
  return [...pool].sort((x, y) => score(y) - score(x))[0];
}

function styleReason(
  style: ArtStyle,
  c: { E: number; D: number; I: number; night: boolean; percussive: boolean; contrast: number; calm: string[]; song: SongProfile | null; photos: number },
) {
  if (style === 'kandinsky') {
    return `Геометрические переклички в духе Кандинского: ${[c.night ? 'ночной сюжет' : null, c.percussive ? `ударные акценты трека (плотность атак ${f2(c.song!.attackDensity)})` : null, `контраст кадра ${f2(c.contrast)}`, `Energy ${Math.round(c.E * 100)}`].filter(Boolean).join(', ')}. Фигуры встают на самые контрастные зоны и вспыхивают на долю.`;
  }
  if (style === 'impressionism') {
    return `Рассеянный свет в духе импрессионизма: ${[c.calm.length ? `спокойные слова ${quote(c.calm)}` : null, `мягкий контраст ${f2(c.contrast)}`, c.song ? `редкие атаки (${f2(c.song.attackDensity)})` : null, `Energy ${Math.round(c.E * 100)}`].filter(Boolean).join(', ')}. Свет ложится мазками, зерно смягчает края.`;
  }
  return `Минимализм с воздухом: камерный сюжет (Intimacy ${Math.round(c.I * 100)}), ${c.photos} ${c.photos === 1 ? 'кадр' : c.photos < 5 ? 'кадра' : 'кадров'} и неторопливый рассказ (Density ${Math.round(c.D * 100)}). Много пустого пространства, тонкая рамка.`;
}

function pickEffects(a: TextAnalysis, input: GeneratorInput, cover: PhotoFeatures, season: Season, W: number) {
  const out: { effect: ArtEffect; strength: number; reason: string; source: Explanation['source'] }[] = [];
  const has = (keys: string[]) => a.details.filter((d) => keys.includes(d.entry.key)).map((d) => d.word);
  const greenWeight = cover.palette.filter((c) => c.h >= 70 && c.h <= 165 && c.s > 0.18).reduce((s, c) => s + c.weight, 0);

  const warmWords = has(['закат', 'лампа', 'свечи', 'костёр', 'гирлянды', 'фонари', 'какао', 'глинтвейн']);
  const summer = a.seasonHits.filter((s) => s.season === 'summer').map((s) => s.word);
  if (warmWords.length || summer.length || (cover.warmth > 0.3 && cover.brightness > 0.3)) {
    out.push({
      effect: 'amber-halo',
      strength: warmWords.length + summer.length + Math.max(0, cover.warmth) * 2,
      source: warmWords.length || summer.length ? 'text' : 'photo',
      reason: `Янтарные ореолы: ${warmWords.length || summer.length ? `в записи ${quote([...warmWords, ...summer])}` : `тёплая обложка (тепло ${f2(cover.warmth)})`}${W > 0.55 ? `, Warmth ${Math.round(W * 100)}` : ''}.`,
    });
  }
  const snow = [...has(['снег', 'мандарины', 'глинтвейн']), ...a.seasonHits.filter((s) => s.season === 'winter').map((s) => s.word)];
  if (snow.length || input.weather === 'snow' || (season === 'winter' && cover.warmth < -0.15 && cover.brightness > 0.55)) {
    out.push({
      effect: 'silver-shimmer',
      strength: snow.length + (input.weather === 'snow' ? 2 : 0) + 1,
      source: snow.length ? 'text' : 'photo',
      reason: `Серебристое мерцание: ${snow.length ? `зимние слова ${quote([...new Set(snow)])}` : input.weather === 'snow' ? 'погода «снег»' : `холодный светлый кадр (яркость ${f2(cover.brightness)})`}.`,
    });
  }
  const spring = [...has(['цветы', 'сирень']), ...a.seasonHits.filter((s) => s.season === 'spring').map((s) => s.word)];
  if (spring.length) {
    out.push({ effect: 'light-particles', strength: spring.length + 1, source: 'text', reason: `Редкие светлые частицы: весенние слова ${quote(spring)}.` });
  }
  const nature = a.places.filter((p) => ['лес', 'горы', 'сад', 'парк', 'перевал'].includes(p.entry.key)).map((p) => p.word);
  if (nature.length || greenWeight > 0.25) {
    out.push({
      effect: 'organic-forms',
      strength: nature.length + greenWeight * 3,
      source: nature.length ? 'text' : 'photo',
      reason: `Органические формы: ${nature.length ? `место ${quote(nature)}` : ''}${nature.length && greenWeight > 0.25 ? ' и ' : ''}${greenWeight > 0.25 ? `зелёные тона занимают ${Math.round(greenWeight * 100)}% обложки` : ''}.`,
    });
  }
  const rain = has(['дождь', 'стекло']);
  if (rain.length || input.weather === 'rain') {
    out.push({
      effect: 'muted-reflections',
      strength: rain.length + (input.weather === 'rain' ? 2 : 0) + 1,
      source: rain.length ? 'text' : 'estimate',
      reason: `Приглушённые отражения: ${rain.length ? `в записи ${quote(rain)}` : 'погода «дождь»'}.`,
    });
  }
  return out.sort((x, y) => y.strength - x.strength).slice(0, 3);
}

function buildScenes(
  input: GeneratorInput,
  c: { E: number; D: number; I: number; barMs: number; beatMs: number; rand: () => number; phrases: string[]; finale: string | null },
): Scene[] {
  const n = input.photos.length;
  const coverIdx = Math.min(input.coverIndex, n - 1);
  const order = input.photos.map((_, i) => i);
  const lastIdx = order[n - 1];

  // Середина: кадры в пользовательском порядке без обложки (и без финального кадра, если кадров ≥3).
  let middle = order.filter((i) => i !== coverIdx);
  if (n >= 3 && lastIdx !== coverIdx) middle = middle.filter((i) => i !== lastIdx);
  if (!middle.length) middle = [coverIdx];
  // Финал — последняя деталь дня; если этот кадр уже звучал в середине, возвращаемся к обложке.
  const finaleIdx = middle.includes(lastIdx) ? coverIdx : lastIdx;

  const perScene = c.D > 0.55 ? 2 : 1;
  const middleCount = clamp(Math.ceil(middle.length / perScene), 1, 3);
  const groups: number[][] = Array.from({ length: middleCount }, () => []);
  middle.forEach((p, i) => groups[Math.min(middleCount - 1, Math.floor((i * middleCount) / middle.length))].push(p));

  const sceneCount = 2 + middleCount;
  const target = lerp(27000, 16000, c.E);
  // Длина сцен кратна такту; общая длительность держится в пределах 15–30 с.
  const bars: number[] = Array.from({ length: sceneCount }, () => Math.max(1, Math.round(target / sceneCount / c.barMs)));
  const total = () => bars.reduce((s, b) => s + b, 0) * c.barMs;
  let guard = 0;
  while (total() > 30000 && guard++ < 40) {
    const i = bars.indexOf(Math.max(...bars));
    if (bars[i] <= 1) break;
    bars[i]--;
  }
  guard = 0;
  while (total() < 15000 && guard++ < 40) {
    // Удлиняем в первую очередь середину истории.
    const mids = bars.slice(1, -1);
    const i = 1 + mids.indexOf(Math.min(...mids));
    bars[i]++;
  }

  const amp = 0.3 + c.E * 0.7;
  const closeScale = 1.12 + c.I * 0.12;
  const dirSign = c.rand() > 0.5 ? 1 : -1;
  const captions = [...c.phrases];
  const midCaptions = captions.slice(0, Math.min(2, middleCount));

  const scenes: Scene[] = [];
  let t = 0;
  const makeShots = (photoIdxs: number[], start: number, dur: number, kind: Scene['kind']): Shot[] => {
    const beats = Math.max(photoIdxs.length, Math.round(dur / c.beatMs));
    const shots: Shot[] = [];
    let s = start;
    photoIdxs.forEach((pi, k) => {
      const shotBeats = k === photoIdxs.length - 1 ? beats - Math.floor(beats / photoIdxs.length) * k : Math.floor(beats / photoIdxs.length);
      const end = k === photoIdxs.length - 1 ? start + dur : s + shotBeats * c.beatMs;
      const target = detailTarget(input.photos[pi]);
      let shot: Shot;
      if (kind === 'opening') {
        shot = { photoIndex: pi, startMs: s, endMs: end, fromScale: 1.0, toScale: 1 + 0.06 * amp, fromX: 0, toX: 0, fromY: 0, toY: 0 };
      } else if (kind === 'finale') {
        shot = { photoIndex: pi, startMs: s, endMs: end, fromScale: closeScale, toScale: 1.0, fromX: target.x * (closeScale - 1) * 50, toX: 0, fromY: target.y * (closeScale - 1) * 50, toY: 0 };
      } else {
        const sc = closeScale + (k % 2) * 0.04;
        const fx = (k % 2 === 0 ? -dirSign : dirSign) * 2 * amp;
        shot = { photoIndex: pi, startMs: s, endMs: end, fromScale: 1.04, toScale: sc, fromX: fx, toX: target.x * (sc - 1) * 50, fromY: 0, toY: target.y * (sc - 1) * 50 };
      }
      shots.push(roundShot(shot));
      s = end;
    });
    return shots;
  };

  const openDur = bars[0] * c.barMs;
  scenes.push({ kind: 'opening', startMs: 0, durationMs: Math.round(openDur), bars: bars[0], caption: null, shots: makeShots([coverIdx], 0, openDur, 'opening') });
  t = openDur;
  groups.forEach((g, i) => {
    const dur = bars[i + 1] * c.barMs;
    scenes.push({ kind: 'middle', startMs: Math.round(t), durationMs: Math.round(dur), bars: bars[i + 1], caption: midCaptions[i] ?? null, shots: makeShots(g, t, dur, 'middle') });
    t += dur;
  });
  const finDur = bars[bars.length - 1] * c.barMs;
  scenes.push({ kind: 'finale', startMs: Math.round(t), durationMs: Math.round(finDur), bars: bars[bars.length - 1], caption: c.finale, shots: makeShots([finaleIdx], t, finDur, 'finale') });
  return scenes;
}

/** Направление к самой детальной ячейке кадра (−1..1 по осям). */
function detailTarget(p: PhotoFeatures) {
  const g = p.detailGrid;
  let best = 4;
  for (let i = 0; i < 9; i++) if (g[i] > g[best]) best = i;
  const cx = (best % 3) - 1;
  const cy = Math.floor(best / 3) - 1;
  return { x: -cx, y: -cy };
}

function roundShot(s: Shot): Shot {
  return {
    ...s,
    startMs: Math.round(s.startMs),
    endMs: Math.round(s.endMs),
    fromScale: round(s.fromScale, 3),
    toScale: round(s.toScale, 3),
    fromX: round(s.fromX, 2),
    toX: round(s.toX, 2),
    fromY: round(s.fromY, 2),
    toY: round(s.toY, 2),
  };
}
