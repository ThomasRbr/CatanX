import { Assets, Texture } from 'pixi.js';
import { TerrainType } from '@catanx/engine';

export const TERRAIN_COLORS: Record<TerrainType, number> = {
  plains: 0xb79f69,
  forest: 0x295331,
  mountain: 0x65686d,
  hill: 0x786142,
  pasture: 0x6f8f48,
  desert: 0xc8ab78,
  coast: 0x5a7f8a,
  ocean: 0x1f3f5f,
  river: 0x3a6686,
  swamp: 0x4e5a3a,
  volcano: 0x4f2d2d,
  tundra: 0x9aa9b0,
  jungle: 0x274a33,
  goldmine: 0x9f8438,
  sacred: 0x6b4c72,
  ruins: 0x6f5947,
  glacier: 0xb9c6cf,
  lake: 0x476f80,
};

const TERRAIN_ACCENTS: Record<TerrainType, number> = {
  plains: 0xd7bd7f,
  forest: 0x406f48,
  mountain: 0x8e9399,
  hill: 0x9a7a53,
  pasture: 0x8db763,
  desert: 0xdfc28e,
  coast: 0x78a8b5,
  ocean: 0x2b5780,
  river: 0x5f8faf,
  swamp: 0x6c7f50,
  volcano: 0x7d4545,
  tundra: 0xc7d2d8,
  jungle: 0x3e6d49,
  goldmine: 0xd9bc67,
  sacred: 0x9b77a4,
  ruins: 0x9a7d63,
  glacier: 0xd9e6ee,
  lake: 0x79a7bc,
};

const TERRAIN_GLYPHS: Record<TerrainType, string> = {
  plains: 'PL',
  forest: 'FO',
  mountain: 'MT',
  hill: 'CO',
  pasture: 'PT',
  desert: 'DE',
  coast: 'CT',
  ocean: 'OC',
  river: 'RI',
  swamp: 'MA',
  volcano: 'VO',
  tundra: 'TU',
  jungle: 'JU',
  goldmine: 'OR',
  sacred: 'SA',
  ruins: 'RU',
  glacier: 'GL',
  lake: 'LA',
};

const TERRAIN_KEYS = Object.keys(TERRAIN_COLORS) as TerrainType[];

function toRgb(color: number): [number, number, number] {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return [r, g, b];
}

function rgba(color: number, alpha: number): string {
  const [r, g, b] = toRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class TerrainRenderer {
  private terrainTextures = new Map<TerrainType, Texture>();

  async loadTerrainTextures(basePath = '/assets/textures/terrain'): Promise<void> {
    const missing: TerrainType[] = [];
    const entries = TERRAIN_KEYS.map(async (terrain) => {
      const texturePath = `${basePath}/${terrain}.png`;
      try {
        const texture = await Assets.load(texturePath);
        this.terrainTextures.set(terrain, texture);
      } catch {
        missing.push(terrain);
      }
    });

    await Promise.all(entries);

    if (missing.length > 0 && typeof console !== 'undefined') {
      console.info(
        `[TerrainRenderer] ${missing.length} texture(s) manquante(s) sous ${basePath} — fallback procédural utilisé.`,
      );
    }

    for (const terrain of TERRAIN_KEYS) {
      if (this.terrainTextures.has(terrain)) continue;
      this.terrainTextures.set(terrain, this.createFallbackTexture(terrain));
    }
  }

  getTerrainColor(terrain: TerrainType): number {
    return TERRAIN_COLORS[terrain] ?? 0x888888;
  }

  getTerrainAccentColor(terrain: TerrainType): number {
    return TERRAIN_ACCENTS[terrain] ?? 0xb4b7be;
  }

  getTerrainGlyph(terrain: TerrainType): string {
    return TERRAIN_GLYPHS[terrain] ?? '??';
  }

  getTerrainTexture(terrain: TerrainType): Texture | null {
    return this.terrainTextures.get(terrain) ?? null;
  }

  private createFallbackTexture(terrain: TerrainType): Texture {
    if (typeof document === 'undefined') {
      return Texture.WHITE;
    }

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return Texture.WHITE;

    const base = this.getTerrainColor(terrain);
    const accent = this.getTerrainAccentColor(terrain);

    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, rgba(accent, 0.94));
    grad.addColorStop(1, rgba(base, 0.98));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 280; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = 0.4 + Math.random() * 1.6;
      ctx.fillStyle = i % 3 === 0 ? rgba(0xffffff, 0.06) : rgba(0x000000, 0.05);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (terrain === 'forest' || terrain === 'jungle') {
      for (let i = 0; i < 48; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const w = 2 + Math.random() * 5;
        const h = 4 + Math.random() * 8;
        ctx.fillStyle = rgba(0x1d3a22, 0.3);
        ctx.fillRect(x, y, w, h);
      }
    } else if (terrain === 'mountain' || terrain === 'hill' || terrain === 'volcano') {
      for (let i = 0; i < 30; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const spread = 6 + Math.random() * 12;
        ctx.fillStyle = rgba(0x201912, terrain === 'volcano' ? 0.32 : 0.2);
        ctx.beginPath();
        ctx.moveTo(x, y - spread);
        ctx.lineTo(x - spread, y + spread);
        ctx.lineTo(x + spread, y + spread);
        ctx.closePath();
        ctx.fill();
      }
    } else if (
      terrain === 'ocean' ||
      terrain === 'coast' ||
      terrain === 'river' ||
      terrain === 'lake'
    ) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(0xdff6ff, 0.2);
      for (let row = 8; row < size; row += 12) {
        ctx.beginPath();
        ctx.moveTo(0, row);
        for (let x = 0; x <= size; x += 8) {
          const wave = row + Math.sin((x + row) * 0.12) * 2.5;
          ctx.lineTo(x, wave);
        }
        ctx.stroke();
      }
    } else if (
      terrain === 'desert' ||
      terrain === 'plains' ||
      terrain === 'pasture' ||
      terrain === 'tundra'
    ) {
      for (let i = 0; i < 40; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const w = 8 + Math.random() * 16;
        const h = 2 + Math.random() * 4;
        ctx.fillStyle = rgba(0xffffff, 0.08);
        ctx.fillRect(x, y, w, h);
      }
    } else if (terrain === 'swamp') {
      for (let i = 0; i < 24; i += 1) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 3 + Math.random() * 8;
        ctx.fillStyle = rgba(0x2c3b27, 0.28);
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.5, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return Texture.from(canvas);
  }
}
