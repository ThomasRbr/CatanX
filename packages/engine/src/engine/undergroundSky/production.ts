/**
 * Production souterraine au lancer de dés.
 */

import type { GameState } from '../../types/game';
import type { ResourceBundle, ResourceType } from '../../types/resources';
import type { UndergroundSkyMaterialBundle } from '../../types/undergroundSky';
import { isUndergroundSkyEnabled } from '../../core/extensions';
import {
  CLASSIC_RESOURCE_TYPES,
  ensureLimitedBank,
  usesLimitedBank,
} from '../catan/ClassicBoard';
import { addResources } from '../resources/ResourceSystem';
import { US_DISCOVERY_OUTPUT } from './catalog';
import { queueUndergroundSkyEvents } from './events';
import { syncPublicMaterialCounts } from './materials';
import { ensureUndergroundSkyState } from './state';

export interface UndergroundProductionGrant {
  playerId: string;
  outpostId: string;
  nodeId: string;
  resources: ResourceBundle;
  materials: UndergroundSkyMaterialBundle;
}

/**
 * Avant-postes produisent 1 ; extracteurs 2.
 * Pénurie banque classique + matériaux (règle Catan).
 */
export function applyUndergroundProduction(
  state: GameState,
  diceTotal: number,
): UndergroundProductionGrant[] {
  if (!isUndergroundSkyEnabled(state)) return [];
  const us = ensureUndergroundSkyState(state);
  if (!us || diceTotal === 7) return [];

  const pending: UndergroundProductionGrant[] = [];

  for (const outpost of us.outposts) {
    const node = us.undergroundGraph.nodes[outpost.nodeId];
    if (!node || node.numberToken !== diceTotal) continue;

    let resource: ResourceType | null = null;
    let materialKey: keyof UndergroundSkyMaterialBundle | null = null;

    if (node.discovery === 'thermal_spring') {
      resource = node.thermalChoice;
      if (!resource) continue;
    } else {
      const output = US_DISCOVERY_OUTPUT[node.discovery];
      if (!output) continue;
      if (output === 'us_crystal' || output === 'us_aether') {
        materialKey = output;
      } else {
        resource = output;
      }
    }

    const amount = outpost.upgradedExtractor ? 2 : 1;
    pending.push({
      playerId: outpost.playerId,
      outpostId: outpost.id,
      nodeId: outpost.nodeId,
      resources: resource ? { [resource]: amount } : {},
      materials: materialKey ? { [materialKey]: amount } : {},
    });
  }

  if (pending.length === 0) return [];

  // Ressources classiques — pénurie Catan
  if (usesLimitedBank(state)) {
    ensureLimitedBank(state);
    for (const res of CLASSIC_RESOURCE_TYPES) {
      const entitled = pending.filter((p) => (p.resources[res] ?? 0) > 0);
      if (entitled.length === 0) continue;
      const totalNeeded = entitled.reduce(
        (s, p) => s + (p.resources[res] ?? 0),
        0,
      );
      const available = state.bank?.[res] ?? 0;
      if (available >= totalNeeded) {
        if (state.bank) state.bank[res] = available - totalNeeded;
        continue;
      }
      if (entitled.length > 1) {
        for (const p of entitled) delete p.resources[res];
        continue;
      }
      const only = entitled[0]!;
      const give = Math.min(available, only.resources[res] ?? 0);
      if (give <= 0) delete only.resources[res];
      else {
        only.resources[res] = give;
        if (state.bank) state.bank[res] = available - give;
      }
    }
  }

  // Matériaux — même règle (chaque ligne pending = bénéficiaire)
  for (const key of ['us_crystal', 'us_aether'] as const) {
    const entitled = pending.filter((p) => (p.materials[key] ?? 0) > 0);
    if (entitled.length === 0) continue;
    const totalNeeded = entitled.reduce(
      (s, p) => s + (p.materials[key] ?? 0),
      0,
    );
    const available = us.materialBank[key] ?? 0;
    if (available >= totalNeeded) {
      us.materialBank[key] = available - totalNeeded;
      continue;
    }
    if (entitled.length > 1) {
      for (const p of entitled) delete p.materials[key];
      continue;
    }
    const only = entitled[0]!;
    const give = Math.min(available, only.materials[key] ?? 0);
    if (give <= 0) delete only.materials[key];
    else {
      only.materials[key] = give;
      us.materialBank[key] = available - give;
    }
  }

  const delivered: UndergroundProductionGrant[] = [];
  for (const grant of pending) {
    const player = state.players.get(grant.playerId);
    if (!player) continue;
    const hasRes = Object.values(grant.resources).some((v) => (v ?? 0) > 0);
    const hasMat = Object.values(grant.materials).some((v) => (v ?? 0) > 0);
    if (!hasRes && !hasMat) continue;

    if (hasRes) {
      player.resources = addResources(player.resources, grant.resources);
    }
    if (hasMat) {
      const hand = us.playerMaterials[grant.playerId] ?? {};
      for (const [k, v] of Object.entries(grant.materials)) {
        if ((v ?? 0) <= 0) continue;
        const key = k as keyof UndergroundSkyMaterialBundle;
        hand[key] = (hand[key] ?? 0) + (v ?? 0);
      }
      us.playerMaterials[grant.playerId] = hand;
    }
    delivered.push(grant);
  }

  syncPublicMaterialCounts(us);
  if (delivered.length > 0) {
    queueUndergroundSkyEvents(state, [
      {
        type: 'us_underground_production',
        payload: {
          grants: delivered.map((g) => ({
            playerId: g.playerId,
            outpostId: g.outpostId,
            nodeId: g.nodeId,
            resources: g.resources,
            materials: g.materials,
          })),
        },
      },
    ]);
  }
  return delivered;
}

/** True si le joueur a produit quelque chose sous terre ce lancer (Aqueduc). */
export function playerProducedUnderground(
  grants: UndergroundProductionGrant[],
  playerId: string,
): boolean {
  return grants.some((g) => g.playerId === playerId);
}
