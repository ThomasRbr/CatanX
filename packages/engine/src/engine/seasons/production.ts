/**
 * Production saisonnière — pénalités villes + abondance (+1 favorisée).
 *
 * Ordre autoritaire (appelé depuis rollDice) :
 * 1. production normale (sans multiplicateurs)
 * 2. conversion CK (externe)
 * 3. pénalités climat (ici)
 * 4. banque classique (externe si pas encore appliquée)
 * 5–6. éligibilité + bonus (ici)
 */

import type { GameState } from '../../types/game';
import type { ResourceBundle, ResourceType } from '../../types/resources';
import type { ClassicResourceType } from '../catan/ClassicBoard';
import {
  CLASSIC_RESOURCE_TYPES,
  takeResourcesFromBank,
  usesLimitedBank,
} from '../catan/ClassicBoard';
import type { CollectionResult } from '../resources/ResourceSystem';
import { addResources, resolveBuildingProductionTileIds } from '../resources/ResourceSystem';
import { isSeasonsEnabled } from '../../core/extensions';
import { getClimateDefinition, getGenerousAbundanceOnceAmount } from './definitions';
import { getCityProductionPenalties } from './costs';

export interface SeasonalBonusAward {
  playerId: string;
  resources: ResourceBundle;
}

/**
 * Retire jusqu'au montant défini par le climat sur chaque ressource pénalisée
 * issue des villes/métropoles. Les colonies ne sont jamais touchées.
 *
 * Appelé APRÈS conversion CK : les collections ne contiennent plus la
 * ressource convertie en marchandise.
 */
export function applyClimateProductionPenalties(
  state: GameState,
  collections: CollectionResult[],
  diceValue: number,
): void {
  if (!isSeasonsEnabled(state)) return;
  const penalties = getCityProductionPenalties(state);
  if (Object.keys(penalties).length === 0) return;

  for (const result of collections) {
    // Calculer la part « ville/métropole » produite ce lancer pour ce joueur
    const cityShare = cityClassicProductionShare(state, result.playerId, diceValue);
    const shelter = state.extensions?.seasons?.preparations[result.playerId] === 'shelter';
    const shelterUses = state.extensions?.seasons?.preparationUses[result.playerId];
    const shelterWouldApply = CLASSIC_RESOURCE_TYPES.some((res) => {
      const penalty = penalties[res] ?? 0;
      return penalty > 0 && (cityShare[res] ?? 0) > 0 && (result.resources[res] ?? 0) > 0;
    });
    if (shelter && shelterUses && !shelterUses.shelterUsed && shelterWouldApply) {
      shelterUses.shelterUsed = true;
      continue;
    }
    for (const res of CLASSIC_RESOURCE_TYPES) {
      const pen = penalties[res] ?? 0;
      if (pen <= 0) continue;
      const cityAmt = cityShare[res] ?? 0;
      if (cityAmt <= 0) continue;
      const remove = Math.min(pen, cityAmt, result.resources[res] ?? 0);
      if (remove > 0) {
        result.resources[res] = (result.resources[res] ?? 0) - remove;
        if ((result.resources[res] ?? 0) <= 0) delete result.resources[res];
      }
    }
  }
}

function cityClassicProductionShare(
  state: GameState,
  playerId: string,
  diceValue: number,
): ResourceBundle {
  const share: ResourceBundle = {};
  for (const [, building] of state.buildings) {
    if (building.ownerId !== playerId) continue;
    if (building.definitionId !== 'city' && building.definitionId !== 'metropolis') {
      continue;
    }
    const tileIds = resolveBuildingProductionTileIds(state, building);
    for (const tileId of tileIds) {
      const tile = state.map.get(tileId);
      if (!tile || tile.diceValue !== diceValue || tile.robber) continue;
      const mult = building.definitionId === 'metropolis' ? 3 : 2;
      for (const res of CLASSIC_RESOURCE_TYPES) {
        const base = tile.baseProduction[res] ?? 0;
        if (base > 0) {
          share[res] = (share[res] ?? 0) + base * mult;
        }
      }
    }
  }
  return share;
}

/**
 * Distribue les bonus d’abondance après résolution banque de la production normale.
 * Pénurie bonus : si la banque ne peut pas servir tous les réclamants d’une
 * ressource, aucun de ces bonus n’est distribué (production normale intacte).
 */
