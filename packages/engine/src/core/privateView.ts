/**
 * Projection privée d'un GameState pour un spectateur / joueur donné.
 * L'état autoritaire reste intact ; on retourne une copie filtrée pour le fil réseau.
 */
import type { GameState, ActionLogEntry, PendingPlayerTrade } from '../types/game';
import type { CkProgressPlayImpact } from '../types/citiesKnights';
import type { Player } from '../types/player';
import { isClassicMode, totalClassicResources } from '../engine/catan/ClassicBoard';
import { totalResources } from '../engine/resources/ResourceSystem';

function clonePlain<T>(value: T): T {
  return structuredClone(value);
}

function handSize(state: GameState, player: Player): number {
  const resources = isClassicMode(state)
    ? totalClassicResources(player.resources)
    : totalResources(player.resources);
  const commodities =
    state.extensions?.citiesKnights?.publicCommodityCounts[player.id] ??
    totalCkFromState(state, player.id);
  return resources + commodities;
}

function totalCkFromState(state: GameState, playerId: string): number {
  const bundle = state.extensions?.citiesKnights?.playerCommodities[playerId];
  if (!bundle) return 0;
  return Object.values(bundle).reduce((s, v) => s + (v ?? 0), 0);
}

function redactPlayer(state: GameState, player: Player): Player {
  const played = player.devCards.filter((card) => card.played).map((card) => ({ ...card }));
  const unplayedCount = player.devCards.filter((card) => !card.played).length;

  return {
    ...player,
    resources: {},
    publicResourceCount: handSize(state, player),
    productionQueue: [],
    militaryCards: [],
    diplomaticCards: [],
    devCards: played,
    publicDevCardCount: unplayedCount,
    objectives: player.objectives
      .filter((objective) => objective.revealed)
      .map((objective) => ({ ...objective })),
    activeTradeDeals: player.activeTradeDeals.map((deal) => ({ ...deal })),
  };
}

function projectTrade(
  trade: PendingPlayerTrade | null | undefined,
  viewerId: string | null,
): PendingPlayerTrade | null {
  if (!trade) return null;
  const broadcast = trade.toPlayerId === null;
  const showTerms =
    Boolean(viewerId) &&
    (trade.fromPlayerId === viewerId ||
      trade.toPlayerId === viewerId ||
      broadcast);
  if (showTerms) {
    return {
      ...trade,
      give: { ...trade.give },
      receive: { ...trade.receive },
      giveCommodities: trade.giveCommodities ? { ...trade.giveCommodities } : undefined,
      receiveCommodities: trade.receiveCommodities
        ? { ...trade.receiveCommodities }
        : undefined,
      rejectedBy: trade.rejectedBy ? [...trade.rejectedBy] : undefined,
      termsHidden: false,
    };
  }
  return {
    ...trade,
    give: {},
    receive: {},
    giveCommodities: undefined,
    receiveCommodities: undefined,
    rejectedBy: trade.rejectedBy ? [...trade.rejectedBy] : undefined,
    termsHidden: true,
  };
}

function projectActionLog(
  log: ActionLogEntry[],
  viewerId: string | null,
): ActionLogEntry[] {
  return log.map((entry) => {
    if (!entry.data || Object.keys(entry.data).length === 0) {
      return { ...entry };
    }

    const data = { ...entry.data };
    const isOwner = Boolean(viewerId) && entry.playerId === viewerId;

    if (!isOwner) {
      delete data.give;
      delete data.receive;
      delete data.resources;
      delete data.hand;
      delete data.cards;
      // Type de carte achetée (secret) — les cartes jouées restent dans la description
      if (data.cardType === 'hidden' || entry.description.includes('achetée')) {
        delete data.cardType;
      }
    }

    const progressImpact = data.progressImpact as CkProgressPlayImpact | undefined;
    if (progressImpact && !isOwner) {
      const ownImpact = viewerId ? progressImpact.impacts[viewerId] : undefined;
      data.progressImpact = {
        ...progressImpact,
        impacts: ownImpact && viewerId ? { [viewerId]: ownImpact } : {},
      } satisfies CkProgressPlayImpact;
    }

    return { ...entry, data };
  });
}

/**
 * Construit une vue du plateau pour `viewerId`.
 * `viewerId === null` → spectateur : toutes les mains sont masquées.
 */
