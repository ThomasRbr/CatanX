import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraViewport } from '../../components/Map/cameraTypes';
import type { WorldCoord } from '../utils/hexToWorld';
import { worldToPixelSpace } from '../utils/hexToWorld';
import { boundsCenter, clampTargetToBounds, type WorldBounds } from './fitOrthographicCamera';
import type { MapLodLevel } from '../utils/mapLod';
import { zoomToLod } from '../utils/mapLod';

const VIEW_DIRECTION = new THREE.Vector3(1, 1.28, 1).normalize();
const MIN_DISTANCE = 3.15;
const FOCUS_LERP = 7;

/** Tallest thing standing on a tile — peaks, spires, canopy. */
const ISLAND_HEIGHT = 2.1;
/** Hex circumradius: island bounds are computed from tile centres. */
const TILE_OVERHANG = 1;
/** Breathing room so the coastline never touches the frame edge. */
const FIT_MARGIN = 1.16;

/**
 * Smallest camera distance along `VIEW_DIRECTION` that keeps the whole island
 * inside the frustum.
 *
 * Fitting on the flat XZ span alone is what made the default view overflow: at
 * a 42° pitch the board is foreshortened along one axis and stretched along the
 * other, and terrain height pushes the silhouette further still. Solving the
 * projection constraint for all eight corners of the island volume handles both
 * without a hand-tuned fudge factor.
 */
export function fitDistanceForBounds(
  bounds: WorldBounds,
  fovDegrees: number,
  aspect: number,
  margin = FIT_MARGIN,
): number {
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2);
  const tanH = tanV * Math.max(0.2, aspect);

  const halfX = (bounds.maxX - bounds.minX) / 2 + TILE_OVERHANG;
  const halfZ = (bounds.maxZ - bounds.minZ) / 2 + TILE_OVERHANG;

  const forward = VIEW_DIRECTION;
  const up = new THREE.Vector3(0, 1, 0)
    .projectOnPlane(forward)
    .normalize();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();

  const offset = new THREE.Vector3();
  let required = MIN_DISTANCE;

  for (const sx of [-1, 1]) {
    for (const sy of [0, 1]) {
      for (const sz of [-1, 1]) {
        offset.set(halfX * sx, ISLAND_HEIGHT * sy, halfZ * sz);
        // Depth of this corner is `distance - offset·forward`; the corner fits
        // when its lateral offset stays inside the frustum at that depth.
        const along = offset.dot(forward);
        const vertical = Math.abs(offset.dot(up));
        const horizontal = Math.abs(offset.dot(right));
        required = Math.max(
          required,
          along + (vertical * margin) / tanV,
          along + (horizontal * margin) / tanH,
        );
      }
    }
  }

  return required;
}

interface DioramaCameraControlsProps {
  bounds: WorldBounds;
  layoutSize: number;
  sensitivity?: number;
  focusWorld: WorldCoord | null;
  focusNonce: number;
  onViewportChange?: (viewport: CameraViewport) => void;
  onPanningChange?: (panning: boolean) => void;
  onLodChange?: (lod: MapLodLevel) => void;
  effectsEnabled?: boolean;
  initialDistanceScale?: number;
}

