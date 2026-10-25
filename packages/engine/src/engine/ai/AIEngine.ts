// @deprecated Legacy empire AI — not used by decideClassicAI. Prefer classic/ClassicAI.ts.
// ============================================================
// AIEngine — Joueur IA avec 7 personnalités distinctes
// Stratégies : score evaluation + priorités par personnalité
// ============================================================

import { Player, AIPersonality, AIDifficulty } from '../../types/player';
import { GameState } from '../../types/game';
import { ResourceBundle, ResourceType } from '../../types/resources';
import { CubeCoord } from '../../types/hex';
import { hexToId, hexDistance, hexAllNeighbors } from '../hex/HexMath';
import { TechTreeEngine } from '../tech/TechTree';
import { hasResources } from '../resources/ResourceSystem';
import { TechId } from '../../types/technology';
import { randomFloat } from '../../core/rng';
import { isCitiesKnightsEnabled } from '../../core/extensions';

// ============================================================
// TYPES D'ACTIONS IA
// ============================================================

export interface AIAction {
  type: AIActionType;
  priority: number; // 0-100, plus haut = plus urgent
  data: AIActionData;
  reasoning: string; // Pour le debug / l'affichage
}

export type AIActionType =
  | 'build_settlement'
  | 'build_city'
  | 'build_metropolis'
  | 'build_road'
  | 'build_building'
  | 'train_unit'
  | 'research_tech'
  | 'attack_unit'
  | 'move_unit'
  | 'declare_war'
  | 'propose_peace'
  | 'propose_alliance'
  | 'trade_with_bank'
  | 'trade_with_player'
  | 'use_dev_card'
  | 'end_turn';

export interface AIActionData {
  tileId?: string;
  unitId?: string;
  targetId?: string;
  buildingType?: string;
  unitType?: string;
  techId?: string;
  tradeOffer?: ResourceBundle;
  tradeRequest?: ResourceBundle;
  cardType?: string;
  [key: string]: unknown;
}

// ============================================================
// 2.9B — MÉMOIRE IA (failedActions, plans, menaces)
// ============================================================

export interface AIMemory {
  /** Actions ayant échoué → ne pas retenter pendant N tours */
  failedActions: Array<{
    type: AIActionType;
    data: AIActionData;
    failedTurn: number;
    cooldownTurns: number; // ne pas retenter avant failedTurn + cooldownTurns
  }>;
  /** Actions planifiées pour les prochains tours */
  plannedActions: Array<{
    type: AIActionType;
    data: AIActionData;
    plannedTurn: number;
    priority: number;
  }>;
  /** Carte de menace : playerId → niveau 0-100 */
  threatMap: Record<string, number>;
  /** Dernier tour où une action a été exécutée par type */
  lastActionTurn: Partial<Record<AIActionType, number>>;
}

// ============================================================
// ÉVALUATION DE L'ÉTAT DU JEU
// ============================================================

export interface GameEvaluation {
  totalScore: number;
  militaryScore: number;
  economicScore: number;
  scienceScore: number;
  diplomaticScore: number;
  territoryScore: number;
  vpScore: number;
  threatLevel: number; // menace perçue des adversaires
  opportunities: string[];
  threats: string[];
}

export function evaluateGameState(player: Player, state: GameState): GameEvaluation {
  const militaryScore = evaluateMilitary(player, state);
  const economicScore = evaluateEconomy(player, state);
  const scienceScore = evaluateScience(player, state);
  const diplomaticScore = evaluateDiplomacy(player, state);
  const territoryScore = evaluateTerritory(player, state);
  const vpScore = player.stats.victoryPoints * 10;
  const threatLevel = assessThreatLevel(player, state);

  const opportunities: string[] = [];
  const threats: string[] = [];

  // Opportunités
  if (
    player.resources.wheat &&
    player.resources.ore &&
    player.resources.wheat >= 2 &&
    player.resources.ore >= 3 &&
    player.settlements.length > 0
  ) {
    opportunities.push('can_upgrade_to_city');
  }
  if (TechTreeEngine.getAvailableTechs(player).length > 0 && !player.currentResearch) {
    opportunities.push('can_start_research');
  }

  // Menaces
  const enemies = [...state.players.values()].filter(
    (p) => p.id !== player.id && player.relations[p.id]?.status === 'war',
  );
  if (enemies.length > 0) threats.push('at_war');
  if (threatLevel > 70) threats.push('under_attack');

  return {
    totalScore:
      militaryScore + economicScore + scienceScore + diplomaticScore + territoryScore + vpScore,
    militaryScore,
    economicScore,
    scienceScore,
    diplomaticScore,
    territoryScore,
    vpScore,
    threatLevel,
    opportunities,
    threats,
  };
}

