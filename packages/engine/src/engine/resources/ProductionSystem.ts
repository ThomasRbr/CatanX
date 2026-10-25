import { GameState } from '../../types/game';
import { Player } from '../../types/player';
import { PRODUCTION_RECIPES, ProductionRecipe, ResourceType } from '../../types/resources';
import { nextId } from '../../core/ids';
import { now } from '../../core/clock';
import { hasResources, subtractResources, addResources } from '../resources/ResourceSystem';

export interface CraftResult {
  success: boolean;
  reason?: string;
  completed?: boolean;
}

function findRecipe(recipeId: string): ProductionRecipe | undefined {
  return PRODUCTION_RECIPES.find((recipe) => recipe.id === recipeId);
}

function laborOnBuilding(buildingId: string, state: GameState): number {
  const building = state.buildings.get(buildingId);
  if (!building) return 0;
  const assigned = building.workers.length;
  const tile = state.map.get(building.tileId);
  const onSite = tile?.units.length ?? 0;
  // Bâtiment actif = au moins 1 ouvrier implicite (main-d'œuvre locale).
  const baseline = building.isActive ? 1 : 0;
  return Math.max(assigned, onSite, baseline);
}

/**
 * Démarre (ou complète immédiatement) une recette de craft sur un bâtiment.
 */
export function craftRecipe(
  playerId: string,
  buildingId: string,
  recipeId: string,
  state: GameState,
): CraftResult {
  if (!state.config.enableProductionChains) {
    return { success: false, reason: 'Les chaînes de production sont désactivées.' };
  }

  const player = state.players.get(playerId);
  const building = state.buildings.get(buildingId);
  if (!player || !building) {
    return { success: false, reason: 'Bâtiment ou joueur introuvable.' };
  }
  if (building.ownerId !== playerId) {
    return { success: false, reason: 'Vous ne contrôlez pas ce bâtiment.' };
  }
  if (!building.isActive) {
    return { success: false, reason: 'Ce bâtiment est inactif.' };
  }
  if (building.activeRecipeId) {
    return { success: false, reason: 'Une production est déjà en cours sur ce bâtiment.' };
  }

  const recipe = findRecipe(recipeId);
  if (!recipe) {
    return { success: false, reason: 'Recette inconnue.' };
  }
  if (building.definitionId !== recipe.requiredBuilding) {
    return {
      success: false,
      reason: `Cette recette nécessite un bâtiment « ${recipe.requiredBuilding} ».`,
    };
  }
  if (recipe.requiredTech && !player.researchedTechs.includes(recipe.requiredTech)) {
    return {
      success: false,
      reason: `Technologie requise : ${recipe.requiredTech}.`,
    };
  }
  if (laborOnBuilding(buildingId, state) < recipe.workerSlots) {
    return {
      success: false,
      reason: `Main-d'œuvre insuffisante (${recipe.workerSlots} requise).`,
    };
  }
  if (!hasResources(player.resources, recipe.input)) {
    return { success: false, reason: 'Ressources d’entrée insuffisantes.' };
  }

  player.resources = subtractResources(player.resources, recipe.input);

  // Demande marché
  for (const [resource, amount] of Object.entries(recipe.input)) {
    const key = resource as ResourceType;
    state.market.demand[key] = (state.market.demand[key] ?? 0) + Number(amount ?? 0);
  }

  if (recipe.turns <= 1) {
    player.resources = addResources(player.resources, recipe.output);
    for (const [resource, amount] of Object.entries(recipe.output)) {
      const key = resource as ResourceType;
      state.market.supply[key] = Math.max(
        0,
        (state.market.supply[key] ?? 0) - Number(amount ?? 0),
      );
    }
    state.actionLog.push({
      id: nextId('log'),
      turn: state.currentTurn,
      playerId,
      type: 'production_order',
      description: `Craft terminé : ${recipe.name}`,
      data: { recipeId, buildingId, instant: true },
      timestamp: now(),
    });
    return { success: true, completed: true };
  }

  building.activeRecipeId = recipeId;
  building.productionProgress = 0;
  state.actionLog.push({
    id: nextId('log'),
    turn: state.currentTurn,
    playerId,
    type: 'production_order',
    description: `Craft démarré : ${recipe.name}`,
    data: { recipeId, buildingId, turns: recipe.turns },
    timestamp: now(),
  });
  return { success: true, completed: false };
}

/**
 * Avance les recettes multi-tours pour un joueur (début/fin de tour).
 */
export function advancePlayerCrafts(player: Player, state: GameState): void {
  if (!state.config.enableProductionChains) return;

  for (const [, building] of state.buildings) {
    if (building.ownerId !== player.id || !building.activeRecipeId) continue;
    const recipe = findRecipe(building.activeRecipeId);
    if (!recipe) {
      building.activeRecipeId = undefined;
      building.productionProgress = 0;
      continue;
    }

    building.productionProgress += 1;
    if (building.productionProgress < recipe.turns) continue;

    player.resources = addResources(player.resources, recipe.output);
    for (const [resource, amount] of Object.entries(recipe.output)) {
      const key = resource as ResourceType;
      state.market.supply[key] = Math.max(
        0,
        (state.market.supply[key] ?? 0) - Number(amount ?? 0),
      );
    }

    state.actionLog.push({
      id: nextId('log'),
      turn: state.currentTurn,
      playerId: player.id,
      type: 'production_order',
      description: `Craft terminé : ${recipe.name}`,
      data: { recipeId: recipe.id, buildingId: building.id },
      timestamp: now(),
    });

    building.activeRecipeId = undefined;
    building.productionProgress = 0;
  }
}

export function listCraftableRecipes(
  playerId: string,
  buildingId: string,
  state: GameState,
): ProductionRecipe[] {
  const player = state.players.get(playerId);
  const building = state.buildings.get(buildingId);
  if (!player || !building || building.ownerId !== playerId) return [];

  return PRODUCTION_RECIPES.filter((recipe) => {
    if (recipe.requiredBuilding !== building.definitionId) return false;
    if (recipe.requiredTech && !player.researchedTechs.includes(recipe.requiredTech)) return false;
    return true;
  });
}
