// ============================================================
// ResourceSystem — Collecte, production, transformation, marché
// ============================================================

import {
  ResourceBundle,
  ResourceType,
  ResourceMarket,
  PRODUCTION_RECIPES,
} from '../../types/resources';
import { Player } from '../../types/player';
import { HexTile, TerrainType, normalizePortType } from '../../types/hex';
import { GameState } from '../../types/game';
import type { BuildingInstance } from '../../types/buildings';
import {
  getBuildingDefById,
  calculateBuildingMaintenance as calcBuildingMaint,
} from '../buildings/BuildingSystem';
import {
  applyClassicBankProduction,
  isClassicMode,
  usesLimitedBank,
} from '../catan/ClassicBoard';
import { isClassicLandTerrain } from '../catan/CatanTopology';
import { peekPortCharterAlly } from '../pactsEmbassies/clauses';

// ============================================================
// OPÉRATIONS SUR BUNDLES
// ============================================================

export function addResources(base: ResourceBundle, add: ResourceBundle): ResourceBundle {
  const result = { ...base };
  for (const [res, amount] of Object.entries(add) as [ResourceType, number][]) {
    result[res] = (result[res] ?? 0) + amount;
  }
  return result;
}

export function subtractResources(base: ResourceBundle, sub: ResourceBundle): ResourceBundle {
  const result = { ...base };
  for (const [res, amount] of Object.entries(sub) as [ResourceType, number][]) {
    // BUG FIX: clamp à 0 pour éviter les valeurs négatives
    result[res] = Math.max(0, (result[res] ?? 0) - amount);
  }
  return result;
}

export function hasResources(bundle: ResourceBundle, required: ResourceBundle): boolean {
  for (const [res, amount] of Object.entries(required) as [ResourceType, number][]) {
    if ((bundle[res] ?? 0) < amount) return false;
  }
  return true;
}

export function scaleResources(bundle: ResourceBundle, factor: number): ResourceBundle {
  const result: ResourceBundle = {};
  for (const [res, amount] of Object.entries(bundle) as [ResourceType, number][]) {
    result[res] = Math.round(amount * factor);
  }
  return result;
}

export function totalResources(bundle: ResourceBundle): number {
  return Object.values(bundle).reduce((s, v) => s + (v ?? 0), 0);
}

export function resourceTypes(bundle: ResourceBundle): ResourceType[] {
  return Object.entries(bundle)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k]) => k as ResourceType);
}

// ============================================================
// COLLECTE DE RESSOURCES (lancer de dés)
// ============================================================

export interface CollectionResult {
  playerId: string;
  resources: ResourceBundle;
  bonuses: BonusEntry[];
}

export interface BonusEntry {
  source: string;
  resource: ResourceType;
  amount: number;
}

/**
 * Source de vérité des terrains produits par un bâtiment.
 *
 * Les sauvegardes antérieures au placement topologique peuvent ne contenir
 * que `tileId` (ou une liste partielle). Dès qu'un bâtiment possède une
 * intersection stable, la topologie fait autorité afin que ses 2–3 terrains
 * adjacents produisent tous correctement.
 */
export function resolveBuildingProductionTileIds(
  state: GameState,
  building: Pick<
    BuildingInstance,
    'placementKind' | 'placementIntersectionId' | 'productionTileIds' | 'tileId'
  >,
): string[] {
  if (building.placementKind === 'intersection' && building.placementIntersectionId) {
    const adjacent =
      state.classicBoard?.topology.intersections[building.placementIntersectionId]?.tileIds;
    if (adjacent?.length) {
      return [...new Set(adjacent)].filter((tileId) => {
        const tile = state.map.get(tileId);
        return Boolean(
          tile && isClassicLandTerrain(tile.terrain) && tile.terrain !== 'desert',
        );
      });
    }
  }

  return building.productionTileIds?.length
    ? [...new Set(building.productionTileIds)]
    : [building.tileId];
}

