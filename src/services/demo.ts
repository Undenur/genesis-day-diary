/**
 * Три контрастных демо-дня, созданные обычным генератором из собственных материалов:
 * иллюстрации из scripts/gen-assets.mjs, треки — синтез MOMENTA, отрендеренный в WAV и измеренный как обычный файл.
 *
 * Первый запуск повторяем после перезагрузки, прерывания и параллельного запуска во второй вкладке:
 * — у каждого демо-дня и события устойчивый id (не зависит от названия, которое пользователь может изменить);
 * — день записывается вместе с файлами одной транзакцией «если ещё нет» (insertMemoryIfAbsent);
 * — подготовку занимает межвкладочная блокировка Web Locks; вторая вкладка дождётся первой.
 * Никакие существующие записи не удаляются и не перезаписываются.
 */
import type { Category, CountdownEvent, Memory, MemoryInput, Place, Scale, SynthTexture, Weather } from '../lib/types';
import { hashString, seasonFromDate, todayISO } from '../lib/util';
import { getMeta, insertCountdownIfAbsent, insertMemoryIfAbsent, listCountdowns, listMemories, setMeta } from './db';
import { analyzeAudioBlob, preparePhoto } from './media';
import { buildRelive, toMemory } from './pipeline';
import { renderSynthWav } from './synth';

export type DemoKey = 'mountains' | 'night' | 'rain';

export interface DemoDef {
  key: DemoKey;
  title: string;
  date: string;
  category: Category;
  weather: Weather;
  place: Omit<Place, 'id'>;
  photos: string[];
  text: string;
  track: { title: string; artist: string; genre: string; mood: string; bpm: number; scale: Scale; texture: SynthTexture; energy: number; year: number };
}

export interface DemoEventDef {
  key: 'baikal' | 'birthday';
  title: string;
  dayOffset: number;
  time: string;
  img: string;
  category: Category;
  description: string;
}

/** Устойчивые идентификаторы демо: по ним, а не по названию, проверяется наличие. */
export const demoMemoryId = (key: DemoKey) => `demo-${key}`;
export const demoEventId = (key: DemoEventDef['key']) => `demo-event-${key}`;

function shiftYears(iso: string, years: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
}

export function demoDefs(today = todayISO()): DemoDef[] {
  const year = Number(today.slice(0, 4));
  const marchThisYear = `${year}-03-07`;
  return [
    {
      key: 'mountains',
      title: 'Там, где дышат горы',
      date: `${year - 1}-07-21`,
      category: 'travel',
      weather: 'fog',
      place: { name: 'Перевал над Большим озером', lat: 43.0506, lng: 76.9853 },
      photos: ['mountains-dawn', 'lake-turquoise', 'tea-thermos'],
      text:
        'Поднялись на перевал ещё до рассвета, пока туман лежал в долине, как молоко. Шли медленно и слушали, как дышат горы и шуршат камни под ногами. Вдвоём с Аней пили чай из термоса и молчали — так спокойно не было давно. Озеро внизу стало бирюзовым, когда солнце вышло из-за вершин. На обратном пути запомнился запах полыни и тёплый камень под ладонью.',
      track: { title: 'Высота 2800', artist: 'MOMENTA Demo', genre: 'эмбиент', mood: 'воздушный, спокойный', bpm: 76, scale: 'major', texture: 'ambient', energy: 0.35, year: year - 1 },
    },
    {
      key: 'night',
      title: 'Ночь громче наших слов',
      date: marchThisYear <= today ? marchThisYear : `${year - 1}-03-07`,
      category: 'meeting',
      weather: '',
      place: { name: 'Склад на набережной', lat: 55.7436, lng: 37.6602 },
      photos: ['stage-lights', 'crowd-hands'],
      text:
        'Концерт начался ближе к полуночи, и склад на набережной гудел, как улей. Прожекторы резали дым на полосы, бас бил прямо в грудь. Мы с друзьями прыгали у самой сцены и кричали припев так громко, что не слышали друг друга! Танцевали до утра, пока ноги не перестали слушаться. На выходе город был синим и тихим, а в ушах ещё звенело.',
      track: { title: 'Стробоскоп', artist: 'MOMENTA Demo', genre: 'электроника', mood: 'энергичный драйв', bpm: 136, scale: 'minor', texture: 'electronic', energy: 0.9, year: 2024 },
    },
    {
      key: 'rain',
      title: 'Дождь за тёплым стеклом',
      date: shiftYears(today, -1),
      category: 'personal',
      weather: 'rain',
      place: { name: 'Кофейня у вокзала', lat: 59.9311, lng: 30.3609 },
      photos: ['rain-window', 'cup-lamp'],
      text:
        'Весь вечер шёл дождь, и мы с мамой сидели у окна в маленькой кофейне у вокзала. Капли стекали по стеклу, огни улицы расплывались в золотые пятна. Лампа над столом грела ладони, чай остывал неспешно. Было совсем не грустно — тихо и тепло, как в детстве. Последним запомнился запах корицы на выходе.',
      track: { title: 'Капли на стекле', artist: 'MOMENTA Demo', genre: 'камерное фортепиано', mood: 'тихое, нежное', bpm: 62, scale: 'minor', texture: 'piano', energy: 0.2, year: 2019 },
    },
  ];
}

