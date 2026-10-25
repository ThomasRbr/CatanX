import { CSSProperties, useMemo } from 'react';
import { GameState } from '@catanx/engine';
import { HexLayout, hexToPixel } from '@catanx/engine';
import { TerrainType } from '@catanx/engine';
import { CameraViewport } from '../Map/HexBoard';

interface MiniMapProps {
  gameState: GameState;
  viewport: CameraViewport | null;
  selectedTileId: string | null;
  onNavigate: (tileId: string) => void;
  style?: CSSProperties;
}

const WIDTH = 246;
const HEIGHT = 176;
const PADDING = 12;

const TERRAIN_COLORS: Record<TerrainType, string> = {
  plains: '#9a875a',
  forest: '#3f633f',
  mountain: '#7f7f86',
  hill: '#8f7149',
  pasture: '#7f9456',
  desert: '#c9ad79',
  coast: '#7ea0b3',
  ocean: '#436b89',
  river: '#5b8eaf',
  swamp: '#5d6d48',
  volcano: '#8d4c44',
  tundra: '#bec9d4',
  jungle: '#325a3d',
  goldmine: '#d2b26d',
  sacred: '#a485ad',
  ruins: '#90735b',
  glacier: '#d9e8ef',
  lake: '#6c97b0',
};

const PLAYER_COLORS: Record<string, string> = {
  red: '#d62828',
  blue: '#1d4ed8',
  green: '#2a9d8f',
  orange: '#f77f00',
  purple: '#7b2cbf',
  white: '#f1f5f9',
  brown: '#7f5539',
  cyan: '#00bcd4',
};

function clampHexSize(mapRadius: number): number {
  if (mapRadius <= 3) return 56;
  if (mapRadius <= 5) return 48;
  if (mapRadius <= 6) return 42;
  return 36;
}

interface ProjectedTile {
  id: string;
  worldX: number;
  worldY: number;
  x: number;
  y: number;
  terrain: TerrainType;
  owner: string | null;
}

export function MiniMap({ gameState, viewport, selectedTileId, onNavigate, style }: MiniMapProps) {
  const projection = useMemo(() => {
    const layout: HexLayout = {
      size: clampHexSize(gameState.mapRadius),
      origin: { x: 0, y: 0 },
      flat: false,
    };

    const raw = [...gameState.map.values()].map((tile) => {
      const center = hexToPixel(tile.coord, layout);
      return {
        id: tile.id,
        worldX: center.x,
        worldY: center.y,
        terrain: tile.terrain,
        owner: tile.owner,
      };
    });

    if (raw.length === 0) {
      return {
        tiles: [] as ProjectedTile[],
        bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const tile of raw) {
      minX = Math.min(minX, tile.worldX);
      maxX = Math.max(maxX, tile.worldX);
      minY = Math.min(minY, tile.worldY);
      maxY = Math.max(maxY, tile.worldY);
    }

    const usableWidth = WIDTH - PADDING * 2;
    const usableHeight = HEIGHT - PADDING * 2;
    const worldWidth = Math.max(1, maxX - minX + layout.size * 2);
    const worldHeight = Math.max(1, maxY - minY + layout.size * 2);
    const scale = Math.min(usableWidth / worldWidth, usableHeight / worldHeight);

    const offsetX = (WIDTH - worldWidth * scale) / 2;
    const offsetY = (HEIGHT - worldHeight * scale) / 2;

    const tiles: ProjectedTile[] = raw.map((tile) => ({
      ...tile,
      x: offsetX + (tile.worldX - (minX - layout.size)) * scale,
      y: offsetY + (tile.worldY - (minY - layout.size)) * scale,
    }));

    return {
      tiles,
      bounds: {
        minX: minX - layout.size,
        maxX: maxX + layout.size,
        minY: minY - layout.size,
        maxY: maxY + layout.size,
      },
    };
  }, [gameState.map, gameState.mapRadius]);

  const viewportBox = useMemo(() => {
    if (!viewport) return null;
    const worldWidth = Math.max(1, projection.bounds.maxX - projection.bounds.minX);
    const worldHeight = Math.max(1, projection.bounds.maxY - projection.bounds.minY);
    const usableWidth = WIDTH - PADDING * 2;
    const usableHeight = HEIGHT - PADDING * 2;
    const scale = Math.min(usableWidth / worldWidth, usableHeight / worldHeight);
    const offsetX = (WIDTH - worldWidth * scale) / 2;
    const offsetY = (HEIGHT - worldHeight * scale) / 2;

    const left = offsetX + (viewport.minX - projection.bounds.minX) * scale;
    const right = offsetX + (viewport.maxX - projection.bounds.minX) * scale;
    const top = offsetY + (viewport.minY - projection.bounds.minY) * scale;
    const bottom = offsetY + (viewport.maxY - projection.bounds.minY) * scale;

    return {
      left,
      top,
      width: Math.max(10, right - left),
      height: Math.max(10, bottom - top),
    };
  }, [
    projection.bounds.maxX,
    projection.bounds.maxY,
    projection.bounds.minX,
    projection.bounds.minY,
    viewport,
  ]);

  const selected = selectedTileId
    ? projection.tiles.find((tile) => tile.id === selectedTileId)
    : null;

  return (
    <div
      className="ui-panel"
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: WIDTH + 24,
        padding: 10,
        pointerEvents: 'auto',
        ...style,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Mini-carte</div>

      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{
          display: 'block',
          borderRadius: 10,
          background: 'rgba(21, 33, 48, 0.82)',
          cursor: 'pointer',
        }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
          const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;

          let best: { id: string; d: number } | null = null;
          for (const tile of projection.tiles) {
            const dx = tile.x - x;
            const dy = tile.y - y;
            const d = dx * dx + dy * dy;
            if (!best || d < best.d) {
              best = { id: tile.id, d };
            }
          }
          if (best) onNavigate(best.id);
        }}
      >
        {projection.tiles.map((tile) => {
          const ownerColor = tile.owner
            ? (PLAYER_COLORS[gameState.players.get(tile.owner)?.color ?? ''] ?? null)
            : null;
          return (
            <g key={tile.id}>
              <circle
                cx={tile.x}
                cy={tile.y}
                r={4.2}
                fill={TERRAIN_COLORS[tile.terrain] ?? '#6b7280'}
                opacity={0.95}
              />
              {ownerColor && (
                <circle cx={tile.x} cy={tile.y} r={2.2} fill={ownerColor} opacity={0.92} />
              )}
            </g>
          );
        })}

        {viewportBox && (
          <rect
            x={viewportBox.left}
            y={viewportBox.top}
            width={viewportBox.width}
            height={viewportBox.height}
            fill="none"
            stroke="#fef3c7"
            strokeWidth={1.5}
            opacity={0.95}
            rx={2}
          />
        )}

        {selected && (
          <circle
            cx={selected.x}
            cy={selected.y}
            r={6}
            fill="none"
            stroke="#fde68a"
            strokeWidth={1.4}
            opacity={0.95}
          />
        )}
      </svg>
    </div>
  );
}
