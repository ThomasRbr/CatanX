// ============================================================
// DiplomacyEngine — Relations, traités, commerce, espionnage
// ============================================================

import {
  Player,
  DiplomaticRelation,
  DiplomaticStatus,
  Treaty,
  TreatyType,
  TradeDeal,
  TrustEvent,
} from '../../types/player';
import { ResourceBundle, ResourceType } from '../../types/resources';
import { CouncilActiveEffect, GameState } from '../../types/game';
import { hasResources, subtractResources, addResources } from '../resources/ResourceSystem';
import { nextId } from '../../core/ids';

// ============================================================
// SCORE DIPLOMATIQUE & STATUS
// ============================================================

const STATUS_THRESHOLDS: Array<{ min: number; status: DiplomaticStatus }> = [
  { min: 75, status: 'allied' },
  { min: 40, status: 'friendly' },
  { min: -20, status: 'neutral' },
  { min: -50, status: 'hostile' },
  { min: -Infinity, status: 'war' },
];

export function getStatusFromScore(score: number): DiplomaticStatus {
  for (const threshold of STATUS_THRESHOLDS) {
    if (score >= threshold.min) return threshold.status;
  }
  return 'war';
}

/** Clamp un score diplomatique dans l'intervalle [-100, 100] */
function clampScore(score: number): number {
  return Math.max(-100, Math.min(100, score));
}

export function initRelation(fromPlayer: string, toPlayer: string): DiplomaticRelation {
  return {
    status: 'neutral',
    score: 0,
    treaties: [],
    sharedVision: false,
    openBorders: false,
    militaryAccess: false,
    lastInteractionTurn: 0,
    trustHistory: [],
  };
}

// ============================================================
// MODIFICATION DES RELATIONS
// ============================================================

export interface DiplomacyAction {
  type: DiplomacyActionType;
  fromPlayerId: string;
  toPlayerId: string;
  data?: unknown;
}

export type DiplomacyActionType =
  | 'declare_war'
  | 'propose_peace'
  | 'accept_peace'
  | 'propose_alliance'
  | 'accept_alliance'
  | 'break_alliance'
  | 'propose_trade'
  | 'accept_trade'
  | 'reject_trade'
  | 'propose_open_borders'
  | 'accept_open_borders'
  | 'propose_research_pact'
  | 'accept_research_pact'
  | 'denounce'
  | 'compliment'
  | 'demand_tribute'
  | 'accept_tribute'
  | 'refuse_tribute'
  | 'declare_vassal'
  | 'accept_vassal'
  | 'gift_resources'
  | 'betray_alliance';

export interface DiplomacyResult {
  success: boolean;
  reason?: string;
  events: DiplomacyEvent[];
}

export interface DiplomacyEvent {
  type: string;
  fromId: string;
  toId: string;
  data?: unknown;
  message: string;
}

export function processDiplomacyAction(action: DiplomacyAction, state: GameState): DiplomacyResult {
  const fromPlayer = state.players.get(action.fromPlayerId);
  const toPlayer = state.players.get(action.toPlayerId);

  if (!fromPlayer || !toPlayer) {
    return { success: false, reason: 'Joueur introuvable', events: [] };
  }

  // S'assurer que la relation existe
  if (!fromPlayer.relations[action.toPlayerId]) {
    fromPlayer.relations[action.toPlayerId] = initRelation(action.fromPlayerId, action.toPlayerId);
  }
  if (!toPlayer.relations[action.fromPlayerId]) {
    toPlayer.relations[action.fromPlayerId] = initRelation(action.toPlayerId, action.fromPlayerId);
  }

  const fromRel = fromPlayer.relations[action.toPlayerId];
  const toRel = toPlayer.relations[action.fromPlayerId];

  switch (action.type) {
    case 'declare_war': {
      if (hasActiveCouncilEffect(state, 'forced_truce')) {
        return {
          success: false,
          reason: 'Trêve mondiale du conseil : déclaration de guerre interdite.',
          events: [],
        };
      }
      return declarWar(fromPlayer, toPlayer, fromRel, toRel, state);
    }

    case 'propose_peace':
      return proposePeace(fromPlayer, toPlayer, fromRel, toRel);

    case 'accept_peace':
      return acceptPeace(fromPlayer, toPlayer, fromRel, toRel, state.currentTurn);

    case 'propose_alliance':
      return proposeAlliance(fromPlayer, toPlayer, fromRel, toRel);

    case 'accept_alliance':
      return acceptAlliance(fromPlayer, toPlayer, fromRel, toRel, state.currentTurn);

    case 'break_alliance':
      return breakAlliance(fromPlayer, toPlayer, fromRel, toRel);

    case 'denounce':
      return denounce(fromPlayer, toPlayer, fromRel, toRel);

    case 'gift_resources': {
      const gift = action.data as ResourceBundle;
      return giftResources(fromPlayer, toPlayer, fromRel, toRel, gift, state.currentTurn);
    }

    case 'betray_alliance':
      return betrayAlliance(fromPlayer, toPlayer, fromRel, toRel, state);

    default:
      return { success: false, reason: 'Action non implémentée', events: [] };
  }
}

