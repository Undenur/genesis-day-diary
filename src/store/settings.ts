/** Небольшие настройки — в localStorage (через zustand persist). */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Settings {
  name: string;
  avatar: string | null;
  motion: 'system' | 'reduce' | 'full';
  musicVolume: number;
  voiceVolume: number;
  hidePrivateOnHome: boolean;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      name: 'Алина',
      avatar: null,
      motion: 'system',
      musicVolume: 0.8,
      voiceVolume: 1,
      hidePrivateOnHome: false,
      set: (patch) => set(patch),
    }),
    { name: 'momenta-settings', version: 1 },
  ),
);
