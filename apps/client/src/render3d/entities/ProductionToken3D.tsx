import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { HexTile } from '@catanx/engine';
import { useMapLod } from '../camera/MapLodContext';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { cubeToWorld } from '../utils/hexToWorld';
import { shouldCastDecorShadows } from '../utils/perfBudgets';

interface ProductionToken3DProps {
  tiles: HexTile[];
  robberTileId?: string | null;
  /** Number faces (kept for API compatibility; they are a single draw call now). */
  showLabels?: boolean;
  activeRollTotal?: number | null;
  rollToken?: string | null;
}

/**
 * Production chits as physical objects.
 *
 * They used to be a fixed-height cylinder plus a camera-facing sprite drawn
 * with depth testing off. On a relief board that meant discs buried inside
 * mountains, numbers floating over them, and — once the post chain added
 * ambient occlusion — numbers stained by the AO of whatever terrain lay behind.
 *
 * Now each chit is a small turned disc resting on the sampled surface, and the
 * number is printed on its top face: depth-tested, lit by the sun, shadowed
 * and occluded like everything else. The face yaws to follow the camera so the
 * numerals always read upright, and the whole chit grows a little when zoomed
 * out so it never shrinks below a readable size on screen.
 *
 * Readability comes first on a strategy board, so two things bend realism:
 * the chit leans toward the camera (a flat disc at the 42° board pitch reads
 * as a squashed ellipse), and a ghost pass draws the parts hidden behind a
 * canopy or a summit, so a number is never lost behind decor.
 */

const TOKEN_RADIUS = 0.165;
const TOKEN_THICKNESS = 0.034;
const FACE_RADIUS = TOKEN_RADIUS - 0.007;
/** Minimum on-screen diameter, in CSS pixels, before chits start to grow. */
const MIN_SCREEN_DIAMETER = 50;
const MAX_ZOOM_GROWTH = 2.1;
/** Lean toward the camera, in radians. */
const TOKEN_TILT = 0.52;

const bodyGeo = new THREE.CylinderGeometry(TOKEN_RADIUS, TOKEN_RADIUS + 0.006, TOKEN_THICKNESS, 48);
// Bevelled foot so the chit reads as turned wood, not a coin.
const footGeo = new THREE.CylinderGeometry(TOKEN_RADIUS + 0.012, TOKEN_RADIUS + 0.016, 0.01, 48);

const bodyMat = new THREE.MeshStandardMaterial({
  color: '#e9dcbd',
  roughness: 0.58,
  metalness: 0,
});
const footMat = new THREE.MeshStandardMaterial({
  color: '#8a6740',
  roughness: 0.66,
  metalness: 0,
});

// --- Numeral atlas ---------------------------------------------------------

const ATLAS_GRID = 4;
const ATLAS_CELL = 256;
const VALUES = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] as const;

function pipsFor(value: number): number {
  return 6 - Math.abs(7 - value);
}

function cellIndex(value: number): number {
  return VALUES.indexOf(value as (typeof VALUES)[number]);
}

let atlasTexture: THREE.CanvasTexture | null = null;

