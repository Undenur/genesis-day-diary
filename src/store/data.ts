/** Общее состояние данных: дни и события Countdown. Источник истины — IndexedDB. */
import { create } from 'zustand';
import type { CountdownEvent, Memory } from '../lib/types';
import * as store from '../services/db';

interface DataState {
  memories: Memory[];
  countdowns: CountdownEvent[];
  status: 'idle' | 'loading' | 'seeding' | 'ready' | 'error';
  error: string | null;
  init: () => Promise<void>;
  reload: () => Promise<void>;
  saveMemory: (m: Memory, opts?: { clearDraft?: boolean }) => Promise<void>;
  removeMemory: (id: string) => Promise<void>;
  saveCountdown: (c: CountdownEvent) => Promise<void>;
  removeCountdown: (id: string) => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useData = create<DataState>()((set, get) => ({
  memories: [],
  countdowns: [],
  status: 'idle',
  error: null,
  init: () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      set({ status: 'loading' });
      try {
        await store.collectGarbage();
        await get().reload();
        const seeded = await store.getMeta<boolean>('demoSeeded');
        if (!seeded) {
          set({ status: 'seeding' });
          const { seedDemos } = await import('../services/demo');
          // Каждый готовый демо-день сразу появляется в архиве.
          await seedDemos(() => get().reload());
          await get().reload();
        }
        set({ status: 'ready' });
      } catch (e) {
        console.error(e);
        set({ status: 'error', error: (e as Error).message });
      }
    })();
    return initPromise;
  },
  reload: async () => {
    const [memories, countdowns] = await Promise.all([store.listMemories(), store.listCountdowns()]);
    memories.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    set({ memories, countdowns });
  },
  saveMemory: async (m, opts) => {
    await store.saveMemoryAtomic(m, opts);
    await get().reload();
  },
  removeMemory: async (id) => {
    await store.deleteMemory(id);
    // Событие Countdown, из которого создан день, снова предлагает создать воспоминание.
    for (const c of get().countdowns.filter((c) => c.memoryId === id)) await store.saveCountdown({ ...c, memoryId: null });
    await get().reload();
  },
  saveCountdown: async (c) => {
    await store.saveCountdown(c);
    await get().reload();
  },
  removeCountdown: async (id) => {
    await store.deleteCountdown(id);
    await get().reload();
  },
}));
