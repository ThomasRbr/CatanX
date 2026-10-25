/**
 * Matériaux Cristal / Éther — banque, main, pénurie, échanges.
 */

import type { GameState } from '../../types/game';
import type {
  UndergroundSkyMaterial,
  UndergroundSkyMaterialBundle,
  UndergroundSkyState,
} from '../../types/undergroundSky';
import { US_MATERIALS, emptyMaterialBundle } from '../../types/undergroundSky';
import { isUndergroundSkyEnabled } from '../../core/extensions';

export function totalMaterials(bundle: UndergroundSkyMaterialBundle): number {
  let sum = 0;
  for (const key of US_MATERIALS) {
    sum += bundle[key] ?? 0;
  }
  return sum;
}

export function hasMaterials(
  bundle: UndergroundSkyMaterialBundle,
  required: UndergroundSkyMaterialBundle,
): boolean {
  for (const key of US_MATERIALS) {
    if ((bundle[key] ?? 0) < (required[key] ?? 0)) return false;
  }
  return true;
}

export function addMaterials(
  base: UndergroundSkyMaterialBundle,
  add: UndergroundSkyMaterialBundle,
): UndergroundSkyMaterialBundle {
  const result: UndergroundSkyMaterialBundle = { ...base };
  for (const key of US_MATERIALS) {
    const amount = add[key] ?? 0;
    if (amount <= 0) continue;
    result[key] = (result[key] ?? 0) + amount;
  }
  return result;
}

export function subtractMaterials(
  base: UndergroundSkyMaterialBundle,
  sub: UndergroundSkyMaterialBundle,
): UndergroundSkyMaterialBundle {
  const result: UndergroundSkyMaterialBundle = { ...base };
  for (const key of US_MATERIALS) {
    const amount = sub[key] ?? 0;
    if (amount <= 0) continue;
    const next = Math.max(0, (result[key] ?? 0) - amount);
    if (next <= 0) delete result[key];
    else result[key] = next;
  }
  return result;
}

export function syncPublicMaterialCounts(us: UndergroundSkyState): void {
  for (const playerId of Object.keys(us.playerMaterials)) {
    us.publicMaterialCounts[playerId] = totalMaterials(
      us.playerMaterials[playerId] ?? emptyMaterialBundle(),
    );
  }
}

export function getPlayerMaterials(
  us: UndergroundSkyState,
  playerId: string,
): UndergroundSkyMaterialBundle {
  if (!us.playerMaterials[playerId]) {
    us.playerMaterials[playerId] = emptyMaterialBundle();
  }
  return us.playerMaterials[playerId]!;
}

export function grantMaterialsFromBank(
  us: UndergroundSkyState,
  playerId: string,
  grant: UndergroundSkyMaterialBundle,
): UndergroundSkyMaterialBundle {
  const taken: UndergroundSkyMaterialBundle = {};
  const hand = getPlayerMaterials(us, playerId);
  for (const key of US_MATERIALS) {
    const want = grant[key] ?? 0;
    if (want <= 0) continue;
    const available = us.materialBank[key] ?? 0;
    const give = Math.min(want, available);
    if (give <= 0) continue;
    us.materialBank[key] = available - give;
    taken[key] = give;
    hand[key] = (hand[key] ?? 0) + give;
  }
  us.playerMaterials[playerId] = hand;
  syncPublicMaterialCounts(us);
  return taken;
}

export function returnMaterialsToBank(
  us: UndergroundSkyState,
  materials: UndergroundSkyMaterialBundle,
): void {
  for (const key of US_MATERIALS) {
    const amount = materials[key] ?? 0;
    if (amount <= 0) continue;
    us.materialBank[key] = (us.materialBank[key] ?? 0) + amount;
  }
}

export function spendPlayerMaterials(
  us: UndergroundSkyState,
  playerId: string,
  cost: UndergroundSkyMaterialBundle,
): boolean {
  const hand = getPlayerMaterials(us, playerId);
  if (!hasMaterials(hand, cost)) return false;
  us.playerMaterials[playerId] = subtractMaterials(hand, cost);
  returnMaterialsToBank(us, cost);
  syncPublicMaterialCounts(us);
  return true;
}

/**
 * Pénurie banque Catan : plusieurs bénéficiaires → personne ;
 * un seul → reçoit le stock disponible.
 */