// ============================================================
// DÉCLARATION DE GUERRE
// ============================================================

function declarWar(
  from: Player,
  to: Player,
  fromRel: DiplomaticRelation,
  toRel: DiplomaticRelation,
  state: GameState,
): DiplomacyResult {
  if (fromRel.status === 'war') {
    return { success: false, reason: 'Déjà en guerre', events: [] };
  }

  fromRel.status = 'war';
  toRel.status = 'war';
  fromRel.score = clampScore(Math.min(fromRel.score, -60));
  toRel.score = clampScore(Math.min(toRel.score, -60));
  fromRel.openBorders = false;
  fromRel.militaryAccess = false;
  toRel.openBorders = false;
  toRel.militaryAccess = false;
  fromRel.warDeclaredTurn = state.currentTurn;
  toRel.warDeclaredTurn = state.currentTurn;

  // Annuler tous les traités
  fromRel.treaties = fromRel.treaties.filter((t) => t.type === 'peace_treaty');
  toRel.treaties = toRel.treaties.filter((t) => t.type === 'peace_treaty');

  // Impact sur les autres joueurs (pénalité diplomatique globale)
  const aggressionPenalty = -10;
  for (const [, otherPlayer] of state.players) {
    if (otherPlayer.id === from.id || otherPlayer.id === to.id) continue;
    if (otherPlayer.relations[from.id]) {
      otherPlayer.relations[from.id].score = clampScore(
        otherPlayer.relations[from.id].score + aggressionPenalty,
      );
      otherPlayer.relations[from.id].status = getStatusFromScore(
        otherPlayer.relations[from.id].score,
      );
      addTrustEvent(
        otherPlayer.relations[from.id],
        state.currentTurn,
        `Déclaration de guerre sur ${to.name}`,
        aggressionPenalty,
      );
    }
  }

  return {
    success: true,
    events: [
      {
        type: 'war_declared',
        fromId: from.id,
        toId: to.id,
        message: `${from.name} a déclaré la guerre à ${to.name} !`,
      },
    ],
  };
}

// ============================================================
// PAIX
// ============================================================

function proposePeace(
  from: Player,
  to: Player,
  fromRel: DiplomaticRelation,
  toRel: DiplomaticRelation,
): DiplomacyResult {
  if (fromRel.status !== 'war') {
    return { success: false, reason: 'Pas en guerre', events: [] };
  }

  return {
    success: true,
    events: [
      {
        type: 'peace_proposed',
        fromId: from.id,
        toId: to.id,
        message: `${from.name} propose la paix à ${to.name}.`,
      },
    ],
  };
}

