/**
 * Création / hydratation de l’état Pactes & Ambassades.
 */

import type { GameState } from '../../types/game';
import type { PactsEmbassiesState, PePlayerState } from '../../types/pactsEmbassies';
import {
  defaultPactsEmbassiesConfig,
  emptyPePlayerState,
  emptyPeRoundUsage,
} from '../../types/pactsEmbassies';
import {
  isCitiesKnightsEnabled,
  isPactsEmbassiesEnabled,
  isSeasonsEnabled,
  isUndergroundSkyEnabled,
} from '../../core/extensions';
import { listAvailableMandates } from './catalog/mandates';
import { RESOLUTION_CATALOG } from './catalog/resolutions';
import { listAvailableCrises } from './catalog/crises';

function shuffleDeterministic(ids: string[], seed: number): string[] {
  const arr = [...ids];
  let s = seed >>> 0;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function createPactsEmbassiesState(
  playerIds: string[],
  playerCount: number,
  seed: number,
  options?: {
    roundsPerCouncilSession?: number;
    citiesKnightsEnabled?: boolean;
    seasonsEnabled?: boolean;
    undergroundSkyEnabled?: boolean;
  },
): PactsEmbassiesState {
  const players: Record<string, PePlayerState> = {};
  for (const id of playerIds) {
    players[id] = emptyPePlayerState();
  }

  const extFlags = {
    citiesKnights: Boolean(options?.citiesKnightsEnabled),
    seasons: Boolean(options?.seasonsEnabled),
    undergroundSky: Boolean(options?.undergroundSkyEnabled),
  };

  const mandateDefs = listAvailableMandates(extFlags);
  const crisisDefs = listAvailableCrises(extFlags);
  const resolutionIds = RESOLUTION_CATALOG.map((r) => r.id);
  const crisisIds = crisisDefs.map((c) => c.id);
  const mandateIds = mandateDefs.map((m) => m.id);

  const resolutionDeckOrder = shuffleDeterministic(resolutionIds, seed ^ 0x0e01);
  const crisisDeckOrder = shuffleDeterministic(crisisIds, seed ^ 0x0e02);
  const mandateDeckOrder = shuffleDeterministic(mandateIds, seed ^ 0x0e03);

  const visibleMandates = mandateDeckOrder.slice(0, 3).map((mandateId) => {
    const def = mandateDefs.find((m) => m.id === mandateId)!;
    return {
      id: `mandate_${def.id}`,
      mandateId: def.id,
      title: def.title,
      description: def.description,
      conditionKind: def.conditionKind,
      conditionData: def.conditionData,
    };
  });

  const roundsPerSession = options?.roundsPerCouncilSession ?? 4;

  return {
    players,
    embassies: [],
    pactOffers: [],
    pacts: [],
    council: {
      sessionIndex: 0,
      phase: 'idle',
      roundInSession: 0,
      roundsPerSession,
      proposals: [],
      votes: [],
      lobbyBids: [],
      neutralDelegations: [],
      votesRevealed: false,
    },
    activeResolutions: [],
    crisis: null,
    mandates: visibleMandates,
    highChancellorId: null,
    highChancellorScore: 0,
    globalRound: 0,
    roundUsage: emptyPeRoundUsage(),
    dormantSegments: [],
    pendingChoices: [],
    history: [],
    mildPenalties: [],
    _secret: {
      resolutionDeckOrder,
      crisisDeckOrder,
      mandateDeckOrder,
      lobbyBidsHidden: true,
    },
  };
}

export function ensurePactsEmbassiesState(state: GameState): PactsEmbassiesState | null {
  if (!isPactsEmbassiesEnabled(state)) return null;
  if (state.extensions?.pactsEmbassies) return state.extensions.pactsEmbassies;

  const playerIds = [...state.players.keys()];
  const pe = createPactsEmbassiesState(
    playerIds,
    state.config.playerCount,
    state.config.mapSeed,
    {
      roundsPerCouncilSession:
        isSeasonsEnabled(state)
          ? state.config.extensions?.seasons?.roundsPerSeason ?? 5
          : state.config.extensions?.pactsEmbassies?.roundsPerCouncilSession ?? 4,
      citiesKnightsEnabled: isCitiesKnightsEnabled(state),
      seasonsEnabled: isSeasonsEnabled(state),
      undergroundSkyEnabled: isUndergroundSkyEnabled(state),
    },
  );
  state.extensions = { ...state.extensions, pactsEmbassies: pe };
  return pe;
}

export function hydratePactsEmbassiesFromSnapshot(state: GameState): void {
  const enabled = isPactsEmbassiesEnabled(state);
  if (!enabled) {
    if (state.extensions?.pactsEmbassies) {
      const { pactsEmbassies: _drop, ...rest } = state.extensions;
      state.extensions = rest;
    }
    return;
  }

  const raw = state.extensions?.pactsEmbassies as Partial<PactsEmbassiesState> | undefined;
  const playerIds = [...state.players.keys()];
  const base = createPactsEmbassiesState(
    playerIds,
    state.config.playerCount,
    state.config.mapSeed,
    {
      roundsPerCouncilSession: isSeasonsEnabled(state)
        ? state.config.extensions?.seasons?.roundsPerSeason ?? 5
        : defaultPactsEmbassiesConfig(
            state.config.extensions?.pactsEmbassies,
          ).roundsPerCouncilSession,
      citiesKnightsEnabled: isCitiesKnightsEnabled(state),
      seasonsEnabled: isSeasonsEnabled(state),
      undergroundSkyEnabled: isUndergroundSkyEnabled(state),
    },
  );

  if (!raw) {
    state.extensions = { ...state.extensions, pactsEmbassies: base };
    return;
  }

  const players: Record<string, PePlayerState> = { ...base.players };
  for (const id of playerIds) {
    const src = raw.players?.[id];
    players[id] = src
      ? {
          ...emptyPePlayerState(),
          ...src,
          mandatesClaimed: [...(src.mandatesClaimed ?? [])],
        }
      : emptyPePlayerState();
  }

  state.extensions = {
    ...state.extensions,
    pactsEmbassies: {
      ...base,
      ...raw,
      players,
      embassies: raw.embassies ? [...raw.embassies] : [],
      pactOffers: raw.pactOffers ? [...raw.pactOffers] : [],
      pacts: raw.pacts ? [...raw.pacts] : [],
      council: raw.council
        ? {
            ...base.council,
            ...raw.council,
            // Une ancienne sauvegarde peut encore contenir 4 alors que les
            // saisons modernes durent 5 rondes : le calendrier saisonnier prime.
            roundsPerSession: isSeasonsEnabled(state)
              ? state.config.extensions?.seasons?.roundsPerSeason ?? 5
              : raw.council.roundsPerSession ?? base.council.roundsPerSession,
            proposals: raw.council.proposals ? [...raw.council.proposals] : [],
            votes: raw.council.votes ? [...raw.council.votes] : [],
            lobbyBids: raw.council.lobbyBids ? [...raw.council.lobbyBids] : [],
            neutralDelegations: raw.council.neutralDelegations
              ? [...raw.council.neutralDelegations]
              : [],
          }
        : base.council,
      activeResolutions: raw.activeResolutions ? [...raw.activeResolutions] : [],
      crisis: raw.crisis ?? null,
      mandates: raw.mandates ? [...raw.mandates] : base.mandates,
      roundUsage: raw.roundUsage
        ? {
            playerTradeBonusUsed: { ...(raw.roundUsage.playerTradeBonusUsed ?? {}) },
            portCharterUsed: { ...(raw.roundUsage.portCharterUsed ?? {}) },
            alliedInfraInfluenceGained: {
              ...(raw.roundUsage.alliedInfraInfluenceGained ?? {}),
            },
            firstValidPlayerTrade: { ...(raw.roundUsage.firstValidPlayerTrade ?? {}) },
          }
        : emptyPeRoundUsage(),
      dormantSegments: raw.dormantSegments ? [...raw.dormantSegments] : [],
      pendingChoices: raw.pendingChoices ? [...raw.pendingChoices] : [],
      history: raw.history ? [...raw.history] : [],
      mildPenalties: raw.mildPenalties ? [...raw.mildPenalties] : [],
      _secret: {
        resolutionDeckOrder: raw._secret?.resolutionDeckOrder
          ? [...raw._secret.resolutionDeckOrder]
          : base._secret.resolutionDeckOrder,
        crisisDeckOrder: raw._secret?.crisisDeckOrder
          ? [...raw._secret.crisisDeckOrder]
          : base._secret.crisisDeckOrder,
        mandateDeckOrder: raw._secret?.mandateDeckOrder
          ? [...raw._secret.mandateDeckOrder]
          : base._secret.mandateDeckOrder,
        lobbyBidsHidden: raw._secret?.lobbyBidsHidden ?? true,
      },
    },
  };
}

export function getPe(state: GameState): PactsEmbassiesState | null {
  if (!isPactsEmbassiesEnabled(state)) return null;
  return state.extensions?.pactsEmbassies ?? null;
}

export function activeEmbassyCount(
  pe: PactsEmbassiesState,
  playerId: string,
): number {
  return pe.embassies.filter((e) => e.playerId === playerId && !e.suspended).length;
}
