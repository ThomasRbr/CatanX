import * as THREE from 'three';

/**
 * Shared materials and textures of the sky layer.
 *
 * Lazily created once and reused by every island, beacon and airship: the
 * whole layer compiles a handful of programs instead of one per prop.
 */

let islandMaterial: THREE.MeshStandardMaterial | null = null;
let glowMaterial: THREE.MeshBasicMaterial | null = null;
let veilMaterial: THREE.MeshStandardMaterial | null = null;
let puffTexture: THREE.Texture | null = null;
let questionTexture: THREE.Texture | null = null;
let densePuffTexture: THREE.Texture | null = null;

/** Lit, vertex-coloured material for everything solid. */
export function skyIslandMaterial(): THREE.MeshStandardMaterial {
  islandMaterial ??= new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
    envMapIntensity: 0.6,
  });
  return islandMaterial;
}

/**
 * Unlit HDR accents. Vertex colours above 1 cross the bloom threshold, so a
 * crystal glows without a light of its own.
 */
export function skyGlowMaterial(): THREE.MeshBasicMaterial {
  glowMaterial ??= new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return glowMaterial;
}

/** Undiscovered islands: one cold, matte tone that reads as a silhouette. */
export function skyVeilMaterial(): THREE.MeshStandardMaterial {
  veilMaterial ??= new THREE.MeshStandardMaterial({
    color: '#6f7b9c',
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.4,
  });
  return veilMaterial;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  const context = element.getContext('2d');
  return context ? [element, context] : null;
}

function drawPuff(core: number, mid: number): THREE.Texture {
  const created = canvas(128);
  if (!created) return new THREE.Texture();
  const [element, context] = created;
  const blobs: Array<[number, number, number]> = [
    [64, 70, 46],
    [40, 74, 30],
    [88, 72, 32],
    [56, 52, 30],
    [78, 56, 26],
  ];
  for (const [x, y, r] of blobs) {
    const gradient = context.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(255,255,255,${core})`);
    gradient.addColorStop(0.55, `rgba(255,255,255,${mid})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Soft cumulus puff: several overlapping radial blobs. */
export function skyPuffTexture(): THREE.Texture {
  puffTexture ??= drawPuff(0.55, 0.32);
  return puffTexture;
}

/** Denser puff for storm cloud and mist that must hide what is behind. */
export function skyDensePuffTexture(): THREE.Texture {
  densePuffTexture ??= drawPuff(0.95, 0.7);
  return densePuffTexture;
}

/** "?" glyph floating over undiscovered islands. */
export function skyQuestionTexture(): THREE.Texture {
  if (questionTexture) return questionTexture;
  const created = canvas(128);
  if (!created) {
    questionTexture = new THREE.Texture();
    return questionTexture;
  }
  const [element, context] = created;
  const halo = context.createRadialGradient(64, 64, 10, 64, 64, 62);
  halo.addColorStop(0, 'rgba(40,56,96,0.55)');
  halo.addColorStop(0.6, 'rgba(40,56,96,0.35)');
  halo.addColorStop(1, 'rgba(40,56,96,0)');
  context.fillStyle = halo;
  context.fillRect(0, 0, 128, 128);
  context.beginPath();
  context.arc(64, 64, 38, 0, Math.PI * 2);
  context.lineWidth = 5;
  context.strokeStyle = 'rgba(235,243,255,0.9)';
  context.stroke();
  context.fillStyle = '#f4f8ff';
  context.font = 'bold 60px Georgia, "Times New Roman", serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('?', 64, 68);
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  questionTexture = texture;
  return texture;
}
