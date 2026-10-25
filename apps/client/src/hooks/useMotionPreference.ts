import { useEffect, useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';

export function useMotionPreference(): boolean {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const [systemReduced, setSystemReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reducedMotion || systemReduced;
}
