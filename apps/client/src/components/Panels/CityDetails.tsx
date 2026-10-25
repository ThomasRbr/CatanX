import { GameState } from '@catanx/engine';
import { Player } from '@catanx/engine';
import { frTerrain } from '../../i18n/fr';

interface CityDetailsProps {
  gameState: GameState;
  player: Player;
  onClose: () => void;
}

export function CityDetails({ gameState, player, onClose }: CityDetailsProps) {
  const cityTiles = [...player.cities, ...player.metropolis]
    .map((tileId) => gameState.map.get(tileId))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return (
    <div className="ui-panel" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700 }}>Détails urbains</div>
        <button onClick={onClose}>Fermer</button>
      </div>

      <div style={{ marginTop: 6, fontSize: 13 }}>Villages : {player.settlements.length}</div>
      <div style={{ marginTop: 3, fontSize: 13 }}>Villes : {player.cities.length}</div>
      <div style={{ marginTop: 3, fontSize: 13 }}>Métropoles : {player.metropolis.length}</div>

      <div style={{ marginTop: 10, display: 'grid', gap: 7 }}>
        {cityTiles.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.8 }}>Aucune ville pour le moment.</div>
        ) : (
          cityTiles.map((tile) => (
            <div key={tile.id} className="ui-panel" style={{ padding: 8 }}>
              <div style={{ fontWeight: 700 }}>{frTerrain(tile.terrain)}</div>
              <div style={{ marginTop: 2, fontSize: 12 }}>Dés : {tile.diceValue ?? '-'}</div>
              <div style={{ marginTop: 2, fontSize: 12 }}>Bâtiments : {tile.buildings.length}</div>
              <div style={{ marginTop: 2, fontSize: 12 }}>Unités : {tile.units.length}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
