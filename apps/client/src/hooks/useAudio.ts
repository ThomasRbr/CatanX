import { useEffect, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { SoundManager } from '../render/SoundManager';

let manager: SoundManager | null = null;

function getManager(): SoundManager {
  if (!manager) {
    manager = new SoundManager();
  }
  return manager;
}

export function useAudio() {
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const sfxVolume = useSettingsStore((s) => s.sfxVolume);

  useEffect(() => {
    const m = getManager();
    m.setVolumes(musicVolume, sfxVolume);

    const unlock = () => m.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [musicVolume, sfxVolume]);

  return useMemo(
    () => ({
      musicVolume,
      sfxVolume,
      playSfx: (id: string) => {
        getManager().playSfx(id);
      },
    }),
    [musicVolume, sfxVolume],
  );
}
