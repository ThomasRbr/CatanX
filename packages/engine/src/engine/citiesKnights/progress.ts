/**
 * Decks Progress C&K (phase 7 — pioche + main ; effets jouables progressivement).
 */
import type { GameState } from '../../types/game';
import type {
  CkProgressCard,
  CkProgressCardType,
  CkProgressDeckId,
  CkUrbanTrack,
} from '../../types/citiesKnights';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { nextId } from '../../core/ids';
import { now } from '../../core/clock';
import { randomInt } from '../../core/rng';
import { ensureCitiesKnightsState, syncPublicProgressCounts } from './state';
import { getUrbanLevel } from './urban';

/** Règle CatanX : trois cartes Progrès maximum après résolution de la pioche. */
export const PROGRESS_HAND_LIMIT = 3;

/** 6 types × 3 exemplaires = 18 par deck. */
const DECK_COMPOSITION: Record<CkProgressDeckId, CkProgressCardType[]> = {
  trade: [
    'merchant',
    'merchant_fleet',
    'trade_harbor',
    'resource_monopoly',
    'commodity_monopoly',
    'master_merchant',
  ],
  politics: ['bishop', 'diplomat', 'intrigue', 'deserter', 'spy', 'warlord'],
  science: ['alchemist', 'crane', 'engineer', 'inventor', 'road_building', 'smith'],
};

const GATE_TO_TRACK: Record<'trade_gate' | 'politics_gate' | 'science_gate', CkUrbanTrack> = {
  trade_gate: 'trade',
  politics_gate: 'politics',
  science_gate: 'science',
};

const TRACK_TO_DECK: Record<CkUrbanTrack, CkProgressDeckId> = {
  trade: 'trade',
  politics: 'politics',
  science: 'science',
};

