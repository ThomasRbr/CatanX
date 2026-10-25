/**
 * Tests clauses PE + lobby / votes secrets / suspension ambassade.
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
  projectStateForViewer,
  beginCouncilSession,
  lobbyNeutralDelegation,
  resolveCouncilVotes,
  getPortTradeRatio,
  peekPortCharterAlly,
  sharedReserveHandBonus,
  syncEmbassySuspensions,
  buildEmbassy,
} from '@catanx/engine';
import { castCouncilVote as peCastCouncilVote } from '../council';
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

function signPact(
  state: GameState,
  ctx: ReturnType<typeof testCtx>,
  fromId: string,
  toId: string,
  clauses: Array<
    | 'trade_accord'
    | 'port_charter'
    | 'open_borders'
    | 'shared_reserve'
    | 'underground_passage'
    | 'trade_winds'
  >,
): void {
  const pe = state.extensions!.pactsEmbassies!;
  pe.players[fromId]!.influence = 5;
  pe.players[toId]!.influence = 5;
  state.currentPlayerIndex = state.turnOrder.indexOf(fromId);
  const propose = applyCommand(
    state,
    { type: 'pe_propose_pact', playerId: fromId, toPlayerId: toId, clauses },
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
}

describe('pactsEmbassies clauses', () => {
  it('shared_reserve donne +1 seuil de main', () => {
    const { state, ctx } = createPeGame();
    const a = state.turnOrder[0]!;
    const b = state.turnOrder[1]!;
    expect(sharedReserveHandBonus(state, a)).toBe(0);
    signPact(state, ctx, a, b, ['shared_reserve']);
    expect(sharedReserveHandBonus(state, a)).toBe(1);
    expect(sharedReserveHandBonus(state, b)).toBe(1);
  });

  it('port_charter abaisse le ratio banque à 3:1 via allié', () => {
    const { state, ctx } = createPeGame();
    const a = state.turnOrder[0]!;
    const b = state.turnOrder[1]!;
    signPact(state, ctx, a, b, ['port_charter']);

    // Donner un port 3:1 à B uniquement
    const playerB = state.players.get(b)!;
    playerB.ports = ['generic_3:1'];
    const playerA = state.players.get(a)!;
    playerA.ports = [];

    expect(peekPortCharterAlly(state, a)).toBe(b);
    expect(getPortTradeRatio(playerA, 'wood', state)).toBe(3);
    expect(getPortTradeRatio(playerA, 'wood', state, { ignorePortCharter: true })).toBe(4);
  });
});

describe('pactsEmbassies council', () => {
  it('lobby escrow dépense Influence et rembourse les perdants', () => {
    const { state } = createPeGame();
    const pe = state.extensions!.pactsEmbassies!;
    beginCouncilSession(state, pe);
    pe.council.phase = 'negotiate';

    // 4 joueurs : pas de cités neutres auto — en injecter une pour le test
    if (pe.council.neutralDelegations.length === 0) {
      const proposal = pe.council.proposals[0]!;
      pe.council.neutralDelegations = [
        {
          id: 'neutral_test',
          label: 'Cité neutre test',
          naturalPreference: {
            proposalId: proposal.id,
            variantId: proposal.variants[0]!.id,
          },
          votes: 1,
        },
      ];
    }

    const a = state.turnOrder[0]!;
    const b = state.turnOrder[1]!;
    pe.players[a]!.influence = 3;
    pe.players[b]!.influence = 3;
    const del = pe.council.neutralDelegations[0];
    expect(del).toBeTruthy();

    expect(lobbyNeutralDelegation(state, pe, a, del!.id, 1).ok).toBe(true);
    expect(pe.players[a]!.influence).toBe(2);
    expect(lobbyNeutralDelegation(state, pe, b, del!.id, 2).ok).toBe(true);
    expect(pe.players[b]!.influence).toBe(1);

    // Avancer jusqu’à reveal pour résoudre les mises
    pe.council.phase = 'reveal';
    resolveCouncilVotes(state, pe);

    expect(pe.players[a]!.influence).toBe(3); // remboursé (perdant)
    expect(pe.players[b]!.influence).toBe(1); // gagnant : mise consommée
    expect(del!.directedBy).toBe(b);
  });

  it('refuse le vote ambitieux non confirmé en phase vote', () => {
    const { state } = createPeGame();
    const pe = state.extensions!.pactsEmbassies!;
    beginCouncilSession(state, pe);
    const proposal = pe.council.proposals[0];
    expect(proposal).toBeTruthy();
    proposal!.sponsorId = state.turnOrder[0]!;
    proposal!.ambitiousConfirmed = false;
    pe.council.phase = 'vote';

    const ambitious = proposal!.variants.find((v) => v.kind === 'ambitious');
    expect(ambitious).toBeTruthy();
    const vote = peCastCouncilVote(
      state,
      pe,
      state.turnOrder[1]!,
      proposal!.id,
      ambitious!.id,
      0,
    );
    expect(vote.ok).toBe(false);
  });

  it('masque les votes déposés aux adversaires jusqu’à révélation', () => {
    const { state } = createPeGame();
    const pe = state.extensions!.pactsEmbassies!;
    beginCouncilSession(state, pe);
    pe.council.phase = 'vote';
    const proposal = pe.council.proposals[0]!;
    const variant = proposal.variants.find((v) => v.kind !== 'ambitious') ?? proposal.variants[0]!;
    const voter = state.turnOrder[0]!;
    const other = state.turnOrder[1]!;

    peCastCouncilVote(state, pe, voter, proposal.id, variant.id, 0);
    expect(pe.council.votes).toHaveLength(1);

    const otherView = projectStateForViewer(state, other);
    const foreign = otherView.extensions!.pactsEmbassies!.council.votes.find(
      (v) => v.playerId === voter,
    );
    expect(foreign).toBeTruthy();
    expect(foreign!.variantId).toBe('');
    expect(foreign!.proposalId).toBe('');
    expect(foreign!.deposited).toBe(true);
  });
});

describe('pactsEmbassies embassies', () => {
  it('suspend l’ambassade si la ville n’est plus une cité', () => {
    const { state } = createPeGame();
    const pe = state.extensions!.pactsEmbassies!;
    const playerId = state.turnOrder[0]!;
    state.classicBoard = createClassicBoardState(state.map, state.turnOrder);
    const cityId = 'pe_suspend_city';
    state.classicBoard.occupiedIntersections[cityId] = playerId;
    state.classicBoard.buildingByIntersection[cityId] = 'city';

    buildEmbassy(state, pe, playerId, cityId);
    expect(pe.embassies[0]!.suspended).toBe(false);

    state.classicBoard.buildingByIntersection[cityId] = 'settlement';
    syncEmbassySuspensions(state, pe);
    expect(pe.embassies[0]!.suspended).toBe(true);
  });
});
