/**
 * Decks saisonniers — mélange seedé + garde-fous climats sévères.
 */

import { SeededRandom } from '../../core/rng';
import type { Season } from '../../types/events';
import type { SeasonClimateId, SeasonsConfig } from '../../types/seasons';
import { SEASON_ORDER } from '../../types/seasons';
import { climateIdsForSeason, isSevereClimate } from './definitions';

export function createSeasonDecks(
  seed: number,
): Record<Season, SeasonClimateId[]> {
  const decks = {} as Record<Season, SeasonClimateId[]>;
  for (let i = 0; i < SEASON_ORDER.length; i++) {
    const season = SEASON_ORDER[i]!;
    const rng = new SeededRandom((seed ^ ((i + 1) * 0x9e3779b9)) >>> 0);
    decks[season] = rng.shuffle(climateIdsForSeason(season));
  }
  return decks;
}

export function emptySeasonDiscards(): Record<Season, SeasonClimateId[]> {
  return {
    spring: [],
    summer: [],
    autumn: [],
    winter: [],
  };
}

function refillDeck(
  deck: SeasonClimateId[],
  discard: SeasonClimateId[],
): { deck: SeasonClimateId[]; discard: SeasonClimateId[] } {
  if (deck.length > 0) return { deck, discard };
  const rng = new SeededRandom(
    discard.reduce((acc, id, i) => acc + id.charCodeAt(0) * (i + 1), 1) || 1,
  );
  return { deck: rng.shuffle(discard), discard: [] };
}

/**
 * Choisit un climat au sommet en respectant les garde-fous.
 * Le climat tiré est retiré du deck mais PAS ajouté à la défausse
 * (la défausse reçoit le climat lorsqu’il quitte le statut « actif »).
 */
export function peekDrawClimateWithGuards(
  deckIn: SeasonClimateId[],
  discardIn: SeasonClimateId[],
  opts: {
    previousWasSevere: boolean;
    severeThisYear: number;
    config: SeasonsConfig;
  },
): {
  drawn: SeasonClimateId;
  deck: SeasonClimateId[];
  discard: SeasonClimateId[];
  wasSevere: boolean;
} {
  let { deck, discard } = refillDeck([...deckIn], [...discardIn]);

  const maxAttempts = Math.max(deck.length * 3, 12);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    ({ deck, discard } = refillDeck(deck, discard));
    const top = deck[0]!;
    const severe = isSevereClimate(top);
    const consecutiveBlocked =
      !opts.config.allowConsecutiveSevere && opts.previousWasSevere && severe;
    const yearCapBlocked =
      severe && opts.severeThisYear >= opts.config.maxSeverePerYear;

    if (consecutiveBlocked || yearCapBlocked) {
      deck = [...deck.slice(1), top];
      continue;
    }

    return {
      drawn: top,
      deck: deck.slice(1),
      discard,
      wasSevere: severe,
    };
  }

  ({ deck, discard } = refillDeck(deck, discard));
  let pickIndex = deck.findIndex((id) => !isSevereClimate(id));
  if (pickIndex < 0) pickIndex = 0;
  const drawn = deck[pickIndex]!;
  return {
    drawn,
    deck: [...deck.slice(0, pickIndex), ...deck.slice(pickIndex + 1)],
    discard,
    wasSevere: isSevereClimate(drawn),
  };
}

export function nextSeason(season: Season): Season {
  const idx = SEASON_ORDER.indexOf(season);
  return SEASON_ORDER[(idx + 1) % SEASON_ORDER.length]!;
}

/**
 * Initialise courant (printemps) + prévision (été) avant placement.
 */
export function initialClimateDraw(
  seed: number,
  config: SeasonsConfig,
): {
  decks: Record<Season, SeasonClimateId[]>;
  discards: Record<Season, SeasonClimateId[]>;
  currentClimateId: SeasonClimateId;
  forecastClimateId: SeasonClimateId;
  severeClimatesThisYear: number;
  previousClimateWasSevere: boolean;
} {
  const decks = createSeasonDecks(seed);
  const discards = emptySeasonDiscards();

  const springDraw = peekDrawClimateWithGuards(decks.spring, discards.spring, {
    previousWasSevere: false,
    severeThisYear: 0,
    config,
  });
  decks.spring = springDraw.deck;
  discards.spring = springDraw.discard;

  const severeSoFar = springDraw.wasSevere ? 1 : 0;

  const summerDraw = peekDrawClimateWithGuards(decks.summer, discards.summer, {
    previousWasSevere: springDraw.wasSevere,
    severeThisYear: severeSoFar,
    config,
  });
  decks.summer = summerDraw.deck;
  discards.summer = summerDraw.discard;

  return {
    decks,
    discards,
    currentClimateId: springDraw.drawn,
    forecastClimateId: summerDraw.drawn,
    severeClimatesThisYear: severeSoFar,
    previousClimateWasSevere: springDraw.wasSevere,
  };
}
