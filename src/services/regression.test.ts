/**
 * Регрессионные проверки:
 * 1) две вкладки в чистом профиле создавали 6 демо-дней вместо 3;
 * 2) предпрослушивание продолжало звучать вместе с историей (устаревшая асинхронная загрузка);
 * 3) версия 1.2: демо-дни установок с синтезом переходят на композиции каталога, не трогая правки автора;
 * 4) обрыв ссылки посреди истории — запасная композиция с той же позиции; быстрые нажатия настроений.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { artDefaults } from '../components/relive/effects';
import type { ArtDirection, Memory } from '../lib/types';
import { claimAudio, stopAllAudio } from './audioOwner';
import { collectGarbage, getBlob, getMeta, insertMemoryIfAbsent, listCountdowns, listMemories, putBlob, setMeta, wipeAll } from './db';
import { DEMO_AUDIO_VERSION, DEMO_EVENTS, demoEventId, demoMemoryId, seedDemos, upgradeDemoAudio, type DemoDef, type PreparedDay } from './demo';
import { resolveMusic } from './musicSource';
import { usePreviewSound } from './previewSound';
import { StoryAudio } from './storyAudio';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Подготовка без браузерных API: те же устойчивые id, что и у настоящей. */
async function fakeDay(def: DemoDef): Promise<PreparedDay> {
  await tick(5 + Math.random() * 15);
  const id = demoMemoryId(def.key);
  const memory = {
    id,
    date: def.date,
    title: def.title,
    text: def.text,
    photos: [{ id: `${id}:photo:0`, blobId: `${id}:img:0`, thumbBlobId: `${id}:thumb:0`, name: `${def.photos[0]}.jpg` }],
    coverId: `${id}:photo:0`,
    song: null,
    voice: null,
    demo: true,
    demoKey: def.key,
    createdAt: '2026-01-01T00:00:00Z',
  } as unknown as Memory;
  return { memory, blobs: [{ id: `${id}:img:0`, blob: new Blob(['img']) }, { id: `${id}:thumb:0`, blob: new Blob(['t']) }] };
}

async function fakeEvent(e: (typeof DEMO_EVENTS)[number]) {
  await tick(3);
  const id = demoEventId(e.key);
  return { event: { id, title: e.title, datetime: `2026-12-01T${e.time}`, coverBlobId: `${id}:cover`, description: '', category: e.category, memoryId: null, createdAt: '' }, cover: { id: `${id}:cover`, blob: new Blob(['c']) } };
}

describe('первый запуск', () => {
  beforeEach(async () => {
    await wipeAll();
  });

  it('две параллельные подготовки дают ровно три демо-дня и два события', async () => {
    await Promise.all([seedDemos({ prepareDay: fakeDay, prepareEvent: fakeEvent }), seedDemos({ prepareDay: fakeDay, prepareEvent: fakeEvent })]);
    const mem = await listMemories();
    expect(mem.length).toBe(3);
    expect(new Set(mem.map((m) => m.id)).size).toBe(3);
    expect((await listCountdowns()).length).toBe(2);
    expect(await getMeta('demoSeeded')).toBe(true);
    for (const m of mem) expect(await getBlob(m.photos[0].blobId)).not.toBeNull();
  });

  it('прерванный запуск завершается и не трогает отредактированный день', async () => {
    const first = await fakeDay({ key: 'mountains', title: 'x', date: '2025-07-21', photos: ['mountains-dawn'], text: '' } as unknown as DemoDef);
    first.memory.title = 'Мои горы, переименованные';
    await insertMemoryIfAbsent(first.memory, first.blobs);
    await setMeta('demoSeeded', false);
    await seedDemos({ prepareDay: fakeDay, prepareEvent: fakeEvent });
    const mem = await listMemories();
    expect(mem.length).toBe(3);
    expect(mem.find((m) => m.id === demoMemoryId('mountains'))!.title).toBe('Мои горы, переименованные');
  });

  it('сборщик не удаляет свежие файлы, которые ещё импортирует другая вкладка', async () => {
    await putBlob(new Blob(['draft photo']), 'draft', 'img-in-progress');
    await collectGarbage();
    expect(await getBlob('img-in-progress')).not.toBeNull();
    await collectGarbage(Date.now() + 2 * 3600 * 1000);
    expect(await getBlob('img-in-progress')).toBeNull();
  });
});

