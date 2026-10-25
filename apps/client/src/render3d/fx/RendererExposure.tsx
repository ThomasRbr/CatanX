import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { isCinematicView, type BoardViewMode } from '../camera/viewMode';

interface RendererExposureProps {
  viewMode?: BoardViewMode;
}

/** Keeps ACES exposure in sync when toggling strategic / cinematic. */
export function RendererExposure({ viewMode = 'strategic' }: RendererExposureProps) {
  const { gl } = useThree();
  const cinematic = isCinematicView(viewMode);

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    // Preserve highlight detail in stone, snow and pale soil. ACES plus the
    // PMREM environment previously clipped these materials toward chalk white.
    // The post chain's AO and grade take a little light back out; this
    // returns it so the board reads sunny rather than overcast.
    gl.toneMappingExposure = cinematic ? 1.14 : 1.13;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }, [cinematic, gl]);

  return null;
}
