import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraViewport } from '../../components/Map/cameraTypes';
import {
  boundsCenter,
  clampTargetToBounds,
  fitOrthographicZoom,
  type WorldBounds,
} from './fitOrthographicCamera';
import { DEFAULT_HUD_INSETS } from './hudInsets';
import { worldToPixelSpace, type WorldCoord } from '../utils/hexToWorld';
import { zoomToLod, type MapLodLevel } from '../utils/mapLod';

/** ~40° look-down from NW — readable orthographic diorama angle. */
const CAMERA_OFFSET = new THREE.Vector3(1, 1.52, 1).normalize().multiplyScalar(24);
const MIN_ZOOM = 22;
const MAX_ZOOM = 130;
const FOCUS_LERP = 8;

interface CameraControlsProps {
  bounds: WorldBounds;
  layoutSize: number;
  sensitivity?: number;
  focusWorld: WorldCoord | null;
  focusNonce: number;
  onViewportChange?: (viewport: CameraViewport) => void;
  /** True while middle/right-button panning — consumers can ignore clicks. */
  onPanningChange?: (panning: boolean) => void;
  /** Called when orthographic zoom crosses LOD thresholds. */
  onLodChange?: (lod: MapLodLevel) => void;
  effectsEnabled?: boolean;
  fitHudInsets?: { top?: number; right?: number; bottom?: number; left?: number };
  fitMargin?: number;
}

