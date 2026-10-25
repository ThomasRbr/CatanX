import { describe, expect, it } from 'vitest';
import { buildCkWallModules, getCkKnightAssetId } from './CkPieces3D';

describe('premium Cities & Knights pieces', () => {
  it('maps every knight rank to a distinct model', () => {
    expect([getCkKnightAssetId(1), getCkKnightAssetId(2), getCkKnightAssetId(3)]).toEqual([
      'ck_knight_basic',
      'ck_knight_strong',
      'ck_knight_mighty',
    ]);
  });

  it('builds a complete modular city enclosure', () => {
    const modules = buildCkWallModules();
    expect(modules).toHaveLength(12);
    expect(modules.filter((module) => module.kind === 'gate')).toHaveLength(1);
    expect(modules.filter((module) => module.kind === 'segment')).toHaveLength(5);
    expect(modules.filter((module) => module.kind === 'tower')).toHaveLength(6);
    expect(modules.every((module) => Number.isFinite(module.rotationY))).toBe(true);
  });
});