describe('старые дни без полей версии 1.1', () => {
  it('художественный слой получает значения по умолчанию', () => {
    const old = { style: 'kandinsky', captionAlign: 'left', softness: 0.4 } as unknown as ArtDirection;
    const d = artDefaults(old);
    expect(d.lead).toBe('geometry');
    expect(d.intensity.geometry).toBe(1);
    expect(d.light.x).toBeGreaterThan(0.5);
  });
});

// ---------- Звук ----------
class FakeAudio {
  static all: FakeAudio[] = [];
  src: string;
  paused = true;
  volume = 1;
  loop = false;
  preload = '';
  currentTime = 0;
  duration = 24;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src = '') {
    this.src = src;
    FakeAudio.all.push(this);
  }
  /** Как в браузере: paused сбрасывается сразу, промис завершается позже. */
  async play() {
    this.paused = false;
    await tick(2);
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = '';
  }
}

class FakeNode {
  gain = { value: 1, setTargetAtTime() {} };
  fftSize = 0;
  connect(n?: unknown) {
    return n ?? this;
  }
  getByteTimeDomainData() {}
}

class FakeContext {
  state = 'suspended';
  currentTime = 0;
  destination = new FakeNode();
  async resume() {
    await tick(4);
    this.state = 'running';
  }
  createGain() {
    return new FakeNode();
  }
  createAnalyser() {
    return new FakeNode();
  }
  createMediaElementSource() {
    return new FakeNode();
  }
  async close() {}
}

const g = globalThis as unknown as Record<string, unknown>;
g.Audio = FakeAudio;
g.window = g.window ?? g;
(g.window as Record<string, unknown>).AudioContext = FakeContext;

const fileMusic = resolveMusic({ source: 'file', title: 't', artist: '', genre: '', mood: '', fileBlobId: 'f' }, 'calm');

const playingCount = () => FakeAudio.all.filter((a) => !a.paused).length;

describe('один владелец музыки', () => {
  beforeEach(() => {
    FakeAudio.all = [];
    stopAllAudio();
  });

  it('открытие истории во время загрузки предпрослушивания не даёт ему заиграть', async () => {
    await putBlob(new Blob(['wav']), 'm1', 'audio-m1');
    const m = { id: 'm1', song: { source: 'file', fileBlobId: 'audio-m1' }, generation: { song: null, beatMs: 500, inputHash: 'x' } } as unknown as Memory;
    const pending = usePreviewSound.getState().toggle(m);
    // История открывается, пока файл предпрослушивания ещё читается из базы.
    stopAllAudio();
    const storyToken = claimAudio('story', () => {});
    await pending;
    await tick(10);
    expect(playingCount()).toBe(0);
    expect(usePreviewSound.getState().playingId).toBeNull();
    expect(storyToken).toBeGreaterThan(0);
  });

  it('предпрослушивание останавливается, когда история начинает играть', async () => {
    await putBlob(new Blob(['wav']), 'm2', 'audio-m2');
    const m = { id: 'm2', song: { source: 'file', fileBlobId: 'audio-m2' }, generation: { song: null, beatMs: 500, inputHash: 'x' } } as unknown as Memory;
    await usePreviewSound.getState().toggle(m);
    expect(playingCount()).toBe(1);
    const story = new StoryAudio({ music: fileMusic, fileUrl: 'blob:story', voiceUrl: null, getPositionMs: () => 0 });
    await story.play(0);
    expect(playingCount()).toBe(1);
    expect(FakeAudio.all.find((a) => !a.paused)!.src).toBe('blob:story');
    story.pause();
    await tick(5);
    expect(playingCount()).toBe(0);
    story.destroy();
  });

  it('три play() подряд при уже запущенном контексте: звук не гасит сам себя', async () => {
    const story = new StoryAudio({ music: fileMusic, fileUrl: 'blob:s3', voiceUrl: null, getPositionMs: () => 0 });
    await story.play(0); // контекст запущен
    story.pause();
    await Promise.all([story.play(0), story.play(0), story.play(0)]);
    await tick(10);
    expect(playingCount()).toBe(1);
    story.pause();
    expect(playingCount()).toBe(0);
    story.destroy();
  });

  it('быстрые Play → Pause → Play: звучит один источник, Play → Pause — тишина', async () => {
    const story = new StoryAudio({ music: fileMusic, fileUrl: 'blob:s2', voiceUrl: null, getPositionMs: () => 0 });
    const p1 = story.play(0);
    story.pause();
    await p1;
    await tick(10);
    expect(playingCount()).toBe(0);
    const p2 = story.play(0);
    story.pause();
    const p3 = story.play(1000);
    await Promise.all([p2, p3]);
    await tick(10);
    expect(playingCount()).toBe(1);
    story.pause();
    expect(playingCount()).toBe(0);
    story.destroy();
  });
});