export function CameraControls({
  bounds,
  layoutSize,
  sensitivity = 1,
  focusWorld,
  focusNonce,
  onViewportChange,
  onPanningChange,
  onLodChange,
  effectsEnabled = true,
  fitHudInsets = DEFAULT_HUD_INSETS,
  fitMargin = 1.05,
}: CameraControlsProps) {
  const { camera, gl, size } = useThree();
  const target = useRef(new THREE.Vector3(0, 0, 0));
  const focusGoal = useRef<THREE.Vector3 | null>(null);
  const panning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const fittedKey = useRef('');
  const lastViewport = useRef<CameraViewport | null>(null);
  const lastLod = useRef<MapLodLevel | null>(null);
  const onViewportChangeRef = useRef(onViewportChange);
  const onPanningChangeRef = useRef(onPanningChange);
  const onLodChangeRef = useRef(onLodChange);
  const boundsRef = useRef(bounds);
  const sensitivityRef = useRef(sensitivity);
  const layoutSizeRef = useRef(layoutSize);
  const scratchRight = useRef(new THREE.Vector3());
  const scratchForward = useRef(new THREE.Vector3());
  const impact = useRef({ startedAt: 0, intensity: 0, seed: 0 });

  const center = useMemo(() => boundsCenter(bounds), [bounds]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    onPanningChangeRef.current = onPanningChange;
  }, [onPanningChange]);

  useEffect(() => {
    onLodChangeRef.current = onLodChange;
  }, [onLodChange]);

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  useEffect(() => {
    layoutSizeRef.current = layoutSize;
  }, [layoutSize]);

  // Initial / map-size framing
  useEffect(() => {
    if (size.width < 2 || size.height < 2) return;
    const key = `${bounds.minX}:${bounds.maxX}:${bounds.minZ}:${bounds.maxZ}:${size.width}x${size.height}`;
    if (fittedKey.current === key) return;
    fittedKey.current = key;

    const ortho = camera as THREE.OrthographicCamera;
    target.current.set(center.x, 0, center.z);
    focusGoal.current = null;
    ortho.zoom = THREE.MathUtils.clamp(
      fitOrthographicZoom(ortho, bounds, size.width, size.height, {
        margin: fitMargin,
        hudInsets: fitHudInsets,
      }),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    ortho.near = 0.1;
    ortho.far = 280;
    ortho.updateProjectionMatrix();
    const lod = zoomToLod(ortho.zoom, lastLod.current ?? 1);
    lastLod.current = lod;
    onLodChangeRef.current?.(lod);
  }, [bounds, camera, center.x, center.z, fitHudInsets, fitMargin, size.height, size.width]);

  // Focus from minimap / action log
  useEffect(() => {
    if (!focusWorld || focusNonce <= 0) return;
    const goal = new THREE.Vector3(focusWorld.x, 0, focusWorld.z);
    clampTargetToBounds(goal, boundsRef.current);
    focusGoal.current = goal;
  }, [focusNonce, focusWorld]);

  useEffect(() => {
    const el = gl.domElement;

    const setPanning = (next: boolean) => {
      if (panning.current === next) return;
      panning.current = next;
      onPanningChangeRef.current?.(next);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 1 || event.button === 2) {
        setPanning(true);
        lastPointer.current = { x: event.clientX, y: event.clientY };
        el.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!panning.current) return;
      const ortho = camera as THREE.OrthographicCamera;
      const dx = event.clientX - lastPointer.current.x;
      const dy = event.clientY - lastPointer.current.y;
      lastPointer.current = { x: event.clientX, y: event.clientY };

      const worldPerPixel = 1 / Math.max(1e-6, ortho.zoom);
      const panScale = worldPerPixel * sensitivityRef.current * 1.15;

      const right = scratchRight.current;
      const forward = scratchForward.current;
      right.setFromMatrixColumn(ortho.matrixWorld, 0).setY(0).normalize();
      forward.set(0, 0, -1).applyQuaternion(ortho.quaternion).setY(0);
      if (forward.lengthSq() < 1e-6) {
        forward.set(-right.z, 0, right.x);
      } else {
        forward.normalize();
      }

      focusGoal.current = null;
      target.current.addScaledVector(right, -dx * panScale);
      target.current.addScaledVector(forward, dy * panScale);
      clampTargetToBounds(target.current, boundsRef.current);
    };

    const endPan = (event: PointerEvent) => {
      if (!panning.current) return;
      setPanning(false);
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const ortho = camera as THREE.OrthographicCamera;
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      const nextZoom = THREE.MathUtils.clamp(ortho.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      if (nextZoom === ortho.zoom) return;

      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        ortho.zoom = nextZoom;
        ortho.updateProjectionMatrix();
        return;
      }

      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

      const before = unprojectGround(ortho, ndcX, ndcY);
      ortho.zoom = nextZoom;
      ortho.updateProjectionMatrix();
      const after = unprojectGround(ortho, ndcX, ndcY);
      if (before && after) {
        focusGoal.current = null;
        target.current.x += before.x - after.x;
        target.current.z += before.z - after.z;
        clampTargetToBounds(target.current, boundsRef.current);
      }
    };

    const onContextMenu = (event: Event) => event.preventDefault();

    const onLostCapture = () => setPanning(false);

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endPan);
    el.addEventListener('pointercancel', endPan);
    el.addEventListener('lostpointercapture', onLostCapture);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);

    return () => {
      setPanning(false);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endPan);
      el.removeEventListener('pointercancel', endPan);
      el.removeEventListener('lostpointercapture', onLostCapture);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [camera, gl]);

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
    const ortho = camera as THREE.OrthographicCamera;

    if (focusGoal.current) {
      const t = 1 - Math.exp(-FOCUS_LERP * delta);
      target.current.lerp(focusGoal.current, t);
      if (target.current.distanceToSquared(focusGoal.current) < 1e-5) {
        target.current.copy(focusGoal.current);
        focusGoal.current = null;
      }
    }

    ortho.position.copy(target.current).add(CAMERA_OFFSET);
    const impactAge = (performance.now() - impact.current.startedAt) / 1000;
    if (effectsEnabled && impact.current.intensity > 0 && impactAge < 0.62) {
      const fade = Math.pow(1 - impactAge / 0.62, 2);
      const strength = impact.current.intensity * fade * 0.075;
      const wave = impactAge * 38 + impact.current.seed;
      ortho.position.x += Math.sin(wave) * strength;
      ortho.position.z += Math.cos(wave * 0.83) * strength;
      ortho.position.y += Math.sin(wave * 1.31) * strength * 0.28;
    }
    ortho.lookAt(target.current);
    ortho.updateMatrixWorld();

    const halfW = size.width / (2 * Math.max(1e-6, ortho.zoom));
    const halfH = size.height / (2 * Math.max(1e-6, ortho.zoom));
    // Ground coverage under fixed tilt
    const cover = 1.28;
    const worldMinX = target.current.x - halfW * cover;
    const worldMaxX = target.current.x + halfW * cover;
    const worldMinZ = target.current.z - halfH * cover;
    const worldMaxZ = target.current.z + halfH * cover;

    const minPx = worldToPixelSpace({ x: worldMinX, y: 0, z: worldMinZ }, layoutSizeRef.current);
    const maxPx = worldToPixelSpace({ x: worldMaxX, y: 0, z: worldMaxZ }, layoutSizeRef.current);

    const nextViewport: CameraViewport = {
      minX: Math.min(minPx.x, maxPx.x),
      maxX: Math.max(minPx.x, maxPx.x),
      minY: Math.min(minPx.y, maxPx.y),
      maxY: Math.max(minPx.y, maxPx.y),
      zoom: ortho.zoom / 55,
    };

    const lod = zoomToLod(ortho.zoom, lastLod.current ?? 1);
    if (lastLod.current !== lod) {
      lastLod.current = lod;
      onLodChangeRef.current?.(lod);
    }

    const prev = lastViewport.current;
    const changed =
      !prev ||
      Math.abs(prev.minX - nextViewport.minX) > 0.5 ||
      Math.abs(prev.maxX - nextViewport.maxX) > 0.5 ||
      Math.abs(prev.minY - nextViewport.minY) > 0.5 ||
      Math.abs(prev.maxY - nextViewport.maxY) > 0.5 ||
      Math.abs(prev.zoom - nextViewport.zoom) > 0.001;

    if (!changed) return;
    lastViewport.current = nextViewport;
    onViewportChangeRef.current?.(nextViewport);
  });

  return null;
}

function unprojectGround(
  camera: THREE.OrthographicCamera,
  ndcX: number,
  ndcY: number,
): THREE.Vector3 | null {
  const origin = new THREE.Vector3(ndcX, ndcY, -1).unproject(camera);
  const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(camera);
  const dir = far.sub(origin).normalize();
  if (Math.abs(dir.y) < 1e-6) return null;
  const t = -origin.y / dir.y;
  if (!Number.isFinite(t) || t < 0) return null;
  return origin.addScaledVector(dir, t);
}
