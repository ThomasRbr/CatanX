import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  CkCommodity,
  CkProgressCard,
  DevelopmentCard,
  GameState,
  ResourceType,
} from '@catanx/engine';
import { hasPlayedProgressThisTurn, isCitiesKnightsEnabled } from '@catanx/engine';
import { frCommodity, frResource, frTerrain } from '../../i18n/fr';
import { Icon, type CatanXIconName } from '../../ui';
import styles from './PlayableCardHand.module.css';

type PlayResult = { ok: boolean; reason?: string };

interface PlayableCardHandProps {
  state: GameState;
  playerId: string;
  canAct: boolean;
  canPlayAlchemist: boolean;
  onPlayDevelopment: (
    card: DevelopmentCard,
    params: {
      tileId?: string;
      targetPlayerId?: string;
      resources?: [ResourceType, ResourceType];
      resource?: ResourceType;
    },
  ) => PlayResult;
  onPlayProgress: (card: CkProgressCard, params?: Record<string, unknown>) => PlayResult;
  selectedTileId?: string | null;
  /** Active le ciblage direct sur le plateau et fournit les hexagones légaux. */
  onTileTargetingChange?: (tileIds: string[]) => void;
  onOpenChange?: (open: boolean) => void;
  /** Garde le lancer de dés accessible lorsque la main masque le planificateur. */
  canRollDice?: boolean;
  onRollDice?: () => void;
}

const RESOURCES: ResourceType[] = ['wood', 'clay', 'sheep', 'wheat', 'ore'];
const COMMODITIES: CkCommodity[] = ['ck_cloth', 'ck_coin', 'ck_paper'];

const DEV_META: Record<
  string,
  { title: string; kicker: string; description: string; art: string }
> = {
  knight: {
    title: 'Chevalier',
    kicker: 'Influence',
    art: 'knight',
    description: 'Déplacez le brigand et volez une carte à un joueur adjacent.',
  },
  road_building: {
    title: 'Construction de routes',
    kicker: 'Expansion',
    art: 'road',
    description: 'Placez immédiatement deux routes sans payer leur coût.',
  },
  year_of_plenty: {
    title: 'Année d’abondance',
    kicker: 'Récolte',
    art: 'harvest',
    description: 'Prenez deux ressources de votre choix dans la banque.',
  },
  monopoly: {
    title: 'Monopole',
    kicker: 'Commerce',
    art: 'monopoly',
    description: 'Choisissez une ressource et récupérez-en toutes les cartes adverses.',
  },
  victory_point: {
    title: 'Point de victoire',
    kicker: 'Secret',
    art: 'victory',
    description: 'Ce point secret est déjà comptabilisé dans votre score.',
  },
};

const PROGRESS_META: Record<string, { title: string; description: string }> = {
  merchant: { title: 'Marchand', description: 'Installez le marchand sur un terrain voisin.' },
  merchant_fleet: {
    title: 'Flotte marchande',
    description: 'Échangez une ressource ou marchandise à 2:1 ce tour.',
  },
  trade_harbor: {
    title: 'Port de commerce',
    description: 'Échangez une marchandise contre une ressource chez vos adversaires.',
  },
  resource_monopoly: {
    title: 'Monopole de ressources',
    description: 'Prenez jusqu’à deux ressources choisies à chaque adversaire.',
  },
  commodity_monopoly: {
    title: 'Monopole de marchandises',
    description: 'Prenez une marchandise choisie à chaque adversaire.',
  },
  master_merchant: {
    title: 'Maître marchand',
    description: 'Volez deux cartes à un joueur ayant davantage de points.',
  },
  bishop: { title: 'Évêque', description: 'Déplacez le brigand et volez chaque joueur adjacent.' },
  diplomat: {
    title: 'Diplomate',
    description: 'Retirez une route ouverte ou déplacez l’une des vôtres.',
  },
  intrigue: {
    title: 'Intrigue',
    description: 'Délogez un chevalier adverse au contact de votre réseau.',
  },
  deserter: {
    title: 'Déserteur',
    description: 'Échangez un chevalier adverse contre l’un des vôtres.',
  },
  spy: { title: 'Espion', description: 'Dérobez une carte Progrès à un adversaire.' },
  warlord: {
    title: 'Seigneur de guerre',
    description: 'Activez gratuitement tous vos chevaliers.',
  },
  alchemist: { title: 'Alchimiste', description: 'Choisissez les deux dés avant de les lancer.' },
  crane: {
    title: 'Grue',
    description: 'Réduisez le coût de votre prochaine amélioration urbaine.',
  },
  engineer: {
    title: 'Ingénieur',
    description: 'Construisez gratuitement une muraille autour d’une ville.',
  },
  inventor: { title: 'Inventeur', description: 'Échangez deux jetons numérotés du plateau.' },
  road_building: {
    title: 'Construction de routes',
    description: 'Placez deux routes gratuitement.',
  },
  smith: { title: 'Forgeron', description: 'Améliorez gratuitement jusqu’à deux chevaliers.' },
};

