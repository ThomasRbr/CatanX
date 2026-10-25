import { useEffect, useState } from 'react';
import {
  isCitiesKnightsEnabled,
  listFreeMetropolisHosts,
  ckHandLimit,
  listPillagableCities,
  listKnightRecruitSpots,
  listKnightMoveDestinations,
  listKnightDisplaceTargets,
  knightCanChaseRobber,
  getUrbanLevel,
} from '@catanx/engine';
import type { CkUrbanTrack, GameState, ResourceType } from '@catanx/engine';
import { frCommodity, frResource, frTerrain } from '../../i18n/fr';
import { Icon, type CatanXIconName } from '../../ui';
import styles from './CitiesKnightsPanel.module.css';

interface CitiesKnightsPanelProps {
  state: GameState;
  playerId: string;
  onImprove?: (track: 'trade' | 'politics' | 'science') => void;
  onAqueduct?: (resource: ResourceType) => void;
  onPlaceMetropolis?: (track: 'trade' | 'politics' | 'science', intersectionId: string) => void;
  onBuildWall?: (intersectionId: string) => void;
  onChoosePillage?: (intersectionId: string) => void;
  onChooseProgressDeck?: (deck: 'trade' | 'politics' | 'science') => void;
  onDiscardProgress?: (cardId: string) => void;
  onPlayProgress?: (cardId: string, params?: Record<string, unknown>) => void;
  onStartRecruitPlacement?: () => void;
  recruitPlacementActive?: boolean;
  onRecruitKnight?: (intersectionId: string) => void;
  onActivateKnight?: (knightId: string) => void;
  onPromoteKnight?: (knightId: string) => void;
  onMoveKnight?: (knightId: string, toIntersectionId: string) => void;
  onDisplaceKnight?: (knightId: string, targetKnightId: string) => void;
  onChaseRobber?: (knightId: string, tileId: string) => void;
  onResolveKnightRetreat?: (knightId: string, toIntersectionId: string | null) => void;
  canAct?: boolean;
  /** Phase start_of_turn : Alchimiste jouable. */
  canPlayAlchemist?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

const TRACKS: Array<{
  id: 'trade' | 'politics' | 'science';
  label: string;
  commodity: 'ck_cloth' | 'ck_coin' | 'ck_paper';
  icon: CatanXIconName;
}> = [
  { id: 'trade', label: 'Commerce', commodity: 'ck_cloth', icon: 'trade' },
  { id: 'politics', label: 'Politique', commodity: 'ck_coin', icon: 'diplomacy' },
  { id: 'science', label: 'Science', commodity: 'ck_paper', icon: 'tech' },
];

const COMMODITY_ICONS: Record<'ck_paper' | 'ck_cloth' | 'ck_coin', CatanXIconName> = {
  ck_paper: 'ckPaper',
  ck_cloth: 'ckCloth',
  ck_coin: 'ckCoin',
};

const TRACK_GUIDANCE: Record<
  CkUrbanTrack,
  { purpose: string; levelThree: string; cardFamily: string }
> = {
  trade: {
    purpose: 'Augmente vos chances de piocher des cartes de commerce.',
    levelThree: 'Niveau 3 : échanges de marchandises à 2:1.',
    cardFamily: 'Commerce',
  },
  politics: {
    purpose: 'Augmente vos chances de piocher des cartes politiques.',
    levelThree: 'Niveau 3 : débloque les chevaliers suprêmes.',
    cardFamily: 'Politique',
  },
  science: {
    purpose: 'Augmente vos chances de piocher des cartes scientifiques.',
    levelThree: 'Niveau 3 : débloque l’Aqueduc si vous ne produisez rien.',
    cardFamily: 'Science',
  },
};

export function urbanTrackGuidance(track: CkUrbanTrack, level: number, ownsMetropolis: boolean) {
  const meta = TRACK_GUIDANCE[track];
  const currentMaxRed = level > 0 ? Math.min(6, level + 1) : 0;
  const nextLevel = Math.min(5, level + 1);
  const nextMaxRed = Math.min(6, nextLevel + 1);
  const milestone =
    level < 3
      ? meta.levelThree
      : level < 4
        ? 'Niveau 4 : permet de revendiquer la Métropole de cette piste.'
        : level < 5
          ? 'Niveau 5 : toutes les faces du dé rouge deviennent gagnantes.'
          : ownsMetropolis
            ? 'Piste maîtrisée · Métropole contrôlée.'
            : 'Piste maîtrisée · tentez de reprendre la Métropole.';

  return {
    ...meta,
    currentChance:
      level === 0
        ? 'Pioche inactive — atteignez le niveau 1.'
        : `Porte ${meta.cardFamily} + dé rouge 1–${currentMaxRed}.`,
    nextChance:
      level >= 5
        ? 'Chance maximale : 6 faces sur 6.'
        : `Après amélioration : dé rouge 1–${nextMaxRed}.`,
    milestone,
  };
}

const AQUEDUCT_RESOURCES: ResourceType[] = ['wood', 'clay', 'wheat', 'sheep', 'ore'];

const PROGRESS_LABELS: Record<string, string> = {
  merchant: 'Marchand',
  merchant_fleet: 'Flotte marchande',
  trade_harbor: 'Port de commerce',
  resource_monopoly: 'Monopole ressources',
  commodity_monopoly: 'Monopole marchandises',
  master_merchant: 'Maître marchand',
  bishop: 'Évêque',
  diplomat: 'Diplomate',
  intrigue: 'Intrigue',
  deserter: 'Déserteur',
  spy: 'Espion',
  warlord: 'Seigneur de guerre',
  alchemist: 'Alchimiste',
  crane: 'Grue',
  engineer: 'Ingénieur',
  inventor: 'Inventeur',
  road_building: 'Construction de routes',
  smith: 'Forgeron',
};

/** Libellé lisible pour un site (évite les IDs techniques du type v_…,0000). */
function siteChoiceLabel(base: string, index: number, total: number): string {
  if (total <= 1) return base;
  return `${base} ${index + 1}`;
}

export function CitiesKnightsPanel({
  state,
  playerId,
  onImprove,
  onAqueduct,
  onPlaceMetropolis,
  onBuildWall,
  onChoosePillage,
  onChooseProgressDeck,
  onDiscardProgress,
  onPlayProgress,
  onStartRecruitPlacement,
  recruitPlacementActive = false,
  onRecruitKnight,
  onActivateKnight,
  onPromoteKnight,
  onMoveKnight,
  onDisplaceKnight,
  onChaseRobber,
  onResolveKnightRetreat,
  canAct = false,
  canPlayAlchemist = false,
  expanded: controlledExpanded,
  onExpandedChange,
}: CitiesKnightsPanelProps) {
  const [selectedKnightId, setSelectedKnightId] = useState<string | null>(null);
  const [knightMode, setKnightMode] = useState<'move' | 'displace' | 'chase' | null>(null);
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const setExpanded = (next: boolean) => {
    if (onExpandedChange) onExpandedChange(next);
    else setLocalExpanded(next);
  };

  const ckEarly = state.extensions?.citiesKnights;
  const hasUrgentChoice = Boolean(
    ckEarly?.pendingResolutions.some(
      (r) =>
        r.playerId === playerId &&
        (r.kind === 'aqueduct' ||
          r.kind === 'place_metropolis' ||
          r.kind === 'pillage_city' ||
          r.kind === 'choose_progress_deck' ||
          r.kind === 'discard_progress' ||
          r.kind === 'knight_retreat'),
    ),
  );

  useEffect(() => {
    setSelectedKnightId(null);
    setKnightMode(null);
  }, [playerId]);

  useEffect(() => {
    if (hasUrgentChoice) setExpanded(true);
  }, [hasUrgentChoice]);

  if (!isCitiesKnightsEnabled(state) || !state.extensions?.citiesKnights) return null;
  const ck = state.extensions.citiesKnights;
  const levels = ck.urbanLevels[playerId] ?? { trade: 0, politics: 0, science: 0 };
  const commodities = ck.playerCommodities[playerId] ?? {};
  const walls = Object.values(ck.walls).filter((id) => id === playerId).length;
  const handLimit = ckHandLimit(state, playerId);
  const defenderVp = ck.defenderVp[playerId] ?? 0;
  const progressHand = ck.progressHands[playerId] ?? [];
  const invasion = ck.lastInvasionResult;

  const aqueductPending = ck.pendingResolutions.find(
    (r) => r.kind === 'aqueduct' && r.playerId === playerId,
  );
  const metroPending = ck.pendingResolutions.find(
    (r) => r.kind === 'place_metropolis' && r.playerId === playerId,
  );
  const metroTrack = metroPending?.data?.track as 'trade' | 'politics' | 'science' | undefined;
  const metroHosts =
    metroTrack && onPlaceMetropolis ? listFreeMetropolisHosts(state, playerId, metroTrack) : [];
  const metropolisHostLabel = (intersectionId: string, index: number, total: number) => {
    const nearby = (state.classicBoard?.topology.intersections[intersectionId]?.tileIds ?? [])
      .map((tileId) => state.map.get(tileId))
      .filter((tile) => tile && tile.terrain !== 'ocean' && tile.terrain !== 'glacier')
      .slice(0, 2)
      .map((tile) => `${frTerrain(tile!.terrain)}${tile!.diceValue ? ` ${tile!.diceValue}` : ''}`);
    const base = siteChoiceLabel('Ville', index, total);
    return nearby.length > 0 ? `${base} · ${nearby.join(' / ')}` : base;
  };

  const pillagePending = ck.pendingResolutions.find(
    (r) => r.kind === 'pillage_city' && r.playerId === playerId,
  );
  const pillageOptions =
    (pillagePending?.data?.options as string[] | undefined) ??
    (pillagePending ? listPillagableCities(state, playerId) : []);

  const progressDeckPending = ck.pendingResolutions.find(
    (r) => r.kind === 'choose_progress_deck' && r.playerId === playerId,
  );
  const discardProgressPending = ck.pendingResolutions.find(
    (r) => r.kind === 'discard_progress' && r.playerId === playerId,
  );
  const showInvasionBanner =
    Boolean(invasion) &&
    (invasion!.turn === state.currentTurn ||
      ck.pendingResolutions.some(
        (r) =>
          r.kind === 'pillage_city' ||
          r.kind === 'choose_progress_deck' ||
          (r.kind === 'discard_progress' && r.playerId === playerId),
      ));

  const wallCandidates: string[] = [];
  const board = state.classicBoard;
  if (board && walls < 3) {
    for (const [intersectionId, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId || ck.walls[intersectionId]) continue;
      const bid = board.buildingByIntersection[intersectionId];
      const b = bid ? state.buildings.get(bid) : undefined;
      if (b?.definitionId === 'city' || b?.definitionId === 'metropolis') {
        wallCandidates.push(intersectionId);
      }
    }
  }
  const canAffordWall = (state.players.get(playerId)?.resources.clay ?? 0) >= 2;

  // Conservé comme repli interne pendant la migration de la main Progrès vers le HUD.
  const merchantTiles: string[] = [];
  if (board && canAct) {
    for (const [iid, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId) continue;
      for (const tileId of board.topology.intersections[iid]?.tileIds ?? []) {
        const tile = state.map.get(tileId);
        if (tile && tile.terrain !== 'desert' && tile.terrain !== 'ocean' && tile.diceValue) {
          merchantTiles.push(tileId);
        }
      }
    }
  }
  const uniqueMerchantTiles = [...new Set(merchantTiles)].slice(0, 8);

  const myKnights = ck.knights.filter((k) => k.ownerId === playerId && k.intersectionId);
  const resources = state.players.get(playerId)?.resources ?? {};
  const canRecruit =
    canAct &&
    Boolean(onStartRecruitPlacement || onRecruitKnight) &&
    (ck.knightStocks[playerId]?.basic ?? 0) > 0 &&
    (resources.sheep ?? 0) >= 1 &&
    (resources.ore ?? 0) >= 1;
  const recruitSpots = canRecruit ? listKnightRecruitSpots(state, playerId) : [];
  const politicsLevel = getUrbanLevel(state, playerId, 'politics');
  const moveDests =
    selectedKnightId && knightMode === 'move'
      ? listKnightMoveDestinations(state, playerId, selectedKnightId).slice(0, 8)
      : [];
  const displaceTargets =
    selectedKnightId && knightMode === 'displace'
      ? listKnightDisplaceTargets(state, playerId, selectedKnightId)
      : [];
  const retreatPending = ck.pendingResolutions.find(
    (r) => r.kind === 'knight_retreat' && r.playerId === playerId,
  );
  const retreatOptions = (retreatPending?.data?.options as string[] | undefined) ?? [];
  const retreatKnightId = (retreatPending?.data?.knightId as string | undefined) ?? null;

  const pendingCount = [
    aqueductPending,
    metroPending,
    pillagePending,
    progressDeckPending,
    discardProgressPending,
    retreatPending,
  ].filter(Boolean).length;

  const trackPct =
    ck.barbarianTrackLength > 0 ? (ck.barbarianTrackPosition / ck.barbarianTrackLength) * 100 : 0;
  const dangerLevel = trackPct >= 75 ? 'critical' : trackPct >= 50 ? 'warning' : 'calm';

  return (
    <aside
      className={styles.dock}
      data-extension="cities-knights"
      data-danger={dangerLevel}
      data-expanded={expanded ? 'true' : 'false'}
      aria-label="Extensions"
    >
      <button
        type="button"
        className={styles.launcher}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Fermer' : 'Ouvrir'} Villes et Chevaliers`}
        title={`Villes & Chevaliers · Barbares ${ck.barbarianTrackPosition}/${ck.barbarianTrackLength}`}
        onClick={() => {
          if (!expanded) setExpanded(true);
          else if (!hasUrgentChoice) setExpanded(false);
        }}
      >
        <span className={styles.iconHalo} aria-hidden="true">
          <Icon name="army" size={23} />
        </span>
        <span className={styles.dangerDot} aria-hidden="true" />
        {pendingCount > 0 && (
          <span className={styles.pendingBadge} aria-label={`${pendingCount} choix en attente`}>
            {pendingCount}
          </span>
        )}
        <span className={styles.tooltip} role="tooltip">
          <small>Villes &amp; Chevaliers</small>
          <strong>
            Barbares {ck.barbarianTrackPosition}/{ck.barbarianTrackLength}
          </strong>
        </span>
      </button>

      {expanded && (
        <section className={styles.panel} aria-label="Villes et Chevaliers">
          <header className={styles.header}>
            <div className={styles.headerRow}>
              <div className={styles.headerBrand}>
                <span className={styles.headerIcon} aria-hidden="true">
                  <Icon name="army" size={23} />
                </span>
                <div>
                  <span>Extension</span>
                  <h3>Villes &amp; Chevaliers</h3>
                </div>
              </div>
              <button
                type="button"
                className={styles.collapseBtn}
                aria-expanded={true}
                aria-label="Réduire le panneau Villes et Chevaliers"
                onClick={() => setExpanded(false)}
                disabled={hasUrgentChoice}
                title={hasUrgentChoice ? 'Résolvez le choix en cours avant de réduire' : 'Réduire'}
              >
                Réduire
              </button>
            </div>
            <p className={styles.barbarians}>
              Barbares {ck.barbarianTrackPosition}/{ck.barbarianTrackLength}
              {ck.robberUnlocked ? '' : ' · brigand dormant'}
              {defenderVp > 0 ? ` · Défenseur ${defenderVp} PV` : ''}
            </p>
            <div
              className={styles.trackBar}
              role="progressbar"
              aria-valuenow={ck.barbarianTrackPosition}
              aria-valuemin={0}
              aria-valuemax={ck.barbarianTrackLength}
              aria-label="Piste des barbares"
            >
              <span className={styles.trackBarFill} style={{ width: `${trackPct}%` }} />
            </div>
          </header>

          <div className={styles.body}>
            {showInvasionBanner && invasion && (
              <section className={styles.pending} aria-label="Dernière invasion">
                <h4>
                  {invasion.outcome === 'defenders_win'
                    ? 'Victoire des défenseurs'
                    : 'Victoire des barbares'}
                </h4>
                <p className={styles.pendingHint}>
                  Défense {invasion.defenseStrength} vs Barbares {invasion.barbarianStrength}
                  {invasion.defenderVpAwardedTo === playerId ? ' · +1 PV Défenseur' : ''}
                </p>
              </section>
            )}

            {retreatPending && onResolveKnightRetreat && retreatKnightId && (
              <section className={styles.pending} aria-label="Retraite chevalier">
                <h4>Retraite — chevalier délogé</h4>
                <div className={styles.choiceRow}>
                  {retreatOptions.slice(0, 6).map((intersectionId, index, list) => (
                    <button
                      key={intersectionId}
                      type="button"
                      className={styles.choiceBtn}
                      onClick={() => onResolveKnightRetreat(retreatKnightId, intersectionId)}
                    >
                      {siteChoiceLabel('Case', index, list.length)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={styles.choiceBtn}
                    onClick={() => onResolveKnightRetreat(retreatKnightId, null)}
                  >
                    Retirer du plateau
                  </button>
                </div>
              </section>
            )}

            {pillagePending && onChoosePillage && (
              <section className={styles.pending} aria-label="Pillage">
                <h4>Pillage — choisissez une ville</h4>
                <div className={styles.choiceRow}>
                  {pillageOptions.map((intersectionId, index, list) => (
                    <button
                      key={intersectionId}
                      type="button"
                      className={styles.choiceBtn}
                      onClick={() => onChoosePillage(intersectionId)}
                    >
                      {siteChoiceLabel('Ville', index, list.length)}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {progressDeckPending && onChooseProgressDeck && (
              <section className={styles.pending} aria-label="Pioche Progrès">
                <h4>Récompense — piochez une carte Progrès</h4>
                <div className={styles.choiceRow}>
                  {TRACKS.map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      className={styles.choiceBtn}
                      onClick={() => onChooseProgressDeck(track.id)}
                    >
                      {track.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {discardProgressPending && onDiscardProgress && (
              <section className={styles.pending} aria-label="Défausse Progrès">
                <h4>Main pleine — défaussez 1 carte Progrès</h4>
                <div className={styles.choiceRow}>
                  {progressHand.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className={styles.choiceBtn}
                      onClick={() => onDiscardProgress(card.id)}
                    >
                      {PROGRESS_LABELS[card.type] ?? card.type}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {aqueductPending && onAqueduct && (
              <section className={styles.pending} aria-label="Aqueduc">
                <h4>Aqueduc</h4>
                <p className={styles.pendingHint}>Aucune production — choisissez 1 ressource.</p>
                <div className={styles.choiceRow}>
                  {AQUEDUCT_RESOURCES.map((resource) => (
                    <button
                      key={resource}
                      type="button"
                      className={styles.choiceBtn}
                      onClick={() => onAqueduct(resource)}
                    >
                      {frResource(resource)}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {metroPending && metroTrack && onPlaceMetropolis && (
              <section className={styles.pending} aria-label="Métropole">
                <h4>Métropole ({TRACKS.find((t) => t.id === metroTrack)?.label})</h4>
                {metroHosts.length === 0 ? (
                  <p className={styles.pendingHint}>
                    Métropole acquise et mise en attente : construisez ou améliorez un village en
                    ville pour créer un emplacement libre.
                  </p>
                ) : (
                  <>
                    <p className={styles.pendingHint}>
                      Niveau 4 atteint — choisissez exactement la ville qui devient Métropole.
                    </p>
                    <div className={styles.choiceRow}>
                      {metroHosts.map((intersectionId, index, list) => (
                        <button
                          key={intersectionId}
                          type="button"
                          className={styles.choiceBtn}
                          onClick={() => onPlaceMetropolis(metroTrack, intersectionId)}
                        >
                          {metropolisHostLabel(intersectionId, index, list.length)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>
                <Icon name="trade" size={15} /> Marchandises
              </h4>
              <ul className={styles.commodityList}>
                {(['ck_paper', 'ck_cloth', 'ck_coin'] as const).map((c) => (
                  <li key={c}>
                    <span className={styles.commodityIdentity}>
                      <i aria-hidden="true">
                        <Icon name={COMMODITY_ICONS[c]} size={17} />
                      </i>
                      {frCommodity(c)}
                    </span>
                    <strong>{commodities[c] ?? 0}</strong>
                  </li>
                ))}
              </ul>
            </section>

            {/* La main Progrès est désormais jouable depuis le HUD compact premium. */}
            {false && progressHand.length > 0 && (
              <section className={styles.section}>
                <h4>Progrès ({progressHand.length}/3)</h4>
                <ul className={styles.progressPlayList}>
                  {progressHand.map((card) => {
                    const isAlchemist = card.type === 'alchemist';
                    const playable =
                      Boolean(onPlayProgress) && (isAlchemist ? canPlayAlchemist : canAct);
                    return (
                      <li key={card.id} className={styles.progressCard}>
                        <div className={styles.trackHead}>
                          <span>{PROGRESS_LABELS[card.type] ?? card.type}</span>
                          <strong>{card.deck}</strong>
                        </div>
                        {playable && card.type === 'merchant_fleet' && (
                          <div className={styles.choiceRow}>
                            {AQUEDUCT_RESOURCES.map((resource) => (
                              <button
                                key={resource}
                                type="button"
                                className={styles.choiceBtn}
                                onClick={() => onPlayProgress?.(card.id, { resource })}
                              >
                                2:1 {frResource(resource)}
                              </button>
                            ))}
                            {(['ck_paper', 'ck_cloth', 'ck_coin'] as const).map((commodity) => (
                              <button
                                key={commodity}
                                type="button"
                                className={styles.choiceBtn}
                                onClick={() => onPlayProgress?.(card.id, { commodity })}
                              >
                                2:1 {frCommodity(commodity)}
                              </button>
                            ))}
                          </div>
                        )}
                        {playable && card.type === 'merchant' && (
                          <div className={styles.choiceRow}>
                            {uniqueMerchantTiles.length === 0 ? (
                              <p className={styles.pendingHint}>Aucun terrain adjacent.</p>
                            ) : (
                              uniqueMerchantTiles.map((tileId, index, list) => {
                                const terrain = state.map.get(tileId)?.terrain;
                                const label = terrain
                                  ? siteChoiceLabel(frTerrain(terrain), index, list.length)
                                  : siteChoiceLabel('Terrain', index, list.length);
                                return (
                                  <button
                                    key={tileId}
                                    type="button"
                                    className={styles.choiceBtn}
                                    onClick={() => onPlayProgress?.(card.id, { tileId })}
                                  >
                                    {label}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                        {playable && card.type === 'resource_monopoly' && (
                          <div className={styles.choiceRow}>
                            {AQUEDUCT_RESOURCES.map((resource) => (
                              <button
                                key={resource}
                                type="button"
                                className={styles.choiceBtn}
                                onClick={() => onPlayProgress?.(card.id, { resource })}
                              >
                                {frResource(resource)}
                              </button>
                            ))}
                          </div>
                        )}
                        {playable && card.type === 'commodity_monopoly' && (
                          <div className={styles.choiceRow}>
                            {(['ck_paper', 'ck_cloth', 'ck_coin'] as const).map((commodity) => (
                              <button
                                key={commodity}
                                type="button"
                                className={styles.choiceBtn}
                                onClick={() => onPlayProgress?.(card.id, { commodity })}
                              >
                                {frCommodity(commodity)}
                              </button>
                            ))}
                          </div>
                        )}
                        {playable && card.type === 'alchemist' && (
                          <div className={styles.choiceRow}>
                            {[
                              [3, 3],
                              [4, 4],
                              [5, 5],
                              [6, 2],
                              [5, 3],
                            ].map(([d1, d2]) => (
                              <button
                                key={`${d1}-${d2}`}
                                type="button"
                                className={styles.choiceBtn}
                                onClick={() => onPlayProgress?.(card.id, { die1: d1, die2: d2 })}
                              >
                                {d1}+{d2}
                              </button>
                            ))}
                          </div>
                        )}
                        {playable && card.type === 'engineer' && (
                          <div className={styles.choiceRow}>
                            {wallCandidates.length === 0 ? (
                              <p className={styles.pendingHint}>Aucune ville sans muraille.</p>
                            ) : (
                              wallCandidates.map((intersectionId, index, list) => (
                                <button
                                  key={intersectionId}
                                  type="button"
                                  className={styles.choiceBtn}
                                  onClick={() => onPlayProgress?.(card.id, { intersectionId })}
                                >
                                  {siteChoiceLabel('Muraille', index, list.length)}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                        {playable &&
                          ['crane', 'warlord', 'road_building', 'smith'].includes(card.type) && (
                            <button
                              type="button"
                              className={styles.improveBtn}
                              onClick={() => onPlayProgress?.(card.id, {})}
                            >
                              Jouer
                            </button>
                          )}
                        {playable && (card.type === 'spy' || card.type === 'master_merchant') && (
                          <div className={styles.choiceRow}>
                            {state.turnOrder
                              .filter((id) => id !== playerId)
                              .map((oppId) => {
                                const name = state.players.get(oppId)?.name ?? oppId.slice(-4);
                                return (
                                  <button
                                    key={oppId}
                                    type="button"
                                    className={styles.choiceBtn}
                                    onClick={() =>
                                      onPlayProgress?.(card.id, { targetPlayerId: oppId })
                                    }
                                  >
                                    {name}
                                  </button>
                                );
                              })}
                          </div>
                        )}
                        {playable && card.type === 'bishop' && (
                          <div className={styles.choiceRow}>
                            {[...state.map.values()]
                              .filter(
                                (t) =>
                                  t.terrain !== 'ocean' &&
                                  t.terrain !== 'glacier' &&
                                  t.terrain !== 'desert',
                              )
                              .slice(0, 10)
                              .map((tile, index, list) => (
                                <button
                                  key={tile.id}
                                  type="button"
                                  className={styles.choiceBtn}
                                  onClick={() => onPlayProgress?.(card.id, { tileId: tile.id })}
                                >
                                  {siteChoiceLabel(frTerrain(tile.terrain), index, list.length)}
                                </button>
                              ))}
                          </div>
                        )}
                        {playable && card.type === 'trade_harbor' && (
                          <div className={styles.choiceRow}>
                            {(['ck_paper', 'ck_cloth', 'ck_coin'] as const).flatMap((commodity) =>
                              AQUEDUCT_RESOURCES.slice(0, 3).map((resource) => (
                                <button
                                  key={`${commodity}-${resource}`}
                                  type="button"
                                  className={styles.choiceBtn}
                                  onClick={() => onPlayProgress?.(card.id, { commodity, resource })}
                                >
                                  {frCommodity(commodity)}→{frResource(resource)}
                                </button>
                              )),
                            )}
                          </div>
                        )}
                        {playable &&
                          ![
                            'merchant',
                            'merchant_fleet',
                            'resource_monopoly',
                            'commodity_monopoly',
                            'alchemist',
                            'crane',
                            'warlord',
                            'road_building',
                            'smith',
                            'engineer',
                            'bishop',
                            'spy',
                            'master_merchant',
                            'trade_harbor',
                          ].includes(card.type) && (
                            <p className={styles.pendingHint}>
                              Cible requise (carte avancée) — jouable via commande.
                            </p>
                          )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>
                <Icon name="city" size={15} /> Améliorations urbaines
              </h4>
              <div className={styles.metroGuide}>
                <Icon name="victory" size={18} />
                <span>
                  <strong>Obtenir une Métropole</strong>
                  <small>
                    Atteignez le niveau 4 d’une piste et possédez une ville libre. Le choix de la
                    ville apparaîtra automatiquement ici.
                  </small>
                </span>
              </div>
              <div className={styles.tracks}>
                {TRACKS.map((track) => {
                  const level = levels[track.id];
                  const nextCost = level >= 5 ? null : level + 1;
                  const have = commodities[track.commodity] ?? 0;
                  const canImprove =
                    canAct && nextCost !== null && have >= nextCost && Boolean(onImprove);
                  const metro = ck.metropolises[track.id];
                  const guidance = urbanTrackGuidance(track.id, level, metro.ownerId === playerId);
                  return (
                    <div key={track.id} className={styles.track} data-track={track.id}>
                      <div className={styles.trackHead}>
                        <span className={styles.trackTitle}>
                          <i aria-hidden>
                            <Icon name={track.icon} size={14} />
                          </i>
                          {track.label}
                        </span>
                        <strong>Niv. {level}/5</strong>
                      </div>
                      <div className={styles.pips} aria-hidden>
                        {Array.from({ length: 5 }, (_, i) => (
                          <span key={i} className={i < level ? styles.pipOn : styles.pipOff} />
                        ))}
                      </div>
                      {metro.ownerId === playerId && <p className={styles.metro}>Métropole</p>}
                      <div className={styles.trackExplanation}>
                        <p>{guidance.purpose}</p>
                        <div className={styles.chanceRow}>
                          <span>Chance actuelle</span>
                          <strong>{guidance.currentChance}</strong>
                        </div>
                        <div className={styles.nextBenefit}>
                          <span>{guidance.nextChance}</span>
                          <small>{guidance.milestone}</small>
                        </div>
                      </div>
                      {nextCost !== null && onImprove ? (
                        <button
                          type="button"
                          className={styles.improveBtn}
                          disabled={!canImprove}
                          onClick={() => onImprove?.(track.id)}
                          title={
                            have < nextCost
                              ? `Il vous manque ${nextCost - have} ${frCommodity(track.commodity)}`
                              : !canAct
                                ? 'Disponible pendant votre phase d’action'
                                : undefined
                          }
                        >
                          <span>Améliorer</span>
                          <strong>
                            {nextCost} {frCommodity(track.commodity)} · {have}/{nextCost}
                          </strong>
                        </button>
                      ) : (
                        <div className={styles.mastered}>Niveau maximum atteint</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>
                <Icon name="warning" size={15} /> Défense
              </h4>
              <p className={styles.meta}>
                Murailles {walls}/3 · Seuil main {handLimit} · Chevaliers {myKnights.length}
                {' · '}
                Actifs {myKnights.filter((k) => k.activated).length}
              </p>
              {canAct && onBuildWall && wallCandidates.length > 0 && canAffordWall && (
                <div className={styles.choiceRow}>
                  {wallCandidates.map((intersectionId, index, list) => (
                    <button
                      key={intersectionId}
                      type="button"
                      className={styles.improveBtn}
                      onClick={() => onBuildWall(intersectionId)}
                    >
                      {siteChoiceLabel('Muraille — 2 argile', index, list.length)}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>
                <Icon name="army" size={15} /> Chevaliers
              </h4>
              {myKnights.length === 0 ? (
                <p className={styles.meta}>Aucun chevalier sur le plateau.</p>
              ) : (
                <ul className={styles.commodityList}>
                  {myKnights.map((k) => {
                    const canChase = knightCanChaseRobber(state, k.id);
                    const canCommand = canAct && k.activated && !k.activatedThisTurn;
                    return (
                      <li
                        key={k.id}
                        className={styles.knightRow}
                        data-active={k.activated ? 'true' : 'false'}
                        data-rank={k.rank}
                      >
                        <div className={styles.knightInfo}>
                          <span>
                            Rang {k.rank}
                            {k.activated ? ' · actif' : ' · dormant'}
                            {k.activatedThisTurn ? ' (ce tour)' : ''}
                          </span>
                        </div>
                        <div className={styles.knightActions}>
                          {canAct &&
                            onActivateKnight &&
                            !k.activated &&
                            (resources.wheat ?? 0) >= 1 && (
                              <button
                                type="button"
                                className={styles.choiceBtn}
                                onClick={() => onActivateKnight(k.id)}
                              >
                                Activer
                              </button>
                            )}
                          {canAct &&
                            onPromoteKnight &&
                            k.rank < 3 &&
                            !(k.rank === 2 && politicsLevel < 3) &&
                            (resources.sheep ?? 0) >= 1 &&
                            (resources.ore ?? 0) >= 1 && (
                              <button
                                type="button"
                                className={styles.choiceBtn}
                                onClick={() => onPromoteKnight(k.id)}
                              >
                                Promouvoir
                              </button>
                            )}
                          {canCommand && onMoveKnight && (
                            <button
                              type="button"
                              className={styles.choiceBtn}
                              onClick={() => {
                                setSelectedKnightId(k.id);
                                setKnightMode('move');
                              }}
                            >
                              Déplacer
                            </button>
                          )}
                          {canCommand &&
                            onDisplaceKnight &&
                            listKnightDisplaceTargets(state, playerId, k.id).length > 0 && (
                              <button
                                type="button"
                                className={styles.choiceBtn}
                                onClick={() => {
                                  setSelectedKnightId(k.id);
                                  setKnightMode('displace');
                                }}
                              >
                                Déloger
                              </button>
                            )}
                          {canCommand && onChaseRobber && canChase && (
                            <button
                              type="button"
                              className={styles.choiceBtn}
                              onClick={() => {
                                setSelectedKnightId(k.id);
                                setKnightMode('chase');
                              }}
                            >
                              Chasser
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {canRecruit && recruitSpots.length > 0 && (
                <div className={styles.choiceRow}>
                  <button
                    type="button"
                    className={styles.improveBtn}
                    onClick={() => {
                      if (onStartRecruitPlacement) {
                        onStartRecruitPlacement();
                        return;
                      }
                      // Repli : premier emplacement si pas de mode carte
                      onRecruitKnight?.(recruitSpots[0]!);
                    }}
                  >
                    {recruitPlacementActive
                      ? 'Recrutement… cliquez une case surlignée'
                      : `Recruter sur la carte — 1 mouton + 1 minerai (${recruitSpots.length} site${recruitSpots.length > 1 ? 's' : ''})`}
                  </button>
                </div>
              )}
              {canRecruit && recruitSpots.length === 0 && (
                <p className={styles.pendingHint}>
                  Aucun site libre sur votre réseau de routes pour recruter.
                </p>
              )}
              {knightMode === 'move' && selectedKnightId && (
                <div className={styles.choiceRow}>
                  {moveDests.length === 0 ? (
                    <p className={styles.pendingHint}>Aucune destination.</p>
                  ) : (
                    moveDests.map((id, index, list) => (
                      <button
                        key={id}
                        type="button"
                        className={styles.choiceBtn}
                        onClick={() => {
                          onMoveKnight?.(selectedKnightId, id);
                          setSelectedKnightId(null);
                          setKnightMode(null);
                        }}
                      >
                        {siteChoiceLabel('Déplacer ici', index, list.length)}
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    className={styles.choiceBtn}
                    onClick={() => {
                      setSelectedKnightId(null);
                      setKnightMode(null);
                    }}
                  >
                    Annuler
                  </button>
                </div>
              )}
              {knightMode === 'displace' && selectedKnightId && (
                <div className={styles.choiceRow}>
                  {displaceTargets.length === 0 ? (
                    <p className={styles.pendingHint}>Aucune cible plus faible.</p>
                  ) : (
                    displaceTargets.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={styles.choiceBtn}
                        onClick={() => {
                          onDisplaceKnight?.(selectedKnightId, t.id);
                          setSelectedKnightId(null);
                          setKnightMode(null);
                        }}
                      >
                        Rang {t.rank}
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    className={styles.choiceBtn}
                    onClick={() => {
                      setSelectedKnightId(null);
                      setKnightMode(null);
                    }}
                  >
                    Annuler
                  </button>
                </div>
              )}
              {knightMode === 'chase' && selectedKnightId && state.robberPosition && (
                <div className={styles.choiceRow}>
                  <button
                    type="button"
                    className={styles.improveBtn}
                    onClick={() => {
                      onChaseRobber?.(selectedKnightId, state.robberPosition!);
                      setSelectedKnightId(null);
                      setKnightMode(null);
                    }}
                  >
                    Chasser le brigand
                  </button>
                  <button
                    type="button"
                    className={styles.choiceBtn}
                    onClick={() => {
                      setSelectedKnightId(null);
                      setKnightMode(null);
                    }}
                  >
                    Annuler
                  </button>
                </div>
              )}
            </section>
          </div>
        </section>
      )}
    </aside>
  );
}
