import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildGameConfigFromPreset,
  createDefaultEngineContext,
  chooseClassicRecoveryCommand,
  decideClassicAI,
  createEmptyBalanceMetrics,
  mergeSimulationIntoMetrics,
  prepareClassicSetupState,
  autoCompleteClassicSetup,
  runHeadlessBatch,
  runHeadlessSimulation,
  summarizeMetrics,
} from '@catanx/engine';
import type { GameCommand } from '@catanx/protocol';

describe('ClassicAI', () => {
  it('propose un placement setup valide', () => {
    const config = buildGameConfigFromPreset('classic', { mapSeed: 21, playerCount: 2 });
    const ctx = createDefaultEngineContext(21);
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'ai', aiDifficulty: 'medium' },
          { name: 'B', civilization: 'empire', type: 'ai', aiDifficulty: 'medium' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    prepareClassicSetupState(created.state);
    const playerId = created.state.setupPlayerOrder[0];
    const decision = decideClassicAI(created.state, playerId, { difficulty: 'medium' });
    expect(decision?.kind).toBe('command');
    if (!decision || decision.kind !== 'command') return;
    expect(decision.command.type).toBe('setup_place_settlement');
  });

  it('propose une construction topologique mid-game quand les ressources suffisent', () => {
    const config = buildGameConfigFromPreset('classic', { mapSeed: 21, playerCount: 2 });
    const ctx = createDefaultEngineContext(21);
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'ai', aiDifficulty: 'legendary' },
          { name: 'B', civilization: 'empire', type: 'ai', aiDifficulty: 'easy' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const state = created.state;
    autoCompleteClassicSetup(state);
    const playerId = state.turnOrder[0];
    const player = state.players.get(playerId)!;
    state.turnPhase = 'player_action';
    state.currentPlayerIndex = 0;
    player.resources = {
      ...player.resources,
      wood: 10,
      clay: 10,
      wheat: 10,
      sheep: 10,
      ore: 0, // évite draw_dev prioritaire ; force construction
    };

    const decision = decideClassicAI(state, playerId, { difficulty: 'legendary' });
    expect(decision?.kind).toBe('command');
    if (!decision || decision.kind !== 'command') return;
    expect(['build_road', 'build_settlement', 'upgrade_city', 'bank_trade']).toContain(
      decision.command.type,
    );
  });

  it('termine un tour classique sans bloquer', () => {
    const config = buildGameConfigFromPreset('classic', { mapSeed: 21, playerCount: 2 });
    const ctx = createDefaultEngineContext(21);
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'ai', aiDifficulty: 'easy' },
          { name: 'B', civilization: 'empire', type: 'ai', aiDifficulty: 'easy' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    let state = created.state;
    autoCompleteClassicSetup(state);
    expect(state.phase).toBe('playing');

    let actions = 0;
    for (let step = 0; step < 40; step += 1) {
      if (state.turnPhase === 'discard_resources' && state.sevenFlow) {
        const nextToDiscard = state.sevenFlow.playersToDiscard.find(
          (playerId) => !state.sevenFlow!.playersDiscarded.includes(playerId),
        );
        if (nextToDiscard) {
          const discardDecision = decideClassicAI(state, nextToDiscard, { difficulty: 'easy' });
          if (discardDecision?.kind === 'command') {
            const discardResult = applyCommand(state, discardDecision.command, ctx);
            if (discardResult.ok) {
              state = discardResult.state;
              actions += 1;
            }
          }
          continue;
        }
      }

      const playerId = state.turnOrder[state.currentPlayerIndex];
      const decision = decideClassicAI(state, playerId, { difficulty: 'easy' });
      if (!decision) break;

      if (decision.kind === 'build') {
        // Hors classique uniquement ; en classique les builds sont des commandes.
        applyCommand(state, { type: 'end_turn', playerId }, ctx);
        continue;
      }

      if (decision.kind !== 'command') break;
      const result = applyCommand(state, decision.command, ctx);
      if (result.ok) {
        state = result.state;
        actions += 1;
      }
      if (state.phase === 'finished') break;
    }

    expect(actions).toBeGreaterThanOrEqual(3);
  });
  it('autorise chaque joueur à lancer les dés pendant un tour global', () => {
    const config = buildGameConfigFromPreset('classic', { mapSeed: 31, playerCount: 2 });
    const ctx = createDefaultEngineContext(31);
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'ai' },
          { name: 'B', civilization: 'empire', type: 'ai' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    let state = created.state;
    autoCompleteClassicSetup(state);

    const first = state.turnOrder[0];
    const second = state.turnOrder[1];
    const rollA = applyCommand(state, { type: 'roll_dice', playerId: first }, ctx);
    expect(rollA.ok).toBe(true);
    if (!rollA.ok) return;
    state = rollA.state;
    const ackA = applyCommand(state, { type: 'acknowledge_collection', playerId: first }, ctx);
    expect(ackA.ok).toBe(true);
    if (!ackA.ok) return;
    state = ackA.state;
    const endA = applyCommand(state, { type: 'end_turn', playerId: first }, ctx);
    expect(endA.ok).toBe(true);
    if (!endA.ok) return;
    state = endA.state;

    const rollB = applyCommand(state, { type: 'roll_dice', playerId: second }, ctx);
    expect(rollB.ok).toBe(true);
  });
});

