/**
 * Crises du Conseil — contributions et résolution.
 */

import type { GameState } from '../../types/game';
import type { PactsEmbassiesState, PeCrisisContribution } from '../../types/pactsEmbassies';
import type { ResourceType } from '../../types/resources';
import type { CkCommodity } from '../../types/citiesKnights';
import type { UndergroundSkyMaterial } from '../../types/undergroundSky';
import { hasResources, subtractResources } from '../resources/ResourceSystem';
import { returnResourcesToBank } from '../catan/ClassicBoard';
import { isCitiesKnightsEnabled, isUndergroundSkyEnabled } from '../../core/extensions';
import { getCrisisById } from './catalog/crises';
import { addInfluence } from './influence';
import { addReputation } from './reputation';
import { queuePeEvents } from './events';
import { PE_RESOLUTION_DURATION_ROUNDS } from '../../types/pactsEmbassies';

function contributionPoints(c: PeCrisisContribution): number {
  return c.classicPoints + c.commodityPoints + c.materialPoints;
}

export function contributeToCrisis(
  state: GameState,
  pe: PactsEmbassiesState,
  playerId: string,
  classic?: Partial<Record<ResourceType, number>>,
  commodities?: Partial<Record<CkCommodity, number>>,
  materials?: Partial<Record<UndergroundSkyMaterial, number>>,
): { ok: true } | { ok: false; reason: string } {
  const crisis = pe.crisis;
  if (!crisis || crisis.resolved) {
    return { ok: false, reason: 'Aucune crise active.' };
  }

  const player = state.players.get(playerId);
  if (!player) return { ok: false, reason: 'Joueur inconnu.' };

  let classicPoints = 0;
  const classicSpend: Partial<Record<ResourceType, number>> = {};
  for (const [k, v] of Object.entries(classic ?? {})) {
    const n = Math.max(0, Math.floor(v ?? 0));
    if (n <= 0) continue;
    classicSpend[k as ResourceType] = n;
    classicPoints += n;
  }

  let commodityPoints = 0;
  const commoditySpend: Partial<Record<CkCommodity, number>> = {};
  if (commodities && isCitiesKnightsEnabled(state)) {
    for (const [k, v] of Object.entries(commodities)) {
      const n = Math.max(0, Math.floor(v ?? 0));
      if (n <= 0) continue;
      commoditySpend[k as CkCommodity] = n;
      commodityPoints += n * 2;
    }
  }

  let materialPoints = 0;
  const materialSpend: Partial<Record<UndergroundSkyMaterial, number>> = {};
  if (materials && isUndergroundSkyEnabled(state)) {
    for (const [k, v] of Object.entries(materials)) {
      const n = Math.max(0, Math.floor(v ?? 0));
      if (n <= 0) continue;
      materialSpend[k as UndergroundSkyMaterial] = n;
      materialPoints += n * 2;
    }
  }

  const addPoints = classicPoints + commodityPoints + materialPoints;
  if (addPoints <= 0) return { ok: false, reason: 'Contribution vide.' };

  const existing = crisis.contributions.find((c) => c.playerId === playerId);
  const already = existing ? contributionPoints(existing) : 0;
  const maxPerPlayer = Math.floor(crisis.objective / 2);
  if (already + addPoints > maxPerPlayer) {
    return {
      ok: false,
      reason: `Maximum ${maxPerPlayer} points par joueur (déjà ${already}).`,
    };
  }

  if (Object.keys(classicSpend).length > 0) {
    if (!hasResources(player.resources, classicSpend)) {
      return { ok: false, reason: 'Ressources insuffisantes.' };
    }
  }

  if (Object.keys(classicSpend).length > 0) {
    player.resources = subtractResources(player.resources, classicSpend);
    returnResourcesToBank(state, classicSpend);
  }

  if (Object.keys(commoditySpend).length > 0) {
    const ck = state.extensions?.citiesKnights;
    const bundle = ck?.playerCommodities[playerId];
    if (!ck || !bundle) return { ok: false, reason: 'Marchandises indisponibles.' };
    for (const [k, n] of Object.entries(commoditySpend)) {
      const key = k as CkCommodity;
      if ((bundle[key] ?? 0) < (n ?? 0)) {
        return { ok: false, reason: 'Marchandises insuffisantes.' };
      }
    }
    for (const [k, n] of Object.entries(commoditySpend)) {
      const key = k as CkCommodity;
      bundle[key] = (bundle[key] ?? 0) - (n ?? 0);
    }
  }

  if (Object.keys(materialSpend).length > 0) {
    const us = state.extensions?.undergroundSky;
    const bundle = us?.playerMaterials[playerId];
    if (!us || !bundle) return { ok: false, reason: 'Matériaux indisponibles.' };
    for (const [k, n] of Object.entries(materialSpend)) {
      const key = k as UndergroundSkyMaterial;
      if ((bundle[key] ?? 0) < (n ?? 0)) {
        return { ok: false, reason: 'Matériaux insuffisants.' };
      }
    }
    for (const [k, n] of Object.entries(materialSpend)) {
      const key = k as UndergroundSkyMaterial;
      bundle[key] = (bundle[key] ?? 0) - (n ?? 0);
    }
  }

  if (existing) {
    existing.classicPoints += classicPoints;
    existing.commodityPoints += commodityPoints;
    existing.materialPoints += materialPoints;
  } else {
    crisis.contributions.push({
      playerId,
      classicPoints,
      commodityPoints,
      materialPoints,
    });
  }

  queuePeEvents(state, [
    {
      type: 'pe_crisis_contribution',
      payload: { playerId, points: addPoints, crisisId: crisis.crisisId },
    },
  ]);
  return { ok: true };
}

export function resolveCrisisIfReady(
  state: GameState,
  pe: PactsEmbassiesState,
): void {
  const crisis = pe.crisis;
  if (!crisis || crisis.resolved) return;

  // Résolu en fin de session conseil
  const total = crisis.contributions.reduce((s, c) => s + contributionPoints(c), 0);
  const success = total >= crisis.objective;
  crisis.resolved = true;
  crisis.success = success;

  const def = getCrisisById(crisis.crisisId);

  if (success) {
    for (const c of crisis.contributions) {
      if (contributionPoints(c) >= 2) {
        addInfluence(pe, c.playerId, 1);
        addReputation(pe, c.playerId, 1);
        const ps = pe.players[c.playerId];
        if (ps) ps.crisisContributionsSufficient += 1;
      }
    }
  } else {
    // Cartes déjà dépensées ; Influence conservée ; pénalité légère 4 rondes
    if (def) {
      pe.mildPenalties.push({
        id: `pen_${crisis.id}`,
        effectId: def.mildPenaltyEffectId,
        expiresAtRound: pe.globalRound + PE_RESOLUTION_DURATION_ROUNDS,
      });
    }
  }

  queuePeEvents(state, [
    {
      type: 'pe_crisis_resolved',
      payload: { crisisId: crisis.crisisId, success, total, objective: crisis.objective },
    },
  ]);
}
