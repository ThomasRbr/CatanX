/**
 * Marchandises C&K : conversion production ville, banque, main.
 */
import type { GameState } from '../../types/game';
import type { ResourceBundle, ResourceType } from '../../types/resources';
import type { CkCommodity, CkCommodityBundle } from '../../types/citiesKnights';
import { CK_COMMODITIES } from '../../types/citiesKnights';
import {
  resolveBuildingProductionTileIds,
  type CollectionResult,
} from '../resources/ResourceSystem';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { getSeasonalTradeRatioModifier } from '../seasons/costs';
import {
  addCkCommodities,
  ensureCitiesKnightsState,
  subtractCkCommodities,
  syncPublicCommodityCounts,
  totalCkCommodities,
} from './state';

/** Ressource classique principale → marchandise associée. */
const PRIMARY_TO_COMMODITY: Partial<Record<ResourceType, CkCommodity>> = {
  wood: 'ck_paper',
  sheep: 'ck_cloth',
  ore: 'ck_coin',
};

const CLASSIC_FIVE: readonly ResourceType[] = ['wood', 'clay', 'wheat', 'sheep', 'ore'];

/** Ressource classique dominante d'une tuile (pas le nom visuel). */
export function primaryClassicResource(
  baseProduction: ResourceBundle | undefined,
): ResourceType | null {
  if (!baseProduction) return null;
  let best: ResourceType | null = null;
  let bestAmount = 0;
  for (const res of CLASSIC_FIVE) {
    const amount = baseProduction[res] ?? 0;
    if (amount > bestAmount) {
      bestAmount = amount;
      best = res;
    }
  }
  return bestAmount > 0 ? best : null;
}

/**
 * Convertit la production ville : 2 classiques bois/mouton/minerai
 * → 1 classique + 1 marchandise (stock banque).
 * @returns IDs des joueurs ayant reçu au moins une marchandise.
 */
export function applyCitiesKnightsCommodityProduction(
  state: GameState,
  diceValue: number,
  collections: CollectionResult[],
): Set<string> {
  const grantedPlayers = new Set<string>();
  if (!isCitiesKnightsEnabled(state)) return grantedPlayers;
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return grantedPlayers;

  const pendingGrants: Record<string, CkCommodityBundle> = {};

  for (const [, building] of state.buildings) {
    if (building.definitionId !== 'city' && building.definitionId !== 'metropolis') continue;
    const playerId = building.ownerId;
    const tileIds = resolveBuildingProductionTileIds(state, building);

    for (const tileId of tileIds) {
      const tile = state.map.get(tileId);
      if (!tile || tile.diceValue !== diceValue || tile.robber) continue;

      const primary = primaryClassicResource(tile.baseProduction);
      if (!primary) continue;
      const commodity = PRIMARY_TO_COMMODITY[primary];
      if (!commodity) continue;

      const collection = collections.find((c) => c.playerId === playerId);
      if (!collection) continue;

      const have = collection.resources[primary] ?? 0;
      if (have < 1) continue;

      const bankHave = ck.commodityBank[commodity] ?? 0;
      if (bankHave <= 0) continue;

      collection.resources[primary] = have - 1;
      if (collection.resources[primary] === 0) delete collection.resources[primary];

      ck.commodityBank[commodity] = bankHave - 1;
      pendingGrants[playerId] = addCkCommodities(pendingGrants[playerId] ?? {}, {
        [commodity]: 1,
      });
    }
  }

  for (const [playerId, grant] of Object.entries(pendingGrants)) {
    ck.playerCommodities[playerId] = addCkCommodities(
      ck.playerCommodities[playerId] ?? {},
      grant,
    );
    grantedPlayers.add(playerId);
  }
  syncPublicCommodityCounts(ck);
  return grantedPlayers;
}

export function returnCommoditiesToBank(
  state: GameState,
  commodities: CkCommodityBundle,
): void {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;
  for (const c of CK_COMMODITIES) {
    const n = commodities[c] ?? 0;
    if (n > 0) ck.commodityBank[c] = (ck.commodityBank[c] ?? 0) + n;
  }
}

export function takeCommoditiesFromBank(
  state: GameState,
  want: CkCommodityBundle,
): CkCommodityBundle {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return {};
  const taken: CkCommodityBundle = {};
  for (const c of CK_COMMODITIES) {
    const need = want[c] ?? 0;
    if (need <= 0) continue;
    const available = ck.commodityBank[c] ?? 0;
    const grant = Math.min(need, available);
    if (grant <= 0) continue;
    taken[c] = grant;
    ck.commodityBank[c] = available - grant;
  }
  return taken;
}

export function grantCommoditiesToPlayer(
  state: GameState,
  playerId: string,
  commodities: CkCommodityBundle,
): void {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;
  ck.playerCommodities[playerId] = addCkCommodities(
    ck.playerCommodities[playerId] ?? {},
    commodities,
  );
  syncPublicCommodityCounts(ck);
}

export function removeCommoditiesFromPlayer(
  state: GameState,
  playerId: string,
  commodities: CkCommodityBundle,
): boolean {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return false;
  const hand = ck.playerCommodities[playerId] ?? {};
  for (const c of CK_COMMODITIES) {
    if ((hand[c] ?? 0) < (commodities[c] ?? 0)) return false;
  }
  ck.playerCommodities[playerId] = subtractCkCommodities(hand, commodities);
  syncPublicCommodityCounts(ck);
  return true;
}

export function playerCommodityHandSize(state: GameState, playerId: string): number {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return 0;
  return totalCkCommodities(ck.playerCommodities[playerId]);
}

/** Ratio banque/port pour marchandises : 4:1, générique 3:1, commerce 3 → 2:1, flotte. */
export function getCkCommodityTradeRatio(
  state: GameState,
  playerId: string,
  commodity?: CkCommodity,
): number {
  const player = state.players.get(playerId);
  if (!player) return 4;
  let ratio = 4;
  for (const entry of player.ports) {
    if (entry === 'generic_3:1') ratio = Math.min(ratio, 3);
    const tile = state.map.get(entry);
    if (tile?.port === 'generic_3:1') ratio = Math.min(ratio, 3);
  }
  const levels = state.extensions?.citiesKnights?.urbanLevels[playerId];
  if (levels && levels.trade >= 3) ratio = Math.min(ratio, 2);

  const fleet = state.extensions?.citiesKnights?.progressBuffs?.merchantFleet;
  if (
    fleet?.playerId === playerId &&
    fleet.kind === 'commodity' &&
    (!commodity || fleet.key === commodity)
  ) {
    ratio = Math.min(ratio, 2);
  }
  return ratio;
}

/** Ratio marchandises avec modificateurs saisonniers (Commerce / Hiver marchand). */
export function getCkCommodityTradeRatioSeasonal(
  state: GameState,
  playerId: string,
  commodity: CkCommodity | undefined,
  opts?: { useCommerce?: boolean },
): number {
  const base = getCkCommodityTradeRatio(state, playerId, commodity);
  return getSeasonalTradeRatioModifier(state, playerId, base, {
    useCommerce: opts?.useCommerce,
    isCommodity: true,
  });
}

export function cleanCommodityBundle(
  raw: CkCommodityBundle | Record<string, number> | undefined,
): CkCommodityBundle {
  if (!raw) return {};
  const out: CkCommodityBundle = {};
  for (const c of CK_COMMODITIES) {
    const n = Math.floor(raw[c] ?? 0);
    if (n > 0) out[c] = n;
  }
  return out;
}
