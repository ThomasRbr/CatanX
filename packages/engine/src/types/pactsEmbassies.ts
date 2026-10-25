/**
 * Extension Pactes & Ambassades (`pactsEmbassies`).
 * Types isolés — règles dans engine/pactsEmbassies/.
 */

export interface PactsEmbassiesConfig {
  enabled: boolean;
  ruleset: 'catanx-pacts-embassies-v1';
  victoryPointBonus: 3;
  /** 5 avec Saisons, 4 sans Saisons. */
  roundsPerCouncilSession: 4 | 5;
  maxActivePactsPerPlayer: 2;
  maxActiveResolutions: 2;
  neutralCouncilMode: 'adaptive';
}

export type PactClauseKind =
  | 'trade_accord'
  | 'port_charter'
  | 'open_borders'
  | 'shared_reserve'
  | 'underground_passage'
  | 'trade_winds';

export type ResolutionCategory =
  | 'commerce'
  | 'infrastructure'
  | 'solidarity'
  | 'vertical_world';

export type CouncilSessionPhase =
  | 'reveal'
  | 'negotiate'
  | 'confirm_ambitious'
  | 'vote'
  | 'reveal_votes'
  | 'idle';

export type PactOfferStatus = 'pending' | 'countered' | 'accepted' | 'rejected' | 'expired';
export type PactStatus = 'active' | 'completed' | 'broken' | 'dissolved' | 'unused';

export interface PePlayerState {
  /** Influence diplomatique publique 0–12 (distincte de ResourceType influence). */
  influence: number;
  /** Réputation publique 0–6, départ 3. */
  reputation: number;
  /** Mandats revendiqués (max 2). */
  mandatesClaimed: string[];
  /** Compteurs pour Haut Chancelier / mandats. */
  pactsHonored: number;
  resolutionsSponsoredAdopted: number;
  crisisContributionsSufficient: number;
  firstEmbassyBuilt: boolean;
}

export interface PeEmbassy {
  id: string;
  playerId: string;
  intersectionId: string;
  /** Suspendue après rétrogradation CK (ville sans métropole). */
  suspended: boolean;
  /** Consulat purement visuel lié à un pacte actif. */
  consulatePactId?: string;
}

export interface PePactOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  clauses: PactClauseKind[];
  /** Tour global d’expiration (offre = 1 ronde). */
  expiresAtRound: number;
  status: PactOfferStatus;
  /** Offre précédente si contre-proposition. */
  parentOfferId?: string;
}

export interface PePact {
  id: string;
  partnerA: string;
  partnerB: string;
  clauses: PactClauseKind[];
  status: PactStatus;
  createdRound: number;
  expiresAtRound: number;
  /** Dépôts d’Influence encore retenus. */
  depositHeld: Record<string, boolean>;
  /** Qui a utilisé au moins une clause. */
  clauseUsedBy: Record<string, boolean>;
  /** Dissolution mutuelle proposée par. */
  mutualDissolutionProposedBy?: string;
}

export interface PeResolutionVariant {
  id: string;
  label: string;
  kind: 'status_quo' | 'moderate' | 'ambitious';
  effectId: string;
}

export interface PeCouncilProposal {
  id: string;
  resolutionId: string;
  category: ResolutionCategory;
  title: string;
  variants: PeResolutionVariant[];
  /** Joueur ayant parrainé la variante ambitieuse. */
  sponsorId?: string;
  ambitiousConfirmed: boolean;
}

export interface PeCouncilVote {
  playerId: string;
  proposalId: string;
  variantId: string;
  /** Voix supplémentaires achetées (0–2). */
  extraVotes: number;
  deposited: boolean;
}

export interface PeNeutralDelegation {
  id: string;
  label: string;
  /** Preférence naturelle publique (variantId). */
  naturalPreference: { proposalId: string; variantId: string };
  votes: number;
  /** Dirigée par un lobbyiste (meilleure mise unique). */
  directedBy?: string;
  directedPreference?: { proposalId: string; variantId: string };
}

export interface PeLobbyBid {
  playerId: string;
  delegationId: string;
  amount: number;
}

export interface PeActiveResolution {
  id: string;
  resolutionId: string;
  effectId: string;
  variantKind: 'moderate' | 'ambitious';
  sponsoredBy?: string;
  adoptedRound: number;
  expiresAtRound: number;
}

export interface PeCrisisContribution {
  playerId: string;
  classicPoints: number;
  commodityPoints: number;
  materialPoints: number;
}

export interface PeCrisis {
  id: string;
  crisisId: string;
  title: string;
  objective: number;
  contributions: PeCrisisContribution[];
  resolved: boolean;
  success?: boolean;
  announcedSession: number;
}

export interface PeMandate {
  id: string;
  mandateId: string;
  title: string;
  description: string;
  /** Condition métier (évaluée côté moteur). */
  conditionKind: string;
  conditionData?: Record<string, unknown>;
  claimedBy?: string;
}