/** Un environnement défavorable peut réduire une ville, jamais annuler une colonie. */
function scalePositiveProduction(amount: number, factor: number): number {
  if (amount <= 0 || factor <= 0) return 0;
  return Math.max(1, Math.floor(amount * factor));
}

/**
 * Calcule les ressources produites par le dé pour tous les joueurs.
 * Utilise les bâtiments (villages/villes) et leurs tuiles de production.
 */
export function collectDiceResources(
  diceValue: number,
  state: GameState,
  opts?: { skipBank?: boolean },
): CollectionResult[] {
  const results: CollectionResult[] = [];
  const classic = isClassicMode(state);
  const processed = new Set<string>();

  for (const [, building] of state.buildings) {
    if (!['settlement', 'city', 'metropolis'].includes(building.definitionId)) continue;
    const player = state.players.get(building.ownerId);
    if (!player) continue;

    const multiplier =
      building.definitionId === 'settlement' ? 1 : building.definitionId === 'city' ? 2 : 3;
    const tileIds = resolveBuildingProductionTileIds(state, building);

    for (const tileId of tileIds) {
      // Une clé par bâtiment+tuile : deux colonies du même joueur autour d'un terrain produisent chacune.
      const key = `${building.id}:${tileId}`;
      if (processed.has(key)) continue;
      processed.add(key);

      const tile = state.map.get(tileId);
      if (!tile || tile.diceValue !== diceValue || tile.robber) continue;

      const production = { ...tile.baseProduction };

      for (const res of Object.keys(production) as ResourceType[]) {
        production[res] = Math.floor((production[res] ?? 0) * multiplier);
      }

      if (!classic) {
        for (const mod of tile.modifiers) {
          if (mod.type === 'production' && mod.resource) {
            const existing = production[mod.resource as ResourceType] ?? 0;
            production[mod.resource as ResourceType] = Math.max(0, existing + mod.value);
          }
        }

        if (tile.fertility < 100) {
          const fertilityMod = tile.fertility / 100;
          for (const res of ['wheat', 'herbs', 'sheep'] as ResourceType[]) {
            if (production[res]) {
              production[res] = scalePositiveProduction(production[res]!, fertilityMod);
            }
          }
        }

        if (tile.pollution > 0) {
          const pollutionMod = 1 - tile.pollution / 200;
          for (const res of Object.keys(production) as ResourceType[]) {
            production[res] = scalePositiveProduction(production[res] ?? 0, pollutionMod);
          }
        }
      }

      let existing = results.find((r) => r.playerId === player.id);
      if (!existing) {
        existing = { playerId: player.id, resources: {}, bonuses: [] };
        results.push(existing);
      }

      existing.resources = addResources(existing.resources, production);
    }
  }

  // Rétrocompatibilité : production par propriétaire de tuile si aucun bâtiment enregistré
  if (state.buildings.size === 0) {
    for (const [tileId, tile] of state.map) {
      if (tile.diceValue !== diceValue) continue;
      if (tile.robber) continue;
      if (!tile.owner) continue;

      const player = state.players.get(tile.owner);
      if (!player) continue;

      const production = { ...tile.baseProduction };
      const cityMultiplier = getCityMultiplier(tile, player);
      for (const res of Object.keys(production) as ResourceType[]) {
        production[res] = Math.floor((production[res] ?? 0) * cityMultiplier);
      }

      let existing = results.find((r) => r.playerId === player.id);
      if (!existing) {
        existing = { playerId: player.id, resources: {}, bonuses: [] };
        results.push(existing);
      }
      existing.resources = addResources(existing.resources, production);
    }
  }

  if (!opts?.skipBank && usesLimitedBank(state)) {
    applyClassicBankProduction(state, results);
  }

  return results;
}

function getCityMultiplier(tile: HexTile, player: Player): number {
  if (player.metropolis.includes(tile.id)) return 3;
  if (player.cities.includes(tile.id)) return 2;
  if (player.settlements.includes(tile.id)) return 1;
  return 0;
}

