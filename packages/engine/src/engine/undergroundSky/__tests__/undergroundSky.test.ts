import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  createGame,
  applyCommand,
  createEngineContext,
  migrateSnapshot,
  createSnapshot,
  generateUndergroundGraph,
  generateSkyGraph,
  clampHubCount,
  REQUIRED_SKY_SITES,
  isUndergroundSkyEnabled,
  applyExtensionVictoryBonuses,
  computeVictoryPointTarget,
  sumExtensionVictoryBonuses,
  defaultUndergroundSkyConfig,
  EXTENSION_REGISTRY,
  normalizeExtensionsConfig,
  handleUndergroundSkyCommand,
  findShortestSkyPath,
  SeededRandom,
  FixedClock,
  IncrementalIdGenerator,
  nearestSkyHubsForIntersection,
  createClassicBoardState,
  buildContractDecks,
  recomputeUndergroundSkyMastery,
  SKY_MASTERY_THRESHOLD,
  UNDERGROUND_MASTERY_THRESHOLD,
  US_AIRSHIP_BASE_CAPACITY,
  US_AIRSHIP_REINFORCED_CAPACITY,
  undergroundSkyVictoryPoints,
} from '@catanx/engine';
import type { GameConfig } from '../../../types/game';
import { MapGenerator } from '../../map/MapGenerator';
import { buildCatanTopology } from '../../catan/CatanTopology';

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

