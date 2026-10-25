import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Season } from '@catanx/engine';
import * as THREE from 'three';
import type { WorldBounds } from './camera/fitOrthographicCamera';
import { useMapLod } from './camera/MapLodContext';
import type { BoardLayer } from '../components/Map/boardLayer';
import { getClimateVisualPreset, normalizeSeason } from './utils/seasonVisuals';
import { resolveAtmosphere, type AtmosphereGrade } from './env/atmosphere';
import { SkyDome } from './env/SkyDome';

interface SceneEnvironmentProps {
  bounds?: WorldBounds;
  season?: Season | string;
  climateId?: string | null;
  cinematic?: boolean;
  layer?: BoardLayer;
  shadowMapSize?: 1024 | 2048 | 4096;
}

/** Always 2048 for board shadows — SoftShadows was removed (blurred hex floors). */
const DEFAULT_SHADOW_MAP_SIZE = 2048;

/**
 * Equirectangular image of the same sky the dome paints, fed to PMREM.
 *
 * Reflections used to come from a hand-tuned gradient that shared nothing with
 * the visible sky, so wet rock and water reflected a different world than the
 * one behind them. Generating it from the grade keeps them consistent.
 */
function createSkyEnvironmentTexture(grade: AtmosphereGrade): THREE.DataTexture {
  const width = 256;
  const height = 128;
  const pixels = new Uint8Array(width * height * 4);
  const direction = new THREE.Vector3();
  const sky = new THREE.Color();
  const sun = grade.sunDirection;

  for (let y = 0; y < height; y++) {
    // v == 0 is straight up in equirectangular mapping.
    const theta = (y / (height - 1)) * Math.PI;
    for (let x = 0; x < width; x++) {
      const phi = (x / width) * Math.PI * 2;
      direction.set(
        Math.sin(theta) * Math.sin(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.cos(phi),
      );

      const heightFactor = direction.y;
      if (heightFactor >= 0) {
        sky.copy(grade.horizon).lerp(grade.zenith, Math.pow(heightFactor, 0.42));
      } else {
        sky.copy(grade.horizon).lerp(grade.groundBounce, Math.pow(-heightFactor, 0.55));
      }

      const sunAngle = direction.dot(sun);
      const haze = Math.pow(Math.max(sunAngle, 0), 5) * 0.34;
      sky.lerp(grade.haze, haze);
      // A broad, soft sun lobe only — a hard disc in the environment map bakes
      // a bright blob into every rough reflection after PMREM blurs it.
      const lobe = Math.pow(Math.max(sunAngle, 0), 48) * 0.9;
      sky.r += grade.sunColor.r * lobe;
      sky.g += grade.sunColor.g * lobe;
      sky.b += grade.sunColor.b * lobe;

      const offset = (y * width + x) * 4;
      pixels[offset] = THREE.MathUtils.clamp(Math.round(sky.r * 255), 0, 255);
      pixels[offset + 1] = THREE.MathUtils.clamp(Math.round(sky.g * 255), 0, 255);
      pixels[offset + 2] = THREE.MathUtils.clamp(Math.round(sky.b * 255), 0, 255);
      pixels[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.name = 'CatanX sky environment';
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** PMREM probe rebuilt only when the season/layer grade actually changes. */
function SkyImageBasedLighting({ grade }: { grade: AtmosphereGrade }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const equirect = createSkyEnvironmentTexture(grade);
    const target = pmrem.fromEquirectangular(equirect);
    scene.environment = target.texture;

    equirect.dispose();
    pmrem.dispose();

    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
      target.dispose();
    };
    // `grade` is memoised on the discrete season/climate/layer inputs, so this
    // runs on real grade changes only. Rebuilding a PMREM per frame would stall.
  }, [gl, grade, scene]);

  useEffect(() => {
    scene.environmentIntensity = grade.envIntensity;
  }, [grade.envIntensity, scene]);

  return null;
}

/**
 * Three-point outdoor rig: warm key with shadows, cool sky fill, sea bounce.
 *
 * The previous rig ran a hemisphere, an ambient, three directionals and a point
 * light. Six weak sources from six directions cancel each other's modelling —
 * the island lost its form and every material paid for six light evaluations.
 */
export function SceneEnvironment({
  bounds,
  season = 'spring',
  climateId = null,
  cinematic = false,
  layer = 'surface',
  shadowMapSize = DEFAULT_SHADOW_MAP_SIZE,
}: SceneEnvironmentProps) {
  const lod = useMapLod();
  const normalizedSeason = normalizeSeason(season);

  const grade = useMemo(
    () => resolveAtmosphere({ season: normalizedSeason, climateId, cinematic, layer }),
    [cinematic, climateId, layer, normalizedSeason],
  );
  const transitionMs = layer === 'surface'
    ? (getClimateVisualPreset(climateId)?.transitionMs ?? 1200)
    : 460;

  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const bounceRef = useRef<THREE.DirectionalLight>(null);

  const boardCenter = useMemo(() => {
    if (!bounds) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(
      (bounds.minX + bounds.maxX) * 0.5,
      0,
      (bounds.minZ + bounds.maxZ) * 0.5,
    );
  }, [bounds]);

  const shadowExtent = useMemo(() => {
    if (!bounds) return 14;
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    return Math.max(9, span * 0.48 + 2);
  }, [bounds]);

  /** Distance along the sun vector; far enough to clear the tallest peaks. */
  const sunDistance = useMemo(() => Math.max(22, shadowExtent * 1.9), [shadowExtent]);

  const sunPosition = useMemo(
    () =>
      [
        boardCenter.x + grade.sunDirection.x * sunDistance,
        grade.sunDirection.y * sunDistance,
        boardCenter.z + grade.sunDirection.z * sunDistance,
      ] as [number, number, number],
    [boardCenter, grade.sunDirection, sunDistance],
  );

  /** Bounce comes back from the sea, i.e. opposite the sun and from below eye level. */
  const bouncePosition = useMemo(
    () =>
      [
        boardCenter.x - grade.sunDirection.x * sunDistance,
        Math.max(3, sunDistance * 0.22),
        boardCenter.z - grade.sunDirection.z * sunDistance,
      ] as [number, number, number],
    [boardCenter, grade.sunDirection, sunDistance],
  );

  const lerp = useRef({
    fogNear: grade.fogNear,
    fogFar: grade.fogFar,
    sun: grade.sunIntensity,
    ambient: grade.ambient,
    hemi: grade.hemiIntensity,
    fogColor: grade.fog.clone(),
    hemiSky: grade.hemiSky.clone(),
    hemiGround: grade.hemiGround.clone(),
    sunColor: grade.sunColor.clone(),
  });

  const castSunShadow = lod <= 1;

  useEffect(() => {
    const light = lightRef.current;
    const targetObj = targetRef.current;
    if (!light || !targetObj) return;
    targetObj.position.copy(boardCenter);
    targetObj.updateMatrixWorld();
    light.target = targetObj;
    light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    light.shadow.needsUpdate = true;
    light.shadow.camera.updateProjectionMatrix();
    // Layer 1 = opaque tree shadow proxies (invisible to the main camera).
    light.layers.enable(0);
    light.layers.enable(1);
  }, [boardCenter, shadowExtent, shadowMapSize]);

  useFrame((_, delta) => {
    const speed = Math.min(1, (delta * 1000) / Math.max(200, transitionMs));
    const L = lerp.current;

    const settled =
      Math.abs(grade.fogNear - L.fogNear) < 0.02
      && Math.abs(grade.sunIntensity - L.sun) < 0.01
      && L.fogColor.equals(grade.fog);

    if (settled) {
      L.fogNear = grade.fogNear;
      L.fogFar = grade.fogFar;
      L.sun = grade.sunIntensity;
      L.ambient = grade.ambient;
      L.hemi = grade.hemiIntensity;
      L.fogColor.copy(grade.fog);
      L.hemiSky.copy(grade.hemiSky);
      L.hemiGround.copy(grade.hemiGround);
      L.sunColor.copy(grade.sunColor);
    } else {
      L.fogNear += (grade.fogNear - L.fogNear) * speed;
      L.fogFar += (grade.fogFar - L.fogFar) * speed;
      L.sun += (grade.sunIntensity - L.sun) * speed;
      L.ambient += (grade.ambient - L.ambient) * speed;
      L.hemi += (grade.hemiIntensity - L.hemi) * speed;
      L.fogColor.lerp(grade.fog, speed);
      L.hemiSky.lerp(grade.hemiSky, speed);
      L.hemiGround.lerp(grade.hemiGround, speed);
      L.sunColor.lerp(grade.sunColor, speed);
    }

    if (fogRef.current) {
      fogRef.current.near = L.fogNear;
      fogRef.current.far = L.fogFar;
      fogRef.current.color.copy(L.fogColor);
    }
    if (lightRef.current) {
      lightRef.current.intensity = L.sun;
      lightRef.current.color.copy(L.sunColor);
    }
    if (ambientRef.current) ambientRef.current.intensity = L.ambient;
    if (hemiRef.current) {
      hemiRef.current.intensity = L.hemi;
      hemiRef.current.color.copy(L.hemiSky);
      hemiRef.current.groundColor.copy(L.hemiGround);
    }
    if (bounceRef.current) bounceRef.current.intensity = L.hemi * 0.22;
  });

  return (
    <>
      <SkyDome grade={grade} transitionMs={transitionMs} />
      <SkyImageBasedLighting grade={grade} />
      <fog ref={fogRef} attach="fog" args={[grade.fog.getHex(), grade.fogNear, grade.fogFar]} />

      {/* Sky fill. Carries every surface the key light misses. */}
      <hemisphereLight
        ref={hemiRef}
        args={[grade.hemiSky.getHex(), grade.hemiGround.getHex(), grade.hemiIntensity]}
      />
      {/* Floor only — enough to keep deep crevices from going to true black. */}
      <ambientLight ref={ambientRef} intensity={grade.ambient} />

      <object3D ref={targetRef} position={boardCenter.toArray()} />

      {/* Key */}
      <directionalLight
        ref={lightRef}
        castShadow={castSunShadow}
        intensity={grade.sunIntensity}
        color={grade.sunColor.getHex()}
        position={sunPosition}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={sunDistance * 2.4}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.00028}
        shadow-normalBias={0.04}
      />

      {/* Sea bounce — lifts shadowed faces without flattening the key. */}
      <directionalLight
        ref={bounceRef}
        intensity={grade.hemiIntensity * 0.22}
        color={grade.groundBounce.getHex()}
        position={bouncePosition}
      />
    </>
  );
}
