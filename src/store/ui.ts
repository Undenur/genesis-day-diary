/** Состояние интерфейса, которое должно переживать переход в день и обратно. */
import { create } from 'zustand';
import type { Category, Season } from '../lib/types';

export type MemoriesTab = 'archive' | 'timeline' | 'music';

interface UiState {
  memoriesTab: MemoriesTab;
  archive: { q: string; year: string; month: string; sort: 'new' | 'old'; selectedId: string | null };
  timelineCat: Category | 'all';
  music: { q: string; year: string };
  season: Season | null;
  scroll: Record<string, number>;
  setTab: (t: MemoriesTab) => void;
  setArchive: (p: Partial<UiState['archive']>) => void;
  setTimelineCat: (c: Category | 'all') => void;
  setMusic: (p: Partial<UiState['music']>) => void;
  setSeason: (s: Season) => void;
  saveScroll: (key: string, y: number) => void;
}

export const useUi = create<UiState>()((set) => ({
  memoriesTab: 'archive',
  archive: { q: '', year: '', month: '', sort: 'new', selectedId: null },
  timelineCat: 'all',
  music: { q: '', year: '' },
  season: null,
  scroll: {},
  setTab: (memoriesTab) => set({ memoriesTab }),
  setArchive: (p) => set((s) => ({ archive: { ...s.archive, ...p } })),
  setTimelineCat: (timelineCat) => set({ timelineCat }),
  setMusic: (p) => set((s) => ({ music: { ...s.music, ...p } })),
  setSeason: (season) => set({ season }),
  saveScroll: (key, y) => set((s) => ({ scroll: { ...s.scroll, [key]: y } })),
}));
