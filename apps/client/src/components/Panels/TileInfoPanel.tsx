import type { GameState, HexTile, Player } from '@catanx/engine';
import { frResource, frTerrain } from '../../i18n/fr';
import styles from './TileInfoPanel.module.css';

interface TileInfoPanelProps {
  gameState: GameState;
  tile: HexTile | null;
  owner: Player | null;
  onClose: () => void;
}

const CATAN_RESOURCES = new Set(['wood', 'clay', 'sheep', 'wheat', 'ore']);

export function TileInfoPanel({ gameState, tile, owner, onClose }: TileInfoPanelProps) {
  if (!tile) return null;

  const production = Object.entries(tile.baseProduction).filter(
    ([resource, amount]) => CATAN_RESOURCES.has(resource) && (amount ?? 0) > 0,
  );
  const buildingCount = tile.buildings.filter((id) => gameState.buildings.has(id)).length;
  const unitCount = tile.units.filter((id) => gameState.units.has(id)).length;

  return (
    <aside className={`ui-panel ${styles.card}`} aria-label={`Hexagone ${frTerrain(tile.terrain)}`}>
      <header className={styles.header}>
        <div>
          <small>Hexagone sélectionné</small>
          <strong>{frTerrain(tile.terrain)}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer les informations">×</button>
      </header>

      <div className={styles.summary}>
        <span className={styles.number}>{tile.diceValue ?? '—'}</span>
        <div>
          <small>Propriétaire</small>
          <strong>{owner?.name ?? 'Libre'}</strong>
        </div>
        {(buildingCount > 0 || unitCount > 0) && (
          <div className={styles.counters}>
            {buildingCount > 0 && <span>{buildingCount} bât.</span>}
            {unitCount > 0 && <span>{unitCount} unité{unitCount > 1 ? 's' : ''}</span>}
          </div>
        )}
      </div>

      {production.length > 0 && (
        <div className={styles.production} aria-label="Production">
          {production.map(([resource, amount]) => (
            <span key={resource} data-resource={resource}>{frResource(resource)} <b>+{amount}</b></span>
          ))}
        </div>
      )}
    </aside>
  );
}
