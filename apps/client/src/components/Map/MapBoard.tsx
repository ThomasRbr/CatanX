import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType } from 'react';
import { useSettingsStore, type MapRenderer } from '../../store/settingsStore';
import { supportsWebGL2 } from '../../render3d/utils/rendererCapabilities';
import { HexBoard, type HexBoardProps } from './HexBoard';
import { ThreeMapErrorBoundary } from './ThreeMapErrorBoundary';
import { LazyFallback } from '../../lazy/screens';

export type MapBoardProps = HexBoardProps;

const threeBoardImport = () => import('../../render3d/ThreeHexBoard');
const dioramaBoardImport = () => import('../../render3d/DioramaRenderer');

const LazyThreeHexBoard = lazy(async () => {
  const mod = await threeBoardImport();
  return { default: mod.ThreeHexBoard as ComponentType<HexBoardProps> };
});

const LazyDioramaRenderer = lazy(async () => {
  const mod = await dioramaBoardImport();
  return { default: mod.DioramaRenderer as ComponentType<HexBoardProps> };
});

// Warm only the production renderer. Legacy stays genuinely lazy.
void dioramaBoardImport();

function resolveActive(preferred: MapRenderer): MapRenderer {
  if (preferred === 'pixi') return 'pixi';
  return supportsWebGL2() ? preferred : 'pixi';
}

/**
 * Diorama → Three Legacy → Pixi fallback chain. Automatic failures are not
 * persisted, so a transient GPU/context issue does not permanently downgrade
 * the next session.
 */
export function MapBoard(props: MapBoardProps) {
  const preferred = useSettingsStore((state) => state.mapRenderer);
  const [hydrated, setHydrated] = useState(() => useSettingsStore.persist.hasHydrated());
  const [active, setActive] = useState<MapRenderer | null>(null);

  useEffect(() => {
    if (useSettingsStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useSettingsStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const next = resolveActive(preferred);
    setActive(next);
    if (preferred !== 'pixi' && next === 'pixi') {
      console.warn('[CatanX] WebGL 2 indisponible — fallback Pixi pour cette session');
    }
  }, [hydrated, preferred]);

  const handleDioramaFallback = useCallback((reason: string) => {
    console.warn(`[CatanX] Fallback Diorama → Three Legacy: ${reason}`);
    setActive('threeLegacy');
  }, []);

  const handleLegacyFallback = useCallback((reason: string) => {
    console.warn(`[CatanX] Fallback Three Legacy → Pixi: ${reason}`);
    setActive('pixi');
  }, []);

  if (!hydrated || active === null) {
    return <LazyFallback label="Chargement de la carte…" />;
  }

  if (active === 'diorama') {
    return (
      <ThreeMapErrorBoundary key={`diorama-map-${preferred}`} onFallback={handleDioramaFallback}>
        <Suspense fallback={<LazyFallback label="Chargement du Diorama réaliste…" />}>
          <LazyDioramaRenderer {...props} />
        </Suspense>
      </ThreeMapErrorBoundary>
    );
  }

  if (active === 'threeLegacy') {
    return (
      <ThreeMapErrorBoundary key={`three-legacy-map-${preferred}`} onFallback={handleLegacyFallback}>
        <Suspense fallback={<LazyFallback label="Chargement du rendu 3D de secours…" />}>
          <LazyThreeHexBoard {...props} />
        </Suspense>
      </ThreeMapErrorBoundary>
    );
  }

  return <HexBoard {...props} />;
}
