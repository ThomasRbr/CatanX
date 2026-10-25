import type { GameCommand } from '@catanx/protocol';
import { applyCommand } from '../core/applyCommand';
import { createDefaultEngineContext } from '../core/session';
import { EngineContext } from '../core/context';
import { buildGameConfigFromPreset, type GamePreset } from '../core/presets';
import { checkVictory } from '../engine/game/GameEngine';
import {
  applyClassicBuildDecision,
  chooseClassicRecoveryCommand,
  decideClassicAI,
} from '../engine/ai/classic/ClassicAI';
import { decideCitiesKnightsPending, hasBlockingCkPending } from '../engine/citiesKnights/CitiesKnightsAI';
import { listFreeMetropolisHosts } from '../engine/citiesKnights/urban';
import { PROGRESS_HAND_LIMIT } from '../engine/citiesKnights/progress';
import type { CkUrbanTrack } from '../types/citiesKnights';
import { GameState } from '../types/game';
import type { AIDifficulty } from '../types/player';
import {
  buildSimulationPlayers,
  extractSimulationTelemetry,
  HeadlessSimulationConfig,
  SimulationResult,
} from './BalanceMetrics';
import { autoCompleteClassicSetup } from './prepareClassicSetup';

function activePlayerId(state: GameState): string | null {
  if (state.phase === 'setup') {
    return state.setupPlayerOrder[state.setupPlacementIndex] ?? null;
  }
  return state.turnOrder[state.currentPlayerIndex] ?? null;
}

function difficultyForPlayer(
  state: GameState,
  playerId: string,
  config: HeadlessSimulationConfig,
): AIDifficulty {
  const player = state.players.get(playerId);
  if (player?.aiDifficulty) return player.aiDifficulty;
  const seat = state.turnOrder.indexOf(playerId);
  if (seat >= 0 && config.aiDifficultiesBySeat?.[seat]) {
    return config.aiDifficultiesBySeat[seat]!;
  }
  return config.aiDifficulty;
}

function aiOptionsFor(
  state: GameState,
  playerId: string,
  config: HeadlessSimulationConfig,
) {
  return { difficulty: difficultyForPlayer(state, playerId, config) } as const;
}

/** Drop C&K pendings that can no longer be satisfied (anti-softlock). */
function pruneUnsatisfiableCkPendings(state: GameState): boolean {
  const ck = state.extensions?.citiesKnights;
  if (!ck?.pendingResolutions.length) return false;
  const before = ck.pendingResolutions.length;
  ck.pendingResolutions = ck.pendingResolutions.filter((r) => {
    if (r.kind === 'place_metropolis') {
      const track = r.data?.track as CkUrbanTrack | undefined;
      if (!track) return false;
      return listFreeMetropolisHosts(state, r.playerId, track).length > 0;
    }
    if (r.kind === 'discard_progress') {
      return (ck.progressHands[r.playerId]?.length ?? 0) > PROGRESS_HAND_LIMIT;
    }
    if (r.kind === 'choose_progress_deck') {
      const has = (['science', 'politics', 'trade'] as CkUrbanTrack[]).some((d) => {
        return (
          (ck.progressDecks[d]?.length ?? 0) > 0 ||
          (ck.progressDiscards?.[d]?.length ?? 0) > 0
        );
      });
      return has;
    }
    if (r.kind === 'aqueduct') {
      const bank = state.bank;
      if (!bank) return true;
      return (['wood', 'clay', 'wheat', 'sheep', 'ore'] as const).some(
        (res) => (bank[res] ?? 0) > 0,
      );
    }
    return true;
  });
  return ck.pendingResolutions.length !== before;
}

function resolveCkPending(state: GameState): GameCommand | null {
  const ck = state.extensions?.citiesKnights;
  if (!ck?.pendingResolutions.length) return null;
  pruneUnsatisfiableCkPendings(state);
  for (const pending of ck.pendingResolutions) {
    const decision = decideCitiesKnightsPending(state, pending.playerId);
    if (decision?.kind === 'command') return decision.command;
  }
  return null;
}