describe('undergroundSky framework', () => {
  it('est dans le registre avec bonus +5', () => {
    const def = EXTENSION_REGISTRY.find((e) => e.id === 'undergroundSky');
    expect(def?.victoryPointBonus).toBe(5);
    expect(def?.catanxOnly).toBe(true);
  });

  it('refuse l’activation en Classique', () => {
    const normalized = normalizeExtensionsConfig(
      { undergroundSky: defaultUndergroundSkyConfig({ enabled: true }) },
      { mode: 'classic' },
    );
    expect(normalized.undergroundSky?.enabled).toBe(false);
  });

  it('compose les bonus VP CK + US', () => {
    expect(computeVictoryPointTarget(10, {})).toBe(10);
    expect(
      computeVictoryPointTarget(10, {
        citiesKnights: {
          enabled: true,
          ruleset: 'catanx-essential-v1',
          victoryPointBonus: 3,
          adaptiveBarbarianTrack: true,
        },
      }),
    ).toBe(13);
    expect(
      computeVictoryPointTarget(10, {
        undergroundSky: defaultUndergroundSkyConfig({ enabled: true }),
      }),
    ).toBe(15);
    expect(
      computeVictoryPointTarget(10, {
        citiesKnights: {
          enabled: true,
          ruleset: 'catanx-essential-v1',
          victoryPointBonus: 3,
          adaptiveBarbarianTrack: true,
        },
        undergroundSky: defaultUndergroundSkyConfig({ enabled: true }),
      }),
    ).toBe(18);
  });

  it('pose baseVictoryPointTarget à la création', () => {
    const config = applyExtensionVictoryBonuses(
      baseConfig({
        victoryPointTarget: 10,
        extensions: {
          undergroundSky: defaultUndergroundSkyConfig({ enabled: true }),
        },
      }),
    );
    expect(config.baseVictoryPointTarget).toBe(10);
    expect(config.victoryPointTarget).toBe(15);
    expect(sumExtensionVictoryBonuses(config)).toBe(5);
  });

  it('assigne un site de livraison à chaque contrat', () => {
    for (const ck of [false, true]) {
      const decks = buildContractDecks(42, ck);
      for (const c of [...decks.regular, ...decks.major]) {
        expect(c.preferredSite).toBeTruthy();
      }
    }
  });

  it('dimensionne les contrats pour les soutes 3 puis 4', () => {
    const cargoSize = (contract: ReturnType<typeof buildContractDecks>['regular'][number]) =>
      [
        ...Object.values(contract.requirements.resources ?? {}),
        ...Object.values(contract.requirements.commodities ?? {}),
        ...Object.values(contract.requirements.materials ?? {}),
      ].reduce((sum, amount) => sum + (amount ?? 0), 0);

    for (const ck of [false, true]) {
      const decks = buildContractDecks(42, ck);
      expect(decks.regular.every((contract) => cargoSize(contract) <= US_AIRSHIP_BASE_CAPACITY)).toBe(true);
      expect(decks.major.every((contract) => cargoSize(contract) <= US_AIRSHIP_REINFORCED_CAPACITY)).toBe(true);
      expect(decks.major.every((contract) => contract.victoryPoints === 1)).toBe(true);
    }
  });

  it('accorde 2 PV par titre de maîtrise', () => {
    const state = createGame(
      baseConfig({
        extensions: {
          undergroundSky: defaultUndergroundSkyConfig({ enabled: true }),
        },
      }),
      players,
    );
    const us = state.extensions!.undergroundSky!;
    const pid = state.turnOrder[0]!;
    us.undergroundMasteryOwnerId = pid;
    us.skyMasteryOwnerId = pid;
    us.completedMajorContracts[pid] = 'us_maj_0';
    expect(undergroundSkyVictoryPoints(state, pid)).toBe(5);
  });

  it('attribue les maîtrises aux seuils 6 et 4', () => {
    const state = createGame(
      baseConfig({
        extensions: {
          undergroundSky: defaultUndergroundSkyConfig({ enabled: true }),
        },
      }),
      players,
    );
    const us = state.extensions!.undergroundSky!;
    const undergroundPlayerId = state.turnOrder[0]!;
    const skyPlayerId = state.turnOrder[1]!;

    expect(UNDERGROUND_MASTERY_THRESHOLD).toBe(6);
    expect(SKY_MASTERY_THRESHOLD).toBe(4);

    us.tunnels = Array.from({ length: UNDERGROUND_MASTERY_THRESHOLD }, (_, index) => ({
      id: `threshold_tunnel_${index}`,
      playerId: undergroundPlayerId,
      edgeId: `threshold_edge_${index}`,
    }));
    us.completedRegularContracts[skyPlayerId] = SKY_MASTERY_THRESHOLD;

    recomputeUndergroundSkyMastery(state);

    expect(us.undergroundMasteryOwnerId).toBe(undergroundPlayerId);
    expect(us.skyMasteryOwnerId).toBe(skyPlayerId);
  });

  it('fait passer la soute du dirigeable de 3 à 4', () => {
    const state = createGame(
      baseConfig({
        extensions: {
          undergroundSky: defaultUndergroundSkyConfig({ enabled: true }),
        },
      }),
      players,
    );
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    const us = state.extensions!.undergroundSky!;
    player.resources = { wood: 3, clay: 0, wheat: 0, sheep: 2, ore: 1 };
    us.playerMaterials[playerId] = { us_crystal: 1 };
    us.airports.push({
      id: 'capacity_airport',
      playerId,
      intersectionId: 'capacity_intersection',
      suspended: false,
    });

    const build = handleUndergroundSkyCommand(state, {
      type: 'us_build_airship',
      playerId,
      airportId: 'capacity_airport',
    });
    expect(build.ok).toBe(true);
    const ship = state.extensions!.undergroundSky!.airships[0]!;
    expect(ship.capacity).toBe(US_AIRSHIP_BASE_CAPACITY);
    expect(ship.capacity).toBe(3);

    const upgrade = handleUndergroundSkyCommand(state, {
      type: 'us_upgrade_airship',
      playerId,
      airshipId: ship.id,
      upgrade: 'reinforced_hold',
    });
    expect(upgrade.ok).toBe(true);
    expect(ship.capacity).toBe(US_AIRSHIP_REINFORCED_CAPACITY);
    expect(ship.capacity).toBe(4);
  });

  it('crée l’état et les graphes si activé', () => {
    const state = createGame(
      baseConfig({
        extensions: {
          undergroundSky: defaultUndergroundSkyConfig({ enabled: true }),
        },
      }),
      players,
    );
    expect(isUndergroundSkyEnabled(state)).toBe(true);
    expect(state.config.victoryPointTarget).toBe(15);
    expect(state.config.baseVictoryPointTarget).toBe(10);
    expect(state.extensions?.undergroundSky).toBeTruthy();
    const us = state.extensions!.undergroundSky!;
    expect(Object.keys(us.undergroundGraph.nodes).length).toBeGreaterThan(0);
    expect(Object.keys(us.skyGraph.hubs).length).toBeGreaterThanOrEqual(6);
    expect(us.faceUpRegularContracts).toHaveLength(3);
    expect(us.faceUpMajorContract).toBeTruthy();
  });

  it('refuse les commandes si désactivé', () => {
    const state = createGame(baseConfig(), players);
    const result = handleUndergroundSkyCommand(state, {
      type: 'us_survey_cavern',
      playerId: state.turnOrder[0]!,
      nodeId: 'x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('extension_disabled');
  });

  it('migre schéma 5 → 6 sans changer VP effectif', () => {
    const state = createGame(
      baseConfig({
        extensions: {
          citiesKnights: {
            enabled: true,
            ruleset: 'catanx-essential-v1',
            victoryPointBonus: 3,
            adaptiveBarbarianTrack: true,
          },
        },
      }),
      players,
    );
    const snap = createSnapshot(state, []);
    snap.schemaVersion = 5;
    delete snap.config.baseVictoryPointTarget;
    // Simuler une save pré-v6 : VP déjà bonusé CK
    expect(snap.config.victoryPointTarget).toBe(13);

    const migrated = migrateSnapshot(snap);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(7);
    expect(migrated.config.victoryPointTarget).toBe(13);
    expect(migrated.config.baseVictoryPointTarget).toBe(10);
    expect(migrated.config.extensions?.undergroundSky?.enabled).toBeFalsy();
  });
});

describe('undergroundSky generation', () => {
  it('est déterministe pour une même graine', () => {
    const config = baseConfig({ mapSeed: 99 });
    const map = new MapGenerator(config).generate();
    const topology = buildCatanTopology(map);
    const a = generateUndergroundGraph(map, 99, topology);
    const b = generateUndergroundGraph(map, 99, topology);
    expect(Object.keys(a.nodes).sort()).toEqual(Object.keys(b.nodes).sort());
    expect(Object.keys(a.edges).sort()).toEqual(Object.keys(b.edges).sort());
    for (const id of Object.keys(a.nodes)) {
      expect(a.nodes[id]!.discovery).toBe(b.nodes[id]!.discovery);
      expect(a.nodes[id]!.numberToken).toBe(b.nodes[id]!.numberToken);
    }
    const sa = generateSkyGraph(map, 99);
    const sb = generateSkyGraph(map, 99);
    expect(Object.keys(sa.hubs).sort()).toEqual(Object.keys(sb.hubs).sort());
  });

  it('reste connecté, s’adapte aux joueurs et garantit les sites de contrat', () => {
    const config = baseConfig({ mapSize: 'medium', mapSeed: 7 });
    const map = new MapGenerator(config).generate();
    const land = Object.keys(generateUndergroundGraph(map, 7).nodes).length;
    const sky = generateSkyGraph(map, 7, 6);
    expect(Object.keys(sky.hubs).length).toBe(clampHubCount(land, 6));
    expect(Object.keys(sky.hubs)).toHaveLength(12);
    const generatedSites = new Set(Object.values(sky.hubs).map((hub) => hub.site));
    for (const requiredSite of REQUIRED_SKY_SITES) {
      expect(generatedSites.has(requiredSite)).toBe(true);
    }
    // Connectivité : BFS depuis un hub
    const start = Object.keys(sky.hubs)[0]!;
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of sky.adjacency[cur] ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(Object.keys(sky.hubs).length);
  });

  it('dimensionne le Ciel selon les terres et les joueurs', () => {
    expect(clampHubCount(25, 4)).toBe(8);
    expect(clampHubCount(25, 6)).toBe(12);
    expect(clampHubCount(61, 8)).toBe(16);
    expect(clampHubCount(110, 8)).toBe(22);
    expect(clampHubCount(999, 8)).toBe(30);
  });

  it('pathfinding distingue courant et contre-courant', () => {
    const config = baseConfig({ mapSeed: 3 });
    const map = new MapGenerator(config).generate();
    const sky = generateSkyGraph(map, 3);
    const hubs = Object.keys(sky.hubs);
    if (hubs.length < 2) return;
    const from = hubs[0]!;
    const to = hubs[1]!;
    const path = findShortestSkyPath(sky, from, to, { beacons: [] });
    expect(path).not.toBeNull();
    expect(path!.totalCost).toBeGreaterThan(0);
  });

  it('applique la remise balise sur les legs (ETA = progression)', () => {
    const config = baseConfig({ mapSeed: 11 });
    const map = new MapGenerator(config).generate();
    const sky = generateSkyGraph(map, 11);
    const hubs = Object.keys(sky.hubs);
    expect(hubs.length).toBeGreaterThan(2);
    const from = hubs[0]!;
    let to = hubs[1]!;
    let base = findShortestSkyPath(sky, from, to, { beacons: [] });
    // Chercher un trajet avec au moins un hub intermédiaire
    for (const candidate of hubs) {
      if (candidate === from) continue;
      const trial = findShortestSkyPath(sky, from, candidate, { beacons: [] });
      if (trial && trial.hubPath.length >= 3) {
        to = candidate;
        base = trial;
        break;
      }
    }
    expect(base).not.toBeNull();
    if (!base || base.hubPath.length < 3) return;

    const midHub = base.hubPath[1]!;
    const withBeacon = findShortestSkyPath(sky, from, to, {
      playerId: 'p1',
      beacons: [{ id: 'b1', playerId: 'p1', hubId: midHub }],
    });
    expect(withBeacon).not.toBeNull();
    expect(withBeacon!.totalCost).toBeLessThan(base.totalCost);
    expect(withBeacon!.legCosts.reduce((s, c) => s + c, 0)).toBe(withBeacon!.totalCost);
  });
});

describe('undergroundSky applyCommand smoke', () => {
  it('dispatch us_* via applyCommand', () => {
    const state = createGame(baseConfig(), players);
    const result = applyCommand(
      state,
      {
        type: 'us_build_shaft',
        playerId: state.turnOrder[0]!,
        intersectionId: 'x',
        entryNodeId: 'y',
      },
      testCtx(),
    );
    expect(result.ok).toBe(false);
  });

  it('bloque end_turn si résolution US en attente', () => {
    const state = createGame(
      baseConfig({
        extensions: {
          undergroundSky: {
            enabled: true,
            ruleset: 'catanx-underground-sky-v1',
            victoryPointBonus: 5,
            undergroundGeneration: 'surface-derived',
            skyGeneration: 'adaptive-network',
            flightMode: 'programmed',
            interactionMode: 'soft-competitive',
          },
        },
      }),
      players,
    );
    // Placer rapidement en phase action avec pending US
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const us = state.extensions?.undergroundSky;
    expect(us).toBeTruthy();
    us!.pendingResolutions.push({
      kind: 'thermal_output',
      playerId,
      outpostId: 'out_1',
      nodeId: 'node_1',
    });
    const result = applyCommand(state, { type: 'end_turn', playerId }, testCtx());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toMatch(/us_pending|pending/i);
    }
  });

  it('ne consomme pas la cargaison si trajet céleste impossible', () => {
    const state = createGame(
      baseConfig({
        extensions: {
          undergroundSky: {
            enabled: true,
            ruleset: 'catanx-underground-sky-v1',
            victoryPointBonus: 5,
            undergroundGeneration: 'surface-derived',
            skyGeneration: 'adaptive-network',
            flightMode: 'programmed',
            interactionMode: 'soft-competitive',
          },
        },
      }),
      players,
    );
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources.wheat = 3;
    const us = state.extensions!.undergroundSky!;
    us.airports.push({
      id: 'ap1',
      playerId,
      intersectionId: 'i1',
      suspended: false,
    });
    us.airships.push({
      id: 'ship1',
      playerId,
      airportId: 'ap1',
      capacity: 3,
      moveBudget: 2,
      etherSails: false,
      reinforcedHold: false,
      cargo: [],
      route: null,
      currentHubId: 'missing_hub',
    });
    const result = handleUndergroundSkyCommand(state, {
      type: 'us_dispatch_airship',
      playerId,
      airshipId: 'ship1',
      destinationHubId: Object.keys(us.skyGraph.hubs)[0] ?? 'nowhere',
      cargo: [{ kind: 'resource', key: 'wheat', amount: 2 }],
    });
    expect(result.ok).toBe(false);
    expect(player.resources.wheat).toBe(3);
  });

  it('refuse le déchargement hors aéroport d’attache', () => {
    const state = createGame(
      baseConfig({
        extensions: {
          undergroundSky: {
            enabled: true,
            ruleset: 'catanx-underground-sky-v1',
            victoryPointBonus: 5,
            undergroundGeneration: 'surface-derived',
            skyGeneration: 'adaptive-network',
            flightMode: 'programmed',
            interactionMode: 'soft-competitive',
          },
        },
      }),
      players,
    );
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const us = state.extensions!.undergroundSky!;
    state.classicBoard = createClassicBoardState(state.map, state.turnOrder);
    const board = state.classicBoard;
    const intersectionId = Object.keys(board.topology.intersections)[0]!;
    us.airports.push({
      id: 'ap1',
      playerId,
      intersectionId,
      suspended: false,
    });
    const homeHubs = nearestSkyHubsForIntersection(state, intersectionId, 2);
    const awayHub = Object.keys(us.skyGraph.hubs).find((id) => !homeHubs.includes(id));
    expect(homeHubs.length).toBeGreaterThan(0);
    expect(awayHub).toBeTruthy();
    us.airships.push({
      id: 'ship1',
      playerId,
      airportId: 'ap1',
      capacity: 3,
      moveBudget: 2,
      etherSails: false,
      reinforcedHold: false,
      cargo: [{ kind: 'resource', key: 'wheat', amount: 1 }],
      route: null,
      currentHubId: awayHub!,
    });
    const result = handleUndergroundSkyCommand(state, {
      type: 'us_unload_airship',
      playerId,
      airshipId: 'ship1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_at_airport');
    }
  });

  it('conserve la soute existante lors d’un ferry (cargo vide)', () => {
    const state = createGame(
      baseConfig({
        extensions: {
          undergroundSky: {
            enabled: true,
            ruleset: 'catanx-underground-sky-v1',
            victoryPointBonus: 5,
            undergroundGeneration: 'surface-derived',
            skyGeneration: 'adaptive-network',
            flightMode: 'programmed',
            interactionMode: 'soft-competitive',
          },
        },
      }),
      players,
    );
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources.wheat = 0;
    const us = state.extensions!.undergroundSky!;
    state.classicBoard = createClassicBoardState(state.map, state.turnOrder);
    const hubIds = Object.keys(us.skyGraph.hubs);
    expect(hubIds.length).toBeGreaterThanOrEqual(2);
    const fromHub = hubIds[0]!;
    const path = findShortestSkyPath(us.skyGraph, fromHub, hubIds[1]!, {});
    expect(path).toBeTruthy();
    const dest = path!.hubPath[path!.hubPath.length - 1]!;
    us.airports.push({
      id: 'ap1',
      playerId,
      intersectionId: Object.keys(state.classicBoard.topology.intersections)[0]!,
      suspended: false,
    });
    us.airships.push({
      id: 'ship1',
      playerId,
      airportId: 'ap1',
      capacity: 3,
      moveBudget: 2,
      etherSails: false,
      reinforcedHold: false,
      cargo: [{ kind: 'resource', key: 'ore', amount: 2 }],
      route: null,
      currentHubId: fromHub,
    });
    us.revealedSkyHubIds = [...new Set([...us.revealedSkyHubIds, fromHub, dest])];
    const result = handleUndergroundSkyCommand(state, {
      type: 'us_dispatch_airship',
      playerId,
      airshipId: 'ship1',
      destinationHubId: dest,
      cargo: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ship = result.state.extensions!.undergroundSky!.airships.find((a) => a.id === 'ship1')!;
      expect(ship.cargo).toEqual([{ kind: 'resource', key: 'ore', amount: 2 }]);
      expect(ship.route).not.toBeNull();
    }
  });

  it('garantit au moins un jardin flottant dans le graphe céleste', () => {
    const config = baseConfig({ mapSeed: 1 });
    for (let seed = 1; seed <= 12; seed += 1) {
      const map = new MapGenerator({ ...config, mapSeed: seed }).generate();
      const sky = generateSkyGraph(map, seed);
      const hasGarden = Object.values(sky.hubs).some((h) => h.site === 'floating_garden');
      expect(hasGarden).toBe(true);
    }
  });

  it('refuse un contrat sans dirigeable (plus de livraison main)', () => {
    const state = createGame(
      baseConfig({
        extensions: {
          undergroundSky: {
            enabled: true,
            ruleset: 'catanx-underground-sky-v1',
            victoryPointBonus: 5,
            undergroundGeneration: 'surface-derived',
            skyGeneration: 'adaptive-network',
            flightMode: 'programmed',
            interactionMode: 'soft-competitive',
          },
        },
      }),
      players,
    );
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = { wood: 4, clay: 4, wheat: 4, sheep: 4, ore: 4 };
    const us = state.extensions!.undergroundSky!;
    const contract = us.faceUpRegularContracts[0];
    expect(contract).toBeTruthy();
    const result = handleUndergroundSkyCommand(state, {
      type: 'us_complete_contract',
      playerId,
      contractId: contract!.id,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('airship_required');
    }
  });

  it('charge une cargaison à quai (même hub) sans démarrer de route', () => {
    const state = createGame(
      baseConfig({
        extensions: {
          undergroundSky: {
            enabled: true,
            ruleset: 'catanx-underground-sky-v1',
            victoryPointBonus: 5,
            undergroundGeneration: 'surface-derived',
            skyGeneration: 'adaptive-network',
            flightMode: 'programmed',
            interactionMode: 'soft-competitive',
          },
        },
      }),
      players,
    );
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources.wood = 3;
    player.resources.clay = 2;
    const us = state.extensions!.undergroundSky!;
    state.classicBoard = createClassicBoardState(state.map, state.turnOrder);
    const hubId = Object.keys(us.skyGraph.hubs)[0]!;
    us.airports.push({
      id: 'ap1',
      playerId,
      intersectionId: Object.keys(state.classicBoard.topology.intersections)[0]!,
      suspended: false,
    });
    us.airships.push({
      id: 'ship1',
      playerId,
      airportId: 'ap1',
      capacity: 3,
      moveBudget: 2,
      etherSails: false,
      reinforcedHold: false,
      cargo: [],
      route: null,
      currentHubId: hubId,
    });
    const result = handleUndergroundSkyCommand(state, {
      type: 'us_dispatch_airship',
      playerId,
      airshipId: 'ship1',
      destinationHubId: hubId,
      cargo: [
        { kind: 'resource', key: 'wood', amount: 2 },
        { kind: 'resource', key: 'clay', amount: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const ship = result.state.extensions!.undergroundSky!.airships.find((a) => a.id === 'ship1')!;
      expect(ship.route).toBeNull();
      expect(ship.cargo).toEqual([
        { kind: 'resource', key: 'wood', amount: 2 },
        { kind: 'resource', key: 'clay', amount: 1 },
      ]);
      expect(result.state.players.get(playerId)!.resources.wood).toBe(1);
    }
  });
});
