/**
 * Регрессионные проверки двух воспроизведённых ошибок:
 * 1) две вкладки в чистом профиле создавали 6 демо-дней вместо 3;
 * 2) предпрослушивание продолжало звучать вместе с историей (устаревшая асинхронная загрузка).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { artDefaults } from '../components/relive/effects';
import type { ArtDirection, Memory } from '../lib/types';
import { claimAudio, stopAllAudio } from './audioOwner';
import { collectGarbage, getBlob, getMeta, insertMemoryIfAbsent, listCountdowns, listMemories, putBlob, setMeta, wipeAll } from './db';
import { DEMO_EVENTS, demoEventId, demoMemoryId, seedDemos, type DemoDef, type PreparedDay } from './demo';
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
    const story = new StoryAudio({ song: { source: 'file', title: 't', artist: '', genre: '', mood: '' }, profile: null, fileUrl: 'blob:story', voiceUrl: null, fallbackBpm: 90, seedText: 's', getPositionMs: () => 0 });
    await story.play(0);
    expect(playingCount()).toBe(1);
    expect(FakeAudio.all.find((a) => !a.paused)!.src).toBe('blob:story');
    story.pause();
    await tick(5);
    expect(playingCount()).toBe(0);
    story.destroy();
  });

  it('три play() подряд при уже запущенном контексте: звук не гасит сам себя', async () => {
    const story = new StoryAudio({ song: { source: 'file', title: 't', artist: '', genre: '', mood: '' }, profile: null, fileUrl: 'blob:s3', voiceUrl: null, fallbackBpm: 90, seedText: 's', getPositionMs: () => 0 });
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
    const story = new StoryAudio({ song: { source: 'file', title: 't', artist: '', genre: '', mood: '' }, profile: null, fileUrl: 'blob:s2', voiceUrl: null, fallbackBpm: 90, seedText: 's', getPositionMs: () => 0 });
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
