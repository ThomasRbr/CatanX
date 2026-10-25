// ============================================================
// CatanX — Point d'entrée public du moteur de jeu
// ============================================================

export * from './types/hex';
export * from './types/resources';
export * from './types/player';
export * from './types/buildings';
export * from './types/military';
export * from './types/technology';
export * from './types/events';
export * from './types/game';

export * from './engine/hex/HexMath';
export * from './engine/map/MapGenerator';
export * from './engine/resources/ResourceSystem';
export * from './engine/tech/TechTree';
export * from './engine/military/CombatEngine';
export * from './engine/diplomacy/DiplomacyEngine';
export * from './engine/events/EventSystem';
export * from './engine/game/GameEngine';
export * from './engine/ai/AIEngine';
export * from './engine/ai/classic/ClassicAI';
export * from './engine/ai/classic/ClassicSetupAI';
export * from './engine/ai/pickNextAICommand';
export * from './engine/ai/shared';
export * from './engine/catan/CatanTopology';
export * from './engine/catan/ClassicBoard';
export * from './engine/catan/ClassicCommands';
export * from './engine/catan/ClassicPlayerTrade';
export * from './sim/BalanceMetrics';
export * from './sim/HeadlessSimulator';
export * from './sim/prepareClassicSetup';
export * from './engine/modules/ModuleActions';
export * from './engine/civilizations/Civilizations';
export * from './engine/buildings/BuildingSystem';

export * from './core/rng';
export * from './core/clock';
export * from './core/ids';
export * from './core/errors';
export * from './core/context';
export * from './core/applyCommand';
export * from './core/snapshot';
export * from './core/privateView';
export * from './core/presets';
export * from './core/modules';
export * from './core/extensions';
export * from './core/victories';
export * from './core/session';
export * from './core/setupPreparation';
export * from './engine/resources/ProductionSystem';
export * from './engine/military/BarbarianSystem';
export * from './engine/citiesKnights';
export * from './types/citiesKnights';
export * from './types/seasons';
export {
  SEASON_CLIMATE_DEFINITIONS,
  getClimateDefinition,
  climatesForSeason,
  isSevereClimate,
  peekDrawClimateWithGuards,
  createSeasonDecks,
  createSeasonsState,
  hydrateSeasonsFromSnapshot,
  tickSeasonRound,
  applySeasonalBuildCost,
  markSeasonalBuildUsed,
  applyClimateProductionPenalties,
  applySeasonalAbundanceBonuses,
  chooseSeasonPreparation,
  resolveSeasonBarbarianShipModifier,
  getFirstKnightActivateExtraCost,
  getSeasonalHandLimitDelta,
  getSeasonalTradeRatioModifier,
  improveTradeRatio,
  seasonsChoosePreparationCommand,
} from './engine/seasons';

export * from './types/undergroundSky';
export * from './engine/undergroundSky';

export * from './types/pactsEmbassies';
export * from './engine/pactsEmbassies';

export { ENGINE_VERSION, SCHEMA_VERSION } from './core/version';