function acceptPeace(
  from: Player,
  to: Player,
  fromRel: DiplomaticRelation,
  toRel: DiplomaticRelation,
  turn: number,
): DiplomacyResult {
  fromRel.status = 'neutral';
  toRel.status = 'neutral';
  fromRel.score = clampScore(Math.max(-20, fromRel.score + 30));
  toRel.score = clampScore(Math.max(-20, toRel.score + 30));

  const treaty: Treaty = {
    id: `treaty_peace_${turn}`,
    type: 'peace_treaty',
    establishedTurn: turn,
    expirationTurn: turn + 10, // trêve de 10 tours
    terms: [{ type: 'custom', description: 'Cessez-le-feu de 10 tours' }],
  };

  fromRel.treaties.push(treaty);
  toRel.treaties.push({ ...treaty });

  addTrustEvent(fromRel, turn, `Traité de paix signé avec ${to.name}`, 15);
  addTrustEvent(toRel, turn, `Traité de paix signé avec ${from.name}`, 15);

  return {
    success: true,
    events: [
      {
        type: 'peace_accepted',
        fromId: from.id,
        toId: to.id,
        message: `${from.name} et ${to.name} ont signé un traité de paix.`,
      },
    ],
  };
}

// ============================================================
// ALLIANCE
// ============================================================

function proposeAlliance(
  from: Player,
  to: Player,
  fromRel: DiplomaticRelation,
  toRel: DiplomaticRelation,
): DiplomacyResult {
  if (fromRel.score < 40) {
    return {
      success: false,
      reason: `Relations insuffisantes (${fromRel.score}/40 requis)`,
      events: [],
    };
  }

  return {
    success: true,
    events: [
      {
        type: 'alliance_proposed',
        fromId: from.id,
        toId: to.id,
        message: `${from.name} propose une alliance à ${to.name}.`,
      },
    ],
  };
}

function acceptAlliance(
  from: Player,
  to: Player,
  fromRel: DiplomaticRelation,
  toRel: DiplomaticRelation,
  turn: number,
): DiplomacyResult {
  fromRel.status = 'allied';
  toRel.status = 'allied';
  fromRel.sharedVision = true;
  toRel.sharedVision = true;
  fromRel.openBorders = true;
  toRel.openBorders = true;

  const treaty: Treaty = {
    id: `treaty_alliance_${turn}`,
    type: 'military_alliance',
    establishedTurn: turn,
    terms: [
      { type: 'military_support', description: 'Défense mutuelle' },
      { type: 'open_borders', description: 'Frontières ouvertes' },
    ],
  };

  fromRel.treaties.push(treaty);
  toRel.treaties.push({ ...treaty });

  // Impact positif sur les autres joueurs (qui voient l'alliance comme une menace ou pas)
  addTrustEvent(fromRel, turn, `Alliance formée avec ${to.name}`, 20);
  addTrustEvent(toRel, turn, `Alliance formée avec ${from.name}`, 20);

  return {
    success: true,
    events: [
      {
        type: 'alliance_formed',
        fromId: from.id,
        toId: to.id,
        message: `${from.name} et ${to.name} ont formé une alliance !`,
      },
    ],
  };
}

function breakAlliance(
  from: Player,
  to: Player,
  fromRel: DiplomaticRelation,
  toRel: DiplomaticRelation,
): DiplomacyResult {
  if (fromRel.status !== 'allied') {
    return { success: false, reason: "Pas d'alliance active", events: [] };
  }

  // BUG FIX: les deux côtés doivent recalculer leur statut depuis leur score
  fromRel.score = clampScore(fromRel.score - 20);
  toRel.score = clampScore(toRel.score - 30);
  fromRel.status = getStatusFromScore(fromRel.score);
  toRel.status = getStatusFromScore(toRel.score);
  fromRel.sharedVision = false;
  toRel.sharedVision = false;
  fromRel.openBorders = false;
  toRel.openBorders = false;
  fromRel.treaties = fromRel.treaties.filter((t) => t.type !== 'military_alliance');
  toRel.treaties = toRel.treaties.filter((t) => t.type !== 'military_alliance');

  return {
    success: true,
    events: [
      {
        type: 'alliance_broken',
        fromId: from.id,
        toId: to.id,
        message: `${from.name} a rompu l'alliance avec ${to.name} !`,
      },
    ],
  };
}

// ============================================================
// TRAHISON
// ============================================================