export function projectStateForViewer(
  state: GameState,
  viewerId: string | null,
): GameState {
  const players = new Map<string, Player>();
  for (const [id, player] of state.players) {
    if (viewerId && id === viewerId) {
      players.set(id, {
        ...player,
        resources: { ...player.resources },
        productionQueue: player.productionQueue.map((order) => ({ ...order })),
        devCards: player.devCards.map((card) => ({ ...card })),
        objectives: player.objectives.map((objective) => ({ ...objective })),
        publicResourceCount: handSize(state, player),
        publicDevCardCount: player.devCards.filter((card) => !card.played).length,
      });
    } else {
      players.set(id, redactPlayer(state, player));
    }
  }

  const deckCount = state.devDeck?.length ?? 0;

  let extensions = state.extensions;
  if (state.extensions?.citiesKnights) {
    const ck = state.extensions.citiesKnights;
    const projectedHands: typeof ck.progressHands = {};
    const projectedCommodities: typeof ck.playerCommodities = {};
    for (const playerId of Object.keys(ck.progressHands)) {
      if (viewerId && playerId === viewerId) {
        projectedHands[playerId] = ck.progressHands[playerId].map((card) => ({ ...card }));
        projectedCommodities[playerId] = { ...(ck.playerCommodities[playerId] ?? {}) };
      } else {
        projectedHands[playerId] = [];
        projectedCommodities[playerId] = {};
      }
    }
    extensions = {
      ...state.extensions,
      citiesKnights: {
        ...ck,
        progressHands: projectedHands,
        playerCommodities: projectedCommodities,
        progressDecks: {
          trade: [],
          politics: [],
          science: [],
        },
        progressDiscards: {
          trade: [],
          politics: [],
          science: [],
        },
        publicProgressCounts: { ...ck.publicProgressCounts },
        publicCommodityCounts: { ...ck.publicCommodityCounts },
      },
    };
  }

  if (extensions?.undergroundSky) {
    const us = extensions.undergroundSky;
    const projectedMaterials: typeof us.playerMaterials = {};
    for (const playerId of Object.keys(us.playerMaterials)) {
      if (viewerId && playerId === viewerId) {
        projectedMaterials[playerId] = { ...(us.playerMaterials[playerId] ?? {}) };
      } else {
        projectedMaterials[playerId] = {};
      }
    }
    const projectedAirships = us.airships.map((ship) => {
      if (viewerId && ship.playerId === viewerId) return { ...ship, cargo: [...ship.cargo] };
      const sealedCount = ship.cargo.reduce((s, c) => s + c.amount, 0);
      return {
        ...ship,
        cargo:
          sealedCount > 0
            ? Array.from({ length: sealedCount }, () => ({
                kind: 'material' as const,
                key: 'us_crystal' as const,
                amount: 1,
              }))
            : [],
      };
    });
    const projectedNodes = { ...us.undergroundGraph.nodes };
    for (const [nodeId, node] of Object.entries(projectedNodes)) {
      if (!us.revealedUndergroundNodeIds.includes(nodeId)) {
        projectedNodes[nodeId] = {
          ...node,
          discovery: 'fossil_roots',
          numberToken: null,
          geologyCategory: 'production',
          thermalChoice: null,
          surfaceEdgeId: null,
          workshopDiscountClaimed: false,
          sealedChamberClaimed: false,
        };
      }
    }
    const projectedHubs = { ...us.skyGraph.hubs };
    for (const [hubId, hub] of Object.entries(projectedHubs)) {
      if (!us.revealedSkyHubIds.includes(hubId)) {
        projectedHubs[hubId] = {
          ...hub,
          site: 'calm_mooring',
          firstVisitorRewards: {},
          hangingRuinsClaimed: false,
        };
      }
    }
    extensions = {
      ...extensions,
      undergroundSky: {
        ...us,
        playerMaterials: projectedMaterials,
        publicMaterialCounts: { ...us.publicMaterialCounts },
        undergroundGraph: {
          ...us.undergroundGraph,
          nodes: projectedNodes,
        },
        skyGraph: {
          ...us.skyGraph,
          hubs: projectedHubs,
        },
        airships: projectedAirships as typeof us.airships,
        regularContractDeck: [],
        majorContractDeck: [],
        _secret: { reservedMaterialContractIds: [] },
      },
    };
  }

  if (extensions?.seasons) {
    const seasons = extensions.seasons;
    const projectedNext = { ...seasons.nextPreparations };
    const projectedTargets = { ...seasons.nextPreparationTargets };
    for (const playerId of Object.keys(projectedNext)) {
      if (!viewerId || playerId !== viewerId) {
        projectedNext[playerId] = null;
        projectedTargets[playerId] = null;
      }
    }
    extensions = {
      ...extensions,
      seasons: {
        ...seasons,
        nextPreparations: projectedNext,
        nextPreparationTargets: projectedTargets,
        preparationReady: { ...seasons.preparationReady },
      },
    };
  }

  if (extensions?.pactsEmbassies) {
    const pe = extensions.pactsEmbassies;
    const projectedOffers = pe.pactOffers.map((offer) => {
      const party =
        Boolean(viewerId) &&
        (offer.fromPlayerId === viewerId || offer.toPlayerId === viewerId);
      if (party) return { ...offer, clauses: [...offer.clauses] };
      return {
        ...offer,
        clauses: [] as typeof offer.clauses,
        status: offer.status === 'pending' ? ('pending' as const) : offer.status,
      };
    });
    const projectedVotes = pe.council.votes.map((vote) => {
      if (viewerId && vote.playerId === viewerId) return { ...vote };
      return {
        playerId: vote.playerId,
        proposalId: '',
        variantId: '',
        extraVotes: 0,
        deposited: vote.deposited,
      };
    });
    extensions = {
      ...extensions,
      pactsEmbassies: {
        ...pe,
        pactOffers: projectedOffers,
        council: {
          ...pe.council,
          votes: pe.council.votesRevealed
            ? pe.council.votes.map((v) => ({ ...v }))
            : projectedVotes,
          lobbyBids: [],
        },
        _secret: {
          resolutionDeckOrder: [],
          crisisDeckOrder: [],
          mandateDeckOrder: [],
          lobbyBidsHidden: true,
        },
      },
    };
  }

  return {
    ...state,
    players,
    // Maps partagées en lecture seule — serializeMaps copie à l'émission
    map: state.map,
    units: state.units,
    buildings: state.buildings,
    barbarians: state.barbarians,
    bank: state.bank ? { ...state.bank } : state.bank,
    market: state.market ? clonePlain(state.market) : state.market,
    devDeck: [],
    publicDevDeckCount: deckCount,
    pendingPlayerTrade: projectTrade(state.pendingPlayerTrade, viewerId),
    actionLog: projectActionLog(state.actionLog, viewerId),
    activeEvents: state.activeEvents.map((event) => ({ ...event })),
    eventHistory: state.eventHistory.map((event) => ({ ...event })),
    classicBoard: state.classicBoard ? clonePlain(state.classicBoard) : state.classicBoard,
    sevenFlow: state.sevenFlow ? clonePlain(state.sevenFlow) : state.sevenFlow,
    extensions,
  };
}

