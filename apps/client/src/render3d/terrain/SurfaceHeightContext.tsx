import { createContext, useContext, type PropsWithChildren } from 'react';
import * as THREE from 'three';
import type { SurfaceHeightSampler } from './BoardHeightfield';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';

const flatSampler: SurfaceHeightSampler = {
  sampleHeight: () => HEX_SLAB_THICKNESS,
  sampleTileHeight: () => HEX_SLAB_THICKNESS,
  sampleNormal: (_x, _z, target = new THREE.Vector3()) => target.set(0, 1, 0),
};

const SurfaceHeightContext = createContext<SurfaceHeightSampler>(flatSampler);

export function SurfaceHeightProvider({
  sampler,
  children,
}: PropsWithChildren<{ sampler: SurfaceHeightSampler }>) {
  return <SurfaceHeightContext.Provider value={sampler}>{children}</SurfaceHeightContext.Provider>;
}

export function useSurfaceHeight(): SurfaceHeightSampler {
  return useContext(SurfaceHeightContext);
}
