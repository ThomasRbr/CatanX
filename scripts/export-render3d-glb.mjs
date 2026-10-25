/**
 * Export CatanX original low-poly props to public/assets/models/*.glb
 * Source of truth mirrors apps/client/src/render3d/assets/meshCatalog.ts
 *
 * Usage: node scripts/export-render3d-glb.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Node lacks browser FileReader used by GLTFExporter binary path. */
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReaderPolyfill {
    result = null;
    onloadend = null;
    onerror = null;
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer())
        .then((buf) => {
          this.result = buf;
          this.onloadend?.({ target: this });
        })
        .catch((err) => {
          this.onerror?.(err);
        });
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../apps/client/public/assets/models');

function tintGeometry(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function place(geo, hex, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) {
  const g = tintGeometry(geo, hex);
  g.scale(sx, sy, sz);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

function mergeParts(parts) {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('mergeGeometries failed');
  merged.computeVertexNormals();
  return merged;
}

const builders = {
  tree: () =>
    mergeParts([
      place(new THREE.CylinderGeometry(0.035, 0.05, 0.2, 5), '#6b4a32', 0, 0.1, 0),
      place(new THREE.ConeGeometry(0.17, 0.28, 6), '#3f6b45', 0, 0.28, 0),
      place(new THREE.ConeGeometry(0.12, 0.2, 6), '#4a7a50', 0, 0.44, 0),
    ]),
  scrub: () =>
    mergeParts([
      place(new THREE.SphereGeometry(0.1, 5, 4), '#7a9458', -0.04, 0.08, 0.02, 1, 0.85, 1),
      place(new THREE.SphereGeometry(0.08, 5, 4), '#6a8450', 0.05, 0.07, -0.02, 1.1, 0.8, 0.9),
    ]),
  rock: () =>
    mergeParts([
      place(new THREE.IcosahedronGeometry(0.11, 0), '#8a8580', 0, 0.07, 0, 1.1, 0.75, 0.95),
      place(new THREE.TetrahedronGeometry(0.06, 0), '#7a7570', 0.06, 0.1, 0.03, 1, 0.9, 1),
    ]),
  peak: () =>
    mergeParts([
      place(new THREE.ConeGeometry(0.26, 0.42, 5), '#9a9ea4', 0, 0.22, 0),
      place(new THREE.ConeGeometry(0.12, 0.2, 4), '#b8bcc2', 0.02, 0.48, -0.02),
    ]),
  dune: () =>
    mergeParts([
      place(new THREE.SphereGeometry(0.16, 6, 4), '#e8d4a0', 0, 0.05, 0, 1.6, 0.55, 1.15),
      place(new THREE.SphereGeometry(0.1, 5, 3), '#dfc890', 0.08, 0.07, 0.04, 1.2, 0.45, 1),
    ]),
  settlement: () =>
    mergeParts([
      place(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 8), '#ffffff', 0, 0.015, 0),
      place(new THREE.BoxGeometry(0.18, 0.12, 0.16), '#f2f0ea', 0, 0.09, 0),
      place(new THREE.ConeGeometry(0.14, 0.12, 4), '#ffffff', 0, 0.18, 0, 1, 1, 1, Math.PI / 4),
    ]),
  city: () =>
    mergeParts([
      place(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 8), '#ffffff', 0, 0.015, 0),
      place(new THREE.BoxGeometry(0.16, 0.16, 0.14), '#f2f0ea', -0.06, 0.1, 0),
      place(new THREE.BoxGeometry(0.14, 0.2, 0.14), '#ebe6dc', 0.08, 0.12, 0.02),
      place(new THREE.ConeGeometry(0.12, 0.1, 4), '#ffffff', -0.06, 0.22, 0, 1, 1, 1, Math.PI / 4),
      place(new THREE.ConeGeometry(0.11, 0.12, 4), '#ffffff', 0.08, 0.26, 0.02, 1, 1, 1, Math.PI / 5),
    ]),
  robber: () =>
    mergeParts([
      place(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 10), '#0e0c12', 0, 0.012, 0),
      place(new THREE.CylinderGeometry(0.1, 0.14, 0.16, 6), '#2a2430', 0, 0.1, 0),
      place(new THREE.SphereGeometry(0.09, 8, 6), '#1a1520', 0, 0.22, 0),
      place(new THREE.ConeGeometry(0.08, 0.12, 5), '#3a3040', 0, 0.32, 0),
    ]),
};

function exportBinary(geometry, filePath) {
  return new Promise((resolve, reject) => {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.04,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, mat);
    const scene = new THREE.Scene();
    scene.add(mesh);
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error(`Expected binary GLB for ${filePath}`));
          return;
        }
        fs.writeFileSync(filePath, Buffer.from(result));
        mat.dispose();
        geometry.dispose();
        resolve(result.byteLength);
      },
      (err) => reject(err),
      { binary: true },
    );
  });
}

fs.mkdirSync(outDir, { recursive: true });

const summary = [];
for (const [id, build] of Object.entries(builders)) {
  const geo = build();
  const filePath = path.join(outDir, `${id}.glb`);
  const bytes = await exportBinary(geo, filePath);
  summary.push({ id, bytes, file: path.relative(process.cwd(), filePath) });
}

console.log(JSON.stringify({ ok: true, models: summary }, null, 2));
