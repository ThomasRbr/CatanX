import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type TreeSpecies = 'spruce' | 'pine' | 'deciduous' | 'beech';

/**
 * Three alpha-tested planes form a cheap volumetric conifer. From the board's
 * elevated camera at least two silhouettes are always visible, avoiding the
 * cardboard cut-out look of a single billboard while retaining photo detail.
 */
export function createCrossedConiferImpostorGeometry(
  species: TreeSpecies = 'spruce',
): THREE.BufferGeometry {
  const dimensions: Record<TreeSpecies, readonly [number, number]> = {
    spruce: [0.66, 1.06],
    pine: [0.78, 1.02],
    deciduous: [0.94, 0.98],
    beech: [0.76, 1.08],
  };
  const [width, height] = dimensions[species];
  // Extra crossed cards = readable volume from diorama cameras without GLB toys.
  const planeCount = species === 'spruce' || species === 'pine' ? 5 : 4;
  const parts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < planeCount; index++) {
    const plane = new THREE.PlaneGeometry(width, height, 1, 1);
    // Unequal cards so top-down isn't a regular star / broccoli stamp.
    const scaleX = 0.88 + ((index * 19) % 9) * 0.028;
    const scaleY = 0.9 + ((index * 13) % 7) * 0.025;
    const yJitter = ((index % 3) - 1) * height * 0.028;
    const yawBias = index * 0.11 + (index % 2) * 0.19;
    plane.scale(scaleX, scaleY, 1);
    plane.translate(((index % 3) - 1) * width * 0.04, height * 0.5 + yJitter, 0);
    plane.rotateY(index * Math.PI / planeCount + yawBias);
    parts.push(plane);
  }
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('Unable to merge crossed conifer impostor');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function colorize(geometry: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  // BufferGeometryUtils refuses to merge indexed and non-indexed primitives.
  // Normalise every authored part here so future species can freely combine
  // cones, cylinders, spheres and icosahedrons.
  const result = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  geometry.dispose();
  const count = result.getAttribute('position').count;
  const tint = new THREE.Color(color);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const variation = 0.91 + ((index * 17) % 11) * 0.012;
    colors[index * 3] = tint.r * variation;
    colors[index * 3 + 1] = tint.g * variation;
    colors[index * 3 + 2] = tint.b * variation;
  }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return result;
}

