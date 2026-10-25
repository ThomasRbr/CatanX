/**
 * Tests IA Pactes & Ambassades.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createEngineContext,
  defaultPactsEmbassiesConfig,
  SeededRandom,
  FixedClock,
  IncrementalIdGenerator,
  createClassicBoardState,
  listPactsEmbassiesScoredActions,
  choosePactsEmbassiesAction,
  beginCouncilSession,
} from '@catanx/engine';
import { __peAiTest } from '../ai';
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
  { name: 'A', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'B', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'C', civilization: 'empire' as const, type: 'ai' as const },
  { name: 'D', civilization: 'empire' as const, type: 'ai' as const },
];

function createPeGame(seed = 1): { state: GameState; ctx: ReturnType<typeof testCtx> } {
  const ctx = testCtx(seed);
  const created = applyCommand(
    null,
    {
      type: 'create_game',
      config: baseConfig({
        extensions: {
          pactsEmbassies: defaultPactsEmbassiesConfig({ enabled: true }),
        },
      }),
      players,
    },
    ctx,
  );
  if (!created.ok) throw new Error(created.error.message);
  const state = created.state;
  state.phase = 'playing';
  state.turnPhase = 'player_action';
  return { state, ctx };
}

describe('pactsEmbassies AI', () => {
  it('ne propose pas de vote hors phase vote / confirm_ambitious', () => {
    const { state } = createPeGame();
    const pe = state.extensions!.pactsEmbassies!;
    beginCouncilSession(state, pe);
    pe.council.phase = 'negotiate';
    const playerId = state.turnOrder[0]!;
    pe.players[playerId]!.influence = 3;

    const scored = listPactsEmbassiesScoredActions(state, playerId, 'hard');
    expect(scored.some((a) => a.label === 'council_vote')).toBe(false);
    expect(scored.some((a) => a.command.type === 'pe_sponsor_resolution')).toBe(true);
  });

  it('vote en phase vote et peut lobby en hard', () => {
    const { state } = createPeGame();
    const pe = state.extensions!.pactsEmbassies!;
    beginCouncilSession(state, pe);
    pe.council.phase = 'vote';
    const playerId = state.turnOrder[0]!;
    pe.players[playerId]!.influence = 3;
    if (pe.council.neutralDelegations.length === 0) {
      const proposal = pe.council.proposals[0]!;
      pe.council.neutralDelegations = [
        {
          id: 'n1',
          label: 'N1',
          naturalPreference: {
            proposalId: proposal.id,
            variantId: proposal.variants[0]!.id,
          },
          votes: 1,
        },
      ];
    }

    const scored = listPactsEmbassiesScoredActions(state, playerId, 'hard');
    expect(scored.some((a) => a.label === 'council_vote')).toBe(true);
    expect(scored.some((a) => a.label === 'lobby_neutral')).toBe(true);

    const urgent = choosePactsEmbassiesAction(state, playerId, {
      difficulty: 'hard',
      urgentOnly: true,
    });
    expect(urgent?.type).toBe('pe_cast_council_vote');
  });

  it('choisit port_charter quand l’allié a des ports et soi non', () => {
    const { state } = createPeGame();
    const pe = state.extensions!.pactsEmbassies!;
    const selfId = state.turnOrder[0]!;
    const otherId = state.turnOrder[1]!;
    state.players.get(selfId)!.ports = [];
    state.players.get(otherId)!.ports = ['generic_3:1'];

    const clauses = __peAiTest.pickBestClauses(state, pe, selfId, otherId);
    expect(clauses).toContain('port_charter');
  });

  it('refuse un pacte anti-kingmaking (urgent)', () => {
    const { state } = createPeGame();
    const pe = state.extensions!.pactsEmbassies!;
    const selfId = state.turnOrder[0]!;
    const otherId = state.turnOrder[1]!;
    state.players.get(selfId)!.stats.victoryPoints = 5;
    state.players.get(otherId)!.stats.victoryPoints = state.config.victoryPointTarget - 1;
    pe.players[selfId]!.influence = 2;
    pe.pactOffers.push({
      id: 'offer_km',
      fromPlayerId: otherId,
      toPlayerId: selfId,
      clauses: ['trade_accord'],
      expiresAtRound: 9,
      status: 'pending',
    });

    const cmd = choosePactsEmbassiesAction(state, selfId, {
      difficulty: 'medium',
      urgentOnly: true,
    });
    expect(cmd?.type).toBe('pe_reject_pact');
  });

  it('propose une ambassade quand ressources + ville', () => {
    const { state } = createPeGame();
    const playerId = state.turnOrder[0]!;
    state.classicBoard = createClassicBoardState(state.map, state.turnOrder);
    const cityId = 'ai_city';
    state.classicBoard.occupiedIntersections[cityId] = playerId;
    state.classicBoard.buildingByIntersection[cityId] = 'city';
    state.players.get(playerId)!.resources = {
      wood: 0,
      clay: 0,
      wheat: 1,
      sheep: 1,
      ore: 1,
    };

    const scored = listPactsEmbassiesScoredActions(state, playerId, 'legendary');
    expect(scored.some((a) => a.command.type === 'pe_build_embassy')).toBe(true);
  });

  it('seuil easy plus élevé que legendary', () => {
    expect(__peAiTest.scoreThreshold('easy')).toBeGreaterThan(
      __peAiTest.scoreThreshold('legendary'),
    );
  });
});
