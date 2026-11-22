/** Черновик мастера «Создать воспоминание»: автосохранение в IndexedDB вместе с подготовленными файлами. */
import { create } from 'zustand';
import type { Generation, MemoryInput } from '../lib/types';
import { seasonFromDate, todayISO, uuid } from '../lib/util';
import { clearDraft, loadDraft, saveDraft, StorageFullError } from '../services/db';

export const DRAFT_OWNER = 'draft';

/** Версия последовательности шагов мастера. 1 — семь шагов (до 1.1), 2 — четыре. */
export const DRAFT_FLOW = 2;
/** Шаги черновиков из семишаговой версии → новые: дата/история/фото → 0, песня → 1, голос/контекст → 2, сборка → 3. */
const LEGACY_STEP = [0, 0, 0, 1, 2, 2, 3];

export function mapDraftStep(step: number, flow?: number) {
  if (flow === DRAFT_FLOW) return Math.min(Math.max(0, step), 3);
  return LEGACY_STEP[step] ?? 0;
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
    ...prefill,
  };
}

interface DraftState {
  loaded: boolean;
  step: number;
  input: MemoryInput;
  memoryId: string;
  generation: Generation | null;
  restoredAt: string | null;
  saveError: string | null;
  load: () => Promise<void>;
  update: (patch: Partial<MemoryInput>) => void;
  setStep: (n: number) => void;
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
        await saveDraft({ step: s.step, flow: DRAFT_FLOW, input: s.input, memoryId: s.memoryId, generation: s.generation });
        if (s.saveError) set({ saveError: null });
      } catch (e) {
        set({ saveError: e instanceof StorageFullError ? e.message : 'Черновик не удалось сохранить' });
      }
    }, 300);
  };

  return {
    loaded: false,
    step: 0,
    input: emptyInput(),
    memoryId: uuid(),
    generation: null,
    restoredAt: null,
    saveError: null,
    load: async () => {
      if (get().loaded) return;
      const d = await loadDraft();
      if (d) set({ loaded: true, step: mapDraftStep(d.step, d.flow), input: { ...emptyInput(), ...d.input }, memoryId: d.memoryId ?? uuid(), generation: d.generation ?? null, restoredAt: d.updatedAt });
      else set({ loaded: true });
    },
    update: (patch) => {
      const input = { ...get().input, ...patch };
      if (patch.date && !input.seasonManual) input.season = seasonFromDate(patch.date);
      // Любая правка ввода делает собранный RE:LIVE устаревшим.
      set({ input, generation: null });
      persist();
    },
    setStep: (step) => {
      set({ step });
      persist();
    },
    setGeneration: (generation) => {
      set({ generation });
      persist();
    },
    reset: async (prefill) => {
      if (timer) clearTimeout(timer);
      await clearDraft();
      set({ step: 0, input: emptyInput(prefill), memoryId: uuid(), generation: null, restoredAt: null, loaded: true, saveError: null });
      if (prefill) persist();
    },
  };
});

/** Есть ли в черновике что-то, кроме пустой формы. */
export function draftHasContent(i: MemoryInput) {
  return Boolean(i.text.trim() || i.photos.length || i.title.trim() || i.song || i.voice);
}