function transformed(
  geometry: THREE.BufferGeometry,
  color: string,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.BufferGeometry {
  const result = colorize(geometry, color);
  result.scale(...scale);
  result.rotateX(rotation[0]);
  result.rotateY(rotation[1]);
  result.rotateZ(rotation[2]);
  result.translate(...position);
  return result;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('Unable to merge photoreal tree geometry');
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function branch(
  length: number,
  radius: number,
  color: string,
  y: number,
  azimuth: number,
  rise: number,
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius * 0.65, radius, length, 7, 1, false);
  // Cylinders are authored along Y. Rotate them toward the horizon, then spin
  // around the trunk so each crown has a readable branching structure.
  geometry.rotateZ(Math.PI * 0.5 - rise);
  geometry.rotateY(azimuth);
  const outward = length * 0.42;
  return transformed(
    geometry,
    color,
    [Math.cos(azimuth) * outward, y + Math.sin(rise) * outward, Math.sin(azimuth) * outward],
  );
}

export function createTreeTrunkGeometry(species: TreeSpecies): THREE.BufferGeometry {
  const broadleaf = species === 'deciduous' || species === 'beech';
  const bark = species === 'pine'
    ? '#654736'
    : species === 'spruce'
      ? '#514037'
      : species === 'beech'
        ? '#716b61'
        : '#665044';
  const height = broadleaf ? 0.56 : 0.7;
  const parts: THREE.BufferGeometry[] = [
    transformed(
      new THREE.CylinderGeometry(0.035, 0.058, height, 10, 3, false),
      bark,
      [0, height * 0.5, 0],
    ),
  ];

  const branchCount = broadleaf ? 9 : 6;
  for (let index = 0; index < branchCount; index++) {
    const azimuth = index * 2.399963 + (species === 'pine' ? 0.3 : 0);
    const y = broadleaf ? 0.3 + (index % 4) * 0.065 : 0.24 + index * 0.055;
    const length = broadleaf ? 0.23 + (index % 3) * 0.035 : 0.14 + (index % 2) * 0.03;
    parts.push(branch(length, 0.012, bark, y, azimuth, broadleaf ? 0.34 : 0.18));
  }
  return merge(parts);
}

function coniferCrown(species: 'spruce' | 'pine'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (species === 'spruce') {
    const colors = ['#263e2f', '#2d4935', '#35543c', '#3d5c42', '#456548'];
    // Branch sprays instead of stacked cones: the gaps between clusters catch
    // light and preserve a natural, asymmetric silhouette from every angle.
    for (let tier = 0; tier < 7; tier++) {
      const y = 0.28 + tier * 0.068;
      const radius = 0.255 * (1 - tier * 0.112);
      const sprays = tier < 2 ? 5 : tier < 5 ? 4 : 3;
      for (let spray = 0; spray < sprays; spray++) {
        const azimuth = spray / sprays * Math.PI * 2 + tier * 0.73;
        const reach = radius * (0.34 + ((spray + tier) % 3) * 0.075);
        parts.push(transformed(
          new THREE.IcosahedronGeometry(1, 1),
          colors[(tier + spray) % colors.length]!,
          [Math.cos(azimuth) * reach, y + ((spray % 2) - 0.5) * 0.012, Math.sin(azimuth) * reach],
          [radius * 0.66, 0.045 + radius * 0.2, radius * 0.34],
          [0, -azimuth, spray % 2 === 0 ? -0.08 : 0.05],
        ));
      }
    }
    parts.push(transformed(
      new THREE.ConeGeometry(0.055, 0.19, 11, 2, false),
      '#496a4a',
      [0.006, 0.73, -0.004],
      [0.9, 1, 0.86],
    ));
  } else {
    const clusters = [
      [-0.15, 0.47, 0.02, 0.17, '#354b31'],
      [0.14, 0.5, 0.07, 0.165, '#3b5335'],
      [-0.04, 0.55, -0.14, 0.16, '#415a39'],
      [0.08, 0.61, -0.04, 0.17, '#455e3b'],
      [-0.07, 0.64, 0.1, 0.145, '#4a6240'],
      [0.02, 0.7, 0.02, 0.12, '#516a46'],
    ] as const;
    for (const [x, y, z, radius, color] of clusters) {
      parts.push(transformed(
        new THREE.IcosahedronGeometry(radius, 2),
        color,
        [x, y, z],
        [1.28, 0.54, 1.08],
        [0, (x - z) * 4, 0],
      ));
    }
  }
  return merge(parts);
}

function deciduousCrown(species: 'deciduous' | 'beech'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const clusters = species === 'beech'
    ? [
        [-0.11, 0.5, 0.01, 0.16, '#405537'],
        [0.12, 0.52, 0.04, 0.17, '#4a6040'],
        [-0.03, 0.6, -0.12, 0.18, '#354c32'],
        [0.02, 0.67, 0.08, 0.19, '#587047'],
        [0.01, 0.77, -0.01, 0.14, '#627b4e'],
      ] as const
    : [
        [-0.13, 0.48, 0.01, 0.17, '#50613c'],
        [0.13, 0.49, 0.045, 0.18, '#5a6b42'],
        [-0.02, 0.55, -0.13, 0.19, '#465837'],
        [0.01, 0.62, 0.08, 0.2, '#667548'],
        [0.02, 0.72, -0.01, 0.15, '#718052'],
      ] as const;
  for (const [x, y, z, radius, color] of clusters) {
    parts.push(transformed(
      new THREE.IcosahedronGeometry(radius, 2),
      color,
      [x, y, z],
      [1.08, 0.85, 1],
      [0, (x + z) * 3.2, 0],
    ));
  }
  return merge(parts);
}

export function createTreeCrownGeometry(species: TreeSpecies): THREE.BufferGeometry {
  return species === 'deciduous' || species === 'beech'
    ? deciduousCrown(species)
    : coniferCrown(species);
}

export function createTreeSnowGeometry(species: TreeSpecies): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (species === 'spruce') {
    for (let tier = 0; tier < 6; tier++) {
      const y = 0.33 + tier * 0.07;
      const crownRadius = 0.235 * (1 - tier * 0.12);
      const patches = tier < 3 ? 3 : 2;
      for (let patch = 0; patch < patches; patch++) {
        const azimuth = patch / patches * Math.PI * 2 + tier * 0.87;
        const reach = crownRadius * 0.48;
        parts.push(transformed(
          new THREE.IcosahedronGeometry(1, 1),
          (tier + patch) % 2 === 0 ? '#e5e9e8' : '#f0f2ef',
          [Math.cos(azimuth) * reach, y + 0.045, Math.sin(azimuth) * reach],
          [crownRadius * 0.4, 0.018 + crownRadius * 0.08, crownRadius * 0.22],
          [0, -azimuth, 0],
        ));
      }
    }
  } else {
    const caps = species === 'pine'
      ? [[-0.12, 0.54, 0.02, 0.15], [0.11, 0.58, 0.05, 0.14], [0.04, 0.72, 0.05, 0.13]] as const
      : [[-0.13, 0.56, 0.01, 0.135], [0.13, 0.57, 0.045, 0.14], [0.01, 0.69, 0.08, 0.16], [0.02, 0.78, -0.01, 0.11]] as const;
    for (const [x, y, z, radius] of caps) {
      parts.push(transformed(
        new THREE.SphereGeometry(radius, 11, 6, 0, Math.PI * 2, 0, Math.PI * 0.42),
        '#edf1f0',
        [x, y, z],
        [1.05, 0.34, 0.92],
      ));
    }
  }
  return merge(parts);
}

/**
 * Low fern and sapling fronds for the naturalized forest floor. The former GLB
 * scrub kit was authored for the miniature renderer and appeared as pale rocks
 * beside photographic trees.
 */
export function createUnderstoryGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const colors = ['#2d4a31', '#365638', '#3f6040', '#486b47'];
  for (let frond = 0; frond < 8; frond++) {
    const azimuth = frond / 8 * Math.PI * 2 + (frond % 2) * 0.16;
    const length = 0.14 + (frond % 3) * 0.018;
    parts.push(branch(length, 0.0035, '#40543a', 0.018, azimuth, 0.42));
    for (let leaflet = 1; leaflet <= 4; leaflet++) {
      const t = leaflet / 5;
      const reach = length * t * 0.82;
      const y = 0.025 + reach * 0.42;
      const x = Math.cos(azimuth) * reach;
      const z = Math.sin(azimuth) * reach;
      const size = (0.033 - leaflet * 0.0035);
      for (const side of [-1, 1] as const) {
        parts.push(transformed(
          new THREE.PlaneGeometry(size, size * 2.3, 1, 1),
          colors[(frond + leaflet) % colors.length]!,
          [
            x + Math.cos(azimuth + Math.PI * 0.5) * size * 0.45 * side,
            y,
            z + Math.sin(azimuth + Math.PI * 0.5) * size * 0.45 * side,
          ],
          [1, 1, 1],
          [Math.PI * 0.48, -azimuth, side * 0.22],
        ));
      }
    }
  }
  return merge(parts);
}
