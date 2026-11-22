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
 *
 * Режиссура (1.1): общая форма серии — открытие (место), середина (деталь), финал (время на фразу).
 * Внутри формы меняются масштаб, направление камеры, выдержка, переход и фактура — только по сигналам.
 * У кадра один ведущий приём, сила остальных ограничена и меняется плавно вместе с Emotion DNA.
 */
import type {
  ArtDirection, ArtEffect, ArtLead, ArtStyle, Explanation, Generation, ParamDetail, ParamKey, ParamPart,
  PhotoFeatures, Reason, Scene, Season, Shot, SongProfile, Weather,
} from '../lib/types';
import { clamp, colorName, countWords, hashString, hexToRgb, lerp, liftColor, plural, rng, round, toHex } from '../lib/util';
import { moodOf, type MoodId } from '../lib/catalog';
import { TARGET_NORMAL, relLuminance, shadeFor, zoneCost, zoneOf } from './legibility';
import { freeSide, hueDist } from './photoAnalysis';
import { analyzeText, extractPhrases, type TextAnalysis } from './textAnalysis';
import { suggestTitle } from './title';

export const ALGORITHM_VERSION = 'momenta-dna-1.2';

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
  /** Как ощущался день — выбор автора. Умеренно влияет на подачу, не на цвет и не на ритм. */
  mood?: MoodId | null;
}

type Source = 'text' | 'photo' | 'music' | 'mood';
const SOURCES: Source[] = ['text', 'photo', 'music', 'mood'];

/**
 * Веса источников для каждого параметра (сумма = 1).
 * Настроение автора (mood) влияет только на подачу — Warmth, Nostalgia, Intimacy.
 * Энергию и плотность монтажа задают трек, текст и кадр: так «Нежность» с быстрым треком
 * остаётся камерной по композиции, а монтаж становится плотным.
 */
export const WEIGHTS: Record<ParamKey, Partial<Record<Source, number>>> = {
  warmth: { photo: 0.55, text: 0.22, music: 0.13, mood: 0.1 },
  energy: { music: 0.45, text: 0.35, photo: 0.2 },
  density: { photo: 0.4, text: 0.3, music: 0.3 },
  nostalgia: { text: 0.3, photo: 0.25, music: 0.25, mood: 0.2 },
  intimacy: { text: 0.35, photo: 0.25, music: 0.2, mood: 0.2 },
};