function evaluateMilitary(player: Player, state: GameState): number {
  let score = 0;
  score += player.units.length * 5;
  for (const unitId of player.units) {
    const unit = state.units.get(unitId);
    if (unit) {
      score += (unit.stats.attack + unit.stats.defense) * unit.level;
    }
  }
  return Math.min(100, score);
}

function evaluateEconomy(player: Player, state: GameState): number {
  const totalRes = Object.values(player.resources).reduce((s, v) => s + (v ?? 0), 0);
  const diversity = Object.values(player.resources).filter((v) => (v ?? 0) > 0).length;
  return Math.min(100, totalRes * 0.5 + diversity * 3);
}

function evaluateScience(player: Player, state: GameState): number {
  return Math.min(
    100,
    player.researchedTechs.length * 8 +
      ['stone_age', 'bronze_age', 'iron_age', 'medieval', 'renaissance'].indexOf(player.age) * 15,
  );
}

function evaluateDiplomacy(player: Player, state: GameState): number {
  let score = 50;
  for (const rel of Object.values(player.relations)) {
    if (rel.status === 'allied') score += 10;
    if (rel.status === 'friendly') score += 5;
    if (rel.status === 'war') score -= 15;
    if (rel.status === 'hostile') score -= 5;
  }
  return Math.max(0, Math.min(100, score));
}

function evaluateTerritory(player: Player, state: GameState): number {
  const totalTiles = state.map.size;
  const owned = player.ownedTiles.length;
  const cityBonus = player.cities.length * 5 + player.metropolis.length * 10;
  return Math.min(100, (owned / totalTiles) * 100 + cityBonus);
}

function assessThreatLevel(player: Player, state: GameState): number {
  let threat = 0;
  for (const [, otherPlayer] of state.players) {
    if (otherPlayer.id === player.id) continue;
    const rel = player.relations[otherPlayer.id];
    if (!rel) continue;

    if (rel.status === 'war') {
      const theirStrength = otherPlayer.units.length * 10;
      const myStrength = player.units.length * 10;
      threat += Math.max(0, theirStrength - myStrength) * 2;
    }
  }
  return Math.min(100, threat);
}

// ============================================================
// GÉNÉRATION D'ACTIONS PAR PERSONNALITÉ
// ============================================================

export class AIPlayer {
  private personality: AIPersonality;
  private difficulty: AIDifficulty;
  private playerId: string;
  memory: AIMemory;

  constructor(playerId: string, personality: AIPersonality, difficulty: AIDifficulty) {
    this.playerId = playerId;
    this.personality = personality;
    this.difficulty = difficulty;
    this.memory = {
      failedActions: [],
      plannedActions: [],
      threatMap: {},
      lastActionTurn: {},
    };
  }

  /** 2.9B — Enregistrer une action ayant échoué (cooldown 3 tours) */
  recordFailedAction(type: AIActionType, data: AIActionData, currentTurn: number): void {
    this.memory.failedActions.push({
      type,
      data,
      failedTurn: currentTurn,
      cooldownTurns: 3,
    });
    // Nettoyer les entrées expirées
    this.memory.failedActions = this.memory.failedActions.filter(
      (f) => currentTurn < f.failedTurn + f.cooldownTurns,
    );
  }

  /** 2.9B — Vérifier si une action est en cooldown */
  private isActionOnCooldown(type: AIActionType, data: AIActionData, currentTurn: number): boolean {
    return this.memory.failedActions.some((f) => {
      if (f.type !== type) return false;
      if (currentTurn < f.failedTurn + f.cooldownTurns) {
        // Comparer le targetId si présent
        if (data.targetId && f.data.targetId && data.targetId !== f.data.targetId) return false;
        if (data.tileId && f.data.tileId && data.tileId !== f.data.tileId) return false;
        return true;
      }
      return false;
    });
  }

  decideActions(state: GameState): AIAction[] {
    const player = state.players.get(this.playerId);
    if (!player) return [];

    const evaluation = evaluateGameState(player, state);
    const actions: AIAction[] = [];

    // Chaque personnalité a ses priorités
    switch (this.personality) {
      case 'aggressive':
        actions.push(...this.aggressiveStrategy(player, state, evaluation));
        break;
      case 'economic':
        actions.push(...this.economicStrategy(player, state, evaluation));
        break;
      case 'scientific':
        actions.push(...this.scientificStrategy(player, state, evaluation));
        break;
      case 'diplomatic':
        actions.push(...this.diplomaticStrategy(player, state, evaluation));
        break;
      case 'expansionist':
        actions.push(...this.expansionistStrategy(player, state, evaluation));
        break;
      case 'cultural':
        actions.push(...this.culturalStrategy(player, state, evaluation));
        break;
      case 'balanced':
        actions.push(...this.balancedStrategy(player, state, evaluation));
        break;
    }

    // 2.9G — Cartes de développement contextuelles
    actions.push(...this.generateDevCardActions(player, state));

    // 2.9E — Filtrer les actions invalides (prérequis manquants)
    const valid = actions.filter((a) => this.checkPrerequisites(a, player, state));

    // 2.9B — Filtrer les actions en cooldown
    const filtered = valid.filter(
      (a) => !this.isActionOnCooldown(a.type, a.data, state.currentTurn),
    );

    // 2.9F + 2.9H — Appliquer le niveau de difficulté avec normalisation
    return this.applyDifficultyFilter(filtered, player, state);
  }

