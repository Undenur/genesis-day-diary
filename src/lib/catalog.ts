/**
 * Каталог настроений MOMENTA: шесть состояний дня и шесть настоящих композиций.
 * Музыка — Kevin MacLeod (incompetech.com), лицензия CC BY 4.0. Фрагменты подготовлены
 * scripts/prepare-audio.mjs (36 с, выровненная громкость, мягкие вход и выход). Подробности — docs/CREDITS.md.
 * ID стабильны: они хранятся в записях дней (song.trackId) и не должны меняться.
 */
export type MoodId = 'calm' | 'joy' | 'tender' | 'nostalgia' | 'drive' | 'dream';

export type TrackId =
  | 'km-meditation-impromptu-02'
  | 'km-carefree'
  | 'km-gymnopedie-1'
  | 'km-bittersweet'
  | 'km-raving-energy-faster'
  | 'km-floating-cities';

export interface Mood {
  id: MoodId;
  emoji: string;
  label: string;
  /** Как звучит подборка — короткая подпись под эмодзи */
  hint: string;
  trackId: TrackId;
  /** Умеренное влияние на подачу (0..1); цвет всегда берётся из снимка */
  feel: { energy: number; intimacy: number; nostalgia: number; warmth: number };
}

export interface CatalogTrack {
  id: TrackId;
  mood: MoodId;
  title: string;
  artist: string;
  url: string;
  durationSec: number;
  /** Для профиля песни: жанр и характер звучания по описанию автора музыки */
  genre: string;
  character: string;
  scale: 'major' | 'minor';
  year: number;
  license: 'CC BY 4.0';
  sourcePage: string;
  isrc: string;
}

export const MOODS: Mood[] = [
  { id: 'calm', emoji: '🌿', label: 'Спокойствие', hint: 'редкие ноты и длинные паузы', trackId: 'km-meditation-impromptu-02', feel: { energy: 0.15, intimacy: 0.6, nostalgia: 0.4, warmth: 0.5 } },
  { id: 'joy', emoji: '☀️', label: 'Радость', hint: 'лёгкий ритм и ясная мелодия', trackId: 'km-carefree', feel: { energy: 0.65, intimacy: 0.45, nostalgia: 0.2, warmth: 0.75 } },
  { id: 'tender', emoji: '🫶', label: 'Нежность', hint: 'камерно, с местом для голоса', trackId: 'km-gymnopedie-1', feel: { energy: 0.2, intimacy: 0.9, nostalgia: 0.5, warmth: 0.65 } },
  { id: 'nostalgia', emoji: '🌧', label: 'Ностальгия', hint: 'сдержанно, с запоминающейся фразой', trackId: 'km-bittersweet', feel: { energy: 0.3, intimacy: 0.65, nostalgia: 0.9, warmth: 0.45 } },
  { id: 'drive', emoji: '🎉', label: 'Драйв', hint: 'атаки, бас и движение', trackId: 'km-raving-energy-faster', feel: { energy: 0.9, intimacy: 0.25, nostalgia: 0.15, warmth: 0.5 } },
  { id: 'dream', emoji: '🌌', label: 'Мечтательность', hint: 'широкий фон и свободный ритм', trackId: 'km-floating-cities', feel: { energy: 0.4, intimacy: 0.5, nostalgia: 0.55, warmth: 0.35 } },
];

const page = (isrc: string) => `https://incompetech.com/music/royalty-free/index.html?isrc=${isrc}`;

export const TRACKS: CatalogTrack[] = [
  { id: 'km-meditation-impromptu-02', mood: 'calm', title: 'Meditation Impromptu 02', artist: 'Kevin MacLeod', url: '/audio/km-meditation-impromptu-02.mp3', durationSec: 36, genre: 'фортепиано', character: 'спокойное, тихое, медленное', scale: 'major', year: 2011, license: 'CC BY 4.0', isrc: 'USUAN1100162', sourcePage: page('USUAN1100162') },
  { id: 'km-carefree', mood: 'joy', title: 'Carefree', artist: 'Kevin MacLeod', url: '/audio/km-carefree.mp3', durationSec: 36, genre: 'акустика, укулеле', character: 'радостное, светлое, лёгкое', scale: 'major', year: 2014, license: 'CC BY 4.0', isrc: 'USUAN1400037', sourcePage: page('USUAN1400037') },
  { id: 'km-gymnopedie-1', mood: 'tender', title: 'Gymnopedie No. 1 (Erik Satie)', artist: 'Kevin MacLeod', url: '/audio/km-gymnopedie-1.mp3', durationSec: 36, genre: 'камерное фортепиано', character: 'нежное, тихое', scale: 'major', year: 2011, license: 'CC BY 4.0', isrc: 'USUAN1100787', sourcePage: page('USUAN1100787') },
  { id: 'km-bittersweet', mood: 'nostalgia', title: 'Bittersweet', artist: 'Kevin MacLeod', url: '/audio/km-bittersweet.mp3', durationSec: 36, genre: 'виолончель, фортепиано', character: 'ностальгия, грустное, задумчивое', scale: 'minor', year: 2017, license: 'CC BY 4.0', isrc: 'USUAN1700004', sourcePage: page('USUAN1700004') },
  { id: 'km-raving-energy-faster', mood: 'drive', title: 'Raving Energy (faster)', artist: 'Kevin MacLeod', url: '/audio/km-raving-energy-faster.mp3', durationSec: 36, genre: 'электроника', character: 'энергичный драйв', scale: 'minor', year: 2019, license: 'CC BY 4.0', isrc: 'USUAN1900012', sourcePage: page('USUAN1900012') },
  { id: 'km-floating-cities', mood: 'dream', title: 'Floating Cities', artist: 'Kevin MacLeod', url: '/audio/km-floating-cities.mp3', durationSec: 36, genre: 'эмбиент, синтезаторы', character: 'мечтательное, воздушное', scale: 'minor', year: 2016, license: 'CC BY 4.0', isrc: 'USUAN1600018', sourcePage: page('USUAN1600018') },
];

export const DEFAULT_MOOD: MoodId = 'calm';

export function moodOf(id: MoodId | null | undefined): Mood | null {
  return MOODS.find((m) => m.id === id) ?? null;
}

export function trackOf(id: string | null | undefined): CatalogTrack | null {
  return TRACKS.find((t) => t.id === id) ?? null;
}

export function trackForMood(id: MoodId | null | undefined): CatalogTrack {
  return trackOf(moodOf(id)?.trackId) ?? trackOf(moodOf(DEFAULT_MOOD)!.trackId)!;
}

/** Подбор настроения по словам описания или текста — для старых записей и дней без выбора. */
export function inferMood(text: string): MoodId {
  const t = text.toLowerCase().replace(/ё/g, 'е');
  if (/(драйв|энерг|танц|клуб|электрон|техно|рок|концерт|быстр|громк)/.test(t)) return 'drive';
  if (/(ностальг|грус|дожд|минор|печал|осен|вспомин|детств)/.test(t)) return 'nostalgia';
  if (/(нежн|камерн|мам|любим|вдвоем|фортепиан|пиано)/.test(t)) return 'tender';
  if (/(радост|весел|солнеч|праздн|поп|укулеле|бодр|лето)/.test(t)) return 'joy';
  if (/(мечт|эмбиент|космич|воздуш|туман|горы|звезд)/.test(t)) return 'dream';
  return 'calm';
}
