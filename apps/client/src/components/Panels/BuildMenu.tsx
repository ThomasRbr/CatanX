import type { BuildingId, GameState, ResourceBundle } from '@catanx/engine';
import {
  applySeasonalBuildCost,
  getFirstKnightActivateExtraCost,
  hasResources,
  isSeasonsEnabled,
} from '@catanx/engine';
import { BUILD_OPTIONS } from '../../data/gameplayCatalog';
import { frBuilding, frResource, frTerrain } from '../../i18n/fr';
import styles from './BuildMenu.module.css';

type ClassicBuildMode = 'settlement' | 'road' | 'city';

interface BuildMenuProps {
  gameState: GameState;
  currentPlayerId: string;
  selectedTileId: string | null;
  classicMode?: boolean;
  citiesKnights?: boolean;
  onClassicBuildMode?: (mode: ClassicBuildMode) => void;
  onBuild: (tileId: string, buildingId: BuildingId) => void;
  onClose: () => void;
}

const BASE_IDS = new Set<BuildingId>(['road', 'settlement', 'city']);

function Cost({ value }: { value: ResourceBundle }) {
  return (
    <div className={styles.cost}>
      {Object.entries(value).map(([resource, amount]) => (
        <span key={resource} data-resource={resource}>
          {frResource(resource)} <b>{amount}</b>
        </span>
      ))}
    </div>
  );
}

function seasonalCost(
  state: GameState,
  playerId: string,
  building: 'settlement' | 'city' | 'road' | 'wall',
  base: ResourceBundle,
): ResourceBundle {
  if (!isSeasonsEnabled(state)) return base;
  return applySeasonalBuildCost(state, playerId, building, base, {
    useWorks: building === 'road' || building === 'wall',
  });
}

export function BuildMenu({
  gameState,
  currentPlayerId,
  selectedTileId,
  classicMode = false,
  citiesKnights = false,
  onClassicBuildMode,
  onBuild,
  onClose,
}: BuildMenuProps) {
  const player = gameState.players.get(currentPlayerId) ?? null;
  const tile = selectedTileId ? (gameState.map.get(selectedTileId) ?? null) : null;
  const baseOptions = BUILD_OPTIONS.filter((option) => BASE_IDS.has(option.id));

  const activateExtra = getFirstKnightActivateExtraCost(gameState, currentPlayerId);
  const ckRecipes: Array<{ label: string; description: string; cost: ResourceBundle }> = [
    {
      label: 'Muraille',
      description: 'Protège une ville et augmente la limite de main.',
      cost: seasonalCost(gameState, currentPlayerId, 'wall', { clay: 2 }),
    },
    {
      label: 'Chevalier',
      description: 'Recrutement sur une intersection libre.',
      cost: { sheep: 1, ore: 1 },
    },
    {
      label: 'Activation',
      description: 'Active un chevalier pour défendre l’île.',
      cost: {
        ...activateExtra,
        wheat: 1 + (activateExtra.wheat ?? 0),
      },
    },
    {
      label: 'Promotion',
      description: 'Renforce un chevalier déjà actif.',
      cost: { sheep: 1, ore: 1 },
    },
  ];

  return (
    <section className={`ui-panel ${styles.catalog}`} aria-label="Catalogue de construction">
      <header className={styles.header}>
        <div>
          <small>Atelier de table</small>
          <strong>Constructions</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer les constructions">
          ×
        </button>
      </header>

      {!classicMode && (
        <div className={styles.target}>
          {tile ? `${frTerrain(tile.terrain)} sélectionné` : 'Sélectionnez un hexagone'}
        </div>
      )}

      <div className={styles.list}>
        {baseOptions.map((option) => {
          const building =
            option.id === 'road'
              ? 'road'
              : option.id === 'settlement'
                ? 'settlement'
                : 'city';
          const cost = seasonalCost(gameState, currentPlayerId, building, option.cost);
          const affordable = Boolean(player && hasResources(player.resources, cost));
          const mode =
            option.id === 'road' ? 'road' : option.id === 'settlement' ? 'settlement' : 'city';
          const actionPhase = gameState.turnPhase === 'player_action';
          const canPlace = classicMode
            ? affordable && actionPhase
            : Boolean(tile && player && affordable && actionPhase);
          return (
            <article key={option.id} className={styles.recipe} data-building={option.id}>
              <div className={styles.recipeHead}>
                <strong>{option.label || frBuilding(option.id)}</strong>
                <span>
                  {option.id === 'road'
                    ? 'Liaison'
                    : option.id === 'settlement'
                      ? 'Colonie'
                      : 'Amélioration'}
                </span>
              </div>
              <p>{option.description}</p>
              <Cost value={cost} />
              <button
                type="button"
                disabled={!canPlace}
                onClick={() => {
                  if (classicMode) onClassicBuildMode?.(mode);
                  else if (tile) onBuild(tile.id, option.id);
                }}
              >
                {affordable ? 'Placer' : 'Ressources manquantes'}
              </button>
            </article>
          );
        })}
      </div>

      {citiesKnights && (
        <div className={styles.extension}>
          <div className={styles.sectionTitle}>
            <strong>Villes & Chevaliers</strong>
            <span>Depuis le tableau extension</span>
          </div>
          <div className={styles.ckGrid}>
            {ckRecipes.map((recipe) => (
              <article key={recipe.label}>
                <strong>{recipe.label}</strong>
                <p>{recipe.description}</p>
                <Cost value={recipe.cost} />
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