export const DEMO_EVENTS: DemoEventDef[] = [
  { key: 'baikal', title: 'Поездка на Байкал', dayOffset: 18, time: '07:30', img: 'baikal-ice', category: 'travel', description: 'Прозрачный лёд, коньки и термос с облепиховым чаем.' },
  { key: 'birthday', title: 'День рождения Ани', dayOffset: -1, time: '19:00', img: 'birthday-candles', category: 'holiday', description: 'Торт со свечами и любимые песни на кухне.' },
];

/** Демо-треки доступны и в мастере как обычные файлы — для проверки замены песни. */
export const DEMO_TRACKS = [
  { key: 'piano62', label: 'Камерное фортепиано · 62 BPM', title: 'Капли на стекле', genre: 'камерное фортепиано', mood: 'тихое, нежное', bpm: 62, scale: 'minor' as Scale, texture: 'piano' as SynthTexture, energy: 0.2 },
  { key: 'ambient76', label: 'Эмбиент · 76 BPM', title: 'Высота 2800', genre: 'эмбиент', mood: 'воздушный, спокойный', bpm: 76, scale: 'major' as Scale, texture: 'ambient' as SynthTexture, energy: 0.35 },
  { key: 'electro136', label: 'Электроника · 136 BPM', title: 'Стробоскоп', genre: 'электроника', mood: 'энергичный драйв', bpm: 136, scale: 'minor' as Scale, texture: 'electronic' as SynthTexture, energy: 0.9 },
];

export async function renderDemoTrack(t: { title: string; bpm: number; scale: Scale; texture: SynthTexture; energy: number }) {
  return renderSynthWav({ bpm: t.bpm, scale: t.scale, texture: t.texture, energy: t.energy, seed: hashString(t.title) }, 24);
}

async function fetchDemoImage(name: string) {
  const res = await fetch(`/demo/${name}.jpg`);
  if (!res.ok) throw new Error(`Нет демо-изображения ${name}`);
  return res.blob();
}

export interface PreparedDay {
  memory: Memory;
  blobs: { id: string; blob: Blob }[];
}

