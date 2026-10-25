import { describe, expect, it } from 'vitest';
import { clearColoredHexSlabCache, buildDetailedHexSlab, getColoredHexSlab } from '../coloredHexSlab';

describe('detailed hex slab surfaces', () => {
  it('builds a subdivided top with many more vertices than a flat hex', () => {
    clearColoredHexSlabCache();
    const geo = buildDetailedHexSlab('forest');
    const pos = geo.getAttribute('position');
    const color = geo.getAttribute('color');
    expect(pos).toBeTruthy();
    expect(color).toBeTruthy();
    // Flat extrude hex is ~dozens of verts; detailed should be hundreds.
    expect(pos!.count).toBeGreaterThan(200);
    expect(color!.count).toBe(pos!.count);
    geo.dispose();
  });

  it('orients top face normals upward', () => {
    clearColoredHexSlabCache();
    const geo = buildDetailedHexSlab('forest');
    const pos = geo.getAttribute('position')!;
    // First top triangle (3 verts) — Y of face normal via cross product
    const ax = pos.getX(0);
    const az = pos.getZ(0);
    const bx = pos.getX(1);
    const bz = pos.getZ(1);
    const cx = pos.getX(2);
    const cz = pos.getZ(2);
    const abx = bx - ax;
    const abz = bz - az;
    const acx = cx - ax;
    const acz = cz - az;
    const ny = abz * acx - abx * acz;
    expect(ny).toBeGreaterThan(0);
    geo.dispose();
  });

  it('caches per terrain and keeps mountain relief strong', () => {
    clearColoredHexSlabCache();
    const a = getColoredHexSlab('#7a7872', '#686660', 1, 0.14, 'mountain');
    const b = getColoredHexSlab('#7a7872', '#686660', 1, 0.14, 'mountain');
    expect(a).toBe(b);

    const pos = a.getAttribute('position')!;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    expect(maxY).toBeGreaterThan(0.14);
    expect(maxY - 0.14).toBeGreaterThan(0.02);
    expect(minY).toBeLessThanOrEqual(0.001);

    const soft = buildDetailedHexSlab('pasture');
    const softPos = soft.getAttribute('position')!;
    expect(softPos.count).toBeLessThan(pos.count);
    soft.dispose();
  });
});
