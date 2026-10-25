import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  applyCommand,
  createEngineContext,
  isPactsEmbassiesEnabled,
  applyExtensionVictoryBonuses,
  computeVictoryPointTarget,
  defaultPactsEmbassiesConfig,
  defaultSeasonsConfig,
  EXTENSION_REGISTRY,
  projectStateForViewer,
  delegateCount,
  getDelegates,
  RESOLUTION_CATALOG,
  CRISIS_CATALOG,
  MANDATE_CATALOG,
  createClassicBoardState,
  SeededRandom,
  FixedClock,
  IncrementalIdGenerator,
} from '@catanx/engine';
import type { GameConfig, GameState } from '../../../types/game';

function testCtx(seed = 1) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function baseConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    mode: 'standard',
    mapSize: 'tiny',
    mapSeed: 42,
    playerCount: 4,
    victoryConditions: ['points'],
    victoryPointTarget: 10,
    maxTurns: 0,
    enableSeasons: false,
    enableEvents: false,
    enableDiplomacy: false,
    enableMilitary: false,
    enableTechTree: false,
    enableProductionChains: false,
    fogOfWar: false,
    startingResources: 'none',
    barbarianStrength: {
      enabled: false,
      spawnRate: 0,
      strength: 0,
      scaling: false,
      navalBarbarians: false,
    },
    worldCouncil: false,
    difficultyModifier: 1,
    ...overrides,
  };
}

const players = [
  { name: 'A', civilization: 'empire' as const, type: 'human' as const },
  { name: 'B', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'C', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'D', civilization: 'empire' as const, type: 'ai' as const },
];

function createPeGame(
  overrides: Partial<GameConfig> = {},
  seed = 1,
): { state: GameState; ctx: ReturnType<typeof testCtx> } {
  const ctx = testCtx(seed);
  const config = baseConfig({
    extensions: {
      pactsEmbassies: defaultPactsEmbassiesConfig({ enabled: true }),
    },
    ...overrides,
  });
  const created = applyCommand(null, { type: 'create_game', config, players }, ctx);
  if (!created.ok) throw new Error(created.error.message);
  return { state: created.state, ctx };
}