describe('HeadlessSimulator', () => {
  it('joue une partie automatisée sans blocage', () => {
    const result = runHeadlessSimulation({
      seed: 21,
      playerCount: 2,
      maxTurns: 60,
      maxSteps: 1500,
      aiDifficulty: 'easy',
    });

    expect(result.blocked).toBe(false);
    expect(result.steps).toBeGreaterThan(20);
    expect(result.players.length).toBe(2);
    expect(result.turns).toBeGreaterThan(1);
  });

  it('produit des métriques agrégées sur un lot', () => {
    const batch = runHeadlessBatch([11, 12, 13], {
      playerCount: 2,
      maxTurns: 60,
      maxSteps: 900,
      aiDifficulty: 'easy',
    });

    let metrics = createEmptyBalanceMetrics();
    for (const game of batch) {
      metrics = mergeSimulationIntoMetrics(metrics, game);
    }

    const summary = summarizeMetrics(metrics);
    expect(metrics.gamesPlayed).toBe(3);
    expect(summary.blockRate).toBeLessThanOrEqual(1);
    expect(summary.averageStepsPerGame).toBeGreaterThan(0);
  });

  it('reste déterministe pour une même graine', () => {
    const config = {
      seed: 77,
      playerCount: 2,
      maxTurns: 40,
      maxSteps: 500,
      aiDifficulty: 'medium' as const,
    };
    const a = runHeadlessSimulation(config, createDefaultEngineContext(77));
    const b = runHeadlessSimulation(config, createDefaultEngineContext(77));
    expect(a.blocked).toBe(b.blocked);
    expect(a.turns).toBe(b.turns);
    expect(a.steps).toBe(b.steps);
    expect(a.commandLog.length).toBe(b.commandLog.length);
  });
});

describe('ClassicAI recovery', () => {
  it('propose une commande de secours en phase collecte', () => {
    const config = buildGameConfigFromPreset('classic', { mapSeed: 8, playerCount: 2 });
    const ctx = createDefaultEngineContext(8);
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'ai' },
          { name: 'B', civilization: 'empire', type: 'ai' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const state = created.state;
    autoCompleteClassicSetup(state);
    state.turnPhase = 'resource_collect';
    const playerId = state.turnOrder[state.currentPlayerIndex];
    const recovery = chooseClassicRecoveryCommand(state, playerId, { difficulty: 'medium' });
    expect(recovery?.type).toBe('acknowledge_collection');
  });
});

describe('ClassicAI fairness', () => {
  it('ne lit que des informations publiques (décision vol aléatoire légale)', () => {
    const config = buildGameConfigFromPreset('classic', { mapSeed: 5, playerCount: 2 });
    const ctx = createDefaultEngineContext(5);
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: [
          { name: 'A', civilization: 'empire', type: 'ai' },
          { name: 'B', civilization: 'empire', type: 'ai' },
        ],
      },
      ctx,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const state = created.state;
    const opponentId = state.turnOrder[1];
    state.phase = 'playing';
    state.turnPhase = 'steal_resource';
    state.sevenFlow = {
      playersToDiscard: [],
      playersDiscarded: [],
      stealCandidates: [opponentId],
      robberTileId: state.robberPosition ?? 'tile_0',
    };

    const decision = decideClassicAI(state, state.turnOrder[0], { difficulty: 'hard' });
    expect(decision?.kind).toBe('command');
    if (!decision || decision.kind !== 'command') return;
    const cmd = decision.command as Extract<GameCommand, { type: 'steal_resource' }>;
    expect(cmd.type).toBe('steal_resource');
    expect(cmd.targetPlayerId === opponentId || cmd.targetPlayerId === null).toBe(true);
  });
});
