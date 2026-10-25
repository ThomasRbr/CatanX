import { describe, expect, it } from 'vitest';
import type { GameCommand } from '@catanx/protocol';
import {
  applyCommand,
  buildGameConfigFromPreset,
  createDefaultEngineContext,
  createSnapshot,
  snapshotFromJSON,
  snapshotToGameState,
  SCHEMA_VERSION,
  SEASON_CLIMATE_DEFINITIONS,
  getClimateDefinition,
  isSevereClimate,
  peekDrawClimateWithGuards,
  createSeasonDecks,
  defaultSeasonsConfig,
  tickSeasonRound,
  applySeasonalBuildCost,
  markSeasonalBuildUsed,
  applySeasonalAbundanceBonuses,
  applyClimateProductionPenalties,
  getSeasonalTradeRatioModifier,
  getSeasonalHandLimitDelta,
  getFirstKnightActivateExtraCost,
  getCkCommodityTradeRatioSeasonal,
  isSeasonsEnabled,
  chooseSeasonPreparation,
  resolveSeasonBarbarianShipModifier,
  improveTradeRatio,
} from '@catanx/engine';
import type { SeasonClimateDefinition, SeasonClimateId, GameState } from '@catanx/engine';

function createSeasonsGame(seed = 42, opts?: { ck?: boolean; players?: number }) {
  const ctx = createDefaultEngineContext(seed);
  const config = buildGameConfigFromPreset('catanx', {
    mapSeed: seed,
    playerCount: opts?.players ?? 2,
    mapSize: 'tiny',
    extensions: {
      seasons: defaultSeasonsConfig({ enabled: true }),
      ...(opts?.ck
        ? {
            citiesKnights: {
              enabled: true,
              ruleset: 'catanx-essential-v1',
              victoryPointBonus: 3,
              adaptiveBarbarianTrack: true as const,
            },
          }
        : {}),
    },
  });
  const players = Array.from({ length: opts?.players ?? 2 }, (_, i) => ({
    name: `P${i}`,
    civilization: 'empire',
    type: 'human' as const,
  }));
  const created = applyCommand(null, { type: 'create_game', config, players }, ctx);
  if (!created.ok) throw new Error(created.error.message);
  return { state: created.state, ctx };
}

function forceClimate(state: GameState, climateId: SeasonClimateId): void {
  const seasons = state.extensions!.seasons!;
  seasons.currentClimateId = climateId;
  seasons.currentSeason = getClimateDefinition(climateId).season;
  state.season = seasons.currentSeason;
}