  // ============================================================
  // 2.9E — VÉRIFICATION DES PRÉREQUIS
  // ============================================================

  private checkPrerequisites(action: AIAction, player: Player, state: GameState): boolean {
    switch (action.type) {
      case 'train_unit': {
        const unitType = action.data.unitType as string | undefined;
        if (!unitType) return false;
        // Vérifier que le bâtiment de production requis existe
        const requiredBuildings: Record<string, string> = {
          warrior: 'barracks',
          swordsman: 'barracks',
          spearman: 'barracks',
          knight: 'stable',
          cavalry: 'stable',
          heavy_cavalry: 'stable',
          archer: 'archery_range',
          crossbowman: 'archery_range',
          catapult: 'siege_workshop',
          trebuchet: 'siege_workshop',
          cannon: 'siege_workshop',
          galley: 'harbor',
          war_galley: 'harbor',
          carrack: 'harbor',
          warship: 'harbor',
        };
        const req = requiredBuildings[unitType];
        if (req) {
          const hasBuilding = player.ownedTiles.some((tileId) => {
            const tile = state.map.get(tileId);
            return tile?.buildings.some((b) => b === req);
          });
          if (!hasBuilding) return false;
        }
        return true;
      }

      case 'build_building': {
        const buildingType = action.data.buildingType as string | undefined;
        const tileId = action.data.tileId as string | undefined;
        if (!buildingType || !tileId) return false;
        const tile = state.map.get(tileId);
        if (!tile) return false;
        // Ne pas construire si déjà présent
        if (tile.buildings.includes(buildingType)) return false;
        return true;
      }

      case 'propose_alliance': {
        const targetId = action.data.targetId as string | undefined;
        if (!targetId) return false;
        const relation = player.relations[targetId];
        if (!relation) return false;
        // Ne pas proposer alliance si déjà alliés ou en guerre
        if (relation.status === 'allied' || relation.status === 'war') return false;
        // Vérifier qu'il n'y a pas déjà un pacte militaire en place
        const hasAlliance = relation.treaties.some(
          (t) => t.type === 'military_alliance' || t.type === 'defensive_pact',
        );
        if (hasAlliance) return false;
        return true;
      }

      case 'research_tech': {
        const techId = action.data.techId as string | undefined;
        if (!techId) return false;
        const { canResearch } = TechTreeEngine.canResearch(techId as TechId, player);
        return canResearch;
      }

      default:
        return true;
    }
  }

  // ============================================================
  // 2.9G — UTILISATION DES CARTES DE DÉVELOPPEMENT
  // ============================================================

  private generateDevCardActions(player: Player, state: GameState): AIAction[] {
    const actions: AIAction[] = [];
    if (isCitiesKnightsEnabled(state)) return actions;
    if (player.devCardsPlayedThisTurn >= 1) return actions;

    for (const card of player.devCards) {
      if (card.played) continue;
      // Ne peut jouer que les cartes acquises un tour précédent
      if (card.acquiredTurn >= state.currentTurn) continue;

      switch (card.type) {
        case 'knight': {
          // Jouer chevalier si brigand sur une tuile ennemie ou si on veut voler
          const robberTile = state.robberPosition ? state.map.get(state.robberPosition) : null;
          const robberOnEnemy = robberTile?.owner && robberTile.owner !== player.id;
          if (robberOnEnemy || (state.robberPosition && this.difficulty !== 'easy')) {
            actions.push({
              type: 'use_dev_card',
              priority: 75,
              data: { cardType: 'knight', unitId: card.id },
              reasoning: 'Chevalier : déplacer brigand, voler ressource',
            });
          }
          break;
        }

        case 'year_of_plenty': {
          // Jouer si on manque de ressources pour une action planifiée
          const missingRes = this.findCriticalMissingResource(player);
          if (missingRes) {
            actions.push({
              type: 'use_dev_card',
              priority: 70,
              data: { cardType: 'year_of_plenty', unitId: card.id, resource: missingRes },
              reasoning: `Année d'abondance : obtenir ${missingRes}`,
            });
          }
          break;
        }

        case 'road_building': {
          if (player.resources.wood === 0 || player.resources.clay === 0) {
            actions.push({
              type: 'use_dev_card',
              priority: 60,
              data: { cardType: 'road_building', unitId: card.id },
              reasoning: 'Construction de route gratuite',
            });
          }
          break;
        }

        case 'monopoly': {
          // Utiliser si les adversaires ont beaucoup d'une ressource qu'on veut
          const targetRes = this.findMonopolyTarget(player, state);
          if (targetRes) {
            actions.push({
              type: 'use_dev_card',
              priority: 65,
              data: { cardType: 'monopoly', unitId: card.id, resource: targetRes },
              reasoning: `Monopole sur ${targetRes}`,
            });
          }
          break;
        }
      }
    }

    return actions;
  }

