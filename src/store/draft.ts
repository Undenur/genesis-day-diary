/**
 * Черновик редактора «Создать воспоминание»: автосохранение в IndexedDB вместе с подготовленными файлами.
 * С версии 1.2 редактор — один экран; шаги семи- и четырёхшаговых версий при чтении просто игнорируются.
 */
import { create } from 'zustand';
import type { Generation, MemoryInput } from '../lib/types';
import { seasonFromDate, todayISO, uuid } from '../lib/util';
import { clearDraft, loadDraft, saveDraft, StorageFullError, type DraftRecord } from '../services/db';

export const DRAFT_OWNER = 'draft';

/** Версия формы редактора. 1 — семь шагов (до 1.1), 2 — четыре шага, 3 — один экран. */
export const DRAFT_FLOW = 3;

/**
 * Черновик любой версии → состояние единого экрана. Шаг и версия формы не важны:
 * все поля (дата, название, текст, обложка, порядок фото, музыка, голос) лежат в input.
 */
export function draftFromRecord(d: Pick<DraftRecord, 'input' | 'memoryId' | 'generation'> & Partial<DraftRecord>) {
  return { input: { ...emptyInput(), ...d.input }, memoryId: d.memoryId ?? uuid(), generation: d.generation ?? null };
}

export function emptyInput(prefill: Partial<MemoryInput> = {}): MemoryInput {
  const date = prefill.date ?? todayISO();
  return {
    date,
    title: '',
    text: '',
    category: '',
    season: seasonFromDate(date),
    seasonManual: false,
    weather: '',
    place: null,
    photos: [],
    coverId: null,
    song: null,
    voice: null,
    mood: null,
    ...prefill,
  };
}

interface DraftState {
  loaded: boolean;
  input: MemoryInput;
  memoryId: string;
  generation: Generation | null;
  restoredAt: string | null;
  saveError: string | null;
  load: () => Promise<void>;
  update: (patch: Partial<MemoryInput>) => void;
  setGeneration: (g: Generation | null) => void;
  reset: (prefill?: Partial<MemoryInput>) => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useDraft = create<DraftState>()((set, get) => {
  const persist = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const s = get();
      try {
        await saveDraft({ step: 0, flow: DRAFT_FLOW, input: s.input, memoryId: s.memoryId, generation: s.generation });
        if (s.saveError) set({ saveError: null });
      } catch (e) {
        set({ saveError: e instanceof StorageFullError ? e.message : 'Черновик не удалось сохранить' });
      }
    }, 300);
  };

  return {
    loaded: false,
    input: emptyInput(),
    memoryId: uuid(),
    generation: null,
    restoredAt: null,
    saveError: null,
    load: async () => {
      if (get().loaded) return;
      const d = await loadDraft();
      if (d) set({ loaded: true, ...draftFromRecord(d), restoredAt: d.updatedAt });
      else set({ loaded: true });
    },
    update: (patch) => {
      const input = { ...get().input, ...patch };
      if (patch.date && !input.seasonManual) input.season = seasonFromDate(patch.date);
      // Любая правка ввода делает собранный RE:LIVE устаревшим.
      set({ input, generation: null });
      persist();
    },
    setGeneration: (generation) => {
      set({ generation });
      persist();
    },
    reset: async (prefill) => {
      if (timer) clearTimeout(timer);
      await clearDraft();
      set({ input: emptyInput(prefill), memoryId: uuid(), generation: null, restoredAt: null, loaded: true, saveError: null });
      if (prefill) persist();
    },
  };
});

/** Есть ли в черновике что-то, кроме пустой формы. */
export function draftHasContent(i: MemoryInput) {
  return Boolean(i.text.trim() || i.photos.length || i.title.trim() || i.song || i.voice || i.mood);
}
