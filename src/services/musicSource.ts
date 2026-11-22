/**
 * Единый выбор источника музыки — один и тот же для редактора, карточки архива и RE:LIVE.
 *
 * Приоритет: свой файл → прямая аудиоссылка → трек каталога (по выбору или по настроению).
 * Если ссылка ведёт на страницу Spotify/YouTube или недоступна, внутри MOMENTA честно звучит
 * локальная композиция настроения, а оригинал открывается отдельной кнопкой.
 * Процедурной музыки нет: всё, что звучит, — настоящие записи.
 */
import { classifyLink } from '../engine/audioAnalysis';
import { inferMood, moodOf, trackForMood, trackOf, type CatalogTrack, type MoodId } from '../lib/catalog';
import type { SongInput } from '../lib/types';

export interface ResolvedMusic {
  kind: 'catalog' | 'file' | 'link';
  /** Что играть: адрес каталога или прямой ссылки; для своего файла — null (берётся blobId) */
  url: string | null;
  blobId: string | null;
  /** Трек каталога: звучит сам или служит запасным при сбое ссылки */
  track: CatalogTrack;
  mood: MoodId;
  label: string;
  note: string | null;
  serviceUrl: string | null;
}

export const trackLabel = (t: CatalogTrack) => `${t.title} — ${t.artist}`;

/** Настроение, по которому подбирается композиция: выбор автора → трек каталога → слова описания или текста. */
export function effectiveMood(song: SongInput | null, mood: MoodId | null | undefined, text = ''): MoodId {
  if (mood && moodOf(mood)) return mood;
  if (song?.source === 'catalog') {
    const t = trackOf(song.trackId);
    if (t) return t.mood;
  }
  if (song && (song.genre || song.mood || song.title)) return inferMood(`${song.genre} ${song.mood} ${song.title}`);
  return inferMood(text);
}

export function resolveMusic(song: SongInput | null, mood: MoodId | null | undefined, text = ''): ResolvedMusic {
  const m = effectiveMood(song, mood, text);
  const moodTrack = trackForMood(m);
  const moodName = moodOf(m)!.label;
  const catalog = (track: CatalogTrack, note: string | null, serviceUrl: string | null = null): ResolvedMusic => ({
    kind: 'catalog',
    url: track.url,
    blobId: null,
    track,
    mood: m,
    label: `${trackLabel(track)} · подборка «${moodOf(track.mood)!.label}»`,
    note,
    serviceUrl,
  });

  if (song?.source === 'file' && song.fileBlobId) {
    return { kind: 'file', url: null, blobId: song.fileBlobId, track: moodTrack, mood: m, label: `Свой трек · ${[song.title, song.artist].filter(Boolean).join(' — ') || song.fileName || 'аудиофайл'}`, note: null, serviceUrl: null };
  }
  if (song?.source === 'link' && song.url) {
    const kind = classifyLink(song.url);
    if (kind === 'service') {
      return catalog(moodTrack, `Страница музыкального сервиса не отдаёт звук напрямую. Внутри MOMENTA звучит «${moodTrack.title}» — подборка «${moodName}»; оригинал открывается отдельно.`, song.url);
    }
    return { kind: 'link', url: song.url, blobId: null, track: moodTrack, mood: m, label: `Трек по ссылке · ${song.title || 'аудио'}`, note: null, serviceUrl: song.url };
  }
  if (song?.source === 'catalog') {
    const t = trackOf(song.trackId) ?? moodTrack;
    return catalog(t, null);
  }
  if (song?.source === 'description') {
    return catalog(moodTrack, `Раньше по описанию «${[song.genre, song.mood].filter(Boolean).join(', ') || song.title}» звучал синтез. Теперь — подобранная композиция «${moodTrack.title}».`);
  }
  return catalog(moodTrack, mood ? null : 'Настроение не выбрано — композиция подобрана по тексту дня.');
}

/** Песня каталога для записи: стабильный trackId и метаданные для профиля (лад выводится из характера — как предположение). */
export function catalogSong(track: CatalogTrack): SongInput {
  return { source: 'catalog', trackId: track.id, title: track.title, artist: track.artist, genre: track.genre, mood: track.character, year: track.year };
}