  private findCriticalMissingResource(player: Player): ResourceType | null {
    // Ressources critiques pour construire un village ou une ville
    const buildingCosts: Array<[ResourceType, number]> = [
      ['wood', 1],
      ['clay', 1],
      ['wheat', 1],
      ['sheep', 1],
      ['ore', 3],
    ];
    for (const [res, needed] of buildingCosts) {
      if ((player.resources[res] ?? 0) < needed) return res;
    }
    return null;
  }

  private findMonopolyTarget(player: Player, state: GameState): ResourceType | null {
    const resourceTotals: Partial<Record<ResourceType, number>> = {};
    for (const [pid, other] of state.players) {
      if (pid === player.id) continue;
      for (const [res, amount] of Object.entries(other.resources)) {
        resourceTotals[res as ResourceType] =
          (resourceTotals[res as ResourceType] ?? 0) + (amount ?? 0);
      }
    }
    let best: ResourceType | null = null;
    let bestAmt = 0;
    for (const [res, amt] of Object.entries(resourceTotals)) {
      if ((amt ?? 0) > bestAmt && (player.resources[res as ResourceType] ?? 0) < 2) {
        bestAmt = amt ?? 0;
        best = res as ResourceType;
      }
    }
    return bestAmt >= 3 ? best : null;
  }

  // ── STRATÉGIE AGRESSIVE ────────────────────────────────
  private aggressiveStrategy(player: Player, state: GameState, eval_: GameEvaluation): AIAction[] {
    const actions: AIAction[] = [];

    // Priorité 1 : Entraîner des unités militaires
    if (hasResources(player.resources, { wheat: 1, ore: 1 })) {
      actions.push({
        type: 'train_unit',
        priority: 85,
        data: { unitType: this.chooseMilitaryUnit(player) },
        reasoning: 'Aggressif : renforcement militaire constant',
      });
    }

    // Priorité 2 : Attaquer si possible
    const targets = this.findAttackTargets(player, state);
    for (const target of targets) {
      actions.push({
        type: 'attack_unit',
        priority: 90,
        data: { unitId: target.myUnit, targetId: target.enemyUnit },
        reasoning: `Aggressif : attaquer ${target.enemyOwnerName}`,
      });
    }

    // Priorité 3 : Déclarer guerre si avantage militaire
    if (eval_.militaryScore > 70) {
      const weakest = this.findWeakestEnemy(player, state);
      if (weakest && player.relations[weakest.id]?.status !== 'war') {
        actions.push({
          type: 'declare_war',
          priority: 70,
          data: { targetId: weakest.id },
          reasoning: `Aggressif : attaquer ${weakest.name} (ennemi faible)`,
        });
      }
    }

    // Fallback : expansion territoire
    actions.push(...this.buildExpansionActions(player, state, 50));

    return actions;
  }

  // ── STRATÉGIE ÉCONOMIQUE ──────────────────────────────
  private economicStrategy(player: Player, state: GameState, eval_: GameEvaluation): AIAction[] {
    const actions: AIAction[] = [];

    // Priorité 1 : Construire des marchés et bâtiments de production
    if (hasResources(player.resources, { wood: 2, clay: 1 })) {
      actions.push({
        type: 'build_building',
        priority: 80,
        data: { buildingType: 'market', tileId: this.findBestProductionTile(player, state) },
        reasoning: 'Économique : construire marché',
      });
    }

    // Priorité 2 : Améliorer les villes
    if (hasResources(player.resources, { ore: 3, wheat: 2 }) && player.settlements.length > 0) {
      actions.push({
        type: 'build_city',
        priority: 85,
        data: { tileId: player.settlements[0] },
        reasoning: 'Économique : améliorer village en ville',
      });
    }

    // Priorité 3 : Commerce
    const surplusResource = this.findSurplusResource(player);
    const neededResource = this.findNeededResource(player);
    if (surplusResource && neededResource) {
      actions.push({
        type: 'trade_with_bank',
        priority: 65,
        data: {
          tradeOffer: { [surplusResource]: 4 },
          tradeRequest: { [neededResource]: 1 },
        },
        reasoning: `Économique : échanger ${surplusResource} contre ${neededResource}`,
      });
    }

    // Priorité 4 : Expansion
    actions.push(...this.buildExpansionActions(player, state, 60));

    return actions;
  }