describe('pactsEmbassies framework', () => {
  it('est dans le registre avec bonus +3', () => {
    const def = EXTENSION_REGISTRY.find((e) => e.id === 'pactsEmbassies');
    expect(def?.victoryPointBonus).toBe(3);
    expect(def?.catanxOnly).toBe(true);
  });

  it('isPactsEmbassiesEnabled et SCHEMA_VERSION === 7', () => {
    expect(SCHEMA_VERSION).toBe(7);
    const { state } = createPeGame();
    expect(isPactsEmbassiesEnabled(state)).toBe(true);
    expect(isPactsEmbassiesEnabled(baseConfig())).toBe(false);
  });

  it('create_game initialise influence 0, réputation 3, 1 délégué implicite', () => {
    const { state } = createPeGame();
    expect(isPactsEmbassiesEnabled(state)).toBe(true);
    const pe = state.extensions!.pactsEmbassies!;
    expect(pe.embassies).toHaveLength(0);
    for (const playerId of state.turnOrder) {
      const ps = pe.players[playerId]!;
      expect(ps.influence).toBe(0);
      expect(ps.reputation).toBe(3);
      expect(delegateCount(0)).toBe(1);
      expect(getDelegates(pe, playerId)).toBe(1);
    }
  });

  it('aligne la session du Conseil sur les 5 rondes de Saisons', () => {
    const { state } = createPeGame({
      enableSeasons: true,
      extensions: {
        seasons: defaultSeasonsConfig({ enabled: true }),
        // Simule aussi une ancienne configuration PE encore réglée sur 4.
        pactsEmbassies: defaultPactsEmbassiesConfig({
          enabled: true,
          roundsPerCouncilSession: 4,
        }),
      },
    });

    expect(state.config.extensions?.seasons?.roundsPerSeason).toBe(5);
    expect(state.extensions?.pactsEmbassies?.council.roundsPerSession).toBe(5);
  });

  it('augmente victoryPointTarget de +3 quand PE est activé', () => {
    expect(computeVictoryPointTarget(10, {})).toBe(10);
    expect(
      computeVictoryPointTarget(10, {
        pactsEmbassies: defaultPactsEmbassiesConfig({ enabled: true }),
      }),
    ).toBe(13);

    const config = applyExtensionVictoryBonuses(
      baseConfig({
        victoryPointTarget: 10,
        extensions: {
          pactsEmbassies: defaultPactsEmbassiesConfig({ enabled: true }),
        },
      }),
    );
    expect(config.baseVictoryPointTarget).toBe(10);
    expect(config.victoryPointTarget).toBe(13);

    const { state } = createPeGame();
    expect(state.config.baseVictoryPointTarget).toBe(10);
    expect(state.config.victoryPointTarget).toBe(13);
  });

  it('pe_build_embassy échoue sans ville ni ressources', () => {
    const { state, ctx } = createPeGame();
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;

    const noCity = applyCommand(
      state,
      {
        type: 'pe_build_embassy',
        playerId,
        intersectionId: 'missing_intersection',
      },
      ctx,
    );
    expect(noCity.ok).toBe(false);

    state.classicBoard = createClassicBoardState(state.map, state.turnOrder);
    const cityId = 'pe_test_city';
    state.classicBoard.occupiedIntersections[cityId] = playerId;
    state.classicBoard.buildingByIntersection[cityId] = 'city';
    const player = state.players.get(playerId)!;
    player.resources = { wood: 0, clay: 0, wheat: 0, sheep: 0, ore: 0 };

    const noResources = applyCommand(
      state,
      { type: 'pe_build_embassy', playerId, intersectionId: cityId },
      ctx,
    );
    expect(noResources.ok).toBe(false);
  });

  it('cycle pe_propose_pact / pe_accept_pact avec dépôts d’Influence', () => {
    const { state, ctx } = createPeGame();
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const fromId = state.turnOrder[0]!;
    const toId = state.turnOrder[1]!;
    const pe = state.extensions!.pactsEmbassies!;

    pe.players[fromId]!.influence = 3;
    pe.players[toId]!.influence = 3;

    const propose = applyCommand(
      state,
      {
        type: 'pe_propose_pact',
        playerId: fromId,
        toPlayerId: toId,
        clauses: ['trade_accord'],
      },
      ctx,
    );
    expect(propose.ok).toBe(true);
    expect(pe.players[fromId]!.influence).toBe(2);
    expect(pe.pactOffers.some((o) => o.status === 'pending')).toBe(true);

    const offer = pe.pactOffers.find((o) => o.status === 'pending')!;
    const accept = applyCommand(
      state,
      { type: 'pe_accept_pact', playerId: toId, offerId: offer.id },
      ctx,
    );
    expect(accept.ok).toBe(true);
    expect(pe.players[toId]!.influence).toBe(2);
    const pact = pe.pacts.find((p) => p.status === 'active');
    expect(pact).toBeTruthy();
    expect(pact!.depositHeld[fromId]).toBe(true);
    expect(pact!.depositHeld[toId]).toBe(true);
    expect(pact!.clauses).toEqual(['trade_accord']);
  });

  it('pe_break_pact réduit la réputation de 2', () => {
    const { state, ctx } = createPeGame();
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const fromId = state.turnOrder[0]!;
    const toId = state.turnOrder[1]!;
    const pe = state.extensions!.pactsEmbassies!;

    pe.players[fromId]!.influence = 2;
    pe.players[toId]!.influence = 2;
    pe.players[fromId]!.reputation = 3;

    const propose = applyCommand(
      state,
      {
        type: 'pe_propose_pact',
        playerId: fromId,
        toPlayerId: toId,
        clauses: ['port_charter'],
      },
      ctx,
    );
    expect(propose.ok).toBe(true);
    const offer = pe.pactOffers.find((o) => o.status === 'pending')!;
    const accept = applyCommand(
      state,
      { type: 'pe_accept_pact', playerId: toId, offerId: offer.id },
      ctx,
    );
    expect(accept.ok).toBe(true);

    const pact = pe.pacts.find((p) => p.status === 'active')!;
    const before = pe.players[fromId]!.reputation;
    const broke = applyCommand(
      state,
      { type: 'pe_break_pact', playerId: fromId, pactId: pact.id },
      ctx,
    );
    expect(broke.ok).toBe(true);
    expect(pe.players[fromId]!.reputation).toBe(before - 2);
    expect(pact.status).toBe('broken');
  });

  it('catalogues : 24 résolutions, 12 crises, 12 mandats', () => {
    expect(RESOLUTION_CATALOG).toHaveLength(24);
    expect(CRISIS_CATALOG).toHaveLength(12);
    expect(MANDATE_CATALOG).toHaveLength(12);
  });

  it('projectStateForViewer masque les clauses d’offre aux tiers', () => {
    const { state } = createPeGame();
    const fromId = state.turnOrder[0]!;
    const toId = state.turnOrder[1]!;
    const thirdId = state.turnOrder[2]!;
    const pe = state.extensions!.pactsEmbassies!;

    pe.pactOffers.push({
      id: 'offer_secret',
      fromPlayerId: fromId,
      toPlayerId: toId,
      clauses: ['trade_accord', 'open_borders'],
      expiresAtRound: 2,
      status: 'pending',
    });

    const partyView = projectStateForViewer(state, fromId);
    const partyOffer = partyView.extensions!.pactsEmbassies!.pactOffers.find(
      (o) => o.id === 'offer_secret',
    )!;
    expect(partyOffer.clauses).toEqual(['trade_accord', 'open_borders']);

    const thirdView = projectStateForViewer(state, thirdId);
    const thirdOffer = thirdView.extensions!.pactsEmbassies!.pactOffers.find(
      (o) => o.id === 'offer_secret',
    )!;
    expect(thirdOffer.clauses).toEqual([]);

    const spectatorView = projectStateForViewer(state, null);
    const spectatorOffer = spectatorView.extensions!.pactsEmbassies!.pactOffers.find(
      (o) => o.id === 'offer_secret',
    )!;
    expect(spectatorOffer.clauses).toEqual([]);
  });

  it('enableTechTree true n’altère pas l’état PE (isolation)', () => {
    const { state: withTech } = createPeGame({ enableTechTree: true }, 7);
    const { state: withoutTech } = createPeGame({ enableTechTree: false }, 7);

    expect(withTech.config.enableTechTree).toBe(true);
    expect(withoutTech.config.enableTechTree).toBe(false);

    const peTech = withTech.extensions!.pactsEmbassies!;
    const pePlain = withoutTech.extensions!.pactsEmbassies!;

    for (const playerId of withTech.turnOrder) {
      expect(peTech.players[playerId]!.influence).toBe(0);
      expect(peTech.players[playerId]!.reputation).toBe(3);
      expect(pePlain.players[playerId]!.influence).toBe(0);
      expect(pePlain.players[playerId]!.reputation).toBe(3);
      expect(getDelegates(peTech, playerId)).toBe(1);
      expect(getDelegates(pePlain, playerId)).toBe(1);
    }

    expect(peTech.embassies).toEqual([]);
    expect(pePlain.embassies).toEqual([]);
    expect(peTech.pacts).toEqual([]);
    expect(pePlain.pacts).toEqual([]);
    expect(withTech.config.victoryPointTarget).toBe(13);
    expect(withoutTech.config.victoryPointTarget).toBe(13);
  });
});