/** Подготовка демо-дня в браузере: снимки, трек, измерение и генерация — без записи в базу. */
export async function prepareDemoDay(def: DemoDef): Promise<PreparedDay> {
  const id = demoMemoryId(def.key);
  const blobs: PreparedDay['blobs'] = [];
  const photos = [];
  for (let i = 0; i < def.photos.length; i++) {
    const p = await preparePhoto(await fetchDemoImage(def.photos[i]), `${def.photos[i]}.jpg`, i);
    const blobId = `${id}:img:${i}`;
    const thumbBlobId = `${id}:thumb:${i}`;
    blobs.push({ id: blobId, blob: p.full }, { id: thumbBlobId, blob: p.thumb });
    photos.push({ id: `${id}:photo:${i}`, blobId, thumbBlobId, name: `${def.photos[i]}.jpg`, alt: p.alt, width: p.width, height: p.height, features: p.features });
  }
  const wav = await renderDemoTrack(def.track);
  const fileBlobId = `${id}:audio`;
  blobs.push({ id: fileBlobId, blob: wav });
  const input: MemoryInput = {
    date: def.date,
    title: def.title,
    text: def.text,
    category: def.category,
    season: seasonFromDate(def.date),
    seasonManual: false,
    weather: def.weather,
    place: { id: `${id}:place`, ...def.place },
    photos,
    coverId: photos[0].id,
    song: {
      source: 'file',
      title: def.track.title,
      artist: def.track.artist,
      genre: def.track.genre,
      mood: def.track.mood,
      year: def.track.year,
      bpm: def.track.bpm,
      scale: def.track.scale,
      fileBlobId,
      fileName: `${def.track.title}.wav`,
      fileType: 'audio/wav',
      // Файл ещё не в базе — измеряем его напрямую.
      audio: await analyzeAudioBlob(wav),
    },
    voice: null,
  };
  const { generation, song } = await buildRelive(input, undefined, false);
  return { memory: { ...toMemory(id, { ...input, song }, generation), demo: true, demoKey: def.key }, blobs };
}

export async function prepareDemoEvent(e: DemoEventDef, today = new Date()): Promise<{ event: CountdownEvent; cover: { id: string; blob: Blob } | null }> {
  const id = demoEventId(e.key);
  const when = new Date(today);
  when.setDate(when.getDate() + e.dayOffset);
  const cover = { id: `${id}:cover`, blob: await fetchDemoImage(e.img) };
  return {
    event: { id, title: e.title, datetime: `${todayISO(when)}T${e.time}`, coverBlobId: cover.id, description: e.description, category: e.category, memoryId: null, createdAt: new Date().toISOString() },
    cover,
  };
}

/** Демо, созданное версией до 1.1 (случайный id): узнаём по исходным файлам, а не по названию. */
function isLegacyDemo(m: Memory, def: DemoDef) {
  return !!m.demo && !m.demoKey && m.photos[0]?.name === `${def.photos[0]}.jpg`;
}

export interface SeedOptions {
  onDay?: () => void | Promise<void>;
  prepareDay?: (def: DemoDef) => Promise<PreparedDay>;
  prepareEvent?: typeof prepareDemoEvent;
  today?: string;
  /** Пересоздать недостающие (например, удалённые) демо, даже если первый запуск уже завершён */
  restore?: boolean;
}

/** Подготовка демо. Повторяема и безопасна при параллельном запуске. */
export async function seedDemos(opts: SeedOptions = {}) {
  const { onDay = () => {}, prepareDay = prepareDemoDay, prepareEvent = prepareDemoEvent, today = todayISO(), restore = false } = opts;
  const run = async () => {
    if (!restore && (await getMeta<boolean>('demoSeeded'))) return;
    for (const def of demoDefs(today)) {
      const existing = await listMemories();
      if (existing.some((m) => m.id === demoMemoryId(def.key) || isLegacyDemo(m, def))) continue;
      const day = await prepareDay(def);
      if (await insertMemoryIfAbsent(day.memory, day.blobs)) await onDay();
    }
    const events = await listCountdowns();
    for (const e of DEMO_EVENTS) {
      // Событие версии до 1.1 узнаём по обложке «cd-…» (её создавал только старый сборщик демо) и времени.
      if (events.some((c) => c.id === demoEventId(e.key) || (c.coverBlobId?.startsWith('cd-') && c.datetime.endsWith(e.time)))) continue;
      const { event, cover } = await prepareEvent(e);
      await insertCountdownIfAbsent(event, cover);
    }
    await setMeta('demoSeeded', true);
  };
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks) await locks.request('momenta-demo-seed', run);
  else await run();
}