export function applyMaterialBankScarcity(
  us: UndergroundSkyState,
  pending: Array<{ playerId: string; materials: UndergroundSkyMaterialBundle }>,
): Array<{ playerId: string; materials: UndergroundSkyMaterialBundle }> {
  const granted: Array<{
    playerId: string;
    materials: UndergroundSkyMaterialBundle;
  }> = pending.map((p) => ({
    playerId: p.playerId,
    materials: { ...p.materials },
  }));

  for (const key of US_MATERIALS) {
    const entitled = granted.filter((g) => (g.materials[key] ?? 0) > 0);
    if (entitled.length === 0) continue;
    const totalNeeded = entitled.reduce(
      (sum, g) => sum + (g.materials[key] ?? 0),
      0,
    );
    const available = us.materialBank[key] ?? 0;
    if (available >= totalNeeded) {
      us.materialBank[key] = available - totalNeeded;
      continue;
    }
    if (entitled.length > 1) {
      for (const g of entitled) {
        delete g.materials[key];
      }
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

  return granted.filter((g) => totalMaterials(g.materials) > 0);
}

export function materialHandCount(
  state: GameState,
  playerId: string,
): number {
  if (!isUndergroundSkyEnabled(state)) return 0;
  const us = state.extensions?.undergroundSky;
  if (!us) return 0;
  return totalMaterials(us.playerMaterials[playerId] ?? {});
}

/** Défausse aléatoire d’un matériau (brigand / 7). */
export function discardRandomMaterial(
  us: UndergroundSkyState,
  playerId: string,
  pickIndex: number,
): UndergroundSkyMaterial | null {
  const hand = getPlayerMaterials(us, playerId);
  const bag: UndergroundSkyMaterial[] = [];
  for (const key of US_MATERIALS) {
    for (let i = 0; i < (hand[key] ?? 0); i += 1) bag.push(key);
  }
  if (bag.length === 0) return null;
  const idx = ((pickIndex % bag.length) + bag.length) % bag.length;
  const chosen = bag[idx]!;
  us.playerMaterials[playerId] = subtractMaterials(hand, { [chosen]: 1 });
  returnMaterialsToBank(us, { [chosen]: 1 });
  syncPublicMaterialCounts(us);
  return chosen;
}

/** Vol d’un matériau (brigand). */
export function stealMaterial(
  us: UndergroundSkyState,
  fromPlayerId: string,
  toPlayerId: string,
  pickIndex: number,
): UndergroundSkyMaterial | null {
  const hand = getPlayerMaterials(us, fromPlayerId);
  const bag: UndergroundSkyMaterial[] = [];
  for (const key of US_MATERIALS) {
    for (let i = 0; i < (hand[key] ?? 0); i += 1) bag.push(key);
  }
  if (bag.length === 0) return null;
  const idx = ((pickIndex % bag.length) + bag.length) % bag.length;
  const chosen = bag[idx]!;
  us.playerMaterials[fromPlayerId] = subtractMaterials(hand, { [chosen]: 1 });
  const toHand = getPlayerMaterials(us, toPlayerId);
  us.playerMaterials[toPlayerId] = addMaterials(toHand, { [chosen]: 1 });
  syncPublicMaterialCounts(us);
  return chosen;
}

/**
 * Ratio banque matériaux : 4:1, ou 3:1 avec port générique.
 * Pas de port spécialisé 2:1.
 */
export function getMaterialBankTradeRatio(
  state: GameState,
  playerId: string,
): number {
  const player = state.players.get(playerId);
  if (!player) return 4;
  if (player.ports.includes('generic_3:1')) return 3;
  return 4;
}

export function canBankTradeMaterial(
  us: UndergroundSkyState,
  playerId: string,
  give: UndergroundSkyMaterial,
  receive: UndergroundSkyMaterial,
  ratio: number,
): boolean {
  if (give === receive) return false;
  const hand = getPlayerMaterials(us, playerId);
  if ((hand[give] ?? 0) < ratio) return false;
  if ((us.materialBank[receive] ?? 0) < 1) return false;
  return true;
}

export function executeBankTradeMaterial(
  us: UndergroundSkyState,
  playerId: string,
  give: UndergroundSkyMaterial,
  receive: UndergroundSkyMaterial,
  ratio: number,
): boolean {
  if (!canBankTradeMaterial(us, playerId, give, receive, ratio)) return false;
  const hand = getPlayerMaterials(us, playerId);
  us.playerMaterials[playerId] = subtractMaterials(hand, { [give]: ratio });
  returnMaterialsToBank(us, { [give]: ratio });
  grantMaterialsFromBank(us, playerId, { [receive]: 1 });
  return true;
}

export function reserveMaterialFromBank(
  us: UndergroundSkyState,
  material: UndergroundSkyMaterial,
  amount = 1,
): boolean {
  if ((us.materialBank[material] ?? 0) < amount) return false;
  us.materialBank[material] -= amount;
  return true;
}

export function releaseReservedMaterial(
  us: UndergroundSkyState,
  material: UndergroundSkyMaterial,
  amount = 1,
): void {
  us.materialBank[material] = (us.materialBank[material] ?? 0) + amount;
}
