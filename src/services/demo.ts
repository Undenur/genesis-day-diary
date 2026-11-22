/**
 * Три контрастных демо-дня, созданные обычным генератором из собственных материалов:
 * иллюстрации из scripts/gen-assets.mjs, треки — синтез MOMENTA, отрендеренный в WAV и измеренный как обычный файл.
 */
import type { Category, CountdownEvent, MemoryInput, Place, Scale, SynthTexture, Weather } from '../lib/types';
import { hashString, seasonFromDate, todayISO, uuid } from '../lib/util';
import { listCountdowns, listMemories, putBlob, saveCountdown, saveMemoryAtomic, setMeta } from './db';
import { processPhoto } from './media';
import { buildRelive, toMemory } from './pipeline';
import { renderSynthWav } from './synth';

interface DemoDef {
  title: string;
  date: string;
  category: Category;
  weather: Weather;
  place: Omit<Place, 'id'>;
  photos: string[];
  text: string;
  track: { title: string; artist: string; genre: string; mood: string; bpm: number; scale: Scale; texture: SynthTexture; energy: number; year: number };
}

function shiftYears(iso: string, years: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
}

export function demoDefs(today = todayISO()): DemoDef[] {
  const year = Number(today.slice(0, 4));
  const marchThisYear = `${year}-03-07`;
  return [
    {
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

export async function seedDemos(onDay: () => void | Promise<void> = () => {}) {
  const today = todayISO();
  // Если подготовку прервали перезагрузкой — не создаём дубликаты уже готовых демо.
  const haveDays = new Set((await listMemories()).filter((m) => m.demo).map((m) => m.title));
  const haveEvents = new Set((await listCountdowns()).map((c) => c.title));
  for (const def of demoDefs(today)) {
    if (haveDays.has(def.title)) continue;
    const id = uuid();
    const photos = [];
    for (let i = 0; i < def.photos.length; i++) photos.push(await processPhoto(await fetchDemoImage(def.photos[i]), `${def.photos[i]}.jpg`, id, i));
    const wav = await renderDemoTrack(def.track);
    const fileBlobId = await putBlob(wav, id, `audio-${uuid()}`);
    const input: MemoryInput = {
      date: def.date,
      title: def.title,
      text: def.text,
      category: def.category,
      season: seasonFromDate(def.date),
      seasonManual: false,
      weather: def.weather,
      place: { id: uuid(), ...def.place },
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
      },
      voice: null,
    };
    const { generation, song } = await buildRelive(input, undefined, false);
    await saveMemoryAtomic({ ...toMemory(id, { ...input, song }, generation), demo: true });
    await onDay();
  }

  // Countdown: одно будущее событие и одно, которое уже состоялось.
  const future = new Date();
  future.setDate(future.getDate() + 18);
  const past = new Date();
  past.setDate(past.getDate() - 1);
  const events: { title: string; when: Date; time: string; img: string; category: Category; description: string }[] = [
    { title: 'Поездка на Байкал', when: future, time: '07:30', img: 'baikal-ice', category: 'travel', description: 'Прозрачный лёд, коньки и термос с облепиховым чаем.' },
    { title: 'День рождения Ани', when: past, time: '19:00', img: 'birthday-candles', category: 'holiday', description: 'Торт со свечами и любимые песни на кухне.' },
  ];
  for (const e of events) {
    if (haveEvents.has(e.title)) continue;
    const id = uuid();
    const coverBlobId = await putBlob(await fetchDemoImage(e.img), id, `cd-${uuid()}`);
    const ev: CountdownEvent = { id, title: e.title, datetime: `${todayISO(e.when)}T${e.time}`, coverBlobId, description: e.description, category: e.category, memoryId: null, createdAt: new Date().toISOString() };
    await saveCountdown(ev);
  }
  await setMeta('demoSeeded', true);
}
