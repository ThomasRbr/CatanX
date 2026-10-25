import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { PlayerProfile } from '@catanx/engine';
import { createDefaultProfile, normalizeProfile } from '../profile/profileCatalog';

interface ProfileStoreState {
  profiles: Record<number, PlayerProfile>;
  setProfile: (slot: number, profile: PlayerProfile) => void;
  resetProfile: (slot: number) => void;
}

export const useProfileStore = create<ProfileStoreState>()(
  persist(
    (set) => ({
      profiles: {},
      setProfile: (slot, profile) =>
        set((state) => ({
          profiles: { ...state.profiles, [slot]: normalizeProfile(profile, slot) },
        })),
      resetProfile: (slot) =>
        set((state) => ({ profiles: { ...state.profiles, [slot]: createDefaultProfile(slot) } })),
    }),
    {
      name: 'catanx_player_profiles_v1',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ profiles: state.profiles }),
      migrate: (persisted) => {
        const state = persisted as Partial<ProfileStoreState>;
        return {
          ...state,
          profiles: Object.fromEntries(
            Object.entries(state.profiles ?? {}).map(([slot, profile]) => [
              slot,
              normalizeProfile(profile, Number(slot)),
            ]),
          ),
        } as ProfileStoreState;
      },
    },
  ),
);