// ---------- Версия 1.2: демо на композициях каталога ----------
function oldDemo(key: DemoDef['key'], over: Partial<Memory> = {}): { memory: Memory; blobs: { id: string; blob: Blob }[] } {
  const id = demoMemoryId(key);
  const memory = {
    id,
    schemaVersion: 1,
    visibility: 'private',
    date: '2025-07-21',
    title: 'Там, где дышат горы',
    text: 'Поднялись на перевал ещё до рассвета.',
    category: 'travel',
    season: 'summer',
    seasonManual: false,
    weather: 'fog',
    place: null,
    photos: [{ id: `${id}:photo:0`, blobId: `${id}:img:0`, thumbBlobId: `${id}:thumb:0`, name: 'mountains-dawn.jpg', alt: '', width: 1, height: 1, features: {} }],
    coverId: `${id}:photo:0`,
    song: { source: 'file', title: 'Высота 2800', artist: 'MOMENTA Demo', genre: 'эмбиент', mood: '', fileBlobId: `${id}:audio`, fileName: 'Высота 2800.wav', fileType: 'audio/wav' },
    voice: null,
    generation: { title: 'Там, где дышат горы' },
    demo: true,
    demoKey: key,
    createdAt: '2025-07-21T10:00:00.000Z',
    updatedAt: '2025-07-21T10:00:00.000Z',
    ...over,
  } as unknown as Memory;
  return { memory, blobs: [{ id: `${id}:img:0`, blob: new Blob(['img']) }, { id: `${id}:thumb:0`, blob: new Blob(['t']) }, { id: `${id}:audio`, blob: new Blob(['wav']) }] };
}

const fakeRebuild = (calls: string[]) => async (input: Memory | import('../lib/types').MemoryInput) => {
  calls.push(input.title);
  return { generation: { title: input.title, titleSource: 'author' } as unknown as Memory['generation'], song: input.song };
};