  // ── STRATÉGIE SCIENTIFIQUE ────────────────────────────
  private scientificStrategy(player: Player, state: GameState, eval_: GameEvaluation): AIAction[] {
    const actions: AIAction[] = [];

    // Priorité 1 : Recherche technologique
    if (!player.currentResearch) {
      const availableTechs = TechTreeEngine.getAvailableTechs(player);
      if (availableTechs.length > 0) {
        const bestTech = this.chooseBestTechForScience(availableTechs, player);
        actions.push({
          type: 'research_tech',
          priority: 90,
          data: { techId: bestTech },
          reasoning: `Scientifique : rechercher ${bestTech}`,
        });
      }
    }

    // Priorité 2 : Construire bibliothèques/universités
    if (hasResources(player.resources, { wood: 3, wheat: 1 })) {
      actions.push({
        type: 'build_building',
        priority: 80,
        data: { buildingType: 'library', tileId: this.findBestCityTile(player, state) },
        reasoning: 'Scientifique : construire bibliothèque',
      });
    }

    // Priorité 3 : Expansion modérée pour plus de production science
    actions.push(...this.buildExpansionActions(player, state, 55));

    return actions;
  }

  // ── STRATÉGIE DIPLOMATIQUE ────────────────────────────
  private diplomaticStrategy(player: Player, state: GameState, eval_: GameEvaluation): AIAction[] {
    const actions: AIAction[] = [];

    // Priorité 1 : Former des alliances
    const potentialAllies = this.findPotentialAllies(player, state);
    for (const ally of potentialAllies) {
      actions.push({
        type: 'propose_alliance',
        priority: 85,
        data: { targetId: ally.id },
        reasoning: `Diplomatique : proposer alliance à ${ally.name}`,
      });
    }

    // Priorité 2 : Faire la paix si en guerre
    const enemies = [...state.players.values()].filter(
      (p) => player.relations[p.id]?.status === 'war',
    );
    for (const enemy of enemies) {
      actions.push({
        type: 'propose_peace',
        priority: 80,
        data: { targetId: enemy.id },
        reasoning: `Diplomatique : proposer paix à ${enemy.name}`,
      });
    }

    // Priorité 3 : Commerce inter-joueurs
    const tradablePlayer = this.findTradablePlayer(player, state);
    if (tradablePlayer) {
      const surplus = this.findSurplusResource(player);
      const needed = this.findNeededResource(player);
      if (surplus && needed) {
        actions.push({
          type: 'trade_with_player',
          priority: 70,
          data: {
            targetId: tradablePlayer.id,
            tradeOffer: { [surplus]: 2 },
            tradeRequest: { [needed]: 2 },
          },
          reasoning: `Diplomatique : commerce avec ${tradablePlayer.name}`,
        });
      }
    }

    return actions;
  }

  // ── STRATÉGIE EXPANSIONNISTE ──────────────────────────
  private expansionistStrategy(
    player: Player,
    state: GameState,
    eval_: GameEvaluation,
  ): AIAction[] {
    const actions: AIAction[] = [];

    // Priorité maximale : expansion territoriale
    actions.push(...this.buildExpansionActions(player, state, 90));

    // Routes pour connecter les nouvelles terres
    if (hasResources(player.resources, { wood: 1, clay: 1 })) {
      const roadTarget = this.findBestRoadExtension(player, state);
      if (roadTarget) {
        actions.push({
          type: 'build_road',
          priority: 85,
          data: { tileId: roadTarget },
          reasoning: 'Expansionniste : construire route vers nouvelles terres',
        });
      }
    }

    // Unités pour protéger l'expansion
    if (hasResources(player.resources, { wheat: 1, ore: 1 }) && player.units.length < 3) {
      actions.push({
        type: 'train_unit',
        priority: 75,
        data: { unitType: 'warrior' },
        reasoning: 'Expansionniste : protéger les nouvelles colonies',
      });
    }

    return actions;
  }