function betrayAlliance(
  from: Player,
  to: Player,
  fromRel: DiplomaticRelation,
  toRel: DiplomaticRelation,
  state: GameState,
): DiplomacyResult {
  // Briser l'alliance puis déclarer la guerre
  breakAlliance(from, to, fromRel, toRel);
  const warResult = declarWar(from, to, fromRel, toRel, state);

  // Mémoire permanente de la trahison
  from.betrayalCount = (from.betrayalCount ?? 0) + 1;
  from.hasBetrayedAlliance = true;

  // Pénalité diplomatique massive (-20 envers tous les autres joueurs)
  fromRel.score = clampScore(fromRel.score - 40);
  for (const [, otherPlayer] of state.players) {
    if (otherPlayer.id === from.id) continue;
    if (otherPlayer.relations[from.id]) {
      otherPlayer.relations[from.id].score = clampScore(otherPlayer.relations[from.id].score - 20);
      otherPlayer.relations[from.id].status = getStatusFromScore(
        otherPlayer.relations[from.id].score,
      );
    }
  }

  return {
    success: true,
    events: [
      {
        type: 'betrayal',
        fromId: from.id,
        toId: to.id,
        message: `${from.name} a TRAHI ${to.name} ! La diplomatie mondiale est choquée.`,
      },
      ...warResult.events,
    ],
  };
}

// ============================================================
// DÉNONCIATION
// ============================================================

function denounce(
  from: Player,
  to: Player,
  fromRel: DiplomaticRelation,
  toRel: DiplomaticRelation,
): DiplomacyResult {
  fromRel.score = clampScore(fromRel.score - 10);
  toRel.score = clampScore(toRel.score - 20);
  fromRel.status = getStatusFromScore(fromRel.score);
  toRel.status = getStatusFromScore(toRel.score);

  return {
    success: true,
    events: [
      {
        type: 'denounced',
        fromId: from.id,
        toId: to.id,
        message: `${from.name} dénonce publiquement ${to.name} !`,
      },
    ],
  };
}

// ============================================================
// DON DE RESSOURCES
// ============================================================

function giftResources(
  from: Player,
  to: Player,
  fromRel: DiplomaticRelation,
  toRel: DiplomaticRelation,
  gift: ResourceBundle,
  turn: number,
): DiplomacyResult {
  if (!hasResources(from.resources, gift)) {
    return { success: false, reason: 'Ressources insuffisantes pour le cadeau', events: [] };
  }

  from.resources = subtractResources(from.resources, gift);
  to.resources = addResources(to.resources, gift);

  // Calcul du bonus diplomatique selon la valeur du cadeau
  const giftValue = Object.values(gift).reduce((s, v) => s + (v ?? 0), 0);
  const bonus = Math.min(20, Math.ceil(giftValue / 3));

  toRel.score = clampScore(toRel.score + bonus);
  toRel.status = getStatusFromScore(toRel.score);

  addTrustEvent(toRel, turn, `Don de ressources reçu de ${from.name}`, bonus);

  return {
    success: true,
    events: [
      {
        type: 'resources_gifted',
        fromId: from.id,
        toId: to.id,
        data: gift,
        message: `${from.name} offre des ressources à ${to.name} (+${bonus} relations).`,
      },
    ],
  };
}

// ============================================================
// ÉROSION NATURELLE DES RELATIONS
// ============================================================

/**
 * Vérifie et supprime les traités expirés pour tous les joueurs.
 * Retire également les effets associés (openBorders, sharedVision, militaryAccess).
 * À appeler en début de chaque tour via GameEngine.advanceTurn().
 */
