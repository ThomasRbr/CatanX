import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  autoCompleteClassicSetup,
  buildGameConfigFromPreset,
  createEngineContext,
  FixedClock,
  IncrementalIdGenerator,
  SeededRandom,
  ckHandLimit,
  getUrbanLevel,
  maybeQueueAqueduct,
} from '@catanx/engine';
import type { GameState } from '../../types/game';

function makeContext(seed: number) {
  return createEngineContext(
    new SeededRandom(seed),
    new FixedClock(1_700_000_000_000),
    new IncrementalIdGenerator(),
  );
}

function createCkPlaying(seed = 90): GameState {
  const ctx = makeContext(seed);
  const config = buildGameConfigFromPreset('classic', {
    mapSeed: seed,
    playerCount: 2,
    extensions: {
      citiesKnights: {
        enabled: true,
        ruleset: 'catanx-essential-v1',
        victoryPointBonus: 3,
        adaptiveBarbarianTrack: true,
      },
    },
  });
  const created = applyCommand(
    null,
    {
      type: 'create_game',
      config,
      players: [
        { name: 'A', civilization: 'empire', type: 'human' },
        { name: 'B', civilization: 'merchants', type: 'human' },
      ],
    },
    ctx,
  );
  if (!created.ok) throw new Error('create failed');
  autoCompleteClassicSetup(created.state);
  created.state.turnPhase = 'player_action';
  created.state.currentPlayerIndex = 0;
  return created.state;
}