function numeralAtlas(): THREE.CanvasTexture {
  if (atlasTexture) return atlasTexture;
  const size = ATLAS_GRID * ATLAS_CELL;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Parchment everywhere so mip levels never bleed transparent black in.
  ctx.fillStyle = '#efe4c6';
  ctx.fillRect(0, 0, size, size);

  for (const value of VALUES) {
    const index = cellIndex(value);
    const cx = (index % ATLAS_GRID) * ATLAS_CELL + ATLAS_CELL / 2;
    const cy = Math.floor(index / ATLAS_GRID) * ATLAS_CELL + ATLAS_CELL / 2;
    const r = ATLAS_CELL / 2;
    const hot = value === 6 || value === 8;
    const ink = hot ? '#a5281f' : '#2b2117';

    const paper = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.1, cx, cy, r);
    paper.addColorStop(0, '#fbf4e0');
    paper.addColorStop(0.75, '#efe3c3');
    paper.addColorStop(1, '#ddcca4');
    ctx.fillStyle = paper;
    ctx.fillRect(cx - r, cy - r, ATLAS_CELL, ATLAS_CELL);

    // Fine grain so the face does not look like flat plastic up close.
    let seed = value * 7919;
    for (let i = 0; i < 420; i++) {
      seed = (seed * 16807) % 2147483647;
      const a = (seed / 2147483647) * Math.PI * 2;
      seed = (seed * 16807) % 2147483647;
      const d = Math.sqrt(seed / 2147483647) * r * 0.96;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(120,90,50,0.10)' : 'rgba(255,255,255,0.10)';
      ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 2);
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = hot ? 'rgba(165,40,31,0.55)' : 'rgba(110,80,44,0.42)';
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const twoDigits = value >= 10;
    // Lining figures only: Georgia's old-style numerals sit at x-height and
    // shrank every number to a third of the face.
    ctx.font = `700 ${twoDigits ? 128 : 148}px "Book Antiqua", "Palatino Linotype", "Times New Roman", serif`;
    if (twoDigits) {
      ctx.save();
      ctx.translate(cx, cy + 40);
      ctx.scale(0.86, 1);
      ctx.fillText(String(value), 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(String(value), cx, cy + 44);
    }

    const pips = pipsFor(value);
    const spacing = 17;
    const startX = cx - ((pips - 1) * spacing) / 2;
    for (let i = 0; i < pips; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * spacing, cy + 80, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  atlasTexture = texture;
  return texture;
}

function remapAtlasUv(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
    .replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
#ifdef USE_MAP
  // Inset slightly so mip filtering never samples the neighbouring cell.
  vMapUv = aCell + (vMapUv - 0.5) * (${(1 / ATLAS_GRID).toFixed(4)} * 0.985) + ${(0.5 / ATLAS_GRID).toFixed(4)};
#endif`,
    );
}

let faceMaterial: THREE.MeshStandardMaterial | null = null;

function numeralFaceMaterial(): THREE.MeshStandardMaterial {
  if (faceMaterial) return faceMaterial;
  const material = new THREE.MeshStandardMaterial({
    map: numeralAtlas(),
    roughness: 0.62,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.onBeforeCompile = (shader) => {
    remapAtlasUv(shader);
    // Self-light keeps the numerals legible on the shaded side of a mountain
    // and under the evening grade without making the chit glow in full sun.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.28;',
    );
  };
  material.customProgramCacheKey = () => 'catanx-token-face-v2';
  faceMaterial = material;
  return material;
}

/**
 * X-ray pass: only fragments *behind* something already drawn survive
 * (`GreaterDepth`), so a chit hidden by a canopy or a summit shows through as
 * a soft ghost while its visible part stays the lit, physical object.
 */
let ghostFaceMaterial: THREE.MeshBasicMaterial | null = null;

/** Face only: the printed face already carries its own parchment disc. */
function ghostMaterial(): THREE.MeshBasicMaterial {
  if (!ghostFaceMaterial) {
    ghostFaceMaterial = new THREE.MeshBasicMaterial({
      map: numeralAtlas(),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: false,
    });
    ghostFaceMaterial.onBeforeCompile = remapAtlasUv;
    ghostFaceMaterial.customProgramCacheKey = () => 'catanx-token-ghost-v1';
  }
  return ghostFaceMaterial;
}

function noopRaycast() {
  /* tokens never steal tile picking */
}

interface TokenPlacement {
  tile: HexTile & { diceValue: number };
  x: number;
  y: number;
  z: number;
}

/** Rest on the highest point under the disc so it never sinks into a slope. */
function restingHeight(sample: (x: number, z: number) => number, x: number, z: number): number {
  let top = sample(x, z);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    top = Math.max(top, sample(x + Math.cos(a) * TOKEN_RADIUS * 0.9, z + Math.sin(a) * TOKEN_RADIUS * 0.9));
  }
  return top + 0.006;
}

const _forward = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _lean = new THREE.Quaternion();
const _faceQuat = new THREE.Quaternion();
const _flatFace = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _euler = new THREE.Euler();
const _offset = new THREE.Vector3();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();

function ProductionPulse({ placement }: { placement: TokenPlacement }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const born = useRef(performance.now());

  useFrame(() => {
    const elapsed = (performance.now() - born.current) / 1000;
    const t = Math.min(1, elapsed / 1.25);
    const eased = 1 - Math.pow(1 - t, 3);
    if (ringRef.current) ringRef.current.scale.setScalar(0.8 + eased * 1.2);
    if (matRef.current) matRef.current.opacity = (1 - t) * 0.7;
  });

  return (
    <mesh
      ref={ringRef}
      position={[placement.x, placement.y + TOKEN_THICKNESS + 0.02, placement.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={noopRaycast}
      renderOrder={8}
    >
      <ringGeometry args={[TOKEN_RADIUS + 0.01, TOKEN_RADIUS + 0.06, 40]} />
      <meshBasicMaterial
        ref={matRef}
        color="#ffcd4a"
        transparent
        opacity={0.7}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function ProductionToken3D({
  tiles,
  robberTileId = null,
  activeRollTotal = null,
  rollToken = null,
}: ProductionToken3DProps) {
  const lod = useMapLod();
  const castShadow = shouldCastDecorShadows(lod);
  const surface = useSurfaceHeight();

  const placements = useMemo<TokenPlacement[]>(() => {
    const out: TokenPlacement[] = [];
    for (const tile of tiles) {
      if (typeof tile.diceValue !== 'number' || tile.diceValue < 2 || tile.diceValue > 12) continue;
      if (tile.diceValue === 7 || tile.robber || tile.id === robberTileId) continue;
      const origin = cubeToWorld(tile.coord);
      out.push({
        tile: tile as HexTile & { diceValue: number },
        x: origin.x,
        z: origin.z,
        y: restingHeight((x, z) => surface.sampleHeight(x, z), origin.x, origin.z),
      });
    }
    return out;
  }, [robberTileId, surface, tiles]);

  const faceGeo = useMemo(() => {
    const geometry = new THREE.CircleGeometry(FACE_RADIUS, 48);
    const cells = new Float32Array(placements.length * 2);
    placements.forEach((placement, i) => {
      const index = Math.max(0, cellIndex(placement.tile.diceValue));
      cells[i * 2] = (index % ATLAS_GRID) / ATLAS_GRID;
      // CanvasTexture is flipped: canvas row 0 is the top of UV space.
      cells[i * 2 + 1] = 1 - (Math.floor(index / ATLAS_GRID) + 1) / ATLAS_GRID;
    });
    geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    return geometry;
  }, [placements]);
  useEffect(() => () => faceGeo.dispose(), [faceGeo]);

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const footRef = useRef<THREE.InstancedMesh>(null);
  const faceRef = useRef<THREE.InstancedMesh>(null);
  const ghostFaceRef = useRef<THREE.InstancedMesh>(null);
  const lastPose = useRef({ yaw: Number.NaN, scale: Number.NaN });

  const writeMatrices = (yaw: number, scale: number) => {
    const body = bodyRef.current;
    const foot = footRef.current;
    const face = faceRef.current;
    const ghostFace = ghostFaceRef.current;
    if (!body || !foot || !face || !ghostFace) return;
    // Lean the chit about its camera-facing axis; the raised rim keeps the
    // low edge from cutting into the slope.
    _lean.setFromEuler(_euler.set(TOKEN_TILT, yaw, 0, 'YXZ'));
    _faceQuat.copy(_lean).multiply(_flatFace);
    _scale.setScalar(scale);
    const rise = Math.sin(TOKEN_TILT) * (TOKEN_RADIUS + 0.016) * scale;
    const place = (
      mesh: THREE.InstancedMesh,
      index: number,
      p: TokenPlacement,
      height: number,
      rotation: THREE.Quaternion,
    ) => {
      _offset.set(0, height * scale, 0).applyQuaternion(_lean);
      _position.set(p.x, p.y + rise, p.z).add(_offset);
      _matrix.compose(_position, rotation, _scale);
      mesh.setMatrixAt(index, _matrix);
    };
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      place(foot, i, p, 0.005, _lean);
      place(body, i, p, 0.008 + TOKEN_THICKNESS / 2, _lean);
      place(face, i, p, 0.008 + TOKEN_THICKNESS + 0.0008, _faceQuat);
      place(ghostFace, i, p, 0.008 + TOKEN_THICKNESS + 0.0008, _faceQuat);
    }
    for (const mesh of [body, foot, face, ghostFace]) {
      mesh.count = placements.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  };

  useLayoutEffect(() => {
    lastPose.current = { yaw: Number.NaN, scale: Number.NaN };
  }, [placements]);

  useFrame(({ camera, size }) => {
    if (placements.length === 0) return;
    camera.getWorldDirection(_forward);
    const flat = Math.hypot(_forward.x, _forward.z);
    // Straight top-down: keep the last yaw instead of spinning on noise.
    const yaw = flat > 1e-3 ? Math.atan2(-_forward.x, -_forward.z) : lastPose.current.yaw || 0;

    let scale = 1;
    if (camera instanceof THREE.PerspectiveCamera) {
      const distance = camera.position.length();
      const pixelsPerUnit = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance);
      const onScreen = TOKEN_RADIUS * 2 * pixelsPerUnit;
      scale = THREE.MathUtils.clamp(MIN_SCREEN_DIAMETER / Math.max(onScreen, 1e-3), 1, MAX_ZOOM_GROWTH);
    }

    const last = lastPose.current;
    if (Math.abs(yaw - last.yaw) < 0.004 && Math.abs(scale - last.scale) < 0.01) return;
    lastPose.current = { yaw, scale };
    writeMatrices(yaw, scale);
  });

  const material = numeralFaceMaterial();
  const ghost = ghostMaterial();

  if (placements.length === 0) return null;

  return (
    <group>
      <instancedMesh
        key={`foot:${placements.length}`}
        ref={footRef}
        args={[footGeo, footMat, placements.length]}
        castShadow={castShadow}
        receiveShadow
        raycast={noopRaycast}
      />
      <instancedMesh
        key={`body:${placements.length}`}
        ref={bodyRef}
        args={[bodyGeo, bodyMat, placements.length]}
        castShadow={castShadow}
        receiveShadow
        raycast={noopRaycast}
      />
      <instancedMesh
        key={`face:${placements.length}`}
        ref={faceRef}
        args={[faceGeo, material, placements.length]}
        receiveShadow
        raycast={noopRaycast}
      />
      {/* Drawn after the opaque scene so the depth test sees the occluders. */}
      <instancedMesh
        key={`ghost-face:${placements.length}`}
        ref={ghostFaceRef}
        args={[faceGeo, ghost, placements.length]}
        raycast={noopRaycast}
        renderOrder={21}
      />
      {rollToken &&
        activeRollTotal != null &&
        placements
          .filter((p) => p.tile.diceValue === activeRollTotal)
          .map((p) => <ProductionPulse key={`${rollToken}:${p.tile.id}`} placement={p} />)}
    </group>
  );
}