export interface PeRoundUsage {
  playerTradeBonusUsed: Record<string, boolean>;
  portCharterUsed: Record<string, boolean>;
  alliedInfraInfluenceGained: Record<string, boolean>;
  firstValidPlayerTrade: Record<string, boolean>;
}

export interface PeDormantSegment {
  kind: 'road' | 'tunnel' | 'sky_route';
  ownerId: string;
  /** Identifiant d’arête / trajet. */
  refId: string;
  /** Pacte dont dépendait la connectivité. */
  pactId: string;
}

export interface PeHistoryEntry {
  turn: number;
  round: number;
  kind: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface PePendingChoice {
  id: string;
  kind:
    | 'pact_offer'
    | 'mutual_dissolution'
    | 'council_vote'
    | 'crisis_contribute'
    | 'claim_mandate';
  playerId: string;
  expiresAtRound: number;
  payload: Record<string, unknown>;
}

export interface PeCouncilSession {
  sessionIndex: number;
  phase: CouncilSessionPhase;
  roundInSession: number;
  roundsPerSession: number;
  proposals: PeCouncilProposal[];
  votes: PeCouncilVote[];
  lobbyBids: PeLobbyBid[];
  neutralDelegations: PeNeutralDelegation[];
  /** Votes révélés publiquement après clôture. */
  votesRevealed: boolean;
}

export interface PactsEmbassiesState {
  players: Record<string, PePlayerState>;
  embassies: PeEmbassy[];
  pactOffers: PePactOffer[];
  pacts: PePact[];
  council: PeCouncilSession;
  activeResolutions: PeActiveResolution[];
  crisis: PeCrisis | null;
  mandates: PeMandate[];
  highChancellorId: string | null;
  /** Score au moment de l’élection (pour égalité). */
  highChancellorScore: number;
  globalRound: number;
  roundUsage: PeRoundUsage;
  dormantSegments: PeDormantSegment[];
  pendingChoices: PePendingChoice[];
  history: PeHistoryEntry[];
  /** Pénalités de crise légère (effetId → expiresAtRound). */
  mildPenalties: Array<{ id: string; effectId: string; expiresAtRound: number }>;
  /** Ordre des decks / résolutions — autoritaire, masqué en vue privée. */
  _secret: {
    resolutionDeckOrder: string[];
    crisisDeckOrder: string[];
    mandateDeckOrder: string[];
    lobbyBidsHidden: boolean;
  };
}

export const PE_INFLUENCE_MAX = 12;
export const PE_REPUTATION_MAX = 6;
export const PE_REPUTATION_START = 3;
export const PE_MAX_EMBASSIES = 3;
export const PE_MAX_MANDATES = 2;
export const PE_PACT_DURATION_ROUNDS = 4;
export const PE_OFFER_DURATION_ROUNDS = 1;
export const PE_RESOLUTION_DURATION_ROUNDS = 4;
export const PE_MAX_ACTIVE_RESOLUTIONS = 2;
export const PE_CHANCELLOR_THRESHOLD = 8;

export function defaultPactsEmbassiesConfig(
  partial?: Partial<PactsEmbassiesConfig>,
): PactsEmbassiesConfig {
  return {
    enabled: partial?.enabled ?? false,
    ruleset: 'catanx-pacts-embassies-v1',
    victoryPointBonus: 3,
    roundsPerCouncilSession: partial?.roundsPerCouncilSession ?? 4,
    maxActivePactsPerPlayer: partial?.maxActivePactsPerPlayer ?? 2,
    maxActiveResolutions: partial?.maxActiveResolutions ?? 2,
    neutralCouncilMode: 'adaptive',
  };
}

export function emptyPePlayerState(): PePlayerState {
  return {
    influence: 0,
    reputation: PE_REPUTATION_START,
    mandatesClaimed: [],
    pactsHonored: 0,
    resolutionsSponsoredAdopted: 0,
    crisisContributionsSufficient: 0,
    firstEmbassyBuilt: false,
  };
}

export function emptyPeRoundUsage(): PeRoundUsage {
  return {
    playerTradeBonusUsed: {},
    portCharterUsed: {},
    alliedInfraInfluenceGained: {},
    firstValidPlayerTrade: {},
  };
}

export function maxClausesForReputation(reputation: number): number {
  return reputation <= 1 ? 1 : 2;
}

export function maxActivePactsForPlayer(activeEmbassyCount: number): {
  maxPacts: number;
  maxClauses: number;
} {
  if (activeEmbassyCount <= 0) {
    return { maxPacts: 1, maxClauses: 1 };
  }
  return { maxPacts: 2, maxClauses: 2 };
}

export function delegateCount(activeEmbassyCount: number): number {
  return Math.min(4, 1 + Math.max(0, activeEmbassyCount));
}