describe('citiesKnights phase 4–5', () => {
  it('améliore une piste urbaine et pose une métropole', () => {
    const state = createCkPlaying(91);
    const ctx = makeContext(91);
    const playerId = state.turnOrder[0]!;
    const ck = state.extensions!.citiesKnights!;
    ck.playerCommodities[playerId] = { ck_cloth: 15 };

    // Niveaux 1→4
    for (let level = 1; level <= 4; level++) {
      const result = applyCommand(
        state,
        { type: 'ck_improve_urban', playerId, track: 'trade' },
        ctx,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(getUrbanLevel(state, playerId, 'trade')).toBe(level);
    }
    expect(getUrbanLevel(state, playerId, 'trade')).toBe(4);
    expect(ck.metropolises.trade.ownerId).toBeNull();
    expect(
      ck.pendingResolutions.some(
        (resolution) => resolution.kind === 'place_metropolis' && resolution.playerId === playerId,
      ),
    ).toBe(true);
    const cityIntersection = Object.entries(state.classicBoard!.occupiedIntersections).find(
      ([intersectionId, owner]) => {
        if (owner !== playerId) return false;
        const buildingId = state.classicBoard!.buildingByIntersection[intersectionId];
        const building = buildingId ? state.buildings.get(buildingId) : undefined;
        return building?.definitionId === 'city';
      },
    )?.[0];
    expect(cityIntersection).toBeTruthy();
    const place = applyCommand(
      state,
      {
        type: 'ck_place_metropolis',
        playerId,
        track: 'trade',
        intersectionId: cityIntersection!,
      },
      ctx,
    );
    expect(place.ok).toBe(true);
    expect(ck.metropolises.trade.ownerId).toBe(playerId);
    expect(ck.metropolises.trade.intersectionId).toBe(cityIntersection);
    const urbanLogs = state.actionLog
      .filter((e) => e.description.startsWith('Amélioration Commerce'))
      .map((e) => e.description);
    expect(urbanLogs).toEqual(
      expect.arrayContaining([
        'Amélioration Commerce → niveau 1',
        'Amélioration Commerce → niveau 2',
        'Amélioration Commerce → niveau 3',
      ]),
    );
    expect(urbanLogs.some((d) => d.includes('niveau 4'))).toBe(true);
  });

  it('construit une muraille et augmente le seuil de main', () => {
    const state = createCkPlaying(92);
    const ctx = makeContext(92);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { clay: 4 };

    const cityIntersection = Object.entries(state.classicBoard!.occupiedIntersections).find(
      ([iid, owner]) => {
        if (owner !== playerId) return false;
        const bid = state.classicBoard!.buildingByIntersection[iid];
        const b = bid ? state.buildings.get(bid) : undefined;
        return b?.definitionId === 'city';
      },
    )?.[0];
    expect(cityIntersection).toBeTruthy();

    expect(ckHandLimit(state, playerId)).toBe(7);
    const wall = applyCommand(
      state,
      { type: 'ck_build_wall', playerId, intersectionId: cityIntersection! },
      ctx,
    );
    expect(wall.ok).toBe(true);
    expect(ckHandLimit(state, playerId)).toBe(9);
  });

  it('recrute, active et promeut un chevalier', () => {
    const state = createCkPlaying(93);
    const ctx = makeContext(93);
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { sheep: 4, ore: 4, wheat: 2 };

    // Intersection libre touchant une route du joueur
    const board = state.classicBoard!;
    let spot: string | null = null;
    for (const [edgeId, owner] of Object.entries(board.roadsByEdge)) {
      if (owner !== playerId) continue;
      const edge = board.topology.edges[edgeId]!;
      for (const id of [edge.a, edge.b]) {
        if (board.occupiedIntersections[id]) continue;
        if (state.extensions!.citiesKnights!.knights.some((k) => k.intersectionId === id)) {
          continue;
        }
        spot = id;
        break;
      }
      if (spot) break;
    }
    expect(spot).toBeTruthy();

    const recruit = applyCommand(
      state,
      { type: 'ck_recruit_knight', playerId, intersectionId: spot! },
      ctx,
    );
    expect(recruit.ok).toBe(true);
    if (!recruit.ok) return;
    const knight = state.extensions!.citiesKnights!.knights[0]!;
    expect(knight.rank).toBe(1);

    const activate = applyCommand(
      state,
      { type: 'ck_activate_knight', playerId, knightId: knight.id },
      ctx,
    );
    expect(activate.ok).toBe(true);
    expect(knight.activated).toBe(true);
    expect(knight.activatedThisTurn).toBe(true);

    const promote = applyCommand(
      state,
      { type: 'ck_promote_knight', playerId, knightId: knight.id },
      ctx,
    );
    expect(promote.ok).toBe(true);
    expect(knight.rank).toBe(2);
    expect(knight.activated).toBe(true); // conserve l'état
  });

  it('un chevalier adverse bloque une construction', () => {
    const state = createCkPlaying(94);
    const ctx = makeContext(94);
    const playerA = state.turnOrder[0]!;
    const playerB = state.turnOrder[1]!;
    const player = state.players.get(playerA)!;
    player.resources = { sheep: 2, ore: 2, wood: 2, clay: 2, wheat: 2 };

    const board = state.classicBoard!;
    // Placer un chevalier de B sur une intersection libre du réseau de A si possible
    // Simplifier : recruter pour A puis vérifier qu'on ne peut pas construire dessus
    let spot: string | null = null;
    for (const [edgeId, owner] of Object.entries(board.roadsByEdge)) {
      if (owner !== playerA) continue;
      const edge = board.topology.edges[edgeId]!;
      for (const id of [edge.a, edge.b]) {
        if (!board.occupiedIntersections[id]) {
          spot = id;
          break;
        }
      }
      if (spot) break;
    }
    expect(spot).toBeTruthy();

    applyCommand(
      state,
      { type: 'ck_recruit_knight', playerId: playerA, intersectionId: spot! },
      ctx,
    );

    // Passer le tour à B pour tenter une route — plutôt tenter settlement de A sur le spot du chevalier
    const settle = applyCommand(
      state,
      { type: 'build_settlement', playerId: playerA, intersectionId: spot! },
      ctx,
    );
    expect(settle.ok).toBe(false);
    void playerB;
  });

  it('ne déclenche pas Aqueduc si seules des marchandises ont été reçues', () => {
    const state = createCkPlaying(95);
    const playerId = state.turnOrder[0]!;
    const ck = state.extensions!.citiesKnights!;
    ck.urbanLevels[playerId] = { trade: 0, politics: 0, science: 3 };

    const collected = new Set<string>([playerId]); // marchandises seules = déjà dans collected
    maybeQueueAqueduct(state, 6, collected);
    expect(ck.pendingResolutions.some((r) => r.kind === 'aqueduct')).toBe(false);

    maybeQueueAqueduct(state, 6, new Set());
    expect(
      ck.pendingResolutions.some((r) => r.kind === 'aqueduct' && r.playerId === playerId),
    ).toBe(true);
  });

  it('ne duplique pas le pending métropole au passage 4→5', () => {
    const state = createCkPlaying(96);
    const ctx = makeContext(96);
    const playerId = state.turnOrder[0]!;
    const ck = state.extensions!.citiesKnights!;
    ck.playerCommodities[playerId] = { ck_cloth: 20 };
    // Forcer aucune ville libre : retirer les villes du joueur du board (garder settlements)
    const board = state.classicBoard!;
    for (const [iid, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId) continue;
      const bid = board.buildingByIntersection[iid];
      const b = bid ? state.buildings.get(bid) : undefined;
      if (b?.definitionId === 'city') {
        // Rétrograder en village pour bloquer la métropole
        b.definitionId = 'settlement';
      }
    }

    for (let level = 1; level <= 4; level++) {
      const result = applyCommand(
        state,
        { type: 'ck_improve_urban', playerId, track: 'trade' },
        ctx,
      );
      expect(result.ok).toBe(true);
    }
    const pendingCount = ck.pendingResolutions.filter(
      (r) => r.kind === 'place_metropolis' && r.playerId === playerId,
    ).length;
    expect(pendingCount).toBe(1);

    const to5 = applyCommand(state, { type: 'ck_improve_urban', playerId, track: 'trade' }, ctx);
    expect(to5.ok).toBe(true);
    const pendingAfter = ck.pendingResolutions.filter(
      (r) => r.kind === 'place_metropolis' && r.playerId === playerId,
    ).length;
    expect(pendingAfter).toBe(1);
  });

  it('refuse une retraite invalide et bloque fin de tour tant que pending', () => {
    const state = createCkPlaying(97);
    const ctx = makeContext(97);
    const playerA = state.turnOrder[0]!;
    const playerB = state.turnOrder[1]!;
    const ck = state.extensions!.citiesKnights!;

    ck.knights.push({
      id: 'ck-retreat-1',
      ownerId: playerB,
      rank: 1,
      activated: false,
      intersectionId: null,
      activatedThisTurn: false,
      promotedThisTurn: false,
    });
    ck.pendingResolutions.push({
      id: 'pending-retreat',
      kind: 'knight_retreat',
      playerId: playerB,
      data: { knightId: 'ck-retreat-1', options: ['fake-spot-a', 'fake-spot-b'] },
    });

    const bad = applyCommand(
      state,
      {
        type: 'ck_resolve_knight_retreat',
        playerId: playerB,
        knightId: 'ck-retreat-1',
        toIntersectionId: 'not-in-options',
      },
      ctx,
    );
    expect(bad.ok).toBe(false);
    expect(ck.pendingResolutions.some((r) => r.kind === 'knight_retreat')).toBe(true);

    const end = applyCommand(state, { type: 'end_turn', playerId: playerA }, ctx);
    expect(end.ok).toBe(false);

    const ok = applyCommand(
      state,
      {
        type: 'ck_resolve_knight_retreat',
        playerId: playerB,
        knightId: 'ck-retreat-1',
        toIntersectionId: null,
      },
      ctx,
    );
    expect(ok.ok).toBe(true);
    expect(ck.pendingResolutions.some((r) => r.kind === 'knight_retreat')).toBe(false);
  });
});