export function checkTreatyExpirations(state: GameState): void {
  const turn = state.currentTurn;

  for (const [, player] of state.players) {
    for (const [otherId, relation] of Object.entries(player.relations)) {
      const before = relation.treaties.length;
      relation.treaties = relation.treaties.filter((treaty) => {
        if (treaty.expirationTurn !== undefined && treaty.expirationTurn <= turn) {
          // Traité expiré — retirer les effets selon le type
          // Retirer les effets persistants selon les termes du traité
          for (const term of treaty.terms ?? []) {
            if (term.type === 'open_borders') relation.openBorders = false;
          }
          // Types de traité avec effets sur les flags de relation
          switch (treaty.type) {
            case 'defensive_pact':
            case 'military_alliance':
              relation.militaryAccess = false;
              relation.sharedVision = false;
              break;
            case 'peace_treaty':
              // La trêve expire — statut recalculé depuis le score
              break;
            default:
              break;
          }
          return false; // supprimer ce traité
        }
        return true; // conserver
      });

      // Recalculer le statut si des traités ont expiré
      if (relation.treaties.length !== before) {
        relation.status = getStatusFromScore(relation.score);
      }
    }

    // Décrémenter les accords commerciaux actifs
    player.activeTradeDeals = player.activeTradeDeals.filter((deal) => {
      deal.turnsRemaining--;
      return deal.turnsRemaining > 0;
    });
  }
}

export function decayRelations(state: GameState): void {
  for (const [, player] of state.players) {
    for (const [otherId, relation] of Object.entries(player.relations)) {
      const other = state.players.get(otherId);
      if (!other) continue;

      // Les relations neutres reviennent doucement vers 0
      if (relation.score > 5) relation.score = clampScore(relation.score - 1);
      if (relation.score < -5) relation.score = clampScore(relation.score + 1);

      // Guerre prolongée détériore encore plus
      if (relation.status === 'war' && relation.warDeclaredTurn !== undefined) {
        const warDuration = state.currentTurn - relation.warDeclaredTurn;
        if (warDuration % 5 === 0) {
          relation.score = clampScore(relation.score - 3);
        }
      }

      relation.status = getStatusFromScore(relation.score);
    }
  }
}

// ============================================================
// TRADE DEALS
// ============================================================

export function proposeTradeAgreement(
  fromPlayer: Player,
  toPlayer: Player,
  offer: ResourceBundle,
  request: ResourceBundle,
  durationTurns: number,
  currentTurn: number,
): { deal: TradeDeal | null; valid: boolean; reason?: string } {
  if (!hasResources(fromPlayer.resources, offer)) {
    return { deal: null, valid: false, reason: 'Ressources insuffisantes' };
  }

  const deal: TradeDeal = {
    id: `trade_${currentTurn}_${fromPlayer.id}_${toPlayer.id}`,
    partnerId: toPlayer.id,
    offer,
    request,
    turnsRemaining: durationTurns,
    establishedTurn: currentTurn,
  };

  return { deal, valid: true };
}

export function processTradeDeal(deal: TradeDeal, fromPlayer: Player, toPlayer: Player): boolean {
  if (!hasResources(fromPlayer.resources, deal.offer)) return false;
  if (!hasResources(toPlayer.resources, deal.request)) return false;

  fromPlayer.resources = subtractResources(fromPlayer.resources, deal.offer);
  fromPlayer.resources = addResources(fromPlayer.resources, deal.request);
  toPlayer.resources = subtractResources(toPlayer.resources, deal.request);
  toPlayer.resources = addResources(toPlayer.resources, deal.offer);

  deal.turnsRemaining--;
  return true;
}

// ============================================================
// OBLIGATIONS D'ALLIANCE
// ============================================================

/**
 * Quand C déclare la guerre à A, vérifie si B est allié de A.
 * Si oui : crée un PendingChoice pour B "Honorer l'alliance ou trahir".
 * À appeler après chaque `declare_war`.
 */
export function checkAllianceObligations(
  aggressor: Player,
  victim: Player,
  state: GameState,
): void {
  for (const [, potentialAlly] of state.players) {
    if (potentialAlly.id === aggressor.id || potentialAlly.id === victim.id) continue;
    if (potentialAlly.isEliminated) continue;

    const allyRel = potentialAlly.relations[victim.id];
    if (allyRel?.status !== 'allied') continue;

    // B est allié de A (victim) → lui poser le choix
    const choiceId = `alliance_obligation_${potentialAlly.id}_${state.currentTurn}`;
    const alreadyPending = state.pendingChoices.some((c) => c.id === choiceId);
    if (alreadyPending) continue;

    state.pendingChoices.push({
      id: choiceId,
      eventId: `war_${aggressor.id}_vs_${victim.id}`,
      playerId: potentialAlly.id,
      choices: [
        {
          id: 'honor_alliance',
          label: `Honorer l'alliance avec ${victim.name}`,
          description: `Entrer en guerre contre ${aggressor.name}`,
          effects: [],
        },
        {
          id: 'betray_alliance',
          label: `Trahir l'alliance avec ${victim.name}`,
          description: 'Rester neutre malgré le traité',
          effects: [],
        },
      ],
      deadline: state.currentTurn + 2,
    });
  }
}