// ============================================================
// PRODUCTION PER TURN (bâtiments, mines, etc.)
// ============================================================

// Mapping des effect types de bâtiment vers les clés ResourceBundle
const EFFECT_TYPE_TO_RESOURCE: Partial<Record<string, ResourceType>> = {
  science_per_turn: 'science',
  culture_per_turn: 'culture',
  faith_per_turn: 'faith',
  influence_per_turn: 'influence',
};

export function calculateTurnProduction(player: Player, state: GameState): ResourceBundle {
  const production: ResourceBundle = {};

  // Multiplicateurs tech pour ressources intangibles
  const scienceMult =
    (player.researchedTechs.includes('scientific_method') ? 2 : 1) *
    (player.researchedTechs.includes('education') ? 1.5 : 1);
  const cultureMult =
    (player.researchedTechs.includes('enlightenment') ? 2 : 1) *
    (player.researchedTechs.includes('printing_press') ? 1.5 : 1);

  for (const [, building] of state.buildings) {
    if (building.ownerId !== player.id || !building.isActive) continue;

    const def = getBuildingDefById(building.definitionId);
    if (!def) continue;

    for (const effect of def.effects) {
      switch (effect.type) {
        case 'produce_resource': {
          if (!effect.resource) break;
          const res = effect.resource as ResourceType;
          production[res] = (production[res] ?? 0) + (effect.amount ?? 0);
          break;
        }
        case 'science_per_turn':
          production.science = (production.science ?? 0) + (effect.amount ?? 0);
          break;
        case 'culture_per_turn':
          production.culture = (production.culture ?? 0) + (effect.amount ?? 0);
          break;
        case 'faith_per_turn':
          production.faith = (production.faith ?? 0) + (effect.amount ?? 0);
          break;
        case 'influence_per_turn':
          production.influence = (production.influence ?? 0) + (effect.amount ?? 0);
          break;
        default:
          break;
      }
    }
  }

  // Appliquer multiplicateurs tech aux ressources intangibles
  if (production.science) production.science = Math.round(production.science * scienceMult);
  if (production.culture) production.culture = Math.round(production.culture * cultureMult);

  return production;
}

// ============================================================
// MARCHÉ GLOBAL
// ============================================================

const BASE_PRICES: Record<ResourceType, number> = {
  wood: 3,
  clay: 3,
  wheat: 3,
  sheep: 3,
  ore: 4,
  stone: 4,
  coal: 4,
  gold: 8,
  fish: 2,
  spice: 6,
  water: 1,
  herbs: 3,
  fur: 5,
  gems: 10,
  obsidian: 8,
  amber: 6,
  lumber: 5,
  brick: 5,
  flour: 4,
  bread: 3,
  cloth: 5,
  iron: 6,
  steel: 9,
  glass: 7,
  tools: 5,
  weapons: 12,
  armor: 14,
  paper: 4,
  books: 8,
  coins: 1,
  gems_cut: 15,
  medicine: 8,
  gunpowder: 10,
  cannon_ball: 8,
  ship_material: 12,
  faith: 0,
  science: 0,
  culture: 0,
  influence: 0,
};

export function initializeMarket(): ResourceMarket {
  return {
    prices: { ...BASE_PRICES },
    supply: Object.fromEntries(Object.keys(BASE_PRICES).map((k) => [k, 100])) as Record<
      ResourceType,
      number
    >,
    demand: Object.fromEntries(Object.keys(BASE_PRICES).map((k) => [k, 0])) as Record<
      ResourceType,
      number
    >,
    history: [],
  };
}