const PROGRESS_ICON: Record<string, CatanXIconName> = {
  merchant: 'trade',
  merchant_fleet: 'trade',
  trade_harbor: 'city',
  resource_monopoly: 'gold',
  commodity_monopoly: 'ckCoin',
  master_merchant: 'victory',
  bishop: 'victory',
  diplomat: 'diplomacy',
  intrigue: 'warning',
  deserter: 'army',
  spy: 'tech',
  warlord: 'army',
  alchemist: 'tech',
  crane: 'build',
  engineer: 'settings',
  inventor: 'tech',
  road_building: 'road',
  smith: 'army',
};

function ChoiceButton({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.choice}${active ? ` ${styles.choiceActive}` : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function PlayableCardHand({
  state,
  playerId,
  canAct,
  canPlayAlchemist,
  onPlayDevelopment,
  onPlayProgress,
  selectedTileId = null,
  onTileTargetingChange,
  onOpenChange,
  canRollDice = false,
  onRollDice,
}: PlayableCardHandProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resourceA, setResourceA] = useState<ResourceType>('wood');
  const [resourceB, setResourceB] = useState<ResourceType>('ore');
  const [commodity, setCommodity] = useState<CkCommodity>('ck_cloth');
  const [targetPlayerId, setTargetPlayerId] = useState('');
  const [tileA, setTileA] = useState('');
  const [tileB, setTileB] = useState('');
  const [intersectionId, setIntersectionId] = useState('');
  const [knightId, setKnightId] = useState('');
  const [edgeId, setEdgeId] = useState('');
  const [die1, setDie1] = useState(4);
  const [die2, setDie2] = useState(4);
  const [targetingSlot, setTargetingSlot] = useState<'tileA' | 'tileB' | null>(null);
  const [targetTileIds, setTargetTileIds] = useState<string[]>([]);

  const player = state.players.get(playerId);
  const isCk = isCitiesKnightsEnabled(state) || Boolean(state.extensions?.citiesKnights);
  const devCards = isCk ? [] : (player?.devCards.filter((card) => !card.played) ?? []);
  const progressCards = isCk
    ? (state.extensions?.citiesKnights?.progressHands[playerId] ?? [])
    : [];
  const cards = isCk ? progressCards : devCards;

  const selectedDev = devCards.find((card) => card.id === selectedId) ?? null;
  const selectedProgress = progressCards.find((card) => card.id === selectedId) ?? null;
  const progressPlayedThisTurn = isCk && hasPlayedProgressThisTurn(state, playerId);

  const opponents = useMemo(
    () =>
      state.turnOrder
        .filter((id) => id !== playerId && !state.players.get(id)?.isEliminated)
        .map((id) => ({ id, label: state.players.get(id)?.name ?? 'Adversaire' })),
    [playerId, state],
  );

  const landTiles = useMemo(
    () =>
      [...state.map.values()].filter(
        (tile) => tile.terrain !== 'ocean' && tile.terrain !== 'glacier',
      ),
    [state],
  );

  const merchantTiles = useMemo(() => {
    const board = state.classicBoard;
    if (!board) return [];
    const ids = new Set<string>();
    for (const [iid, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId) continue;
      for (const id of board.topology.intersections[iid]?.tileIds ?? []) {
        const tile = state.map.get(id);
        if (
          tile &&
          tile.terrain !== 'desert' &&
          tile.terrain !== 'ocean' &&
          tile.terrain !== 'glacier'
        )
          ids.add(id);
      }
    }
    return [...ids];
  }, [playerId, state]);

  const wallSites = useMemo(() => {
    const board = state.classicBoard;
    const ck = state.extensions?.citiesKnights;
    if (!board || !ck) return [];
    return Object.entries(board.occupiedIntersections)
      .filter(([iid, owner]) => {
        if (owner !== playerId || ck.walls[iid]) return false;
        const building = state.buildings.get(board.buildingByIntersection[iid] ?? '');
        return building?.definitionId === 'city' || building?.definitionId === 'metropolis';
      })
      .map(([iid]) => iid);
  }, [playerId, state]);

  const freeNetworkSites = useMemo(() => {
    const board = state.classicBoard;
    const ck = state.extensions?.citiesKnights;
    if (!board || !ck) return [];
    const ids = new Set<string>();
    for (const [id, owner] of Object.entries(board.roadsByEdge)) {
      if (owner !== playerId) continue;
      const edge = board.topology.edges[id];
      if (!edge) continue;
      for (const iid of [edge.a, edge.b]) {
        if (
          !board.occupiedIntersections[iid] &&
          !ck.knights.some((knight) => knight.intersectionId === iid)
        )
          ids.add(iid);
      }
    }
    return [...ids];
  }, [playerId, state]);

  const roadChoices = useMemo(() => {
    const board = state.classicBoard;
    if (!board) return [];
    return Object.entries(board.roadsByEdge).map(([id, owner], index) => ({
      id,
      label: `${owner === playerId ? 'Votre route' : `Route de ${state.players.get(owner)?.name ?? 'adversaire'}`} · ${index + 1}`,
    }));
  }, [playerId, state]);

  const enemyKnights = useMemo(() => {
    const ck = state.extensions?.citiesKnights;
    const board = state.classicBoard;
    if (!ck || !board) return [];
    return ck.knights
      .filter((knight) => {
        if (knight.ownerId === playerId || !knight.intersectionId) return false;
        return Object.entries(board.roadsByEdge).some(([edgeId, owner]) => {
          if (owner !== playerId) return false;
          const edge = board.topology.edges[edgeId];
          return edge?.a === knight.intersectionId || edge?.b === knight.intersectionId;
        });
      })
      .map((knight, index) => {
        const intersection = board.topology.intersections[knight.intersectionId!];
        const nearby = (intersection?.tileIds ?? [])
          .map((id) => state.map.get(id))
          .find((tile) => tile && tile.terrain !== 'ocean' && tile.terrain !== 'glacier');
        const place = nearby
          ? `${frTerrain(nearby.terrain)}${nearby.diceValue ? ` · ${nearby.diceValue}` : ''}`
          : `position ${index + 1}`;
        return {
          id: knight.id,
          label: `${state.players.get(knight.ownerId)?.name ?? 'Adversaire'} · rang ${knight.rank} · ${place}`,
        };
      });
  }, [playerId, state]);

  useEffect(() => {
    if (!selectedId || cards.some((card) => card.id === selectedId)) return;
    setSelectedId(null);
  }, [cards, selectedId]);

  useEffect(() => {
    onOpenChange?.(opened);
    return () => onOpenChange?.(false);
  }, [onOpenChange, opened]);

  useEffect(() => {
    if (!opened) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        // La cible se trouve sur le plateau, hors de la main. Garder la main
        // ouverte jusqu'au clic sur l'hexagone permet au Marchand (et à
        // l'Inventeur) de recevoir la sélection avant de fermer le panneau.
        if (targetingSlot) return;
        setOpened(false);
        setSelectedId(null);
        setTargetingSlot(null);
        setTargetTileIds([]);
        onTileTargetingChange?.([]);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpened(false);
        setSelectedId(null);
        setTargetingSlot(null);
        setTargetTileIds([]);
        onTileTargetingChange?.([]);
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', escape);
    };
  }, [onTileTargetingChange, opened, targetingSlot]);

  useEffect(() => {
    if (!targetingSlot || !selectedTileId || !targetTileIds.includes(selectedTileId)) return;
    if (targetingSlot === 'tileA') {
      setTileA(selectedTileId);
      if (selectedProgress?.type === 'inventor') {
        const remaining = targetTileIds.filter((id) => id !== selectedTileId);
        setTargetingSlot('tileB');
        setTargetTileIds(remaining);
        onTileTargetingChange?.(remaining);
        return;
      }
    } else {
      setTileB(selectedTileId);
    }
    setTargetingSlot(null);
    setTargetTileIds([]);
    onTileTargetingChange?.([]);
  }, [onTileTargetingChange, selectedProgress?.type, selectedTileId, targetTileIds, targetingSlot]);

  if (cards.length === 0) return null;

  const resetChoices = () => {
    setResourceA('wood');
    setResourceB('ore');
    setCommodity('ck_cloth');
    setTargetPlayerId('');
    setTileA('');
    setTileB('');
    setIntersectionId('');
    setKnightId('');
    setEdgeId('');
    setDie1(4);
    setDie2(4);
    setTargetingSlot(null);
    setTargetTileIds([]);
    onTileTargetingChange?.([]);
  };
  const beginTileTargeting = (slot: 'tileA' | 'tileB', ids: string[]) => {
    setTargetingSlot(slot);
    setTargetTileIds(ids);
    onTileTargetingChange?.(ids);
  };
  const selectCard = (id: string) => {
    const closing = selectedId === id;
    setSelectedId(closing ? null : id);
    resetChoices();
    if (closing) return;
    const card = cards.find((candidate) => candidate.id === id);
    if (!card) return;
    const eligibleLand = landTiles
      .filter((tile) => tile.id !== state.robberPosition)
      .map((tile) => tile.id);
    if (!('deck' in card) && card.type === 'knight') {
      beginTileTargeting('tileA', eligibleLand);
    } else if ('deck' in card && card.type === 'merchant') {
      beginTileTargeting('tileA', merchantTiles);
    } else if ('deck' in card && card.type === 'bishop') {
      beginTileTargeting('tileA', eligibleLand);
    } else if ('deck' in card && card.type === 'inventor') {
      beginTileTargeting(
        'tileA',
        landTiles
          .filter((tile) => tile.diceValue && tile.diceValue !== 6 && tile.diceValue !== 8)
          .map((tile) => tile.id),
      );
    }
  };
  const finish = (result: PlayResult) => {
    if (result.ok) {
      setOpened(false);
      setSelectedId(null);
      setTargetingSlot(null);
      setTargetTileIds([]);
      onTileTargetingChange?.([]);
    }
  };

  const devLocked = selectedDev
    ? selectedDev.acquiredTurn === state.currentTurn ||
      (Boolean(player?.devCardsPlayedThisTurn) && selectedDev.type !== 'victory_point') ||
      !canAct
    : false;
  const progressPlayable =
    !progressPlayedThisTurn &&
    (selectedProgress?.type === 'alchemist' ? canPlayAlchemist : canAct);
  const selectionReady = (() => {
    if (selectedDev?.type === 'knight') return Boolean(tileA);
    if (selectedProgress) {
      switch (selectedProgress.type) {
        case 'merchant':
        case 'bishop':
          return Boolean(tileA);
        case 'master_merchant':
        case 'spy':
          return Boolean(targetPlayerId);
        case 'diplomat':
          return Boolean(edgeId);
        case 'intrigue':
          return Boolean(knightId);
        case 'deserter':
          return Boolean(targetPlayerId && intersectionId);
        case 'engineer':
          return Boolean(intersectionId);
        case 'inventor':
          return Boolean(tileA && tileB && tileA !== tileB);
        default:
          return true;
      }
    }
    return true;
  })();

  const renderResourceChoices = (
    selected: ResourceType,
    setSelected: (value: ResourceType) => void,
  ) => (
    <div className={styles.choiceGrid}>
      {RESOURCES.map((resource) => (
        <ChoiceButton
          key={resource}
          active={resource === selected}
          onClick={() => setSelected(resource)}
        >
          {frResource(resource)}
        </ChoiceButton>
      ))}
    </div>
  );
  const renderCommodityChoices = () => (
    <div className={styles.choiceGrid}>
      {COMMODITIES.map((value) => (
        <ChoiceButton key={value} active={value === commodity} onClick={() => setCommodity(value)}>
          {frCommodity(value)}
        </ChoiceButton>
      ))}
    </div>
  );
  const renderSelect = (
    label: string,
    value: string,
    setValue: (value: string) => void,
    options: Array<{ id: string; label: string }>,
  ) => (
    <label className={styles.field}>
      <span>{label}</span>
      <select value={value} onChange={(event) => setValue(event.target.value)}>
        <option value="">Choisir…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
  const renderBoardTarget = (
    label: string,
    value: string,
    slot: 'tileA' | 'tileB',
    options: Array<{ id: string; label: string }>,
  ) => {
    const selected = options.find((option) => option.id === value);
    const active = targetingSlot === slot;
    return (
      <div className={styles.boardTarget}>
        <span>{label}</span>
        <button
          type="button"
          className={`${styles.boardTargetButton}${active ? ` ${styles.boardTargetActive}` : ''}`}
          disabled={options.length === 0}
          onClick={() =>
            beginTileTargeting(
              slot,
              options.map((option) => option.id),
            )
          }
        >
          <Icon name={active ? 'warning' : 'dice'} size={18} />
          <span>
            <strong>{selected?.label ?? 'Choisir sur le plateau'}</strong>
            <small>
              {active
                ? `${options.length} hexagone${options.length > 1 ? 's' : ''} surligné${options.length > 1 ? 's' : ''}`
                : selected
                  ? 'Cliquer pour changer la cible'
                  : 'Puis cliquez sur l’hexagone exact'}
            </small>
          </span>
        </button>
      </div>
    );
  };

  const playDevelopment = () => {
    if (!selectedDev || devLocked) return;
    if (selectedDev.type === 'knight')
      finish(onPlayDevelopment(selectedDev, { tileId: tileA, targetPlayerId }));
    else if (selectedDev.type === 'year_of_plenty')
      finish(onPlayDevelopment(selectedDev, { resources: [resourceA, resourceB] }));
    else if (selectedDev.type === 'monopoly')
      finish(onPlayDevelopment(selectedDev, { resource: resourceA }));
    else finish(onPlayDevelopment(selectedDev, {}));
  };

  const playProgress = (params: Record<string, unknown>) => {
    if (!selectedProgress || !progressPlayable) return;
    finish(onPlayProgress(selectedProgress, params));
  };

  const progressAction = () => {
    if (!selectedProgress) return;
    switch (selectedProgress.type) {
      case 'merchant':
        return playProgress({ tileId: tileA });
      case 'merchant_fleet':
        return playProgress(commodity ? { commodity } : { resource: resourceA });
      case 'trade_harbor':
        return playProgress({ commodity, resource: resourceA });
      case 'resource_monopoly':
        return playProgress({ resource: resourceA });
      case 'commodity_monopoly':
        return playProgress({ commodity });
      case 'master_merchant':
      case 'spy':
        return playProgress({ targetPlayerId });
      case 'bishop':
        return playProgress({ tileId: tileA });
      case 'diplomat':
        return playProgress({ edgeId });
      case 'intrigue':
        return playProgress({ knightId });
      case 'deserter':
        return playProgress({ targetPlayerId, intersectionId });
      case 'alchemist':
        return playProgress({ die1, die2 });
      case 'engineer':
        return playProgress({ intersectionId });
      case 'inventor':
        return playProgress({ tokenTileA: tileA, tokenTileB: tileB });
      default:
        return playProgress({});
    }
  };

  const detailMeta = selectedDev
    ? DEV_META[selectedDev.type]
    : selectedProgress
      ? PROGRESS_META[selectedProgress.type]
      : null;
  const tileOptions = landTiles.map((tile) => ({
    id: tile.id,
    label: `${frTerrain(tile.terrain)}${tile.diceValue ? ` · ${tile.diceValue}` : ''}`,
  }));
  const numberTileOptions = landTiles
    .filter((tile) => tile.diceValue && tile.diceValue !== 6 && tile.diceValue !== 8)
    .map((tile) => ({ id: tile.id, label: `${frTerrain(tile.terrain)} · ${tile.diceValue}` }));
  const merchantOptions = merchantTiles.map((id) => {
    const tile = state.map.get(id)!;
    return { id, label: `${frTerrain(tile.terrain)} · ${tile.diceValue ?? '—'}` };
  });

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        data-testid="card-hand-trigger"
        className={`${styles.trigger} ${isCk ? styles.triggerProgress : ''}`}
        aria-expanded={opened}
        onClick={() => {
          setOpened((value) => !value);
          setSelectedId(null);
          resetChoices();
        }}
      >
        <span className={styles.triggerIcon}>
          <Icon name={isCk ? 'tech' : 'victory'} size={18} />
        </span>
        <span>
          <small>{isCk ? 'Main tactique' : 'Cartes'}</small>
          <strong>{isCk ? 'Progrès' : 'Développement'}</strong>
        </span>
        <b>{cards.length}</b>
      </button>

      {opened && (
        <section
          className={styles.popover}
          aria-label={isCk ? 'Main de cartes Progrès' : 'Main de cartes Développement'}
        >
          <header className={styles.header}>
            <div>
              <span className={styles.eyebrow}>
                {isCk ? 'Villes & Chevaliers' : 'CATAN · paquet classique'}
              </span>
              <h3>{isCk ? 'Cartes Progrès' : 'Votre main'}</h3>
              {isCk && (
                <small className={styles.handLimit}>
                  {cards.length}/3 cartes · 1 jouable par tour
                </small>
              )}
            </div>
            <div className={styles.headerActions}>
              {canRollDice && onRollDice && (
                <button
                  type="button"
                  className={styles.rollDice}
                  onClick={() => {
                    setOpened(false);
                    setSelectedId(null);
                    resetChoices();
                    onRollDice();
                  }}
                >
                  <Icon name="dice" size={17} />
                  <span>Lancer les dés</span>
                </button>
              )}
              <button
                type="button"
                className={styles.close}
                aria-label="Fermer la main"
                onClick={() => {
                  setOpened(false);
                  setSelectedId(null);
                  resetChoices();
                }}
              >
                ×
              </button>
            </div>
          </header>
          <div className={`${styles.content}${detailMeta ? '' : ` ${styles.contentFull}`}`}>
            <div className={styles.fan} role="list">
              {cards.map((card, index) => {
                const progress = 'deck' in card;
                const meta = progress ? PROGRESS_META[card.type] : DEV_META[card.type];
                const kicker = progress ? undefined : DEV_META[card.type]?.kicker;
                const deck = progress ? card.deck : 'development';
                const fresh = !progress && card.acquiredTurn === state.currentTurn;
                return (
                  <button
                    key={card.id}
                    type="button"
                    data-testid={`playable-card-${card.type}`}
                    className={`${styles.card} ${styles[`deck_${deck}`]}${selectedId === card.id ? ` ${styles.selected}` : ''}`}
                    data-card-type={card.type}
                    data-progress={progress ? 'true' : undefined}
                    style={{ '--card-index': index } as CSSProperties}
                    aria-pressed={selectedId === card.id}
                    onClick={() => selectCard(card.id)}
                  >
                    <span className={styles.cardTop}>
                      <small>
                        {progress
                          ? { trade: 'Commerce', politics: 'Politique', science: 'Science' }[
                              card.deck
                            ]
                          : kicker}
                      </small>
                      {fresh && <em>Nouveau</em>}
                    </span>
                    <span
                      className={`${styles.art} ${styles[`art_${progress ? card.deck : (meta as (typeof DEV_META)[string])?.art}`]}`}
                      aria-hidden="true"
                    >
                      <i />
                      {progress ? (
                        <b className={styles.progressSigil}>
                          <Icon name={PROGRESS_ICON[card.type] ?? 'tech'} size={18} />
                        </b>
                      ) : (
                        <b />
                      )}
                    </span>
                    <span className={styles.cardTitle}>{meta?.title ?? card.type}</span>
                    <span className={styles.cardHint}>
                      {fresh ? 'Jouable au prochain tour' : 'Cliquer pour utiliser'}
                    </span>
                  </button>
                );
              })}
            </div>

            {detailMeta && (selectedDev || selectedProgress) && (
              <aside className={styles.detail} data-deck={selectedProgress?.deck ?? 'development'}>
                <span className={styles.detailKicker}>
                  {selectedProgress ? 'Carte Progrès' : DEV_META[selectedDev!.type]?.kicker}
                </span>
                <h4>{detailMeta.title}</h4>
                <p>{detailMeta.description}</p>

                {selectedDev?.type === 'knight' && (
                  <>
                    {renderBoardTarget(
                      'Nouvelle tuile du brigand',
                      tileA,
                      'tileA',
                      tileOptions.filter((option) => option.id !== state.robberPosition),
                    )}
                    {renderSelect(
                      'Joueur à voler · optionnel',
                      targetPlayerId,
                      setTargetPlayerId,
                      opponents,
                    )}
                  </>
                )}
                {selectedDev?.type === 'year_of_plenty' && (
                  <>
                    <span className={styles.fieldLabel}>Première ressource</span>
                    {renderResourceChoices(resourceA, setResourceA)}
                    <span className={styles.fieldLabel}>Deuxième ressource</span>
                    {renderResourceChoices(resourceB, setResourceB)}
                  </>
                )}
                {selectedDev?.type === 'monopoly' && (
                  <>
                    <span className={styles.fieldLabel}>Ressource visée</span>
                    {renderResourceChoices(resourceA, setResourceA)}
                  </>
                )}

                {selectedProgress?.type === 'merchant' &&
                  renderBoardTarget('Terrain du marchand', tileA, 'tileA', merchantOptions)}
                {selectedProgress?.type === 'merchant_fleet' && (
                  <>
                    <span className={styles.fieldLabel}>Ressource à 2:1</span>
                    {renderResourceChoices(resourceA, (value) => {
                      setResourceA(value);
                      setCommodity('' as CkCommodity);
                    })}
                    <span className={styles.or}>ou une marchandise</span>
                    {renderCommodityChoices()}
                  </>
                )}
                {selectedProgress?.type === 'trade_harbor' && (
                  <>
                    <span className={styles.fieldLabel}>Marchandise donnée</span>
                    {renderCommodityChoices()}
                    <span className={styles.fieldLabel}>Ressource demandée</span>
                    {renderResourceChoices(resourceA, setResourceA)}
                  </>
                )}
                {selectedProgress?.type === 'resource_monopoly' &&
                  renderResourceChoices(resourceA, setResourceA)}
                {selectedProgress?.type === 'commodity_monopoly' && renderCommodityChoices()}
                {(selectedProgress?.type === 'master_merchant' ||
                  selectedProgress?.type === 'spy') &&
                  renderSelect('Adversaire ciblé', targetPlayerId, setTargetPlayerId, opponents)}
                {selectedProgress?.type === 'bishop' &&
                  renderBoardTarget(
                    'Nouvelle tuile du brigand',
                    tileA,
                    'tileA',
                    tileOptions.filter((option) => option.id !== state.robberPosition),
                  )}
                {selectedProgress?.type === 'diplomat' &&
                  renderSelect('Route à retirer', edgeId, setEdgeId, roadChoices)}
                {selectedProgress?.type === 'intrigue' &&
                  (enemyKnights.length > 0 ? (
                    renderSelect('Chevalier à déloger', knightId, setKnightId, enemyKnights)
                  ) : (
                    <div className={styles.noTarget} role="status">
                      <Icon name="warning" size={18} />
                      <span>
                        <strong>Aucune cible légale</strong>
                        <small>
                          Intrigue exige un chevalier adverse placé au contact direct de l’une de
                          vos routes.
                        </small>
                      </span>
                    </div>
                  ))}
                {selectedProgress?.type === 'deserter' && (
                  <>
                    {renderSelect('Joueur ciblé', targetPlayerId, setTargetPlayerId, opponents)}
                    {renderSelect(
                      'Emplacement de votre chevalier',
                      intersectionId,
                      setIntersectionId,
                      freeNetworkSites.map((id, index) => ({
                        id,
                        label: `Emplacement libre · ${index + 1}`,
                      })),
                    )}
                  </>
                )}
                {selectedProgress?.type === 'alchemist' && (
                  <div className={styles.diceChoice}>
                    <label>
                      Dé 1
                      <select
                        value={die1}
                        onChange={(event) => setDie1(Number(event.target.value))}
                      >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <span>+</span>
                    <label>
                      Dé 2
                      <select
                        value={die2}
                        onChange={(event) => setDie2(Number(event.target.value))}
                      >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <strong>{die1 + die2}</strong>
                  </div>
                )}
                {selectedProgress?.type === 'engineer' &&
                  renderSelect(
                    'Ville à fortifier',
                    intersectionId,
                    setIntersectionId,
                    wallSites.map((id, index) => ({ id, label: `Ville · ${index + 1}` })),
                  )}
                {selectedProgress?.type === 'inventor' && (
                  <>
                    {renderBoardTarget('Premier jeton', tileA, 'tileA', numberTileOptions)}
                    {renderBoardTarget(
                      'Second jeton',
                      tileB,
                      'tileB',
                      numberTileOptions.filter((option) => option.id !== tileA),
                    )}
                  </>
                )}

                {selectedDev?.type === 'victory_point' ? (
                  <div className={styles.passive}>
                    <Icon name="check" size={17} /> Point actif automatiquement
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.play}
                    disabled={
                      selectedDev
                        ? devLocked || !selectionReady
                        : !progressPlayable || !selectionReady
                    }
                    onClick={selectedDev ? playDevelopment : progressAction}
                  >
                    {progressPlayedThisTurn && selectedProgress
                      ? 'Une carte déjà jouée ce tour'
                      : selectedDev && selectedDev.acquiredTurn === state.currentTurn
                      ? 'Disponible au prochain tour'
                      : !selectionReady
                        ? 'Choisissez une cible'
                        : !canAct && selectedProgress?.type !== 'alchemist'
                          ? 'Attendez votre phase d’action'
                          : 'Jouer cette carte'}
                  </button>
                )}
                {selectedDev &&
                  (player?.devCardsPlayedThisTurn ?? 0) > 0 &&
                  selectedDev.type !== 'victory_point' && (
                    <small className={styles.lockNote}>
                      Une carte Développement a déjà été jouée ce tour.
                    </small>
                  )}
                {selectedProgress?.type === 'alchemist' && !canPlayAlchemist && (
                  <small className={styles.lockNote}>
                    L’Alchimiste se joue avant le lancer des dés.
                  </small>
                )}
                {selectedProgress && progressPlayedThisTurn && (
                  <small className={styles.lockNote}>
                    Une seule carte Progrès peut être jouée par tour. Cette main reste disponible
                    pour préparer votre prochain coup.
                  </small>
                )}
              </aside>
            )}
          </div>
          <footer>
            <span>
              {isCk
                ? 'Maximum 3 cartes · 1 carte Progrès jouable par tour · cibles sur l’île.'
                : 'Sélectionnez une carte pour révéler son effet.'}
            </span>
            <kbd>Échap</kbd>
          </footer>
        </section>
      )}
    </div>
  );
}