/**
 * Résout un choix d'obligation d'alliance.
 * Appelé par GameEngine quand le joueur soumet sa réponse.
 */
export function resolveAllianceObligation(
  playerId: string,
  choiceId: string,
  selectedOption: 'honor_alliance' | 'betray_alliance',
  aggressorId: string,
  victimId: string,
  state: GameState,
): void {
  const ally = state.players.get(playerId);
  const aggressor = state.players.get(aggressorId);
  const victim = state.players.get(victimId);
  if (!ally || !aggressor || !victim) return;

  // Retirer le choix en attente
  state.pendingChoices = state.pendingChoices.filter((c) => c.id !== choiceId);

  if (selectedOption === 'honor_alliance') {
    // Entrer en guerre contre l'agresseur
    const allyRel = ally.relations[aggressorId];
    const aggressorRel = aggressor.relations[playerId];
    if (allyRel && aggressorRel) {
      processDiplomacyAction(
        {
          type: 'declare_war',
          fromPlayerId: playerId,
          toPlayerId: aggressorId,
        },
        state,
      );
    }
  } else {
    // Trahir l'alliance avec la victime
    const allyRel = ally.relations[victimId];
    const victimRel = victim.relations[playerId];
    if (allyRel && victimRel) {
      processDiplomacyAction(
        {
          type: 'break_alliance',
          fromPlayerId: playerId,
          toPlayerId: victimId,
        },
        state,
      );
      // Marquer comme trahison
      ally.betrayalCount = (ally.betrayalCount ?? 0) + 1;
      ally.hasBetrayedAlliance = true;
    }
  }
}

// ============================================================
// CONSEIL MONDIAL
// ============================================================

const COUNCIL_RESOLUTIONS = [
  {
    id: 'global_trade_pact',
    title: 'Pacte commercial mondial',
    description: 'Tous les échanges ont un ratio amélioré de 3:1 pendant 10 tours.',
    options: [
      {
        id: 'approve',
        label: 'Approuver',
        effects: ['trade_ratio:3:10'],
        moralityTag: 'economic' as const,
      },
      { id: 'reject', label: 'Rejeter', effects: [], moralityTag: 'conservative' as const },
    ],
  },
  {
    id: 'arms_limitation',
    title: 'Limitation des armements',
    description: "Chaque joueur ne peut entraîner qu'une unité par tour pendant 8 tours.",
    options: [
      {
        id: 'approve',
        label: 'Approuver',
        effects: ['unit_training_limit:1:8'],
        moralityTag: 'progressive' as const,
      },
      { id: 'reject', label: 'Rejeter', effects: [], moralityTag: 'military' as const },
    ],
  },
  {
    id: 'knowledge_sharing',
    title: 'Partage des connaissances',
    description: 'Chaque civilisation reçoit un bonus de science immédiat.',
    options: [
      {
        id: 'approve',
        label: 'Approuver',
        effects: ['shared_techs'],
        moralityTag: 'progressive' as const,
      },
      { id: 'reject', label: 'Rejeter', effects: [], moralityTag: 'conservative' as const },
    ],
  },
  {
    id: 'world_peace',
    title: 'Paix mondiale',
    description: 'Toutes les guerres actives sont suspendues pendant 5 tours (trêve forcée).',
    options: [
      {
        id: 'approve',
        label: 'Approuver',
        effects: ['forced_truce:5'],
        moralityTag: 'progressive' as const,
      },
      { id: 'reject', label: 'Rejeter', effects: [], moralityTag: 'military' as const },
    ],
  },
  {
    id: 'resource_embargo',
    title: 'Embargo sur les ressources rares',
    description: 'Les échanges de gold, gems et obsidian sont interdits pendant 6 tours.',
    options: [
      {
        id: 'approve',
        label: 'Approuver',
        effects: ['embargo:gold,gems,obsidian:6'],
        moralityTag: 'economic' as const,
      },
      { id: 'reject', label: 'Rejeter', effects: [], moralityTag: 'economic' as const },
    ],
  },
  {
    id: 'hegemony',
    title: 'Hégémonie diplomatique',
    description:
      'Le conseil désigne le joueur le plus influent comme leader mondial (victoire diplomatique possible).',
    options: [
      {
        id: 'elect_leader',
        label: 'Élire le plus influent',
        effects: ['elect_diplomatic_leader'],
        moralityTag: 'progressive' as const,
      },
      { id: 'reject', label: 'Rejeter', effects: [], moralityTag: 'conservative' as const },
    ],
  },
];