/** Long-lens perspective navigation used only by the Diorama renderer. */
export function DioramaCameraControls({
  bounds,
  layoutSize,
  sensitivity = 1,
  focusWorld,
  focusNonce,
  onViewportChange,
  onPanningChange,
  onLodChange,
  effectsEnabled = true,
  // The fit guarantees the island is fully inside the frame; pulling in a
  // little trades that guarantee for a framing that reads as a diorama rather
  // than a map, while the HUD panels still clear the coastline.
  initialDistanceScale = 0.78,
}: DioramaCameraControlsProps) {
  const { camera, gl, size } = useThree();
  const target = useRef(new THREE.Vector3());
  const focusGoal = useRef<THREE.Vector3 | null>(null);
  const distance = useRef(15);
  const panning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const fitKey = useRef('');
  const lastLod = useRef<MapLodLevel>(1);
  const lastViewport = useRef<CameraViewport | null>(null);
  const impact = useRef({ startedAt: 0, intensity: 0, seed: 0 });
  const center = useMemo(() => boundsCenter(bounds), [bounds]);

  /**
   * Zooming out past the fitted distance only adds empty ocean, and used to let
   * the camera travel far enough to see the water plane's edge.
   */
  const maxDistance = useMemo(() => {
    const aspect = Math.max(0.2, size.width / Math.max(1, size.height));
    return fitDistanceForBounds(bounds, 34, aspect) * 1.9;
  }, [bounds, size.height, size.width]);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || size.width < 2 || size.height < 2) return;
    const key = `${bounds.minX}:${bounds.maxX}:${bounds.minZ}:${bounds.maxZ}:${size.width}x${size.height}`;
    if (fitKey.current === key) return;
    fitKey.current = key;
    const aspect = Math.max(0.2, size.width / size.height);
    distance.current = THREE.MathUtils.clamp(
      fitDistanceForBounds(bounds, camera.fov, aspect) * initialDistanceScale,
      MIN_DISTANCE,
      maxDistance,
    );
    target.current.set(center.x, 0, center.z);
    camera.near = 0.08;
    camera.far = 320;
    camera.updateProjectionMatrix();
  }, [bounds, camera, center.x, center.z, initialDistanceScale, maxDistance, size.height, size.width]);

  useEffect(() => {
    if (!focusWorld || focusNonce <= 0) return;
    const goal = new THREE.Vector3(focusWorld.x, 0, focusWorld.z);
    clampTargetToBounds(goal, bounds);
    focusGoal.current = goal;
  }, [bounds, focusNonce, focusWorld]);

  useEffect(() => {
    const element = gl.domElement;
    const setPanning = (value: boolean) => {
      if (panning.current === value) return;
      panning.current = value;
      onPanningChange?.(value);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 1 && event.button !== 2) return;
      setPanning(true);
      lastPointer.current = { x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      if (!panning.current || !(camera instanceof THREE.PerspectiveCamera)) return;
      const dx = event.clientX - lastPointer.current.x;
      const dy = event.clientY - lastPointer.current.y;
      lastPointer.current = { x: event.clientX, y: event.clientY };
      const worldPerPixel =
        (2 * distance.current * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) /
        Math.max(1, size.height);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
      focusGoal.current = null;
      target.current.addScaledVector(right, -dx * worldPerPixel * sensitivity);
      target.current.addScaledVector(forward, dy * worldPerPixel * sensitivity);
      clampTargetToBounds(target.current, bounds);
    };
    const up = (event: PointerEvent) => {
      if (!panning.current) return;
      setPanning(false);
      try { element.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(event.deltaY * 0.0011 * sensitivity);
      distance.current = THREE.MathUtils.clamp(distance.current * factor, MIN_DISTANCE, maxDistance);
    };
    const contextMenu = (event: Event) => event.preventDefault();
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('contextmenu', contextMenu);
    return () => {
      setPanning(false);
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('contextmenu', contextMenu);
    };
  }, [bounds, camera, gl, maxDistance, onPanningChange, sensitivity, size.height]);

  useEffect(() => {
    if (!effectsEnabled) {
      impact.current.intensity = 0;
      return;
    }
    const onImpact = (event: Event) => {
      const detail = (event as CustomEvent<{ intensity?: number }>).detail;
      impact.current = {
        startedAt: performance.now(),
        intensity: THREE.MathUtils.clamp(detail?.intensity ?? 0.4, 0, 1),
        seed: Math.random() * Math.PI * 2,
      };
    };
    window.addEventListener('catanx:board-impact', onImpact);
    return () => window.removeEventListener('catanx:board-impact', onImpact);
  }, [effectsEnabled]);

  useFrame((_, delta) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (focusGoal.current) {
      target.current.lerp(focusGoal.current, 1 - Math.exp(-FOCUS_LERP * delta));
      if (target.current.distanceToSquared(focusGoal.current) < 1e-5) focusGoal.current = null;
    }
    camera.position.copy(target.current).addScaledVector(VIEW_DIRECTION, distance.current);
    const age = (performance.now() - impact.current.startedAt) / 1000;
    if (effectsEnabled && impact.current.intensity > 0 && age < 0.62) {
      const strength = impact.current.intensity * Math.pow(1 - age / 0.62, 2) * 0.06;
      camera.position.x += Math.sin(age * 38 + impact.current.seed) * strength;
      camera.position.z += Math.cos(age * 31 + impact.current.seed) * strength;
    }
    camera.lookAt(target.current);
    camera.updateMatrixWorld();

    const syntheticZoom = 920 / distance.current;
    const lod = zoomToLod(syntheticZoom, lastLod.current);
    if (lod !== lastLod.current) {
      lastLod.current = lod;
      onLodChange?.(lod);
    }

    if (!onViewportChange) return;
    const halfHeight = distance.current * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const halfWidth = halfHeight * camera.aspect;
    const min = worldToPixelSpace(
      { x: target.current.x - halfWidth, y: 0, z: target.current.z - halfHeight },
      layoutSize,
    );
    const max = worldToPixelSpace(
      { x: target.current.x + halfWidth, y: 0, z: target.current.z + halfHeight },
      layoutSize,
    );
    const next: CameraViewport = {
      minX: Math.min(min.x, max.x), maxX: Math.max(min.x, max.x),
      minY: Math.min(min.y, max.y), maxY: Math.max(min.y, max.y),
      zoom: syntheticZoom / 55,
    };
    const previous = lastViewport.current;
    if (!previous || Math.abs(previous.minX - next.minX) > 0.5 ||
      Math.abs(previous.maxX - next.maxX) > 0.5 || Math.abs(previous.zoom - next.zoom) > 0.001) {
      lastViewport.current = next;
      onViewportChange(next);
    }
  });

  return null;
}