export function updateMarketPrices(market: ResourceMarket, turn: number): ResourceMarket {
  const newPrices = { ...market.prices };

  for (const res of Object.keys(newPrices) as ResourceType[]) {
    const supply = market.supply[res] ?? 100;
    const demand = market.demand[res] ?? 0;
    const base = BASE_PRICES[res] ?? 1;

    if (supply === 0) {
      // Aucune offre = prix max
      newPrices[res] = base * 3;
    } else {
      const ratio = demand / supply;
      // Prix fluctue ±40% autour de la base
      const fluctuation = Math.min(1.4, Math.max(0.6, 1 + (ratio - 1) * 0.3));
      newPrices[res] = Math.round(base * fluctuation);
    }
  }

  return {
    ...market,
    prices: newPrices,
    demand: Object.fromEntries(Object.keys(newPrices).map((k) => [k, 0])) as Record<
      ResourceType,
      number
    >,
  };
}

export function tradeWithBank(
  player: Player,
  offer: ResourceBundle,
  request: ResourceBundle,
  tradeRatio: number = 4,
): { success: boolean; reason?: string } {
  if (!hasResources(player.resources, offer)) {
    return { success: false, reason: 'Ressources insuffisantes' };
  }

  const offerTotal = totalResources(offer);
  const requestTotal = totalResources(request);

  if (offerTotal < requestTotal * tradeRatio) {
    return { success: false, reason: `Ratio insuffisant (${tradeRatio}:1 requis)` };
  }

  return { success: true };
}

/**
 * Enregistre une transaction dans le marché pour ajuster l'offre/demande.
 * À appeler après chaque échange validé (banque ou joueur à joueur).
 */
export function recordTradeInMarket(
  market: ResourceMarket,
  sold: ResourceBundle,
  bought: ResourceBundle,
): ResourceMarket {
  const newSupply = { ...market.supply };
  const newDemand = { ...market.demand };

  // Ce qui est vendu augmente l'offre
  for (const [res, amount] of Object.entries(sold) as [ResourceType, number][]) {
    newSupply[res] = Math.max(0, (newSupply[res] ?? 100) + amount);
  }

  // Ce qui est acheté augmente la demande et réduit l'offre
  for (const [res, amount] of Object.entries(bought) as [ResourceType, number][]) {
    newDemand[res] = (newDemand[res] ?? 0) + amount;
    newSupply[res] = Math.max(0, (newSupply[res] ?? 100) - amount);
  }

  return { ...market, supply: newSupply, demand: newDemand };
}

export function getPortTradeRatio(
  player: Player,
  resource: ResourceType,
  state: GameState,
  opts?: { ignorePortCharter?: boolean },
): number {
  let ratio = 4;
  for (const entry of player.ports) {
    const direct = normalizePortType(
      entry === 'generic_3:1' || entry.endsWith('_2:1')
        ? (entry as import('../../types/hex').PortType)
        : null,
    );
    if (direct === `${resource}_2:1`) ratio = Math.min(ratio, 2);
    if (direct === 'generic_3:1') ratio = Math.min(ratio, 3);

    // Legacy : id de tuile
    const tile = state.map.get(entry);
    if (!tile?.port) continue;
    const port = normalizePortType(tile.port);
    if (port === `${resource}_2:1`) ratio = Math.min(ratio, 2);
    if (port === 'generic_3:1') ratio = Math.min(ratio, 3);
  }

  const councilTrade = state.worldCouncil?.activeEffects?.find(
    (effect) => effect.kind === 'trade_ratio' && effect.expiresTurn >= state.currentTurn,
  );
  if (councilTrade) {
    const councilRatio = Number(councilTrade.data?.ratio ?? 3);
    ratio = Math.min(ratio, councilRatio);
  }

  // Marchand C&K : 2:1 sur la ressource classique du terrain
  const merchant = state.extensions?.citiesKnights?.merchant;
  if (merchant?.ownerId === player.id && merchant.tileId) {
    const tile = state.map.get(merchant.tileId);
    const classic: ResourceType[] = ['wood', 'clay', 'wheat', 'sheep', 'ore'];
    let best: ResourceType | null = null;
    let bestAmount = 0;
    for (const res of classic) {
      const amount = tile?.baseProduction?.[res] ?? 0;
      if (amount > bestAmount) {
        bestAmount = amount;
        best = res;
      }
    }
    if (best === resource && bestAmount > 0) ratio = Math.min(ratio, 2);
  }

  // Flotte marchande
  const fleet = state.extensions?.citiesKnights?.progressBuffs?.merchantFleet;
  if (
    fleet?.playerId === player.id &&
    fleet.kind === 'resource' &&
    fleet.key === resource
  ) {
    ratio = Math.min(ratio, 2);
  }

  // Résolutions Pactes & Ambassades (ratio banque)
  const peResolutions = state.extensions?.pactsEmbassies?.activeResolutions;
  if (peResolutions) {
    for (const r of peResolutions) {
      if (r.effectId === 'trade_ratio_bank_3') ratio = Math.min(ratio, 3);
      if (r.effectId === 'trade_ratio_bank_2') ratio = Math.min(ratio, 2);
    }
  }

  // Charte portuaire : 3:1 via allié (aperçu ; consommation dans bankTrade)
  if (!opts?.ignorePortCharter && ratio > 3) {
    if (peekPortCharterAlly(state, player.id)) {
      ratio = Math.min(ratio, 3);
    }
  }

  return ratio;
}