let councilResolutionIdx = 0;

export function pruneCouncilEffects(state: GameState): void {
  if (!state.worldCouncil.activeEffects) {
    state.worldCouncil.activeEffects = [];
    return;
  }
  state.worldCouncil.activeEffects = state.worldCouncil.activeEffects.filter(
    (effect) => effect.expiresTurn >= state.currentTurn,
  );
}

export function hasActiveCouncilEffect(
  state: GameState,
  kind: CouncilActiveEffect['kind'],
): boolean {
  pruneCouncilEffects(state);
  return state.worldCouncil.activeEffects.some((effect) => effect.kind === kind);
}

export function getActiveCouncilEffect(
  state: GameState,
  kind: CouncilActiveEffect['kind'],
): CouncilActiveEffect | undefined {
  pruneCouncilEffects(state);
  return state.worldCouncil.activeEffects.find((effect) => effect.kind === kind);
}

function pushCouncilEffect(
  state: GameState,
  kind: CouncilActiveEffect['kind'],
  expiresTurn: number,
  data?: Record<string, unknown>,
): void {
  if (!state.worldCouncil.activeEffects) state.worldCouncil.activeEffects = [];
  state.worldCouncil.activeEffects = state.worldCouncil.activeEffects.filter((e) => e.kind !== kind);
  state.worldCouncil.activeEffects.push({
    id: nextId('council_fx'),
    kind,
    expiresTurn,
    data,
  });
}

function applyCouncilOptionEffects(
  state: GameState,
  optionId: string,
  resolution: NonNullable<GameState['worldCouncil']['currentResolution']>,
): void {
  const option = resolution.options.find((entry) => entry.id === optionId);
  if (!option) return;

  for (const effect of option.effects) {
    if (effect === 'elect_diplomatic_leader') {
      const leader = [...state.players.values()]
        .filter((p) => !p.isEliminated)
        .sort((a, b) => (b.resources.influence ?? 0) - (a.resources.influence ?? 0))[0];
      if (leader) {
        state.worldCouncil.diplomaticLeaderId = leader.id;
        leader.resources.influence = (leader.resources.influence ?? 0) + 3;
      }
      continue;
    }

    if (effect === 'shared_techs') {
      for (const [, player] of state.players) {
        if (player.isEliminated) continue;
        player.resources.science = (player.resources.science ?? 0) + 5;
        player.researchProgress += 5;
      }
      pushCouncilEffect(state, 'shared_techs', state.currentTurn, {});
      continue;
    }

    if (effect.startsWith('trade_ratio:')) {
      const [, ratioRaw, turnsRaw] = effect.split(':');
      pushCouncilEffect(state, 'trade_ratio', state.currentTurn + Number(turnsRaw ?? 10), {
        ratio: Number(ratioRaw ?? 3),
      });
      continue;
    }

    if (effect.startsWith('unit_training_limit:')) {
      const [, maxRaw, turnsRaw] = effect.split(':');
      pushCouncilEffect(state, 'unit_training_limit', state.currentTurn + Number(turnsRaw ?? 8), {
        max: Number(maxRaw ?? 1),
      });
      continue;
    }

    if (effect.startsWith('forced_truce:')) {
      const turns = Number(effect.split(':')[1] ?? 5);
      pushCouncilEffect(state, 'forced_truce', state.currentTurn + turns, {});
      for (const [, player] of state.players) {
        for (const [otherId, relation] of Object.entries(player.relations)) {
          if (relation.status !== 'war') continue;
          relation.status = 'neutral';
          relation.score = Math.max(relation.score, -10);
          const other = state.players.get(otherId);
          const reverse = other?.relations[player.id];
          if (reverse && reverse.status === 'war') {
            reverse.status = 'neutral';
            reverse.score = Math.max(reverse.score, -10);
          }
        }
      }
      continue;
    }

    if (effect.startsWith('embargo:')) {
      const [, resourcesRaw, turnsRaw] = effect.split(':');
      const resources = (resourcesRaw ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean) as ResourceType[];
      pushCouncilEffect(state, 'embargo', state.currentTurn + Number(turnsRaw ?? 6), {
        resources,
      });
    }
  }
}

