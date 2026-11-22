/** Конвейер «ввод → анализ → RE:LIVE». Каждый шаг сообщает текущую операцию для интерфейса. */
import { buildSongProfile } from '../engine/audioAnalysis';
import { generateRelive } from '../engine/generator';
import { analyzeText } from '../engine/textAnalysis';
import type { Generation, Memory, MemoryInput, SongInput } from '../lib/types';
import { SCHEMA_VERSION, getBlob } from './db';
import { analyzeAudioBlob } from './media';

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
  constructor(public field: 'text' | 'photos' | 'title', message: string) {
    super(message);
  }
}

export function validateInput(input: MemoryInput) {
  if (input.text.trim().length < 3) throw new InputError('text', 'Расскажите о дне хотя бы парой слов');
  if (!input.photos.length) throw new InputError('photos', 'Добавьте хотя бы один снимок');
}

/** Измеряет файл песни, если он есть и ещё не измерен. Ошибку декодирования превращает в пометку. */
export async function ensureSongAnalysis(song: SongInput | null): Promise<{ song: SongInput | null; warning: string | null }> {
  if (!song || song.source !== 'file' || !song.fileBlobId || song.audio) return { song, warning: null };
  const blob = await getBlob(song.fileBlobId);
  if (!blob) return { song: { ...song, fileBlobId: undefined }, warning: 'Файл трека не найден — использую описание' };
  try {
    const audio = await analyzeAudioBlob(blob);
    return { song: { ...song, audio }, warning: null };
  } catch (e) {
    return { song, warning: (e as Error).message + ' Использую описание трека.' };
  }
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
  const { song, warning } = await ensureSongAnalysis(input.song);
  await frame();
  onStep('dna');
  const profile = song ? buildSongProfile(song) : null;
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
    songLabel: song ? [song.title, song.artist].filter(Boolean).join(' — ') : '',
  });
  await frame();
  return { generation, song, warning };
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
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
}