  // ── STRATÉGIE CULTURELLE ──────────────────────────────
  private culturalStrategy(player: Player, state: GameState, eval_: GameEvaluation): AIAction[] {
    const actions: AIAction[] = [];

    // Priorité 1 : Bâtiments culturels
    if (hasResources(player.resources, { wood: 2, stone: 2 })) {
      actions.push({
        type: 'build_building',
        priority: 85,
        data: { buildingType: 'theater', tileId: this.findBestCityTile(player, state) },
        reasoning: 'Culturel : construire théâtre',
      });
    }

    // Priorité 2 : Temples et foi
    if (hasResources(player.resources, { stone: 3, gold: 1 })) {
      actions.push({
        type: 'build_building',
        priority: 80,
        data: { buildingType: 'temple', tileId: this.findBestCityTile(player, state) },
        reasoning: 'Culturel : construire temple',
      });
    }

    // Priorité 3 : Techs culturelles
    if (!player.currentResearch) {
      const cultureTechs: TechId[] = [
        'philosophy',
        'drama_poetry',
        'theology',
        'printing_press',
        'enlightenment',
      ];
      const available = TechTreeEngine.getAvailableTechs(player).filter((t) =>
        cultureTechs.includes(t),
      );
      if (available.length > 0) {
        actions.push({
          type: 'research_tech',
          priority: 75,
          data: { techId: available[0] },
          reasoning: `Culturel : rechercher ${available[0]}`,
        });
      }
    }

    return actions;
  }

  // ── STRATÉGIE ÉQUILIBRÉE ──────────────────────────────
  private balancedStrategy(player: Player, state: GameState, eval_: GameEvaluation): AIAction[] {
    const actions: AIAction[] = [];

    // Faire un peu de tout selon les besoins
    if (eval_.militaryScore < 40 && hasResources(player.resources, { wheat: 1, ore: 1 })) {
      actions.push({
        type: 'train_unit',
        priority: 70,
        data: { unitType: 'warrior' },
        reasoning: "Équilibré : renforcer l'armée (niveau bas)",
      });
    }

    if (eval_.scienceScore < 40 && !player.currentResearch) {
      const avail = TechTreeEngine.getAvailableTechs(player);
      if (avail.length > 0) {
        actions.push({
          type: 'research_tech',
          priority: 70,
          data: { techId: avail[0] },
          reasoning: 'Équilibré : commencer une recherche',
        });
      }
    }

    if (
      eval_.economicScore < 40 &&
      hasResources(player.resources, { ore: 3, wheat: 2 }) &&
      player.settlements.length > 0
    ) {
      actions.push({
        type: 'build_city',
        priority: 75,
        data: { tileId: player.settlements[0] },
        reasoning: 'Équilibré : améliorer une ville',
      });
    }

    actions.push(...this.buildExpansionActions(player, state, 65));

    return actions;
  }

  // ============================================================
  // HELPERS D'ANALYSE
  // ============================================================

  private buildExpansionActions(
    player: Player,
    state: GameState,
    basePriority: number,
  ): AIAction[] {
    const actions: AIAction[] = [];

    // Village
    if (hasResources(player.resources, { wood: 1, clay: 1, wheat: 1, sheep: 1 })) {
      const bestTile = this.findBestSettlementTile(player, state);
      if (bestTile) {
        actions.push({
          type: 'build_settlement',
          priority: basePriority,
          data: { tileId: bestTile },
          reasoning: 'Expansion : construire un village',
        });
      }
    }

    return actions;
  }

  private findBestSettlementTile(player: Player, state: GameState): string | null {
    // Chercher une tuile non occupée, proche de ressources variées
    let bestScore = -1;
    let bestTile: string | null = null;

    // Probabilités de lancer de dés pour chaque valeur (2-12)
    const DICE_PROBABILITY: Record<number, number> = {
      2: 1,
      3: 2,
      4: 3,
      5: 4,
      6: 5,
      7: 6,
      8: 5,
      9: 4,
      10: 3,
      11: 2,
      12: 1,
    };

    for (const [tileId, tile] of state.map) {
      if (tile.owner || tile.terrain === 'ocean' || tile.terrain === 'coast') continue;
      if (tile.buildings.length > 0) continue;

      let score = 0;

      // Score basé sur la diversité des terrains voisins
      const neighbors = hexAllNeighbors(tile.coord);
      const neighborTerrains = new Set(
        neighbors.map((n) => state.map.get(hexToId(n))?.terrain).filter(Boolean),
      );
      score += neighborTerrains.size * 2;

      // Score dé : probabilité × productions disponibles
      if (tile.diceValue) {
        const diceProb = DICE_PROBABILITY[tile.diceValue] ?? 1;
        const productionValue = Object.values(tile.baseProduction ?? {}).reduce(
          (s, v) => s + (v ?? 0),
          0,
        );
        score += diceProb * productionValue;
      }

      // Voisins avec de bons dés (accessibilité des ressources autour)
      for (const neighbor of neighbors) {
        const neighborTile = state.map.get(hexToId(neighbor));
        if (!neighborTile || neighborTile.terrain === 'ocean') continue;
        if (neighborTile.diceValue) {
          const prob = DICE_PROBABILITY[neighborTile.diceValue] ?? 0;
          score += prob * 0.5;
        }
      }

      // Malus si proche d'un ennemi
      const enemyProximityPenalty = this.calculateEnemyProximityPenalty(tileId, player, state);
      score -= enemyProximityPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestTile = tileId;
      }
    }