/** Indique si le meilleur ratio du joueur vient d’un port générique (pas 2:1 spécialisé). */
export function playerUsesGenericPortOnly(
  player: Player,
  resource: ResourceType,
  state: GameState,
): boolean {
  let hasSpecial = false;
  let hasGeneric = false;
  for (const entry of player.ports) {
    const direct = normalizePortType(
      entry === 'generic_3:1' || entry.endsWith('_2:1')
        ? (entry as import('../../types/hex').PortType)
        : null,
    );
    if (direct === `${resource}_2:1`) hasSpecial = true;
    if (direct === 'generic_3:1') hasGeneric = true;
    const tile = state.map.get(entry);
    const port = normalizePortType(tile?.port);
    if (port === `${resource}_2:1`) hasSpecial = true;
    if (port === 'generic_3:1') hasGeneric = true;
  }
  return hasGeneric && !hasSpecial;
}

// ============================================================
// MAINTENANCE & DÉPENSES
// ============================================================

export function calculateMaintenanceCost(player: Player, state: GameState): ResourceBundle {
  const total: ResourceBundle = {};

  // Maintenance des unités (nourriture/tour)
  for (const unitId of player.units) {
    const unit = state.units.get(unitId);
    if (!unit) continue;
    total.bread = (total.bread ?? 0) + 1;
    if (['knight', 'heavy_cavalry', 'cataphract'].includes(unit.type)) {
      total.sheep = (total.sheep ?? 0) + 1; // fourrage
    }
  }

  // Maintenance des bâtiments — lire depuis les définitions
  const allBuildingIds = [...state.buildings.keys()];
  const buildingMaint = calcBuildingMaint(allBuildingIds, state.buildings, player.id);
  for (const [res, amount] of Object.entries(buildingMaint) as [ResourceType, number][]) {
    total[res] = (total[res] ?? 0) + amount;
  }

  return total;
}

// ============================================================
// STOCKAGE & CAPACITÉ
// ============================================================

export function capResources(resources: ResourceBundle, caps: ResourceBundle): ResourceBundle {
  const capped = { ...resources };
  for (const [res, cap] of Object.entries(caps) as [ResourceType, number][]) {
    if (capped[res] !== undefined && capped[res]! > cap) {
      capped[res] = cap;
    }
  }
  return capped;
}

export function defaultResourceCap(hasTech: (id: string) => boolean): ResourceBundle {
  let cap = 10;
  if (hasTech('pottery')) cap += 5;
  if (hasTech('warehouse')) cap += 10;
  if (hasTech('granary')) cap += 5;

  const allResources = Object.keys(BASE_PRICES) as ResourceType[];
  return Object.fromEntries(allResources.map((r) => [r, cap])) as ResourceBundle;
}