/**
 * Vérifie si c'est le moment de tenir un vote du Conseil Mondial.
 * Si oui, crée une nouvelle résolution et reset les votes.
 * À appeler dans advanceTurn() chaque nouveau tour global.
 */
export function advanceWorldCouncil(state: GameState): void {
  if (!state.worldCouncil.active) return;
  pruneCouncilEffects(state);
  if (state.currentTurn < state.worldCouncil.nextVoteTurn) return;

  // Résoudre le vote précédent s'il y en avait un
  if (state.worldCouncil.currentResolution && Object.keys(state.worldCouncil.votes).length > 0) {
    const winnerOptionId = tallyCouncilVotes(state.worldCouncil.votes, state);
    state.worldCouncil.currentResolution.winnerId = winnerOptionId ?? undefined;
    state.worldCouncil.history.push({ ...state.worldCouncil.currentResolution });

    if (winnerOptionId) {
      applyCouncilOptionEffects(state, winnerOptionId, state.worldCouncil.currentResolution);
      state.worldCouncil.currentResolution.globalEffect = winnerOptionId;
    }
  }

  const cursor = state.worldCouncil.resolutionCursor ?? 0;
  const template = COUNCIL_RESOLUTIONS[cursor % COUNCIL_RESOLUTIONS.length];
  state.worldCouncil.resolutionCursor = cursor + 1;
  // Garde rétro-compatibilité avec l'ancien compteur module (tests / saves legacy)
  councilResolutionIdx = state.worldCouncil.resolutionCursor;

  state.worldCouncil.currentResolution = {
    id: `${template.id}_t${state.currentTurn}`,
    title: template.title,
    description: template.description,
    options: template.options,
    turn: state.currentTurn,
  };
  state.worldCouncil.votes = {};
  state.worldCouncil.nextVoteTurn = state.currentTurn + 15;
}

export function tallyCouncilVotes(
  votes: Record<string, string>, // playerId -> optionId
  state: GameState,
): string | null {
  const tally: Record<string, number> = {};

  for (const [playerId, optionId] of Object.entries(votes)) {
    const player = state.players.get(playerId);
    if (!player) continue;

    // Poids du vote basé sur les villes contrôlées
    const weight = player.cities.length + player.metropolis.length * 2 + 1;
    tally[optionId] = (tally[optionId] ?? 0) + weight;
  }

  if (Object.keys(tally).length === 0) return null;

  return Object.entries(tally).sort(([, a], [, b]) => b - a)[0][0];
}

// ============================================================
// HELPERS
// ============================================================

function addTrustEvent(
  relation: DiplomaticRelation,
  turn: number,
  event: string,
  delta: number,
): void {
  relation.trustHistory.push({ turn, event, delta });
  // Garder seulement les 20 derniers événements
  if (relation.trustHistory.length > 20) {
    relation.trustHistory = relation.trustHistory.slice(-20);
  }
}