/** Taille de main visible (propre ou projetée). */
export function getPublicResourceCount(player: Player, state?: GameState): number {
  const fromBundle = totalResources(player.resources);
  const commodities = state
    ? state.extensions?.citiesKnights?.publicCommodityCounts?.[player.id] ??
      Object.values(state.extensions?.citiesKnights?.playerCommodities?.[player.id] ?? {}).reduce(
        (s, v) => s + (v ?? 0),
        0,
      )
    : 0;
  const materials = state
    ? state.extensions?.undergroundSky?.publicMaterialCounts?.[player.id] ?? 0
    : 0;

  // Main redigée : bundle vide mais compte public renseigné
  if (fromBundle === 0 && typeof player.publicResourceCount === 'number') {
    return player.publicResourceCount;
  }
  if (fromBundle > 0 || commodities > 0 || materials > 0) {
    return fromBundle + commodities + materials;
  }
  return player.publicResourceCount ?? 0;
}

/** Nombre de cartes développement non jouées (propre ou projeté). */
export function getPublicDevCardCount(player: Player): number {
  const visibleUnplayed = player.devCards.filter((card) => !card.played).length;
  if (typeof player.publicDevCardCount === 'number') {
    // Si des cartes non jouées sont présentes, on a la main complète
    if (visibleUnplayed > 0) return visibleUnplayed;
    return player.publicDevCardCount;
  }
  return visibleUnplayed;
}
