/** Deterministic pseudo-island SVG from a map seed (no save schema dependency). */
export function saveThumbnailSvg(mapSeed: number, size = 96): string {
  const seed = mapSeed >>> 0;
  const rnd = mulberry32(seed === 0 ? 1 : seed);

  const water = hsl(195 + rnd() * 25, 42 + rnd() * 18, 38 + rnd() * 10);
  const sand = hsl(38 + rnd() * 12, 48 + rnd() * 20, 62 + rnd() * 10);
  const land = hsl(95 + rnd() * 40, 35 + rnd() * 25, 38 + rnd() * 18);
  const forest = hsl(130 + rnd() * 30, 40 + rnd() * 20, 28 + rnd() * 12);
  const peak = hsl(25 + rnd() * 15, 20 + rnd() * 15, 48 + rnd() * 12);
  const accent = hsl(42 + rnd() * 20, 55 + rnd() * 25, 55 + rnd() * 15);

  const cx = size * (0.38 + rnd() * 0.24);
  const cy = size * (0.4 + rnd() * 0.22);
  const rx = size * (0.28 + rnd() * 0.14);
  const ry = size * (0.22 + rnd() * 0.12);

  const blobs: string[] = [];
  const blobCount = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < blobCount; i++) {
    const bx = cx + (rnd() - 0.5) * rx * 1.6;
    const by = cy + (rnd() - 0.5) * ry * 1.6;
    const br = size * (0.08 + rnd() * 0.12);
    const fill = i % 2 === 0 ? land : forest;
    blobs.push(
      `<ellipse cx="${fmt(bx)}" cy="${fmt(by)}" rx="${fmt(br)}" ry="${fmt(br * (0.7 + rnd() * 0.4))}" fill="${fill}" opacity="0.92"/>`,
    );
  }

  const hexes: string[] = [];
  const hexCount = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < hexCount; i++) {
    const angle = rnd() * Math.PI * 2;
    const dist = rnd() * Math.min(rx, ry) * 0.85;
    const hx = cx + Math.cos(angle) * dist;
    const hy = cy + Math.sin(angle) * dist;
    const hr = size * (0.055 + rnd() * 0.04);
    const fill = rnd() > 0.55 ? forest : land;
    hexes.push(hexagon(hx, hy, hr, fill, rnd() * 30));
  }

  const peaks: string[] = [];
  const peakCount = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < peakCount; i++) {
    const px = cx + (rnd() - 0.5) * rx * 1.1;
    const py = cy + (rnd() - 0.5) * ry * 0.9;
    const h = size * (0.06 + rnd() * 0.08);
    const w = h * (0.7 + rnd() * 0.4);
    peaks.push(
      `<polygon points="${fmt(px)},${fmt(py - h)} ${fmt(px - w)},${fmt(py + h * 0.35)} ${fmt(px + w)},${fmt(py + h * 0.35)}" fill="${peak}" opacity="0.88"/>`,
    );
  }

  const shoreRx = rx * (1.15 + rnd() * 0.12);
  const shoreRy = ry * (1.15 + rnd() * 0.12);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">`,
    `<rect width="${size}" height="${size}" fill="${water}"/>`,
    `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(shoreRx)}" ry="${fmt(shoreRy)}" fill="${sand}" opacity="0.85"/>`,
    `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${land}"/>`,
    ...blobs,
    ...hexes,
    ...peaks,
    `<circle cx="${fmt(cx + rx * 0.55)}" cy="${fmt(cy - ry * 0.35)}" r="${fmt(size * 0.035)}" fill="${accent}" opacity="0.75"/>`,
    `</svg>`,
  ].join('');
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function hexagon(cx: number, cy: number, r: number, fill: string, rotDeg: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = ((rotDeg + i * 60) * Math.PI) / 180;
    points.push(`${fmt(cx + Math.cos(a) * r)},${fmt(cy + Math.sin(a) * r)}`);
  }
  return `<polygon points="${points.join(' ')}" fill="${fill}" opacity="0.9"/>`;
}