export function applySeasonalAbundanceBonuses(
  state: GameState,
  collections: CollectionResult[],
): { awards: SeasonalBonusAward[]; events: { type: string; payload: Record<string, unknown> }[] } {
  const awards: SeasonalBonusAward[] = [];
  const events: { type: string; payload: Record<string, unknown> }[] = [];
  if (!isSeasonsEnabled(state)) return { awards, events };

  const seasons = state.extensions?.seasons;
  if (!seasons) return { awards, events };

  const def = getClimateDefinition(seasons.currentClimateId);
  const [favA, favB] = def.favoredResources;

  type Claim = {
    playerId: string;
    resources: Partial<Record<ClassicResourceType, number>>;
    usedHarvest: boolean;
  };
  const claims: Claim[] = [];

  for (const result of collections) {
    const playerId = result.playerId;
    const prep = seasons.preparations[playerId];
    const prepUses = seasons.preparationUses[playerId];
    const climateUses = seasons.climateUses[playerId];
    const producedA = (result.resources[favA] ?? 0) > 0;
    const producedB = (result.resources[favB] ?? 0) > 0;
    const adaptationTarget = seasons.preparationTargets[playerId];
    const adaptationActive =
      prep === 'harvest' &&
      Boolean(adaptationTarget) &&
      Boolean(prepUses && !prepUses.harvestUsed) &&
      (result.resources[adaptationTarget!] ?? 0) > 0;
    if (!producedA && !producedB && !adaptationActive) continue;

    // Base : +1. Climats généreux : premier bonus du climat à +2 (ou amount).
    // Adaptation : +1 une fois sur la ressource de terrain choisie.
    const generousAmount = getGenerousAbundanceOnceAmount(seasons.currentClimateId);
    const firstBonus = !climateUses?.firstSeasonalBonusClaimed;
    let amount = 1;
    if (generousAmount != null && firstBonus) {
      amount = generousAmount;
    }
    const claimResources: Partial<Record<ClassicResourceType, number>> = {};
    if (producedA || producedB) {
      const chosen: ClassicResourceType = producedA ? favA : favB;
      claimResources[chosen] = amount;
    }
    if (adaptationActive && adaptationTarget) {
      claimResources[adaptationTarget] = (claimResources[adaptationTarget] ?? 0) + 1;
    }

    claims.push({ playerId, resources: claimResources, usedHarvest: adaptationActive });
  }

  // Grouper par ressource pour résoudre les pénuries
  const demandByRes: Record<string, Claim[]> = {};
  for (const claim of claims) {
    for (const res of Object.keys(claim.resources) as ClassicResourceType[]) {
      if (!demandByRes[res]) demandByRes[res] = [];
      demandByRes[res]!.push(claim);
    }
  }

  const granted: Record<string, ResourceBundle> = {};
  const blockedResources = new Set<ClassicResourceType>();

  for (const res of Object.keys(demandByRes) as ClassicResourceType[]) {
    const claimants = demandByRes[res]!;
    const totalNeed = claimants.reduce((s, c) => s + (c.resources[res] ?? 0), 0);
    if (usesLimitedBank(state)) {
      const stock = state.bank?.[res] ?? 0;
      if (stock < totalNeed) {
        blockedResources.add(res);
        continue;
      }
    }
    for (const claim of claimants) {
      const amt = claim.resources[res] ?? 0;
      if (amt <= 0) continue;
      if (!granted[claim.playerId]) granted[claim.playerId] = {};
      granted[claim.playerId]![res] = (granted[claim.playerId]![res] ?? 0) + amt;
    }
  }

  for (const claim of claims) {
    const playerId = claim.playerId;
    const bundle = granted[playerId];
    if (!bundle) continue;

    // Retirer les ressources bloquées (claims mono)
    for (const res of Object.keys(claim.resources) as ClassicResourceType[]) {
      if (blockedResources.has(res)) {
        delete bundle[res];
      }
    }
    if (Object.keys(bundle).length === 0) {
      delete granted[playerId];
      continue;
    }

    // Débiter banque + marquer usages (uniquement sur ce qui est réellement accordé)
    if (usesLimitedBank(state)) {
      takeResourcesFromBank(state, bundle);
    }
    const player = state.players.get(playerId);
    if (player) {
      player.resources = addResources(player.resources, bundle);
      const gained = Object.values(bundle).reduce((s, v) => s + (v ?? 0), 0);
      player.stats.totalResourcesCollected += gained;
    }

    const uses = seasons.climateUses[playerId];
    if (uses) {
      uses.firstSeasonalBonusClaimed = true;
    }
    const prep = seasons.preparations[playerId];
    const prepUses = seasons.preparationUses[playerId];
    if (claim.usedHarvest && prep === 'harvest' && prepUses && !prepUses.harvestUsed) {
      prepUses.harvestUsed = true;
    }

    awards.push({ playerId, resources: bundle });
    events.push({
      type: 'seasonal_bonus_awarded',
      payload: {
        playerId,
        resources: bundle,
        climateId: seasons.currentClimateId,
      },
    });
  }

  return { awards, events };
}

/** Ressources classiques produites (après pénalités) pour un joueur. */
export function classicProducedResources(
  collection: CollectionResult | undefined,
): Set<ClassicResourceType> {
  const set = new Set<ClassicResourceType>();
  if (!collection) return set;
  for (const res of CLASSIC_RESOURCE_TYPES) {
    if ((collection.resources[res] ?? 0) > 0) set.add(res);
  }
  return set;
}

export type { ResourceType };
