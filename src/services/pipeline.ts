/**
 * Конвейер «ввод → анализ → RE:LIVE». Каждый шаг сообщает текущую операцию для интерфейса.
 *
 * Настроение автора (input.mood) и реально звучащий источник разделены:
 * — источник выбирает musicSource.resolveMusic (свой файл → ссылка → композиция каталога);
 * — темп, энергия и атаки измеряются по настоящему сигналу этого источника и задают монтаж и пульс;
 * — настроение умеренно влияет на подачу (близость кадра, мягкость), но не на цвет и не на ритм.
 */
import { buildSongProfile } from '../engine/audioAnalysis';
import { generateRelive } from '../engine/generator';
import { analyzeText } from '../engine/textAnalysis';
import type { CatalogTrack } from '../lib/catalog';
import type { AudioFeatures, Generation, Memory, MemoryInput, SongInput } from '../lib/types';
import { SCHEMA_VERSION, getBlob } from './db';
import { analyzeAudioBlob, probeAudioUrl } from './media';
import { catalogSong, resolveMusic } from './musicSource';

export type ProgressStep = 'text' | 'photos' | 'music' | 'dna' | 'scenes';
export const STEP_LABEL: Record<ProgressStep, string> = {
  text: 'Читаю историю',
  photos: 'Изучаю цвета и детали кадров',
  music: 'Слушаю трек',
  dna: 'Вычисляю Emotion DNA',
  scenes: 'Монтирую сцены под ритм',
};

const pause = () => new Promise((r) => setTimeout(r, 160));

export class InputError extends Error {
  constructor(public field: 'text' | 'photos' | 'title' | 'date', message: string) {
    super(message);
  }
}

export function validateInput(input: MemoryInput) {
  if (input.text.trim().length < 3) throw new InputError('text', 'Расскажите о дне хотя бы парой слов');
  if (!input.photos.length) throw new InputError('photos', 'Добавьте хотя бы один снимок');
}

const catalogCache = new Map<string, AudioFeatures>();

/** Измерение композиции каталога (файл приходит из кэша PWA, если сеть недоступна). */
export async function analyzeCatalogTrack(t: CatalogTrack, fetcher: (url: string) => Promise<Blob> = (u) => fetch(u).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))): Promise<AudioFeatures | null> {
  const hit = catalogCache.get(t.id);
  if (hit) return hit;
  try {
    const a = await analyzeAudioBlob(await fetcher(t.url));
    catalogCache.set(t.id, a);
    return a;
  } catch {
    return null;
  }
}

/**
 * Прямая ссылка: если сервер отдаёт файл (тот же источник или CORS) — измеряем сигнал;
 * иначе проверяем, играет ли она вообще (тайм-аут 8 с), чтобы не считать ритм по несуществующему треку.
 */
export async function measureLink(
  url: string,
  fetcher: (url: string) => Promise<Blob> = (u) => fetch(u, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))),
  probe: (url: string) => Promise<'ok' | 'error' | 'timeout'> = probeAudioUrl,
): Promise<{ audio: AudioFeatures | null; playable: boolean }> {
  try {
    return { audio: await analyzeAudioBlob(await fetcher(url)), playable: true };
  } catch {
    return { audio: null, playable: (await probe(url)) === 'ok' };
  }
}

/** Измеряет свой файл, если он ещё не измерен. Ошибку декодирования превращает в пометку. */
export async function ensureSongAnalysis(song: SongInput | null): Promise<{ song: SongInput | null; warning: string | null }> {
  if (!song || song.source !== 'file' || !song.fileBlobId || song.audio) return { song, warning: null };
  const blob = await getBlob(song.fileBlobId);
  if (!blob) return { song: { ...song, fileBlobId: undefined }, warning: 'Файл трека не найден — звучит композиция настроения' };
  try {
    const audio = await analyzeAudioBlob(blob);
    return { song: { ...song, audio }, warning: null };
  } catch (e) {
    return { song, warning: (e as Error).message + ' Темп оценён без сигнала.' };
  }
}

/**
 * Песня, которая реально прозвучит, — с измерениями. Возвращает и песню для записи:
 * авторский ввод не заменяется; к каталожной песне и своему файлу добавляются только измерения.
 */
export async function soundingSong(input: MemoryInput) {
  const music = resolveMusic(input.song, input.mood, input.text);
  let warning: string | null = null;
  let saved: SongInput | null = input.song;
  let sounding: SongInput;
  if (music.kind === 'file') {
    const r = await ensureSongAnalysis(input.song);
    saved = r.song;
    warning = r.warning;
    sounding = r.song ?? catalogSong(music.track);
  } else if (music.kind === 'link') {
    const link = await measureLink(music.url!);
    if (link.audio) sounding = { ...input.song!, audio: link.audio };
    else if (link.playable) sounding = input.song!; // играет, но чужой сервер не отдаёт сигнал: темп — оценка
    else {
      // Ссылка не отвечает — в истории прозвучит композиция настроения, по ней и считаем ритм.
      warning = `Ссылка не отвечает — в истории прозвучит «${music.track.title}» из подборки, ритм рассчитан по ней.`;
      const audio = await analyzeCatalogTrack(music.track);
      sounding = { ...catalogSong(music.track), audio: audio ?? undefined };
    }
  } else {
    const audio = await analyzeCatalogTrack(music.track);
    if (!audio) warning = `Не удалось прослушать «${music.track.title}» — темп оценён по описанию композиции.`;
    sounding = { ...catalogSong(music.track), audio: audio ?? undefined };
    if (input.song?.source === 'catalog' && audio) saved = { ...input.song, audio };
  }
  return { music, sounding, saved, warning };
}

export async function buildRelive(
  input: MemoryInput,
  onStep: (s: ProgressStep) => void = () => {},
  /** Паузы между шагами нужны только для показа прогресса человеку. */
  pace = true,
): Promise<{ generation: Generation; song: SongInput | null; warning: string | null }> {
  const frame = pace ? pause : async () => {};
  validateInput(input);
  onStep('text');
  await frame();
  onStep('photos');
  await frame();
  onStep('music');
  const { music, sounding, saved, warning } = await soundingSong(input);
  await frame();
  onStep('dna');
  const profile = buildSongProfile(sounding);
  const coverIndex = Math.max(0, input.photos.findIndex((p) => p.id === input.coverId));
  await frame();
  onStep('scenes');
  const generation = generateRelive({
    text: input.text,
    date: input.date,
    authorTitle: input.title,
    season: input.season,
    weather: input.weather,
    placeName: input.place?.name ?? '',
    photos: input.photos.map((p) => p.features),
    coverIndex,
    song: profile,
    songLabel: music.kind === 'catalog' ? `«${music.track.title}»` : [sounding.title, sounding.artist].filter(Boolean).join(' — ') || 'Свой трек',
    mood: input.mood ?? null,
  });
  generation.sound = { kind: music.kind, trackId: music.kind === 'catalog' ? music.track.id : undefined, label: music.label };
  await frame();
  return { generation, song: saved, warning };
}

export function toMemory(id: string, input: MemoryInput, generation: Generation, prev?: Memory): Memory {
  const now = new Date().toISOString();
  return {
    ...input,
    id,
    schemaVersion: SCHEMA_VERSION,
    title: generation.title,
    category: input.category || analyzeText(input.text).categoryGuess,
    coverId: input.coverId ?? input.photos[0]?.id ?? null,
    generation,
    visibility: 'private',
    demo: prev?.demo,
    demoKey: prev?.demoKey,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
}
