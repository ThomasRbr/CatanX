import { useCallback } from 'react';
import { hexAllNeighbors, hexDistance, hexToId } from '@catanx/engine';
import { useGameStore } from '../store/gameStore';
import { useUIStore } from '../store/uiStore';

export function useHexClick() {
  const gameState = useGameStore((s) => s.gameState);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const setSelectedTileId = useUIStore((s) => s.setSelectedTileId);
  const setRightPanelOpen = useUIStore((s) => s.setRightPanelOpen);
  const setHighlightedTiles = useUIStore((s) => s.setHighlightedTiles);
  const setActiveUnitId = useUIStore((s) => s.setActiveUnitId);
  const setUnitCommandMode = useUIStore((s) => s.setUnitCommandMode);

  return useCallback(
    (tileId: string) => {
      setSelectedTileId(tileId);
      setRightPanelOpen(true);

      if (!gameState) {
        setHighlightedTiles([]);
        return;
      }

      const tile = gameState.map.get(tileId);
      if (!tile) {
        setHighlightedTiles([]);
        return;
      }

      const neighbors = hexAllNeighbors(tile.coord)
        .map((coord) => hexToId(coord))
        .filter((id) => gameState.map.has(id));

      const unitOnTile = tile.units
        .map((unitId) => gameState.units.get(unitId))
        .find((unit) => Boolean(unit));

      if (unitOnTile) {
        if (currentPlayerId && unitOnTile.ownerId === currentPlayerId) {
          setActiveUnitId(unitOnTile.id);
        } else {
          setActiveUnitId(null);
          setUnitCommandMode(null);
        }

        const movement = Math.max(1, unitOnTile.stats.movement);
        const movementTiles: string[] = [];

        for (const [candidateId, candidateTile] of gameState.map) {
          const distance = hexDistance(tile.coord, candidateTile.coord);
          if (distance > movement) continue;
          movementTiles.push(candidateId);
        }

        setHighlightedTiles(Array.from(new Set([...neighbors, ...movementTiles])));
        return;
      }

      setActiveUnitId(null);
      setUnitCommandMode(null);
      setHighlightedTiles(neighbors);
    },
    [
      currentPlayerId,
      gameState,
      setActiveUnitId,
      setHighlightedTiles,
      setRightPanelOpen,
      setSelectedTileId,
      setUnitCommandMode,
    ],
  );
}