describe('Seasons extension', () => {
  it('active seasons sur preset CatanX et refuse Classic', () => {
    const catanx = buildGameConfigFromPreset('catanx');
    expect(catanx.extensions?.seasons?.enabled).toBe(true);
    expect(catanx.extensions?.seasons?.ruleset).toBe('catanx-seasons-v2');
    expect(catanx.extensions?.seasons?.roundsPerSeason).toBe(5);
    expect(catanx.enableSeasons).toBe(true);

    const classic = buildGameConfigFromPreset('classic');
    expect(classic.extensions?.seasons?.enabled).toBe(false);
    expect(classic.enableSeasons).toBe(false);
  });

  it('crée un état saisons avec climat + prévision avant placement', () => {
    const { state } = createSeasonsGame(123);
    expect(isSeasonsEnabled(state)).toBe(true);
    const seasons = state.extensions?.seasons;
    expect(seasons).toBeTruthy();
    expect(seasons!.currentSeason).toBe('spring');
    expect(seasons!.roundInSeason).toBe(1);
    expect(seasons!.seasonYear).toBe(1);
    expect(seasons!.currentClimateId).toBeTruthy();
    expect(seasons!.forecastClimateId).toBeTruthy();
    expect(getClimateDefinition(seasons!.currentClimateId).season).toBe('spring');
    expect(getClimateDefinition(seasons!.forecastClimateId).season).toBe('summer');
    expect(state.season).toBe('spring');
    expect(state.seasonTurn).toBe(1);
  });

  it('catalogue V2 : 12 climats, une contrainte chacun, dont 4 sévères', () => {
    expect(SEASON_CLIMATE_DEFINITIONS).toHaveLength(12);
    const severe = SEASON_CLIMATE_DEFINITIONS.filter(
      (d: SeasonClimateDefinition) => d.severity === 'severe',
    );
    expect(severe).toHaveLength(4);
    // Une contrainte (négative / structurelle) par climat ; les climats
    // « seuil −1 » ajoutent aussi generous_abundance_once.
    for (const climate of SEASON_CLIMATE_DEFINITIONS) {
      const constraints = climate.effects.filter(
        (effect) => effect.kind !== 'generous_abundance_once',
      );
      expect(constraints).toHaveLength(1);
    }
    expect(
      severe.every((climate) =>
        climate.effects.some(
          (effect) => effect.kind === 'city_production_penalty' && effect.amount === 2,
        ),
      ),
    ).toBe(true);
    const generous = SEASON_CLIMATE_DEFINITIONS.filter((climate) =>
      climate.effects.some((effect) => effect.kind === 'generous_abundance_once'),
    );
    expect(generous.map((c) => c.id).sort()).toEqual([
      'autumn_golden_harvest',
      'spring_gentle_renewal',
      'summer_golden',
    ]);
  });

  it('garde-fous : pas deux sévères consécutifs, max 2/an', () => {
    const config = defaultSeasonsConfig({ enabled: true });
    const springSevere = SEASON_CLIMATE_DEFINITIONS.filter(
      (d: SeasonClimateDefinition) => d.season === 'spring' && d.severity === 'severe',
    ).map((d: SeasonClimateDefinition) => d.id);
    const springStd = SEASON_CLIMATE_DEFINITIONS.filter(
      (d: SeasonClimateDefinition) => d.season === 'spring' && d.severity === 'standard',
    ).map((d: SeasonClimateDefinition) => d.id);
    const forced = [...springSevere, ...springSevere, ...springStd] as SeasonClimateId[];

    const first = peekDrawClimateWithGuards(forced, [], {
      previousWasSevere: true,
      severeThisYear: 0,
      config,
    });
    expect(isSevereClimate(first.drawn)).toBe(false);

    const second = peekDrawClimateWithGuards(forced, [], {
      previousWasSevere: false,
      severeThisYear: 2,
      config,
    });
    expect(isSevereClimate(second.drawn)).toBe(false);
  });

  it('avance l’horloge : 5 rondes puis changement de saison', () => {
    const { state } = createSeasonsGame(55);
    const seasons = state.extensions!.seasons!;
    expect(seasons.roundInSeason).toBe(1);

    for (let i = 0; i < 4; i++) {
      tickSeasonRound(state);
    }
    expect(state.extensions!.seasons!.roundInSeason).toBe(5);

    tickSeasonRound(state);
    expect(state.extensions!.seasons!.currentSeason).toBe('summer');
    expect(state.extensions!.seasons!.roundInSeason).toBe(1);
    expect(state.season).toBe('summer');
  });

  it('choisit une préparation publique', () => {
    const { state, ctx } = createSeasonsGame(77);
    state.phase = 'playing';
    const playerId = state.turnOrder[0]!;
    const result = applyCommand(
      state,
      {
        type: 'seasons_choose_preparation',
        playerId,
        preparation: 'harvest',
      } as GameCommand,
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(state.extensions!.seasons!.preparations[playerId]).toBe('harvest');
  });

  it('applique l’unique contrainte de route du Grand dégel', () => {
    const { state } = createSeasonsGame(88);
    forceClimate(state, 'spring_great_thaw');
    const cost = applySeasonalBuildCost(state, state.turnOrder[0]!, 'road', {
      wood: 1,
      clay: 1,
    });
    expect(cost.clay).toBe(2);
    expect(cost.wood).toBe(1);
  });

  it('Mobilisation compense +1 argile sur la première route sous Grand dégel', () => {
    const { state } = createSeasonsGame(89);
    forceClimate(state, 'spring_great_thaw');
    const playerId = state.turnOrder[0]!;
    state.extensions!.seasons!.preparations[playerId] = 'works';
    const cost = applySeasonalBuildCost(
      state,
      playerId,
      'road',
      { wood: 1, clay: 1 },
      { useWorks: true },
    );
    expect(cost.clay).toBe(1);
    expect(cost.wood).toBe(1);
  });

  it('Réserves augmente le seuil de main de +2', () => {
    const { state } = createSeasonsGame(90);
    const playerId = state.turnOrder[0]!;
    state.extensions!.seasons!.preparations[playerId] = 'reserve';
    forceClimate(state, 'spring_great_thaw');
    expect(getSeasonalHandLimitDelta(state, playerId)).toBe(2);
  });

  it('Caravane garantit un échange à 3:1', () => {
    const { state } = createSeasonsGame(91);
    const playerId = state.turnOrder[0]!;
    forceClimate(state, 'spring_great_thaw');
    state.extensions!.seasons!.preparations[playerId] = 'commerce';
    const ratio = getSeasonalTradeRatioModifier(state, playerId, 4, {
      useCommerce: true,
    });
    expect(ratio).toBe(3);
    expect(improveTradeRatio(4)).toBe(3);
    expect(improveTradeRatio(3)).toBe(2);
  });

  it('Abri neutralise une surcharge de construction une seule fois', () => {
    const { state } = createSeasonsGame(911);
    const playerId = state.turnOrder[0]!;
    forceClimate(state, 'spring_great_thaw');
    state.extensions!.seasons!.preparations[playerId] = 'shelter';
    const protectedCost = applySeasonalBuildCost(state, playerId, 'road', {
      wood: 1,
      clay: 1,
    });
    expect(protectedCost).toEqual({ wood: 1, clay: 1 });
    markSeasonalBuildUsed(state, playerId, 'road');
    expect(state.extensions!.seasons!.preparationUses[playerId]!.shelterUsed).toBe(true);
    const nextCost = applySeasonalBuildCost(state, playerId, 'road', { wood: 1, clay: 1 });
    expect(nextCost).toEqual({ wood: 1, clay: 2 });
  });

  it('climat généreux : premier bonus +2, suivants +1', () => {
    const { state } = createSeasonsGame(92);
    forceClimate(state, 'spring_gentle_renewal');
    const playerId = state.turnOrder[0]!;
    if (state.bank) {
      state.bank.sheep = 19;
      state.bank.wheat = 19;
    }
    const first = applySeasonalAbundanceBonuses(state, [
      { playerId, resources: { sheep: 1 }, bonuses: [] },
    ]);
    expect(first.awards).toHaveLength(1);
    expect(first.awards[0]!.resources.sheep).toBe(2);
    expect(state.extensions!.seasons!.climateUses[playerId]!.firstSeasonalBonusClaimed).toBe(
      true,
    );

    const second = applySeasonalAbundanceBonuses(state, [
      { playerId, resources: { wheat: 1 }, bonuses: [] },
    ]);
    expect(second.awards).toHaveLength(1);
    expect(second.awards[0]!.resources.wheat).toBe(1);
  });

  it('le rythme de partie ne modifie plus la règle d’abondance', () => {
    const { state } = createSeasonsGame(921);
    state.config.pacingPreset = 'tabletop';
    forceClimate(state, 'summer_hot_storms'); // climat non généreux
    const playerId = state.turnOrder[0]!;
    const player = state.players.get(playerId)!;
    player.resources = {};
    if (state.bank) {
      state.bank.wood = 19;
      state.bank.ore = 19;
    }
    const collections = [{ playerId, resources: { wood: 1, ore: 1 }, bonuses: [] }];
    const { awards } = applySeasonalAbundanceBonuses(state, collections);
    expect(awards).toHaveLength(1);
    expect(awards[0]!.resources.wood).toBe(1);
  });

  it('Adaptation + climat généreux : la cible reçoit +1 une fois', () => {
    const { state } = createSeasonsGame(922);
    forceClimate(state, 'spring_gentle_renewal'); // fav: sheep, wheat
    const playerId = state.turnOrder[0]!;
    state.extensions!.seasons!.preparations[playerId] = 'harvest';
    state.extensions!.seasons!.preparationTargets[playerId] = 'sheep';
    state.extensions!.seasons!.preparationUses[playerId] = {
      harvestUsed: false,
      commerceUsed: false,
      worksUsed: false,
      shelterUsed: false,
    };
    if (state.bank) {
      state.bank.sheep = 19;
      state.bank.wheat = 19;
    }
    const collections = [{ playerId, resources: { sheep: 1, wheat: 1 }, bonuses: [] }];
    const { awards } = applySeasonalAbundanceBonuses(state, collections);
    expect(awards).toHaveLength(1);
    expect(awards[0]!.resources.sheep).toBe(3);
    expect(awards[0]!.resources.wheat ?? 0).toBe(0);
    expect(state.extensions!.seasons!.preparationUses[playerId]!.harvestUsed).toBe(true);
  });

  it('Adaptation renforce une fois le terrain choisi sur un climat standard', () => {
    const { state } = createSeasonsGame(923);
    forceClimate(state, 'summer_hot_storms'); // fav: wood, ore — non généreux
    const playerId = state.turnOrder[0]!;
    state.extensions!.seasons!.preparations[playerId] = 'harvest';
    state.extensions!.seasons!.preparationTargets[playerId] = 'wood';
    state.extensions!.seasons!.preparationUses[playerId] = {
      harvestUsed: false,
      commerceUsed: false,
      worksUsed: false,
      shelterUsed: false,
    };
    if (state.bank) {
      state.bank.wood = 19;
      state.bank.ore = 19;
    }
    const collections = [{ playerId, resources: { wood: 1, ore: 1 }, bonuses: [] }];
    const { awards } = applySeasonalAbundanceBonuses(state, collections);
    expect(awards).toHaveLength(1);
    expect(awards[0]!.resources.wood).toBe(2);
    expect(state.extensions!.seasons!.preparationUses[playerId]!.harvestUsed).toBe(true);
  });

  it('une pénurie annule seulement le bonus, jamais la production normale', () => {
    const { state } = createSeasonsGame(93);
    forceClimate(state, 'autumn_golden_harvest');
    const playerId = state.turnOrder[0]!;
    const def = getClimateDefinition('autumn_golden_harvest');
    const [favA, favB] = def.favoredResources;
    if (state.bank) {
      state.bank[favA] = 0;
      state.bank[favB] = 10;
    }
    const collections = [{ playerId, resources: { [favA]: 1, [favB]: 1 }, bonuses: [] }];
    const { awards } = applySeasonalAbundanceBonuses(state, collections);
    expect(awards).toHaveLength(0);
  });

  it('pénalité sévère peut retirer jusqu’à 2 sur production ville', () => {
    const { state } = createSeasonsGame(94);
    forceClimate(state, 'spring_floods');
    const playerId = state.turnOrder[0]!;
    // Simuler une collecte avec argile (pénalité clay sur villes)
    const collections = [{ playerId, resources: { clay: 2, wood: 1 }, bonuses: [] }];
    // Sans bâtiments ville, cityShare = 0 → pas de pénalité
    applyClimateProductionPenalties(state, collections, 6);
    expect(collections[0]!.resources.clay).toBe(2);
  });

  it('CK : aucun climat ne surcharge directement les chevaliers', () => {
    const { state } = createSeasonsGame(95, { ck: true });
    forceClimate(state, 'winter_announced_blizzard');
    const extra = getFirstKnightActivateExtraCost(state, state.turnOrder[0]!);
    expect(extra).toEqual({});
  });

  it('CK : ratio marchandise saisonnier exporté', () => {
    const { state } = createSeasonsGame(96, { ck: true });
    const playerId = state.turnOrder[0]!;
    state.extensions!.seasons!.preparations[playerId] = 'commerce';
    const ratio = getCkCommodityTradeRatioSeasonal(state, playerId, 'ck_cloth', {
      useCommerce: true,
    });
    expect(ratio).toBeGreaterThanOrEqual(2);
    expect(ratio).toBeLessThanOrEqual(4);
  });

  it('CK : aucun climat ne modifie directement la flotte barbare', () => {
    const { state } = createSeasonsGame(97, { ck: true });
    forceClimate(state, 'summer_hot_storms');
    const mod = resolveSeasonBarbarianShipModifier(state);
    expect(mod).toEqual({ skip: false, extraSteps: 0 });
  });

  it('émet season_changed via end_turn (drain events)', () => {
    const { state, ctx } = createSeasonsGame(98);
    state.phase = 'playing';
    state.turnPhase = 'player_action';
    state.extensions!.seasons!.roundInSeason = 5;
    // Avancer jusqu’au dernier joueur pour que end_turn boucle
    state.currentPlayerIndex = state.turnOrder.length - 1;
    const playerId = state.turnOrder[state.currentPlayerIndex]!;
    const result = applyCommand(state, { type: 'end_turn', playerId } as GameCommand, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const types = result.events.map((e) => e.type);
      expect(types).toContain('season_changed');
    }
  });

  it('snapshot courant round-trip conserve seasons', () => {
    const { state } = createSeasonsGame(101);
    const snap = createSnapshot(state);
    expect(snap.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(7);
    const json = JSON.stringify(snap);
    const restored = snapshotToGameState(snapshotFromJSON(json));
    expect(restored.extensions?.seasons?.currentClimateId).toBe(
      state.extensions?.seasons?.currentClimateId,
    );
    expect(restored.extensions?.seasons?.seasonYear).toBe(1);
  });

  it('normalise à 5 rondes les sauvegardes qui contiennent encore 4', () => {
    const { state } = createSeasonsGame(1015);
    const legacy = JSON.parse(JSON.stringify(createSnapshot(state)));
    legacy.config.extensions.seasons.roundsPerSeason = 4;
    legacy.state.config.extensions.seasons.roundsPerSeason = 4;

    const migrated = snapshotFromJSON(JSON.stringify(legacy));
    expect(migrated.config.extensions?.seasons?.roundsPerSeason).toBe(5);
    expect(migrated.state.config.extensions?.seasons?.roundsPerSeason).toBe(5);
  });

  it('migration v3 → v5 hydrate seasons sans decks incohérents', () => {
    const { state } = createSeasonsGame(102);
    const snap = createSnapshot(state);
    const legacy = {
      ...snap,
      schemaVersion: 3,
      state: {
        ...snap.state,
        extensions: {
          ...snap.state.extensions,
          seasons: undefined,
        },
      },
      config: {
        ...snap.config,
        extensions: {
          ...snap.config.extensions,
          seasons: defaultSeasonsConfig({ enabled: true }),
        },
      },
    };
    const restored = snapshotToGameState(snapshotFromJSON(JSON.stringify(legacy)));
    const seasons = restored.extensions?.seasons;
    expect(seasons).toBeTruthy();
    expect(seasons!.currentClimateId).toBeTruthy();
    expect(seasons!.forecastClimateId).toBeTruthy();
    expect(seasons!.decks.spring).not.toContain(seasons!.currentClimateId);
    // forecast is summer — not in summer deck as drawn card
    expect(seasons!.decks.summer).not.toContain(seasons!.forecastClimateId);
  });

  it('migration v4 → v5 remplace les anciens climats et assainit les decks', () => {
    const { state } = createSeasonsGame(1025);
    const snap = createSnapshot(state);
    const legacy = JSON.parse(JSON.stringify(snap));
    legacy.schemaVersion = 4;
    legacy.config.extensions.seasons.ruleset = 'catanx-seasons-v1';
    legacy.state.extensions.seasons.currentClimateId = 'spring_flower_mists';
    legacy.state.extensions.seasons.forecastClimateId = 'summer_heatwave';
    legacy.state.extensions.seasons.decks.spring = [
      'spring_march_winds',
      'spring_great_thaw',
      'spring_floods',
    ];

    const migrated = snapshotFromJSON(JSON.stringify(legacy));
    const restored = snapshotToGameState(migrated);
    const seasons = restored.extensions!.seasons!;
    expect(migrated.schemaVersion).toBe(7);
    expect(migrated.config.extensions?.seasons?.ruleset).toBe('catanx-seasons-v2');
    expect(getClimateDefinition(seasons.currentClimateId).season).toBe('spring');
    expect(getClimateDefinition(seasons.forecastClimateId).season).toBe('summer');
    expect(seasons.decks.spring).not.toContain('spring_march_winds');
    expect(seasons.decks.spring).not.toContain(seasons.currentClimateId);
  });

  it('classic refuse seasons même si enableSeasons legacy', () => {
    const config = buildGameConfigFromPreset('classic', { enableSeasons: true });
    expect(config.enableSeasons).toBe(false);
    expect(config.extensions?.seasons?.enabled).toBe(false);
  });

  it('année saisonnière ++ uniquement hiver → printemps', () => {
    const { state } = createSeasonsGame(103);
    const seasons = state.extensions!.seasons!;
    seasons.currentSeason = 'winter';
    seasons.roundInSeason = 5;
    seasons.seasonYear = 1;
    seasons.forecastClimateId = 'spring_gentle_renewal';
    tickSeasonRound(state);
    expect(state.extensions!.seasons!.currentSeason).toBe('spring');
    expect(state.extensions!.seasons!.seasonYear).toBe(2);
  });

  it('chooseSeasonPreparation écrit nextPreparations en fenêtre ronde 5', () => {
    const { state } = createSeasonsGame(104);
    const playerId = state.turnOrder[0]!;
    const seasons = state.extensions!.seasons!;
    seasons.springPrepPending = false;
    seasons.preparationWindowOpen = true;
    seasons.roundInSeason = 5;
    const result = chooseSeasonPreparation(state, playerId, 'harvest', 'ore');
    expect(result.ok).toBe(true);
    expect(seasons.nextPreparations[playerId]).toBe('harvest');
    expect(seasons.nextPreparationTargets[playerId]).toBe('ore');
    expect(seasons.preparationReady[playerId]).toBe(true);
    expect(seasons.preparations[playerId]).toBe('reserve');
  });

  it('createSeasonDecks mélange 3 climats V2 par saison', () => {
    const decks = createSeasonDecks(7);
    expect(decks.spring).toHaveLength(3);
    expect(decks.summer).toHaveLength(3);
    expect(decks.autumn).toHaveLength(3);
    expect(decks.winter).toHaveLength(3);
  });
});