const f2 = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const sec = (ms: number) => (ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' с';
const quote = (words: string[], n = 2) => words.slice(0, n).map((w) => `«${w.toLowerCase()}»`).join(', ');
const bars = (n: number) => `${n} ${plural(n, ['такт', 'такта', 'тактов'])}`;

const STYLE_LEAD: Record<ArtStyle, ArtLead> = { impressionism: 'light', kandinsky: 'geometry', minimal: 'air' };

export function generateRelive(input: GeneratorInput): Generation {
  const inputHash = hashString(
    JSON.stringify({
      t: input.text,
      d: input.date,
      a: input.authorTitle,
      s: input.season,
      w: input.weather,
      p: input.placeName,
      ph: input.photos.map((p) => [p.palette.map((c) => c.hex), p.brightness, p.contrast, p.detailGrid, p.warmth, p.zones, p.light]),
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
  const mood = moodOf(input.mood);
  const moodNote = mood ? `выбрано «${mood.emoji} ${mood.label}»` : '';

  const sources = {
    warmth: {
      photo: { v: (photoAgg.warmth + 1) / 2, note: `тёплые/холодные тона кадров ${f2(photoAgg.warmth)}` },
      text: { v: (a.warmth + 1) / 2, note: a.details.length || a.seasonHits.length ? `ассоциации текста: ${quote([...a.details.map((d) => d.word), ...a.seasonHits.map((s) => s.word)])}` : 'нейтральный текст' },
      music: song ? { v: musicWarmth(song), note: `${song.scale === 'major' ? 'мажор' : 'минор'}${song.scaleSource === 'manual' ? '' : ' (предположение)'}, мягкость ${f2(song.softness)}` } : null,
      mood: mood ? { v: mood.feel.warmth, note: moodNote } : null,
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
      mood: mood ? { v: mood.feel.nostalgia, note: moodNote } : null,
    },
    intimacy: {
      text: { v: a.intimacy, note: a.people.length ? `рядом: ${quote(a.people.map((p) => p.word))}` : 'никто не назван — камерный рассказ' },
      photo: { v: photoAgg.intimacy, note: `детали в центре кадра ${f2(cover.detailGrid[4])}` },
      music: song ? { v: clamp(song.softness * 0.6 + (1 - song.energy) * 0.4), note: `мягкость звучания ${f2(song.softness)}` } : null,
      mood: mood ? { v: mood.feel.intimacy, note: moodNote } : null,
    },
  } as const;

  const paramDetails = {} as Record<ParamKey, ParamDetail>;
  const params = {} as Record<ParamKey, number>;
  for (const key of Object.keys(WEIGHTS) as ParamKey[]) {
    const parts: ParamPart[] = [];
    const srcs = sources[key] as Partial<Record<Source, { v: number; note: string } | null>>;
    let wSum = 0;
    for (const src of SOURCES) if (srcs[src] && WEIGHTS[key][src]) wSum += WEIGHTS[key][src]!;
    let acc = 0;
    for (const src of SOURCES) {
      const s = srcs[src];
      const base = WEIGHTS[key][src];
      if (!s || !base) continue;
      const w = base / wSum; // перераспределение веса при отсутствии источника
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

  // ---------- Палитра и свет кадра ----------
  const palette = cover.palette.map((c) => c.hex);
  const glow = pickGlow(cover, W);
  const glowHex = liftColor(glow.hex, 0.56, 0.42);
  const accent = liftColor(cover.palette.find((c) => c.hex !== glow.hex && c.s > 0.15)?.hex ?? glow.hex, 0.5, 0.35);
  const light = cover.light ?? { x: 0.7, y: 0.25, strength: 0.3 };
  // Тёмный кадр получает меньше свечения — его тени остаются тенями; светлый — меньше виньетки, больше воздуха.
  const glowRoom = round(clamp(0.28 + cover.brightness * 1.1, 0.3, 1), 2);
  const vignette = round(clamp(0.1 + (1 - cover.brightness) * 0.32 + N * 0.12, 0.1, 0.5), 2);
  explanations.push({
    topic: 'palette',
    source: 'photo',
    text: `Свечение — ${colorName(glow.h, glow.s, glow.l)} ${glow.hex}${glowHex !== glow.hex ? ` (для свечения осветлён до ${glowHex})` : ''}: взят из обложки, где занимает ${Math.round(glow.weight * 100)}% площади, и идёт из ${areaName(light.x, light.y)} — самой светлой области кадра. Сила свечения ${Math.round(glowRoom * 100)}%: ${cover.brightness < 0.3 ? 'тёмный кадр сохраняет глубокие тени' : cover.brightness > 0.55 ? 'светлому кадру оставлен воздух' : 'средняя яркость кадра'}.`,
  });

  // ---------- Ритм ----------
  const bpm = song?.bpm ?? Math.round(64 + a.dynamics * 64);
  const beatMs = 60000 / bpm;
  const barMs = beatMs * 4;
  // Пульс «по атакам» — только когда реальный файл даёт различимые атаки; иначе спокойное дыхание.
  const pulseMode: 'attack' | 'breath' = song?.measured && song.bpmSource !== 'description' && song.attackDensity >= 0.35 && song.texture !== 'ambient' ? 'attack' : 'breath';
  const beatOffsetMs = pulseMode === 'attack' ? Math.round((song?.beatOffsetSec ?? 0) * 1000) : 0;

  // ---------- Ведущий приём и плавная сила слоёв ----------
  const night = a.timeOfDay?.key === 'night' || a.events.some((e) => ['концерт', 'вечеринка', 'фестиваль'].includes(e.entry.key)) || a.places.some((p) => p.entry.key === 'клуб');
  const percussive = !!song && (song.attackDensity > 0.45 || song.texture === 'electronic');
  const scores: Record<ArtStyle, number> = {
    kandinsky: E * 0.5 + (night ? 0.2 : 0) + (percussive ? 0.2 : 0) + cover.contrast * 0.25 + (a.movementWords.length ? 0.1 : 0),
    impressionism: (1 - E) * 0.45 + (cover.brightness > 0.3 && cover.brightness < 0.8 ? 0.12 : 0) + (1 - cover.contrast) * 0.2 + (song ? (1 - song.attackDensity) * 0.2 : 0.1) + (a.calmWords.length ? 0.1 : 0),
    minimal: I * 0.35 + (input.photos.length <= 2 ? 0.2 : 0) + (1 - D) * 0.3 + (a.calmWords.length ? 0.05 : 0),
  };
  const style = (Object.keys(scores) as ArtStyle[]).reduce((x, y) => (scores[y] > scores[x] ? y : x));
  // softmax: соседние значения Emotion DNA меняют силу слоёв постепенно, без скачков.
  const T = 0.12;
  const ex = (Object.keys(scores) as ArtStyle[]).map((k) => [k, Math.exp(scores[k] / T)] as const);
  const exMax = Math.max(...ex.map(([, v]) => v));
  const share = Object.fromEntries(ex.map(([k, v]) => [k, v / exMax])) as Record<ArtStyle, number>;

  const effects = pickEffects(a, input, cover, season, W);
  const topEffect = effects[0];
  const textureLead = !!topEffect && topEffect.strength >= 4;
  const lead: ArtLead = textureLead ? 'texture' : STYLE_LEAD[style];
  const cap = (v: number, isLead: boolean) => round(isLead ? 1 : Math.min(0.4, v * 0.6), 2);
  const intensity = {
    light: cap(share.impressionism, lead === 'light'),
    geometry: cap(share.kandinsky, lead === 'geometry'),
    air: cap(share.minimal, lead === 'air'),
    effects: textureLead ? 1 : round(Math.min(0.45, (topEffect?.strength ?? 0) / 8), 2),
  };
  explanations.push({ topic: 'style', source: 'estimate', text: `${styleReason(style, { E, D, I, night, percussive, contrast: cover.contrast, calm: a.calmWords, song, photos: input.photos.length })} ${textureLead ? `Ведущий приём — фактура «${EFFECT_NAME[topEffect.effect]}», геометрия и свет приглушены.` : 'Остальные слои ослаблены, чтобы у кадра был один голос.'}` });
  for (const e of effects) explanations.push({ topic: 'effect', source: e.source, text: e.reason });

  // ---------- Переходы ----------
  const baseTransition = lerp(1750, 380, E) * (1 + (song ? (song.softness - 0.5) * 0.3 : 0)) * (1 + N * 0.15);
  let transitionMs = baseTransition;
  const slowWords = a.calmWords.filter((w) => /неспешн|медленн|нетороп|плавн|лениво|размерен/i.test(w));
  if (slowWords.length) transitionMs *= 1.18;
  transitionMs = clamp(Math.round(transitionMs / (beatMs / 4)) * (beatMs / 4), 280, 2400);
  const transitionBase = clamp(Math.round(baseTransition / (beatMs / 4)) * (beatMs / 4), 280, 2400);
  const musicDrive = !!song && song.energy >= 0.5 && song.attackDensity >= 0.4;
  explanations.push({
    topic: 'rhythm',
    source: song ? 'music' : 'estimate',
    text: `${tempoSourceText(song, bpm, a.dynamics, input.songLabel)}: доля ${sec(beatMs)}, такт ${sec(barMs)} — шаг монтажа кратен такту. Переход ${sec(transitionMs)}: Energy ${params.energy}${song ? `, мягкость трека ${f2(song.softness)}` : ''}${slowWords.length ? `, слово ${quote(slowWords, 1)} удлинило растворение` : ''}. ${pulseMode === 'attack' ? `Пульс идёт по атакам файла${beatOffsetMs ? ` со смещением сетки ${sec(beatOffsetMs)}` : ''}.` : 'Пульс — спокойное дыхание: у трека нет уверенно различимых атак или темп оценён.'}`,
  });

  const filterFor = (s: ArtStyle) => {
    const hue = round((0.5 - W) * 14, 1);
    if (s === 'kandinsky') return `saturate(${round(1.08 + E * 0.2, 2)}) contrast(${round(1.04 + E * 0.1, 2)}) brightness(0.98) hue-rotate(${hue}deg)`;
    if (s === 'impressionism') return `saturate(${round(1.02 + W * 0.1, 2)}) contrast(0.93) brightness(1.03) sepia(${round(N * 0.22, 2)}) hue-rotate(${hue}deg)`;
    return `saturate(0.9) contrast(1.02) brightness(1.01) sepia(${round(N * 0.14, 2)}) hue-rotate(${hue}deg)`;
  };

  // ---------- Сцены ----------
  const { phrases, finale } = extractPhrases(a);
  const scenes = buildScenes(input, { E, D, I, barMs, beatMs, rand, phrases, finale, musicDrive, calm: a.dynamics < 0.35 });
  const totalMs = scenes.reduce((s, x) => s + x.durationMs, 0);

  const opening = scenes[0];
  const art: ArtDirection = {
    style,
    effects: effects.map((e) => e.effect),
    palette,
    glowColor: glowHex,
    accent,
    grain: round(clamp(N * 0.85 + (style === 'impressionism' ? 0.12 : 0)) * (lead === 'air' ? 1 : 0.75), 2),
    softness: round(clamp(N * 0.6 + (song?.softness ?? 0.5) * 0.4), 2),
    glowAmp: round((0.15 + E * 0.85) * glowRoom, 2),
    motionAmp: round(0.3 + E * 0.7, 2),
    particleCount: Math.round(10 + D * 40),
    tiltDeg: round((E - 0.5) * 2 * (style === 'kandinsky' ? 14 : 5) * (rand() > 0.5 ? 1 : -1), 1),
    titleGap: Math.round(10 + (1 - D) * 22),
    titleSize: Math.round(28 + I * 14),
    transitionMs: Math.round(transitionMs),
    pulseMs: Math.round(beatMs),
    captionAlign: opening.textSide ?? 'left',
    shadeStrength: opening.shade ?? 0.5,
    photoFilter: filterFor(style),
    lead,
    intensity,
    light: { x: light.x, y: light.y },
    pulseMode,
    beatOffsetMs,
    vignette,
    glowRoom,
  };

  explanations.push(layoutExplanation(scenes, input.photos));
  explanations.push({
    topic: 'param',
    source: 'estimate',
    text: `Nostalgia ${params.nostalgia} → зерно ${Math.round(art.grain * 100)}% и мягкость ${Math.round(art.softness * 100)}%. Intimacy ${params.intimacy} → кадрирование ближе и подпись ${art.titleSize} px. Density ${params.density} → ${art.particleCount} ${plural(art.particleCount, ['деталь', 'детали', 'деталей'])} в сцене и интервал ${art.titleGap} px между заголовком и подписью.`,
  });
  if (a.negations.length) {
    explanations.push({ topic: 'caption', source: 'text', text: `Отрицание учтено: ${quote(a.negations, 3)} — смысл не перевёрнут, слово не засчитано как противоположная эмоция.` });
  }
  explanations.push({
    topic: 'rhythm',
    source: 'estimate',
    text: `${scenes.length} ${plural(scenes.length, ['сцена', 'сцены', 'сцен'])} на ${sec(totalMs)}: ${scenes.map((s) => bars(s.bars)).join(' · ')}. Открытие показывает место${scenes[0].shots[0].camera === 'pan' ? ' неторопливой панорамой' : scenes[0].shots[0].camera === 'hold' ? ' неподвижно' : ''}, середина подводит к детали, финал держит фразу ${sec(scenes[scenes.length - 1].durationMs)}.${musicDrive ? ` Энергичный трек уплотнил монтаж: кадры сменяются на атаках, а композиция осталась${a.dynamics < 0.35 ? ' камерной, как в тексте' : ' прежней'}.` : ''}`,
  });
  const captions = scenes.map((s) => s.caption).filter(Boolean) as string[];
  if (captions.length) {
    explanations.push({ topic: 'caption', source: 'text', text: `Подписи — фразы автора без пересказа: ${captions.map((c) => `«${c}»`).join(' / ')}.` });
  }
  explanations.push({
    topic: 'sound',
    source: song ? 'music' : 'estimate',
    text: song ? `Звучит ${input.songLabel}. ` + song.notes.join('. ') + `. Пульс свечения — каждые ${sec(beatMs)}, амплитуда ${Math.round(art.glowAmp * 100)}%.` : `Музыки нет: темп ${bpm} BPM выведен из динамики текста (${f2(a.dynamics)}).`,
  });

  const reasons = buildReasons({ a, slowWords, transitionMs, transitionBase, glow, light, song, bpm, barMs, scenes, captions, mood, params, titleSize: art.titleSize, songLabel: input.songLabel });
  if (mood && song && mood.feel.energy <= 0.35 && song.energy >= 0.6) {
    explanations.push({ topic: 'rhythm', source: 'music', text: `Настроение «${mood.label}» и быстрый трек сосуществуют: подача камерная (Intimacy ${params.intimacy}, подпись ${art.titleSize} px), а монтаж плотный — его задаёт энергия трека ${f2(song.energy)} и такт ${sec(barMs)}.` });
  }

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
    reasons,
    mood: input.mood ?? null,
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

const EFFECT_NAME: Record<ArtEffect, string> = {
  'amber-halo': 'янтарные ореолы',
  'silver-shimmer': 'серебристое мерцание',
  'light-particles': 'светлые частицы',
  'organic-forms': 'органические формы',
  'muted-reflections': 'отражения за стеклом',
};

function areaName(x: number, y: number) {
  const v = y < 0.34 ? 'верхней' : y > 0.66 ? 'нижней' : 'средней';
  const h = x < 0.34 ? 'левой' : x > 0.66 ? 'правой' : 'центральной';
  return h === 'центральной' && v === 'средней' ? 'центра' : `${v} ${h} части`;
}

function tempoSourceText(song: SongProfile | null, bpm: number, dynamics: number, label = '') {
  if (!song) return `Без музыки темп ${bpm} BPM выведен из динамики текста ${f2(dynamics)}`;
  switch (song.bpmSource) {
    case 'measured':
      return `${label ? label + ': ' : ''}${bpm} BPM измерены по файлу (уверенность ${Math.round(song.bpmConfidence * 100)}%)`;
    case 'manual':
      return `${bpm} BPM указаны вручную`;
    case 'description':
      return `${bpm} BPM — оценка по описанию трека`;
    default:
      return `Темп трека неизвестен — взяты нейтральные ${bpm} BPM`;
  }
}

/** До трёх коротких причин: фраза автора, цвет из кадра, источник темпа. Каждая описывает применённое решение. */
function buildReasons(c: {
  a: TextAnalysis;
  slowWords: string[];
  transitionMs: number;
  transitionBase: number;
  glow: PhotoFeatures['palette'][number];
  light: { x: number; y: number };
  song: SongProfile | null;
  bpm: number;
  barMs: number;
  scenes: Scene[];
  captions: string[];
  mood: ReturnType<typeof moodOf>;
  params: Record<ParamKey, number>;
  titleSize: number;
  songLabel: string;
}): Reason[] {
  const out: Reason[] = [];
  if (c.mood) {
    const fast = c.song && c.mood.feel.energy <= 0.35 && c.song.energy >= 0.6;
    out.push({
      kind: 'mood',
      text: `Вы выбрали «${c.mood.emoji} ${c.mood.label}» → Intimacy ${c.params.intimacy}, Nostalgia ${c.params.nostalgia}: кадр ${c.params.intimacy >= 60 ? 'ближе' : 'шире'}, подпись ${c.titleSize} px.${fast ? ' Трек быстрый — монтаж плотный, но подача остаётся камерной.' : ''}`,
    });
  }
  const fin = c.scenes[c.scenes.length - 1];
  if (c.slowWords.length && c.transitionMs !== c.transitionBase) {
    out.push({ kind: 'phrase', text: `Ваше «${c.slowWords[0].toLowerCase()}» удлинило переходы: ${sec(c.transitionBase)} → ${sec(c.transitionMs)}.` });
  } else if (c.a.movementWords.length) {
    out.push({ kind: 'phrase', text: `Слова ${quote(c.a.movementWords)} подняли динамику текста до ${f2(c.a.dynamics)} — движение камеры смелее.` });
  } else if (fin.caption) {
    out.push({ kind: 'phrase', text: `Финал держит вашу фразу «${fin.caption}» ${sec(fin.durationMs)} — время прочесть.` });
  }
  out.push({ kind: 'color', color: c.glow.hex, text: `${cap1(colorName(c.glow.h, c.glow.s, c.glow.l))} ${c.glow.hex} из ${areaName(c.light.x, c.light.y)} обложки стал цветом свечения.` });
  const middleBars = c.scenes.slice(1, -1).map((s) => s.bars);
  const scale = c.song && c.song.scaleSource !== 'manual' ? ` Лад «${c.song.scale === 'minor' ? 'минор' : 'мажор'}» — предположение по описанию.` : '';
  out.push({ kind: 'tempo', text: `${tempoSourceText(c.song, c.bpm, c.a.dynamics, c.songLabel)} → такт ${sec(c.barMs)}, середина по ${bars(Math.max(...middleBars, 1))}.${c.song?.bpmSource === 'measured' ? '' : scale}` });
  return out.slice(0, 4);
}

const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function layoutExplanation(scenes: Scene[], photos: PhotoFeatures[]): Explanation {
  const first = scenes[0];
  const f = photos[first.shots[0].photoIndex];
  const other = first.textSide === 'left' ? 'right' : 'left';
  const zSide = zoneOf(f, first.textSide ?? 'left');
  const zOther = zoneOf(f, other);
  const minRatio = Math.min(...scenes.map((s) => s.contrast ?? 0));
  const switches = scenes.map((s, i) => (i > 0 && s.textSide !== scenes[i - 1].textSide ? i + 1 : null)).filter(Boolean);
  const balanced = Math.abs(zoneCost(zSide) - zoneCost(zOther)) < 0.05;
  return {
    topic: 'layout',
    source: 'photo',
    text: `${balanced ? `Фон под подписью почти одинаков с обеих сторон (детали ${f2(zSide.detail)} и ${f2(zOther.detail)})` : `Подпись открытия стоит ${first.textSide === 'left' ? 'слева' : 'справа'}: там меньше перепадов и светлых пятен (детали ${f2(zSide.detail)} против ${f2(zOther.detail)})`}. Карта деталей измеряет перепады изображения, а не распознаёт предметы. Подложка в каждой сцене подобрана по светлым участкам зоны текста: худший контраст ${f2(minRatio)}:1 при норме 4,5:1.${switches.length ? ` В сцене ${switches.join(', ')} подпись переходит на другую сторону — там фон заметно спокойнее.` : ''}`,
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
  const score = (c: PhotoFeatures['palette'][number]) => c.weight + c.s * 0.3 + bias * (warmScore(c) - 0.5) * 0.6;
  return [...pool].sort((x, y) => score(y) - score(x))[0];
}

/** Цвет подложки под текстом: самый тёмный тон кадра по относительной яркости, приглушённый к ночи. */
export function shadeColorOf(f: PhotoFeatures) {
  const darkest = [...f.palette].sort((x, y) => relLuminance(x.hex) - relLuminance(y.hex))[0]?.hex ?? '#0B1020';
  const [r, g, b] = hexToRgb(darkest);
  return toHex(r * 0.32 + 5 * 0.68, g * 0.32 + 7 * 0.68, b * 0.32 + 12 * 0.68);
}

function styleReason(
  style: ArtStyle,
  c: { E: number; D: number; I: number; night: boolean; percussive: boolean; contrast: number; calm: string[]; song: SongProfile | null; photos: number },
) {
  if (style === 'kandinsky') {
    return `Геометрические переклички в духе Кандинского: ${[c.night ? 'ночной сюжет' : null, c.percussive ? `ударные акценты трека (плотность атак ${f2(c.song!.attackDensity)})` : null, `контраст кадра ${f2(c.contrast)}`, `Energy ${Math.round(c.E * 100)}`].filter(Boolean).join(', ')}. Линии идут от самой светлой области кадра и вспыхивают на долю.`;
  }
  if (style === 'impressionism') {
    return `Рассеянный свет в духе импрессионизма: ${[c.calm.length ? `спокойные слова ${quote(c.calm)}` : null, `мягкий контраст ${f2(c.contrast)}`, c.song ? `редкие атаки (${f2(c.song.attackDensity)})` : null, `Energy ${Math.round(c.E * 100)}`].filter(Boolean).join(', ')}. Свет ложится мазками там, где он есть в кадре.`;
  }
  return `Минимализм с воздухом: камерный сюжет (Intimacy ${Math.round(c.I * 100)}), ${c.photos} ${plural(c.photos, ['кадр', 'кадра', 'кадров'])} и неторопливый рассказ (Density ${Math.round(c.D * 100)}). Много пустого пространства, тонкая рамка.`;
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
  c: {
    E: number; D: number; I: number; barMs: number; beatMs: number; rand: () => number;
    phrases: string[]; finale: string | null; musicDrive: boolean; calm: boolean;
  },
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
  const barCount: number[] = Array.from({ length: sceneCount }, () => Math.max(1, Math.round(target / sceneCount / c.barMs)));
  const total = () => barCount.reduce((s, b) => s + b, 0) * c.barMs;
  let guard = 0;
  while (total() > 30000 && guard++ < 40) {
    const i = barCount.indexOf(Math.max(...barCount));
    if (barCount[i] <= 1) break;
    barCount[i]--;
  }
  guard = 0;
  while (total() < 15000 && guard++ < 40) {
    const mids = barCount.slice(1, -1);
    const i = 1 + mids.indexOf(Math.min(...mids));
    barCount[i]++;
  }
  // Финал оставляет время прочесть фразу: ~1,8 с + 0,33 с на слово.
  const readMs = c.finale ? 1800 + countWords(c.finale) * 330 : 0;
  guard = 0;
  while (barCount[sceneCount - 1] * c.barMs < readMs && guard++ < 10) {
    if (total() + c.barMs <= 30000) barCount[sceneCount - 1]++;
    else {
      const mids = barCount.slice(1, -1);
      const i = 1 + mids.indexOf(Math.max(...mids));
      if (barCount[i] <= 1) break;
      barCount[i]--;
      barCount[sceneCount - 1]++;
    }
  }

  const amp = 0.3 + c.E * 0.7;
  const closeScale = 1.12 + c.I * 0.12;
  const dirSign = c.rand() > 0.5 ? 1 : -1;
  const midCaptions = c.phrases.slice(0, Math.min(2, middleCount));
  const cutMs = Math.round(c.beatMs / 3);

  const makeShots = (photoIdxs: number[], start: number, dur: number, kind: Scene['kind']): Shot[] => {
    // Энергичный трек дробит середину на подкадры по атакам (1–2 такта), не меняя композицию.
    const units: number[] = [];
    if (kind === 'middle' && c.musicDrive) {
      const step = c.E > 0.6 ? 1 : 2;
      const totalBars = Math.max(1, Math.round(dur / c.barMs));
      const per = Math.max(1, Math.floor(totalBars / step / photoIdxs.length));
      photoIdxs.forEach((p) => {
        for (let k = 0; k < per; k++) units.push(p);
      });
    } else units.push(...photoIdxs);
    const beats = Math.max(units.length, Math.round(dur / c.beatMs));
    const shots: Shot[] = [];
    let s = start;
    units.forEach((pi, k) => {
      const shotBeats = Math.floor(beats / units.length);
      const end = k === units.length - 1 ? start + dur : s + shotBeats * c.beatMs;
      const f = input.photos[pi];
      const tgt = detailTarget(f, k);
      const open = f.openness ?? 0;
      let shot: Shot;
      if (kind === 'opening') {
        if (open >= 0.45) {
          // Открытое пространство — медленная панорама почти без увеличения.
          const pan = 2.2 + amp * 1.6;
          shot = { photoIndex: pi, startMs: s, endMs: end, fromScale: 1.07, toScale: 1.08, fromX: -dirSign * pan, toX: dirSign * pan, fromY: 0, toY: 0, camera: 'pan' };
        } else if (n === 1 && c.E < 0.35) {
          shot = { photoIndex: pi, startMs: s, endMs: end, fromScale: 1.0, toScale: 1.0, fromX: 0, toX: 0, fromY: 0, toY: 0, camera: 'hold' };
        } else {
          shot = { photoIndex: pi, startMs: s, endMs: end, fromScale: 1.0, toScale: 1 + 0.05 * amp, fromX: 0, toX: 0, fromY: 0, toY: 0, camera: 'push' };
        }
      } else if (kind === 'finale') {
        // Выдержка: камера почти стоит, чтобы прочесть фразу.
        const sc = n === 1 ? closeScale : 1.04;
        shot = { photoIndex: pi, startMs: s, endMs: end, fromScale: sc, toScale: n === 1 ? 1.0 : 1.02, fromX: tgt.x * (sc - 1) * 50, toX: n === 1 ? 0 : tgt.x * 0.4, fromY: tgt.y * (sc - 1) * 50, toY: 0, camera: n === 1 ? 'pull' : 'hold' };
      } else {
        const sc = closeScale + (k % 2) * 0.04;
        const fx = (k % 2 === 0 ? -dirSign : dirSign) * 2 * amp;
        shot = { photoIndex: pi, startMs: s, endMs: end, fromScale: 1.04, toScale: sc, fromX: fx, toX: tgt.x * (sc - 1) * 50, fromY: 0, toY: tgt.y * (sc - 1) * 50, camera: 'push' };
        if (k > 0 && units[k - 1] === pi) shot.cutMs = cutMs;
      }
      shots.push(roundShot(shot));
      s = end;
    });
    return shots;
  };

  const scenes: Scene[] = [];
  let t = 0;
  const openDur = barCount[0] * c.barMs;
  scenes.push({ kind: 'opening', startMs: 0, durationMs: Math.round(openDur), bars: barCount[0], caption: null, shots: makeShots([coverIdx], 0, openDur, 'opening') });
  t = openDur;
  groups.forEach((g, i) => {
    const dur = barCount[i + 1] * c.barMs;
    scenes.push({ kind: 'middle', startMs: Math.round(t), durationMs: Math.round(dur), bars: barCount[i + 1], caption: midCaptions[i] ?? null, shots: makeShots(g, t, dur, 'middle') });
    t += dur;
  });
  const finDur = barCount[sceneCount - 1] * c.barMs;
  scenes.push({ kind: 'finale', startMs: Math.round(t), durationMs: Math.round(finDur), bars: barCount[sceneCount - 1], caption: c.finale, shots: makeShots([finaleIdx], t, finDur, 'finale') });

  placeText(scenes, input.photos);
  return scenes;
}

/**
 * Сторона подписи и подложка для каждой сцены. Подпись меняет сторону только при заметной пользе (> 0,12),
 * подложка — минимальная, при которой белый текст даёт 4,5:1 по светлым участкам зоны.
 */
export function placeText(scenes: Scene[], photos: PhotoFeatures[]) {
  let prev: 'left' | 'right' | null = null;
  for (const s of scenes) {
    const f = photos[s.shots[0].photoIndex];
    const cl = zoneCost(zoneOf(f, 'left'));
    const cr = zoneCost(zoneOf(f, 'right'));
    let side: 'left' | 'right' = prev ?? (f.zones ? (cl <= cr ? 'left' : 'right') : freeSide(f).side);
    const other: 'left' | 'right' = side === 'left' ? 'right' : 'left';
    if (prev && zoneCost(zoneOf(f, other)) < zoneCost(zoneOf(f, side)) - 0.12) side = other;
    const shadeColor = shadeColorOf(f);
    const { alpha, ratio } = shadeFor(zoneOf(f, side).p90, relLuminance(shadeColor), TARGET_NORMAL);
    s.textSide = side;
    s.shade = alpha;
    s.shadeColor = shadeColor;
    s.contrast = ratio;
    prev = side;
  }
}

/** Направление к самой детальной ячейке кадра (−1..1 по осям); k — следующий по детальности для подкадров. */
function detailTarget(p: PhotoFeatures, k = 0) {
  const ranked = p.detailGrid.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v || a.i - b.i);
  const best = ranked[k % 2 === 0 ? 0 : Math.min(1, ranked.length - 1)].i;
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