describe('обновление звука демо для установок до 1.2', () => {
  beforeEach(async () => {
    await wipeAll();
    await setMeta('demoSeeded', true);
  });

  it('синтез заменяется композицией настроения; правки, удаление и свой трек автора сохраняются', async () => {
    const mountains = oldDemo('mountains', { title: 'Мои горы на рассвете' });
    await insertMemoryIfAbsent(mountains.memory, mountains.blobs);
    // «Ночь» автор отредактировал и поставил свой трек — его не трогаем.
    const night = oldDemo('night', { title: 'Ночь громче наших слов', song: { source: 'file', title: 'Мой трек', artist: 'Я', genre: '', mood: '', fileBlobId: 'demo-night:audio', fileName: 'my.mp3', fileType: 'audio/mpeg' } });
    await insertMemoryIfAbsent(night.memory, night.blobs);
    // «Дождь» удалён — не воскрешаем.

    const calls: string[] = [];
    expect(await upgradeDemoAudio({ rebuild: fakeRebuild(calls) })).toBe(1);
    const mem = await listMemories();
    expect(mem.map((m) => m.id).sort()).toEqual([demoMemoryId('mountains'), demoMemoryId('night')]);
    const m = mem.find((x) => x.id === demoMemoryId('mountains'))!;
    expect(m.song).toMatchObject({ source: 'catalog', trackId: 'km-meditation-impromptu-02' });
    expect(m.mood).toBe('calm');
    expect(m.title).toBe('Мои горы на рассвете');
    expect(m.text).toBe(mountains.memory.text);
    expect(m.createdAt).toBe(mountains.memory.createdAt);
    expect(m.demo).toBe(true);
    expect(m.demoKey).toBe('mountains');
    expect(await getBlob('demo-mountains:audio')).toBeNull();
    expect(mem.find((x) => x.id === demoMemoryId('night'))!.updatedAt).toBe(night.memory.updatedAt);
    expect(await getMeta('demoAudio')).toBe(DEMO_AUDIO_VERSION);

    // Повторный запуск ничего не пересобирает.
    expect(await upgradeDemoAudio({ rebuild: fakeRebuild(calls) })).toBe(0);
    expect(calls).toEqual(['Мои горы на рассвете']);
  });

  it('правка во второй вкладке во время пересборки не перетирается, обновление повторится', async () => {
    const rain = oldDemo('rain', { title: 'Дождь за тёплым стеклом' });
    await insertMemoryIfAbsent(rain.memory, rain.blobs);
    const { db } = await import('./db');
    const racing = async (input: import('../lib/types').MemoryInput) => {
      await (await db()).put('memories', { ...rain.memory, title: 'Правка из второй вкладки', updatedAt: '2026-11-22T12:00:00.000Z' });
      return fakeRebuild([])(input);
    };
    expect(await upgradeDemoAudio({ rebuild: racing })).toBe(0);
    const m = (await listMemories())[0];
    expect(m.title).toBe('Правка из второй вкладки');
    expect(await getMeta('demoAudio')).toBeUndefined();
    // Следующий запуск обновляет звук, сохранив правку.
    expect(await upgradeDemoAudio({ rebuild: fakeRebuild([]) })).toBe(1);
    const after = (await listMemories())[0];
    expect(after.title).toBe('Правка из второй вкладки');
    expect(after.song).toMatchObject({ source: 'catalog', trackId: 'km-gymnopedie-1' });
  });

  it('свежая установка сразу помечена текущей версией звука', async () => {
    await wipeAll();
    await seedDemos({ prepareDay: fakeDay, prepareEvent: fakeEvent });
    expect(await getMeta('demoAudio')).toBe(DEMO_AUDIO_VERSION);
  });
});

describe('звук без синтеза', () => {
  beforeEach(() => {
    FakeAudio.all = [];
    stopAllAudio();
  });

  it('ссылка обрывается посреди истории — запасная композиция с той же позиции', async () => {
    const music = resolveMusic({ source: 'link', url: 'https://example.com/day.mp3', title: 'day', artist: '', genre: '', mood: '' }, 'nostalgia');
    const story = new StoryAudio({ music, fileUrl: null, voiceUrl: null, getPositionMs: () => 12000 });
    const statuses: string[] = [];
    story.onStatus = (s) => statuses.push(s.mode);
    await story.play(5000);
    const link = FakeAudio.all.find((a) => a.src === 'https://example.com/day.mp3')!;
    expect(link.paused).toBe(false);
    link.onerror!();
    await tick(10);
    expect(statuses).toEqual(['catalog']);
    expect(story.status.note).toContain('Bittersweet');
    const playing = FakeAudio.all.filter((a) => !a.paused);
    expect(playing.map((a) => a.src)).toEqual(['/audio/km-bittersweet.mp3']);
    expect(playing[0].currentTime).toBe(12);
    story.pause();
    expect(playingCount()).toBe(0);
    story.destroy();
  });

  it('быстрые нажатия настроений в редакторе: звучит только последний фрагмент', async () => {
    const ps = usePreviewSound.getState();
    await ps.play('editor', { url: '/audio/km-carefree.mp3' });
    expect(playingCount()).toBe(1);
    await Promise.all([
      ps.play('editor', { url: '/audio/km-bittersweet.mp3' }),
      ps.play('editor', { url: '/audio/km-gymnopedie-1.mp3' }),
      ps.play('editor', { url: '/audio/km-floating-cities.mp3' }),
    ]);
    await tick(500); // кроссфейд прежнего фрагмента завершён
    expect(FakeAudio.all.filter((a) => !a.paused).map((a) => a.src)).toEqual(['/audio/km-floating-cities.mp3']);
    expect(usePreviewSound.getState().playingId).toBe('editor');
    usePreviewSound.getState().stop();
    await tick(400);
    expect(playingCount()).toBe(0);
  });
});