export function runHeadlessSimulation(
  config: HeadlessSimulationConfig,
  context?: EngineContext,
): SimulationResult {
  const ctx = context ?? createDefaultEngineContext(config.seed);
  const preset: GamePreset = config.preset ?? 'classic';
  const gameConfig = buildGameConfigFromPreset(
    preset,
    {
      mapSeed: config.seed,
      playerCount: config.playerCount,
      maxTurns: config.maxTurns,
      classicBoardLayout: config.classicBoardLayout ?? 'fixed',
      ...(config.mapSize ? { mapSize: config.mapSize } : {}),
      ...(config.extensions ? { extensions: config.extensions } : {}),
    },
    // Headless : désactiver les modules qui softlockent sans IA dédiée
    {
      events: false,
      technologies: false,
      armies: false,
      diplomacy: false,
      fogOfWar: false,
      worldCouncil: false,
      ...config.modules,
    },
  );

  const players = Array.from({ length: config.playerCount }, (_value, index) => ({
    name: `AI ${index + 1}`,
    civilization: 'empire' as const,
    type: 'ai' as const,
    aiDifficulty: config.aiDifficultiesBySeat?.[index] ?? config.aiDifficulty,
  }));

  const commandLog: GameCommand[] = [
    { type: 'create_game', config: gameConfig, players },
  ];

  let gameState: GameState;
  let steps = 0;
  let idleSteps = 0;

  const dispatch = (command: GameCommand): boolean => {
    const result = applyCommand(gameState, command, ctx);
    if (!result.ok) return false;
    gameState = result.state;
    commandLog.push(command);
    steps += 1;
    return true;
  };

  const recover = (playerId: string): boolean => {
    const fallback = chooseClassicRecoveryCommand(
      gameState,
      playerId,
      aiOptionsFor(gameState, playerId, config),
    );
    if (!fallback) return false;
    return dispatch(fallback);
  };

  const created = applyCommand(null, commandLog[0], ctx);
  if (!created.ok) {
    return {
      seed: config.seed,
      winnerId: null,
      turns: 0,
      blocked: true,
      steps,
      players: [],
      commandLog,
    };
  }
  gameState = created.state;
  if (gameState.classicBoard || preset === 'classic' || preset === 'catanx') {
    autoCompleteClassicSetup(gameState);
  }

  while (
    gameState.phase !== 'finished' &&
    gameState.currentTurn <= config.maxTurns &&
    steps < config.maxSteps &&
    idleSteps < 8
  ) {
    let progressed = false;

    const ckCmd = resolveCkPending(gameState);
    if (ckCmd) {
      if (dispatch(ckCmd)) {
        checkVictory(gameState);
        idleSteps = 0;
        continue;
      }
      // Pending refused — prune stale then continue
      if (pruneUnsatisfiableCkPendings(gameState)) {
        idleSteps = 0;
        continue;
      }
      idleSteps += 1;
      if (idleSteps >= 8) break;
      if (hasBlockingCkPending(gameState)) {
        const playerId = activePlayerId(gameState);
        if (playerId && recover(playerId)) {
          idleSteps = 0;
        }
        continue;
      }
    }

    if (gameState.pendingPlayerTrade) {
      const trade = gameState.pendingPlayerTrade;
      const rejected = new Set(trade.rejectedBy ?? []);
      const responders =
        trade.toPlayerId === null
          ? gameState.turnOrder.filter((id) => {
              if (id === trade.fromPlayerId || rejected.has(id)) return false;
              const p = gameState.players.get(id);
              return Boolean(p && !p.isEliminated);
            })
          : [trade.toPlayerId];
      const targetId = responders[0];
      if (!targetId) {
        idleSteps += 1;
        continue;
      }
      const decision = decideClassicAI(
        gameState,
        targetId,
        aiOptionsFor(gameState, targetId, config),
      );
      if (decision?.kind === 'command' && dispatch(decision.command)) {
        progressed = true;
      } else {
        dispatch({
          type: 'reject_player_trade',
          playerId: targetId,
          tradeId: trade.id,
        });
        progressed = true;
      }
      checkVictory(gameState);
      idleSteps = progressed ? 0 : idleSteps + 1;
      continue;
    }

    if (gameState.turnPhase === 'discard_resources' && gameState.sevenFlow) {
      const nextToDiscard = gameState.sevenFlow.playersToDiscard.find(
        (playerId) => !gameState.sevenFlow!.playersDiscarded.includes(playerId),
      );
      if (nextToDiscard) {
        const decision = decideClassicAI(
          gameState,
          nextToDiscard,
          aiOptionsFor(gameState, nextToDiscard, config),
        );
        if (decision?.kind === 'command' && dispatch(decision.command)) {
          progressed = true;
        } else if (recover(nextToDiscard)) {
          progressed = true;
        }
        checkVictory(gameState);
        idleSteps = progressed ? 0 : idleSteps + 1;
        continue;
      }
    }

    const playerId = activePlayerId(gameState);
    if (!playerId) {
      idleSteps += 1;
      continue;
    }

    const decision = decideClassicAI(
      gameState,
      playerId,
      aiOptionsFor(gameState, playerId, config),
    );

    if (!decision) {
      if (recover(playerId)) progressed = true;
      idleSteps = progressed ? 0 : idleSteps + 1;
      continue;
    }

    if (decision.kind === 'build') {
      const buildResult = applyClassicBuildDecision(
        gameState,
        playerId,
        decision.tileId,
        decision.buildingId,
      );
      if (buildResult.success) {
        steps += 1;
        progressed = true;
      } else if (recover(playerId)) {
        progressed = true;
      }
      checkVictory(gameState);
      idleSteps = progressed ? 0 : idleSteps + 1;
      continue;
    }

    if (decision.kind === 'setup_intersection' || decision.kind === 'setup_road') {
      idleSteps += 1;
      continue;
    }

    if (dispatch(decision.command)) {
      progressed = true;
    } else if (recover(playerId)) {
      progressed = true;
    }

    checkVictory(gameState);
    idleSteps = progressed ? 0 : idleSteps + 1;
  }

  const winnerId = gameState.winner ?? null;
  const blocked = idleSteps >= 8 && gameState.phase !== 'finished';
  const seasons = gameState.extensions?.seasons;
  const seasonsEnabled = Boolean(seasons);
  const severeClimateCount = seasons
    ? seasons.history.filter((h) => h.severity === 'severe').length
    : 0;
  const telemetry = extractSimulationTelemetry(commandLog);
  const undergroundSkyEnabled = Boolean(gameState.extensions?.undergroundSky);

  return {
    seed: config.seed,
    winnerId,
    turns: gameState.currentTurn,
    blocked,
    steps,
    players: buildSimulationPlayers(gameState, winnerId),
    commandLog,
    seasonsEnabled,
    severeClimateCount,
    undergroundSkyEnabled,
    usAirportTurn: telemetry.usAirportTurn,
    usContractsCompleted: telemetry.usContractsCompleted,
    playerTradesProposed: telemetry.playerTradesProposed,
    playerTradesAccepted: telemetry.playerTradesAccepted,
    longestRoadOwner: gameState.longestRoadOwner ?? null,
    largestArmyOwner: gameState.largestArmyOwner ?? null,
  };
}

export function runHeadlessBatch(
  seeds: number[],
  config: Omit<HeadlessSimulationConfig, 'seed'>,
): SimulationResult[] {
  return seeds.map((seed) => runHeadlessSimulation({ ...config, seed }));
}
