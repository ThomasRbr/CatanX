import { hasResources, listCraftableRecipes, PRODUCTION_RECIPES } from '@catanx/engine';
import type { GameState } from '@catanx/engine';

interface CraftPanelProps {
  gameState: GameState;
  playerId: string;
  onCraft: (buildingId: string, recipeId: string) => void;
  onClose: () => void;
}

function laborOnBuilding(buildingId: string, state: GameState): number {
  const building = state.buildings.get(buildingId);
  if (!building) return 0;
  const assigned = building.workers.length;
  const tile = state.map.get(building.tileId);
  const onSite = tile?.units.length ?? 0;
  const baseline = building.isActive ? 1 : 0;
  return Math.max(assigned, onSite, baseline);
}

function craftBlockReason(
  gameState: GameState,
  playerId: string,
  buildingId: string,
  recipeId: string,
): string | null {
  const player = gameState.players.get(playerId);
  const building = gameState.buildings.get(buildingId);
  const recipe = PRODUCTION_RECIPES.find((entry) => entry.id === recipeId);
  if (!player || !building || !recipe) return 'Recette indisponible.';
  if (building.activeRecipeId) return 'Production déjà en cours.';
  if (laborOnBuilding(buildingId, gameState) < recipe.workerSlots) {
    return `Main-d'œuvre insuffisante (${recipe.workerSlots}).`;
  }
  if (!hasResources(player.resources, recipe.input)) {
    return 'Ressources insuffisantes.';
  }
  return null;
}

export function CraftPanel({ gameState, playerId, onCraft, onClose }: CraftPanelProps) {
  const playerBuildings = [...gameState.buildings.values()].filter(
    (building) => building.ownerId === playerId && building.isActive,
  );

  const entries = playerBuildings.flatMap((building) => {
    const recipes = listCraftableRecipes(playerId, building.id, gameState);
    return recipes.map((recipe) => ({ building, recipe }));
  });

  return (
    <div className="ui-panel" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Atelier de production</strong>
        <button type="button" onClick={onClose}>
          Fermer
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        {PRODUCTION_RECIPES.length} recettes au catalogue · {entries.length} disponibles
      </div>

      <div style={{ marginTop: 10, display: 'grid', gap: 8, maxHeight: 320, overflow: 'auto' }}>
        {entries.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Aucune recette disponible. Construisez scierie, forge, atelier…
          </div>
        ) : (
          entries.map(({ building, recipe }) => {
            const block = craftBlockReason(gameState, playerId, building.id, recipe.id);
            const progress =
              building.activeRecipeId === recipe.id
                ? `${building.productionProgress}/${recipe.turns}`
                : null;
            return (
              <div
                key={`${building.id}-${recipe.id}`}
                className="tutorial-step-card"
                style={{ padding: 8 }}
              >
                <div style={{ fontWeight: 700 }}>{recipe.name}</div>
                <div style={{ fontSize: 11, opacity: 0.82, marginTop: 2 }}>
                  Bâtiment {building.definitionId} · {recipe.turns} tour(s) · {recipe.workerSlots}{' '}
                  ouvrier(s)
                </div>
                {progress && (
                  <div style={{ fontSize: 11, marginTop: 4, color: '#8d3d2f' }}>
                    En cours ({progress})
                  </div>
                )}
                {block && !progress && (
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.75 }}>{block}</div>
                )}
                <button
                  type="button"
                  className="command-button primary"
                  style={{ marginTop: 6 }}
                  disabled={Boolean(block)}
                  onClick={() => onCraft(building.id, recipe.id)}
                >
                  Lancer
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