    return bestTile;
  }

  private findBestProductionTile(player: Player, state: GameState): string | undefined {
    return player.cities[0] ?? player.settlements[0];
  }

  private findBestCityTile(player: Player, state: GameState): string | undefined {
    return player.metropolis[0] ?? player.cities[0] ?? player.settlements[0];
  }

  private findBestRoadExtension(player: Player, state: GameState): string | null {
    // Trouver la tuile libre la plus prometteuse accessible depuis les routes existantes
    return player.settlements[player.settlements.length - 1] ?? null;
  }

  private findAttackTargets(
    player: Player,
    state: GameState,
  ): Array<{ myUnit: string; enemyUnit: string; enemyOwnerName: string }> {
    const targets: Array<{ myUnit: string; enemyUnit: string; enemyOwnerName: string }> = [];

    for (const myUnitId of player.units) {
      const myUnit = state.units.get(myUnitId);
      if (!myUnit || myUnit.hasAttacked) continue;

      for (const [, enemyUnit] of state.units) {
        if (enemyUnit.ownerId === player.id) continue;
        const rel = player.relations[enemyUnit.ownerId];
        if (!rel || rel.status !== 'war') continue;

        const dist = hexDistance(myUnit.position, enemyUnit.position);
        if (dist <= myUnit.stats.range + 1) {
          const owner = state.players.get(enemyUnit.ownerId);
          targets.push({
            myUnit: myUnitId,
            enemyUnit: enemyUnit.id,
            enemyOwnerName: owner?.name ?? 'inconnu',
          });
        }
      }
    }

    return targets;
  }

  private findWeakestEnemy(player: Player, state: GameState): Player | null {
    let weakest: Player | null = null;
    let weakestScore = Infinity;

    for (const [, otherPlayer] of state.players) {
      if (otherPlayer.id === player.id) continue;
      const rel = player.relations[otherPlayer.id];
      if (rel?.status === 'allied' || rel?.status === 'friendly') continue;

      const score = otherPlayer.units.length + otherPlayer.cities.length * 5;
      if (score < weakestScore) {
        weakestScore = score;
        weakest = otherPlayer;
      }
    }

    return weakest;
  }

  private findPotentialAllies(player: Player, state: GameState): Player[] {
    return [...state.players.values()].filter((p) => {
      if (p.id === player.id) return false;
      const rel = player.relations[p.id];
      if (!rel) return false;
      return rel.status === 'friendly' || rel.score >= 40;
    });
  }

  private findTradablePlayer(player: Player, state: GameState): Player | null {
    return (
      [...state.players.values()].find((p) => {
        if (p.id === player.id) return false;
        const rel = player.relations[p.id];
        return rel && ['friendly', 'allied', 'neutral'].includes(rel.status);
      }) ?? null
    );
  }

  private findSurplusResource(player: Player): ResourceType | null {
    const MAX_SURPLUS = 6;
    for (const [res, amount] of Object.entries(player.resources) as [ResourceType, number][]) {
      if ((amount ?? 0) >= MAX_SURPLUS) return res;
    }
    return null;
  }

  private findNeededResource(player: Player): ResourceType | null {
    const needed: ResourceType[] = ['wheat', 'ore', 'wood', 'clay', 'sheep'];
    return needed.find((r) => (player.resources[r] ?? 0) < 2) ?? null;
  }

  private chooseMilitaryUnit(player: Player): string {
    if (player.researchedTechs.includes('iron_working')) return 'swordsman';
    if (player.researchedTechs.includes('horseback_riding')) return 'cavalry';
    if (player.researchedTechs.includes('archery')) return 'archer';
    return 'warrior';
  }

  private chooseBestTechForScience(techs: TechId[], player: Player): TechId {
    // Priorité aux techs de science
    const scienceTechs: TechId[] = [
      'writing',
      'education',
      'scientific_method',
      'rationalism',
      'astronomy',
    ];
    const match = techs.find((t) => scienceTechs.includes(t));
    return match ?? techs[0];
  }

  /**
   * Calcule le malus de proximité ennemie pour un emplacement de bâtiment.
   * Retourne un score négatif si des ennemis sont à portée.
   */
  private calculateEnemyProximityPenalty(tileId: string, player: Player, state: GameState): number {
    const tile = state.map.get(tileId);
    if (!tile) return 0;

    let penalty = 0;
    for (const [, unit] of state.units) {
      if (unit.ownerId === player.id) continue;
      const rel = player.relations[unit.ownerId];
      if (rel?.status === 'war' || rel?.status === 'hostile') {
        const dist = hexDistance(tile.coord, unit.position);
        if (dist <= 3) penalty += (4 - dist) * 5; // +5 à dist 3, +10 à dist 2, +15 à dist 1
      }
    }
    return penalty;
  }

  /**
   * Stratégie fin de partie : identifier les joueurs proches de la victoire
   * et retourner une liste d'actions pour les bloquer.
   */
  generateEndGameBlockingActions(player: Player, state: GameState): AIAction[] {
    const actions: AIAction[] = [];
    const victoryTarget = state.config.victoryPointTarget;

    for (const [, threat] of state.players) {
      if (threat.id === player.id || threat.isEliminated) continue;
      const threatVP = threat.stats.victoryPoints;
      if (threatVP < victoryTarget * 0.7) continue; // Pas encore une menace

      const rel = player.relations[threat.id];

      // Option 1 : déclencher la guerre si pas déjà en conflit
      if (rel && rel.status !== 'war' && rel.status !== 'allied') {
        actions.push({
          type: 'declare_war',
          priority: 80 + (threatVP / victoryTarget) * 20,
          data: { targetPlayerId: threat.id },
          reasoning: `Fin de partie : bloquer ${threat.name} (${threatVP} VP)`,
        });
      }

      // Option 2 : proposer une alliance contre la menace commune
      for (const [, potential] of state.players) {
        if (potential.id === player.id || potential.id === threat.id) continue;
        if (potential.isEliminated) continue;
        const potRel = player.relations[potential.id];
        if (potRel?.status === 'friendly' || potRel?.status === 'neutral') {
          actions.push({
            type: 'propose_alliance',
            priority: 70,
            data: { targetPlayerId: potential.id },
            reasoning: `Former alliance contre ${threat.name}`,
          });
          break;
        }
      }
    }

    return actions;
  }

  private applyDifficultyFilter(actions: AIAction[], player: Player, state: GameState): AIAction[] {
    if (actions.length === 0) return actions;

    // 2.9F — Normalisation des scores par rapport à tous les joueurs
    const allScores = [...state.players.values()]
      .filter((p) => !p.isEliminated)
      .map((p) => evaluateGameState(p, state).totalScore);
    const sumScores = allScores.reduce((s, x) => s + x, 0) || 1;
    const myScore = evaluateGameState(player, state).totalScore;
    const relativeScore = myScore / sumScores; // 0-1

    switch (this.difficulty) {
      case 'easy':
        // Ajouter du bruit, ignorer parfois les meilleures actions
        return actions.map((a) => ({
          ...a,
          priority: Math.max(0, a.priority - randomFloat(0, 35)),
        }));

      case 'medium':
        // Léger boost si en retard
        return actions
          .map((a) => ({
            ...a,
            priority: relativeScore < 0.4 ? Math.min(100, a.priority + 10) : a.priority,
          }))
          .sort((a, b) => b.priority - a.priority);

      case 'hard':
        // 2.9H — Priorisation relative : boost fort si derrière, inhibition si devant
        return actions
          .map((a) => ({
            ...a,
            priority:
              relativeScore < 0.35
                ? Math.min(100, a.priority + 15)
                : relativeScore > 0.65
                  ? a.priority * 0.9 // légère inhibition pour ne pas foncer tête baissée
                  : a.priority,
          }))
          .sort((a, b) => b.priority - a.priority);

      case 'legendary': {
        // 2.9H — Simulation d'anticipation 3 tours (minimax simplifié)
        // On applique un bonus aux actions qui contrecarrent les leaders
        const leaderScore = Math.max(...allScores);
        const leaderThreat = leaderScore / sumScores > 0.4; // quelqu'un domine

        return actions
          .map((a) => {
            let p = a.priority;
            // Si quelqu'un domine, booster les actions défensives et diplomatiques
            if (leaderThreat) {
              if (a.type === 'propose_alliance' || a.type === 'declare_war')
                p = Math.min(100, p + 20);
              if (a.type === 'train_unit') p = Math.min(100, p + 10);
            }
            // Si on est en retard, booster toutes les actions productives
            if (relativeScore < 0.3) p = Math.min(100, p + 20);
            return { ...a, priority: p };
          })
          .sort((a, b) => b.priority - a.priority);
      }

      default:
        return actions.sort((a, b) => b.priority - a.priority);
    }
  }
}