function log(
  state: GameState,
  playerId: string,
  description: string,
  data: Record<string, unknown> = {},
): void {
  state.actionLog.push({
    id: nextId('log'),
    turn: state.currentTurn,
    playerId,
    type: 'system',
    description,
    data,
    timestamp: now(),
  });
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

export function buildProgressDeck(deck: CkProgressDeckId): CkProgressCard[] {
  const types = DECK_COMPOSITION[deck];
  const cards: CkProgressCard[] = [];
  for (const type of types) {
    for (let copy = 0; copy < 3; copy++) {
      cards.push({ id: nextId(`ckprog_${deck}`), type, deck });
    }
  }
  shuffleInPlace(cards);
  return cards;
}

function ensureDiscardBuckets(ck: NonNullable<ReturnType<typeof ensureCitiesKnightsState>>): void {
  if (!ck.progressDiscards) {
    ck.progressDiscards = { trade: [], politics: [], science: [] };
  }
  for (const deck of ['trade', 'politics', 'science'] as const) {
    if (!ck.progressDiscards[deck]) ck.progressDiscards[deck] = [];
  }
}

/** Remélange la défausse dans le deck si la pioche est vide. */
function refillDeckFromDiscards(
  ck: NonNullable<ReturnType<typeof ensureCitiesKnightsState>>,
  deck: CkProgressDeckId,
): void {
  ensureDiscardBuckets(ck);
  if ((ck.progressDecks[deck]?.length ?? 0) > 0) return;
  const discard = ck.progressDiscards[deck] ?? [];
  if (discard.length === 0) return;
  ck.progressDecks[deck] = [...discard];
  ck.progressDiscards[deck] = [];
  shuffleInPlace(ck.progressDecks[deck]!);
}

/** Initialise les 3 decks s’ils sont vides (idempotent). */
export function ensureProgressDecks(state: GameState): void {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;
  ensureDiscardBuckets(ck);
  for (const deck of ['trade', 'politics', 'science'] as const) {
    if (!ck.progressDecks[deck]) ck.progressDecks[deck] = [];
    if (ck.progressDecks[deck]!.length > 0) continue;

    const inHands = Object.values(ck.progressHands).some((hand) =>
      hand.some((c) => c.deck === deck),
    );
    const inDiscard = (ck.progressDiscards[deck]?.length ?? 0) > 0;
    if (inDiscard) {
      refillDeckFromDiscards(ck, deck);
      continue;
    }
    if (!inHands) {
      ck.progressDecks[deck] = buildProgressDeck(deck);
    }
  }
}

function queueDiscardProgress(state: GameState, playerId: string): void {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;
  const already = ck.pendingResolutions.some(
    (r) => r.kind === 'discard_progress' && r.playerId === playerId,
  );
  if (already) return;
  ck.pendingResolutions.push({
    id: nextId('ckres'),
    kind: 'discard_progress',
    playerId,
    data: { limit: PROGRESS_HAND_LIMIT },
  });
}

/**
 * Pioche une carte. Si la main dépasse 3, file un pending `discard_progress`.
 */
export function drawProgressCard(
  state: GameState,
  playerId: string,
  deck: CkProgressDeckId,
): { ok: boolean; reason?: string; card?: CkProgressCard; needsDiscard?: boolean } {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { ok: false, reason: 'État C&K manquant' };
  ensureProgressDecks(state);
  refillDeckFromDiscards(ck, deck);

  const pile = ck.progressDecks[deck];
  if (!pile || pile.length === 0) {
    return { ok: false, reason: `Deck ${deck} épuisé` };
  }

  const card = pile.shift()!;
  if (!ck.progressHands[playerId]) ck.progressHands[playerId] = [];
  ck.progressHands[playerId]!.push(card);
  syncPublicProgressCounts(ck);

  const needsDiscard = ck.progressHands[playerId]!.length > PROGRESS_HAND_LIMIT;
  if (needsDiscard) queueDiscardProgress(state, playerId);
  return { ok: true, card, needsDiscard };
}

export function discardProgressCard(
  state: GameState,
  playerId: string,
  cardId: string,
): { ok: boolean; reason?: string } {
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { ok: false, reason: 'État C&K manquant' };
  ensureDiscardBuckets(ck);

  const hand = ck.progressHands[playerId] ?? [];
  const idx = hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return { ok: false, reason: 'Carte introuvable' };

  const [card] = hand.splice(idx, 1);
  if (!card) return { ok: false, reason: 'Carte introuvable' };
  ck.progressDiscards[card.deck] = ck.progressDiscards[card.deck] ?? [];
  ck.progressDiscards[card.deck]!.push(card);
  syncPublicProgressCounts(ck);
  return { ok: true };
}

export function ckDiscardProgress(
  playerId: string,
  cardId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (!isCitiesKnightsEnabled(state)) {
    return { success: false, reason: 'Extension inactive' };
  }
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return { success: false, reason: 'État C&K manquant' };

  const pendingIdx = ck.pendingResolutions.findIndex(
    (r) => r.kind === 'discard_progress' && r.playerId === playerId,
  );
  const hand = ck.progressHands[playerId] ?? [];
  const mustDiscard = hand.length > PROGRESS_HAND_LIMIT || pendingIdx >= 0;
  if (!mustDiscard) {
    return { success: false, reason: 'Aucune défausse Progress requise' };
  }

  const result = discardProgressCard(state, playerId, cardId);
  if (!result.ok) return { success: false, reason: result.reason };

  const stillOver = (ck.progressHands[playerId] ?? []).length > PROGRESS_HAND_LIMIT;
  if (!stillOver && pendingIdx >= 0) {
    ck.pendingResolutions.splice(pendingIdx, 1);
  }
  log(state, playerId, 'Carte Progrès défaussée', { cardId });
  return { success: true };
}

/**
 * Portes colorées : chaque joueur avec niveau urbain ≥ dé rouge pioche dans le deck.
 * Ordre : joueur actif puis suivants.
 */
export function resolveProgressGates(
  state: GameState,
  gate: 'trade_gate' | 'politics_gate' | 'science_gate',
  redDie: number,
): void {
  if (!isCitiesKnightsEnabled(state)) return;
  const ck = ensureCitiesKnightsState(state);
  if (!ck) return;
  ensureProgressDecks(state);

  const track = GATE_TO_TRACK[gate];
  const deck = TRACK_TO_DECK[track];
  const start = state.currentPlayerIndex;

  for (let i = 0; i < state.turnOrder.length; i++) {
    const idx = (start + i) % state.turnOrder.length;
    const playerId = state.turnOrder[idx]!;
    if (getUrbanLevel(state, playerId, track) < 1) continue;
    // Niveau N autorise les faces rouges 1..(N+1) (niveau 1 → 1–2, …, niveau 5 → 1–6)
    if (redDie > getUrbanLevel(state, playerId, track) + 1) continue;
    const drawn = drawProgressCard(state, playerId, deck);
    if (drawn.ok) {
      log(state, playerId, `Porte ${track} : +1 Progrès`, {
        cardType: drawn.card?.type,
        needsDiscard: drawn.needsDiscard,
      });
    }
  }
}

export function playerProgressHand(state: GameState, playerId: string): CkProgressCard[] {
  return state.extensions?.citiesKnights?.progressHands[playerId] ?? [];
}
