import { hexDistance, hexToId } from '@catanx/engine';
import { GameState } from '@catanx/engine';
import { HexTile } from '@catanx/engine';
import { UnitType } from '@catanx/engine';
import { ResourceBundle } from '@catanx/engine';
import { RECRUIT_OPTIONS } from '../../data/gameplayCatalog';
import { frResource, frUnit } from '../../i18n/fr';

interface UnitActionsProps {
  gameState: GameState;
  currentPlayerId: string;
  tile: HexTile | null;
  activeUnitId: string | null;
  unitCommandMode: 'move' | 'attack' | null;
  onSelectUnit: (unitId: string | null) => void;
  onSetCommandMode: (mode: 'move' | 'attack' | null) => void;
  onMove: (unitId: string, targetTileId: string) => void;
  onAttack: (attackerId: string, defenderId: string) => void;
  onFortify: (unitId: string) => void;
  onRecruit: (tileId: string, unitType: UnitType) => void;
  onClose: () => void;
}

function formatCost(cost: ResourceBundle): string {
  const entries = Object.entries(cost);
  if (entries.length === 0) return 'Gratuit';
  return entries.map(([resource, amount]) => `${frResource(resource)} ${amount}`).join(' - ');
}

export function UnitActions({
  gameState,
  currentPlayerId,
  tile,
  activeUnitId,
  unitCommandMode,
  onSelectUnit,
  onSetCommandMode,
  onMove,
  onAttack,
  onFortify,
  onRecruit,
  onClose,
}: UnitActionsProps) {
  const selectedUnit = activeUnitId ? (gameState.units.get(activeUnitId) ?? null) : null;

  const unitsOnTile = tile
    ? tile.units
        .map((id) => gameState.units.get(id))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];

  const controlledUnits = unitsOnTile.filter((unit) => unit.ownerId === currentPlayerId);
  const enemyUnits = unitsOnTile.filter((unit) => unit.ownerId !== currentPlayerId);

  const reachableTiles = selectedUnit
    ? [...gameState.map.entries()]
        .filter(
          ([, candidate]) =>
            hexDistance(selectedUnit.position, candidate.coord) <= selectedUnit.stats.movement,
        )
        .map(([id]) => id)
    : [];

  const attackableUnits = selectedUnit
    ? [...gameState.units.values()].filter((candidate) => {
        if (candidate.ownerId === selectedUnit.ownerId) return false;
        const distance = hexDistance(selectedUnit.position, candidate.position);
        const canMelee = distance === 1;
        const canRanged =
          selectedUnit.stats.rangedAttack > 0 && distance <= selectedUnit.stats.range;
        return canMelee || canRanged;
      })
    : [];

  const recruitEnabled = Boolean(tile && tile.owner === currentPlayerId);

  return (
    <div className="ui-panel" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700 }}>Commandement des unites</div>
        <button onClick={onClose}>Fermer</button>
      </div>

      {!tile ? (
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
          Selectionnez une tuile pour gerer ses troupes.
        </div>
      ) : (
        <>
          <div style={{ marginTop: 9, fontSize: 12, opacity: 0.85 }}>
            Tuile : {tile.id} - Alliees {controlledUnits.length} - Ennemies {enemyUnits.length}
          </div>

          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            {controlledUnits.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Aucune unite controlee sur cette tuile.
              </div>
            ) : (
              controlledUnits.map((unit) => {
                const selected = activeUnitId === unit.id;
                return (
                  <button
                    key={unit.id}
                    onClick={() => onSelectUnit(selected ? null : unit.id)}
                    style={{
                      textAlign: 'left',
                      border: selected ? '2px solid rgba(66, 139, 202, 0.75)' : undefined,
                    }}
                  >
                    <strong>{frUnit(unit.type)}</strong> - Niv {unit.level} - PV{' '}
                    {unit.stats.currentHealth}/{unit.stats.health}
                  </button>
                );
              })
            )}
          </div>

          {selectedUnit && (
            <div className="ui-panel" style={{ marginTop: 10, padding: 9 }}>
              <div style={{ fontWeight: 700 }}>Unite active : {frUnit(selectedUnit.type)}</div>
              <div style={{ marginTop: 3, fontSize: 12, opacity: 0.82 }}>
                Mouvement {selectedUnit.stats.movement} - Portee {selectedUnit.stats.range} - Statut{' '}
                {selectedUnit.status}
              </div>

              <div style={{ marginTop: 8, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <button onClick={() => onSetCommandMode('move')} disabled={selectedUnit.hasMoved}>
                  Mode deplacement
                </button>
                <button
                  onClick={() => onSetCommandMode('attack')}
                  disabled={selectedUnit.hasAttacked}
                >
                  Mode attaque
                </button>
                <button onClick={() => onFortify(selectedUnit.id)}>Fortifier</button>
                <button onClick={() => onSetCommandMode(null)}>Annuler ordre</button>
              </div>

              {unitCommandMode && (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.86 }}>
                  Mode actif :{' '}
                  <strong>{unitCommandMode === 'move' ? 'Deplacement' : 'Attaque'}</strong>. Vous
                  pouvez cliquer directement sur la carte.
                </div>
              )}

              {unitCommandMode === 'move' && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Deplacements rapides :</div>
                  <div
                    style={{
                      marginTop: 5,
                      display: 'grid',
                      gap: 5,
                      maxHeight: 140,
                      overflowY: 'auto',
                    }}
                  >
                    {reachableTiles.slice(0, 16).map((targetTileId) => (
                      <button
                        key={targetTileId}
                        onClick={() => onMove(selectedUnit.id, targetTileId)}
                      >
                        Aller vers {targetTileId}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {unitCommandMode === 'attack' && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Cibles disponibles :</div>
                  <div
                    style={{
                      marginTop: 5,
                      display: 'grid',
                      gap: 5,
                      maxHeight: 160,
                      overflowY: 'auto',
                    }}
                  >
                    {attackableUnits.length === 0 ? (
                      <div style={{ fontSize: 12, opacity: 0.8 }}>Aucune cible a portee.</div>
                    ) : (
                      attackableUnits.map((target) => (
                        <button
                          key={target.id}
                          onClick={() => onAttack(selectedUnit.id, target.id)}
                        >
                          Attaquer {frUnit(target.type)} sur {hexToId(target.position)}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="ui-panel" style={{ marginTop: 10, padding: 9 }}>
            <div style={{ fontWeight: 700 }}>Recrutement</div>
            {!recruitEnabled ? (
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                Recrutement disponible uniquement sur une tuile que vous controlez.
              </div>
            ) : (
              <div style={{ marginTop: 7, display: 'grid', gap: 5 }}>
                {RECRUIT_OPTIONS.map((option) => (
                  <button key={option.type} onClick={() => onRecruit(tile.id, option.type)}>
                    Recruter {option.label} - {formatCost(option.cost)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
