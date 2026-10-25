import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  canExtendTunnelToEdge,
  canSurvey,
  getBuildCost,
  getAdjacentHiddenNodeIds,
  getPlayerUndergroundNodeIds,
  isCitiesKnightsEnabled,
  isUndergroundSkyEnabled,
  isAirshipAtHomeAirport,
  skyMasteryScore,
  undergroundMasteryScore,
  SKY_MASTERY_THRESHOLD,
  UNDERGROUND_MASTERY_THRESHOLD,
  US_PIECE_LIMITS,
  type AirshipCargoItem,
  type ResourceBundle,
  type GameState,
  type ResourceType,
  type CkCommodity,
  type SkyAirship,
  type SkyContract,
  type SkySiteKind,
  type SkyContractKind,
  type UndergroundSkyMaterial,
  type UsBuildKind,
} from '@catanx/engine';
import { Badge, Icon, Tabs, type CatanXIconName } from '../../ui';
import type { BoardLayer } from '../Map/boardLayer';
import { frCommodity, frResource } from '../../i18n/fr';
import styles from './UndergroundSkyPanel.module.css';

type UsTab = 'profondeurs' | 'alizes' | 'constructions' | 'contrats';

type DispatchCargo = AirshipCargoItem;

interface UndergroundSkyPanelProps {
  gameState: GameState;
  playerId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  canAct?: boolean;
  activeLayer?: BoardLayer;
  onLayerChange?: (layer: BoardLayer) => void;
  onSurveyCavern?: (nodeId: string) => void;
  onBuildShaft?: (intersectionId: string, entryNodeId: string) => void;
  onBuildTunnel?: (edgeId: string) => void;
  onBuildOutpost?: (nodeId: string) => void;
  onUpgradeExtractor?: (outpostId: string) => void;
  onBuildLift?: (nodeId: string) => void;
  onBuildAirport?: (intersectionId: string) => void;
  onBuildAirship?: (airportId: string) => void;
  onUpgradeAirship?: (airshipId: string, upgrade: 'ether_sails' | 'reinforced_hold') => void;
  onBuildBeacon?: (hubId: string) => void;
  onDispatchAirship?: (
    airshipId: string,
    destinationHubId: string,
    cargo: DispatchCargo[],
  ) => void;
  onUnloadAirship?: (airshipId: string) => void;
  onCompleteContract?: (
    contractId: string,
    options?: { airshipId?: string; rewardClassic?: string },
  ) => void;
  onChooseThermalOutput?: (outpostId: string, choice: 'wheat' | 'sheep') => void;
  onChooseDiscoveryReward?: (nodeId: string, choice: string) => void;
}

const MATERIAL_LABELS: Record<UndergroundSkyMaterial, string> = {
  us_crystal: 'Cristal',
  us_aether: 'Éther',
};

const CONTRACT_KIND_LABELS: Record<SkyContractKind, string> = {
  supply: 'Ravitaillement',
  construction: 'Construction',
  metallurgy: 'Métallurgie',
  craft: 'Artisanat',
  energy: 'Énergie',
  ck_logistics: 'Logistique C&K',
};

const SKY_SITE_LABELS: Record<SkySiteKind, string> = {
  calm_mooring: 'Mouillage calme',
  aether_source: 'Source d’Éther',
  floating_garden: 'Jardin flottant',
  wind_bazaar: 'Bazar des vents',
  observatory: 'Observatoire',
  hanging_ruins: 'Ruines suspendues',
  turbulent_zone: 'Zone turbulente',
};

const KIND_DEFAULT_SITE: Partial<Record<SkyContract['kind'], SkySiteKind>> = {
  supply: 'floating_garden',
  construction: 'wind_bazaar',
  metallurgy: 'hanging_ruins',
  craft: 'observatory',
  energy: 'aether_source',
  ck_logistics: 'wind_bazaar',
};

function contractDeliverySite(contract: SkyContract): SkySiteKind | null {
  return contract.preferredSite ?? KIND_DEFAULT_SITE[contract.kind] ?? null;
}

function contractDeliveryLabel(contract: SkyContract): string {
  const site = contractDeliverySite(contract);
  return site ? SKY_SITE_LABELS[site] : 'Site non précisé';
}

function cargoCoversContract(ship: SkyAirship, contract: SkyContract): boolean {
  const req = contract.requirements;
  if (req.resources) {
    for (const [key, amount] of Object.entries(req.resources)) {
      const need = amount ?? 0;
      if (need <= 0) continue;
      const have = ship.cargo
        .filter((c) => c.kind === 'resource' && c.key === key)
        .reduce((s, c) => s + c.amount, 0);
      if (have < need) return false;
    }
  }
  if (req.materials) {
    for (const [key, amount] of Object.entries(req.materials)) {
      const need = amount ?? 0;
      if (need <= 0) continue;
      const have = ship.cargo
        .filter((c) => c.kind === 'material' && c.key === key)
        .reduce((s, c) => s + c.amount, 0);
      if (have < need) return false;
    }
  }
  if (req.commodities) {
    for (const [key, amount] of Object.entries(req.commodities)) {
      const need = amount ?? 0;
      if (need <= 0) continue;
      const have = ship.cargo
        .filter((c) => c.kind === 'commodity' && c.key === key)
        .reduce((s, c) => s + c.amount, 0);
      if (have < need) return false;
    }
  }
  return true;
}

const DISCOVERY_LABELS: Record<string, string> = {
  fossil_roots: 'Racines fossiles',
  clay_bank: 'Banc d’argile',
  fungiculture: 'Fungiculture',
  woolly_lichen: 'Lichen laineux',
  iron_vein: 'Veine de fer',
  crystal_geode: 'Géode de cristal',
  aether_breath: 'Souffle d’Éther',
  thermal_spring: 'Source thermale',
  natural_well: 'Puits naturel',
  ancient_workshop: 'Atelier ancien',
  sealed_chamber: 'Chambre scellée',
  unstable_fault: 'Faille instable',
};

const TABS: Array<{ id: UsTab; label: string }> = [
  { id: 'profondeurs', label: 'Profondeurs' },
  { id: 'alizes', label: 'Alizés' },
  { id: 'constructions', label: 'Construire' },
  { id: 'contrats', label: 'Contrats' },
];

const RESOURCE_ICONS: Partial<Record<ResourceType, CatanXIconName>> = {
  wood: 'wood',
  clay: 'brick',
  sheep: 'sheep',
  wheat: 'wheat',
  ore: 'ore',
};

interface UsConstructionRecipe {
  kind: UsBuildKind;
  label: string;
  family: string;
  description: string;
  prerequisite: string;
}

const UNDERGROUND_RECIPES: UsConstructionRecipe[] = [
  {
    kind: 'shaft',
    label: 'Puits',
    family: 'Accès',
    description: 'Relie une construction de surface au réseau souterrain.',
    prerequisite: 'Village, ville ou métropole de surface.',
  },
  {
    kind: 'tunnel',
    label: 'Tunnel',
    family: 'Réseau',
    description: 'Étend votre réseau vers une nouvelle caverne.',
    prerequisite: 'Une arête libre reliée à votre réseau.',
  },
  {
    kind: 'outpost',
    label: 'Avant-poste',
    family: 'Implantation',
    description: 'Exploite un site et compte pour la maîtrise des Profondeurs.',
    prerequisite: 'Une caverne révélée et reliée.',
  },
  {
    kind: 'extractor',
    label: 'Extracteur',
    family: 'Production',
    description: 'Renforce la production d’un avant-poste productif.',
    prerequisite: 'Un avant-poste sur un site productif.',
  },
  {
    kind: 'lift',
    label: 'Ascenseur',
    family: 'Passage',
    description: 'Ouvre une connexion spéciale entre les deux niveaux.',
    prerequisite: 'Un Puits naturel révélé avec une arête libre.',
  },
];

const SKY_RECIPES: UsConstructionRecipe[] = [
  {
    kind: 'airport',
    label: 'Aéroport',
    family: 'Infrastructure',
    description: 'Transforme une ville en base pour vos expéditions célestes.',
    prerequisite: 'Une ville ou métropole sans aéroport.',
  },
  {
    kind: 'airship',
    label: 'Dirigeable',
    family: 'Transport',
    description: 'Transporte deux éléments et parcourt deux liaisons par tour.',
    prerequisite: 'Un aéroport actif.',
  },
  {
    kind: 'beacon',
    label: 'Balise d’Éther',
    family: 'Navigation',
    description: 'Sécurise les routes aériennes et réduit certains trajets.',
    prerequisite: 'Un hub céleste révélé et libre.',
  },
  {
    kind: 'ether_sails',
    label: 'Voiles d’Éther',
    family: 'Amélioration',
    description: 'Ajoute un point de mouvement à un dirigeable.',
    prerequisite: 'Un dirigeable au sol sans voiles améliorées.',
  },
  {
    kind: 'reinforced_hold',
    label: 'Soute renforcée',
    family: 'Amélioration',
    description: 'Ajoute une place de cargaison à un dirigeable.',
    prerequisite: 'Un dirigeable au sol sans soute améliorée.',
  },
];

function ConstructionBook({
  recipes,
  resources,
  materials,
  availability,
  inventory,
  canAct,
}: {
  recipes: UsConstructionRecipe[];
  resources: ResourceBundle;
  materials: Partial<Record<UndergroundSkyMaterial, number>>;
  availability: Partial<Record<UsBuildKind, number>>;
  inventory: Partial<Record<UsBuildKind, { count: number; limit: number }>>;
  canAct: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <details
      className={styles.recipeBook}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <span>
          <small>Catalogue permanent</small>
          <strong>Recettes & constructions</strong>
        </span>
        <b>{recipes.length}</b>
      </summary>
      <div className={styles.recipeGrid}>
        {recipes.map((recipe) => {
          const cost = getBuildCost(recipe.kind);
          const slots = availability[recipe.kind] ?? 0;
          const stock = inventory[recipe.kind];
          const atLimit = Boolean(stock && stock.count >= stock.limit);
          const resourceReady = Object.entries(cost.resources).every(
            ([key, amount]) => (resources[key as ResourceType] ?? 0) >= (amount ?? 0),
          );
          const materialReady = Object.entries(cost.materials).every(
            ([key, amount]) =>
              (materials[key as UndergroundSkyMaterial] ?? 0) >= (amount ?? 0),
          );
          const affordable = resourceReady && materialReady;
          const ready = canAct && !atLimit && slots > 0 && affordable;
          const status = !canAct
            ? 'Consultable hors tour'
            : atLimit
              ? 'Réserve épuisée'
              : slots === 0
                ? 'Prérequis à remplir'
                : affordable
                  ? `${slots} emplacement${slots > 1 ? 's' : ''} disponible${slots > 1 ? 's' : ''}`
                  : 'Ressources manquantes';

          return (
            <article
              key={recipe.kind}
              className={styles.recipeCard}
              data-ready={ready ? '1' : '0'}
            >
              <header>
                <span className={styles.recipeSigil} data-kind={recipe.kind} aria-hidden="true" />
                <div>
                  <strong>{recipe.label}</strong>
                  <small>{recipe.family}</small>
                </div>
                {stock && <b>{stock.count}/{stock.limit}</b>}
              </header>
              <p>{recipe.description}</p>
              <div className={styles.recipeCost} aria-label={`Coût de ${recipe.label}`}>
                {Object.entries(cost.resources).map(([key, amount]) => {
                  const resource = key as ResourceType;
                  const owned = resources[resource] ?? 0;
                  const missing = owned < (amount ?? 0);
                  const icon = RESOURCE_ICONS[resource];
                  return (
                    <span key={key} data-missing={missing ? '1' : '0'}>
                      {icon && <Icon name={icon} size={12} />}
                      <em>{frResource(resource)}</em>
                      <b>{owned}/{amount}</b>
                    </span>
                  );
                })}
                {Object.entries(cost.materials).map(([key, amount]) => {
                  const material = key as UndergroundSkyMaterial;
                  const owned = materials[material] ?? 0;
                  return (
                    <span
                      key={key}
                      data-material={material}
                      data-missing={owned < (amount ?? 0) ? '1' : '0'}
                    >
                      <i aria-hidden="true">◆</i>
                      <em>{MATERIAL_LABELS[material]}</em>
                      <b>{owned}/{amount}</b>
                    </span>
                  );
                })}
              </div>
              <footer data-ready={ready ? '1' : '0'}>
                <span>{ready ? 'Prêt à construire' : status}</span>
                <small>{slots === 0 && !atLimit ? recipe.prerequisite : 'Coût de base'}</small>
              </footer>
            </article>
          );
        })}
      </div>
      <p className={styles.recipeNote}>
        Les réductions de site et les effets saisonniers sont appliqués automatiquement au moment de construire.
      </p>
    </details>
  );
}

function UsGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4.2 5.6c0-1.5 1.2-2.7 2.7-2.7.4 0 .8.1 1.1.3A2.5 2.5 0 0 1 12.4 5c1 .1 1.8 1 1.8 2H3.1c0-.8.5-1.4 1.1-1.4Z"
        opacity="0.9"
      />
      <path
        fill="currentColor"
        d="M3.2 12.2 6.4 8.6l1.8 1.9L11 7.4l5.2 4.8H3.2Z"
        opacity="0.78"
      />
      <path
        fill="currentColor"
        d="M10 11.2 12.1 14.8 10 17.4 7.9 14.8Z"
        opacity="0.95"
      />
    </svg>
  );
}

const REALM_ART: Record<UsTab, string> = {
  profondeurs: '/assets/ui/underground-sky/underground-depths-v1.webp',
  alizes: '/assets/ui/underground-sky/sky-aether-v1.webp',
  constructions: '/assets/ui/underground-sky/underground-depths-v1.webp',
  contrats: '/assets/ui/underground-sky/sky-contracts-v1.webp',
};

function RealmIllustration({ kind }: { kind: UsTab }) {
  return (
    <img
      className={styles.guideArt}
      src={REALM_ART[kind]}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
    />
  );
}

function RealmGuide({
  kind,
  kicker,
  title,
  description,
  steps,
  next,
}: {
  kind: UsTab;
  kicker: string;
  title: string;
  description: string;
  steps: string[];
  next: string;
}) {
  return (
    <section className={styles.realmGuide} data-kind={kind} aria-label={`Guide ${title}`}>
      <div className={styles.guideVisual}>
        <RealmIllustration kind={kind} />
        <span>{kicker}</span>
      </div>
      <div className={styles.guideCopy}>
        <h3>{title}</h3>
        <p>{description}</p>
        <ol>
          {steps.map((step, index) => (
            <li key={step}>
              <strong>{index + 1}</strong>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className={styles.nextMove}>
          <small>Votre prochaine étape</small>
          <strong>{next}</strong>
        </div>
      </div>
    </section>
  );
}

function playerName(state: GameState, id: string | null): string {
  if (!id) return 'Personne';
  return state.players.get(id)?.name ?? id.slice(-4);
}

function cargoLabel(item: Pick<AirshipCargoItem, 'kind' | 'key'>): string {
  if (item.kind === 'resource') return frResource(item.key as ResourceType);
  if (item.kind === 'commodity') return frCommodity(item.key as CkCommodity);
  return MATERIAL_LABELS[item.key as UndergroundSkyMaterial] ?? item.key;
}

function contractRequirementEntries(contract: SkyContract): DispatchCargo[] {
  const entries: DispatchCargo[] = [];
  for (const [key, amount] of Object.entries(contract.requirements.resources ?? {})) {
    if (amount) entries.push({ kind: 'resource', key: key as ResourceType, amount });
  }
  for (const [key, amount] of Object.entries(contract.requirements.materials ?? {})) {
    if (amount) entries.push({ kind: 'material', key: key as UndergroundSkyMaterial, amount });
  }
  for (const [key, amount] of Object.entries(contract.requirements.commodities ?? {})) {
    if (amount) entries.push({ kind: 'commodity', key: key as CkCommodity, amount });
  }
  return entries;
}

function requirementSummary(contract: {
  requirements: {
    resources?: Partial<Record<string, number>>;
    commodities?: Partial<Record<string, number>>;
    materials?: Partial<Record<UndergroundSkyMaterial, number>>;
  };
  rewardMaterial: UndergroundSkyMaterial;
  masteryPoints: number;
  victoryPoints: number;
}): string {
  const parts: string[] = [];
  const { resources, commodities, materials } = contract.requirements;
  if (resources) {
    for (const [key, n] of Object.entries(resources)) {
      if (n) parts.push(`${n} ${frResource(key as ResourceType)}`);
    }
  }
  if (commodities) {
    for (const [key, n] of Object.entries(commodities)) {
      if (n) parts.push(`${n} ${frCommodity(key as CkCommodity)}`);
    }
  }
  if (materials) {
    for (const [key, n] of Object.entries(materials)) {
      if (n) parts.push(`${n} ${MATERIAL_LABELS[key as UndergroundSkyMaterial] ?? key}`);
    }
  }
  const rewards: string[] = [`+${MATERIAL_LABELS[contract.rewardMaterial]}`];
  if (contract.masteryPoints > 0) rewards.push(`+${contract.masteryPoints} maîtrise`);
  if (contract.victoryPoints > 0) rewards.push(`+${contract.victoryPoints} PV`);
  return `${parts.length > 0 ? parts.join(' · ') : '—'} → ${rewards.join(' · ')}`;
}

export function UndergroundSkyPanel({
  gameState,
  playerId,
  open: controlledOpen,
  onOpenChange,
  canAct = true,
  activeLayer,
  onLayerChange,
  onSurveyCavern,
  onBuildShaft,
  onBuildTunnel,
  onBuildOutpost,
  onUpgradeExtractor,
  onBuildLift,
  onBuildAirport,
  onBuildAirship,
  onUpgradeAirship,
  onBuildBeacon,
  onDispatchAirship,
  onChooseThermalOutput,
  onChooseDiscoveryReward,
  onUnloadAirship,
  onCompleteContract,
}: UndergroundSkyPanelProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const [tab, setTab] = useState<UsTab>('profondeurs');
  const [dispatchShipId, setDispatchShipId] = useState<string | null>(null);
  const [dispatchHubId, setDispatchHubId] = useState('');
  const [cargoKind, setCargoKind] = useState<'resource' | 'material' | 'commodity'>('resource');
  const [cargoKey, setCargoKey] = useState('wheat');
  const [cargoAmount, setCargoAmount] = useState(1);
  const [dispatchCargo, setDispatchCargo] = useState<DispatchCargo[]>([]);
  const [trackedContractId, setTrackedContractId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fleetRef = useRef<HTMLElement>(null);

  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setLocalOpen(next);
  };

  const us = isUndergroundSkyEnabled(gameState)
    ? gameState.extensions?.undergroundSky
    : undefined;
  const myPending = us?.pendingResolutions.filter((r) => r.playerId === playerId) ?? [];
  const hasUrgent = myPending.length > 0;
  const player = gameState.players.get(playerId);
  const board = gameState.classicBoard;
  const ckEnabled = isCitiesKnightsEnabled(gameState);

  useEffect(() => {
    if (hasUrgent) setOpen(true);
  }, [hasUrgent]);

  useEffect(() => {
    if (activeLayer === 'underground') setTab('profondeurs');
    if (activeLayer === 'sky') setTab('alizes');
  }, [activeLayer]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [tab]);

  useEffect(() => {
    if (tab !== 'alizes' || !dispatchShipId) return;
    const frame = window.requestAnimationFrame(() => {
      fleetRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dispatchShipId, tab]);

  const surveyTargets = useMemo(() => {
    if (!us) return [] as string[];
    const hidden = getAdjacentHiddenNodeIds(us, playerId);
    const network = getPlayerUndergroundNodeIds(us, playerId);
    const revealed = new Set(us.revealedUndergroundNodeIds);
    for (const nodeId of network) {
      if (!revealed.has(nodeId) && !hidden.includes(nodeId)) hidden.push(nodeId);
    }
    return hidden.filter((nodeId) => canSurvey(gameState, playerId, nodeId).ok);
  }, [us, playerId, gameState]);

  const shaftOptions = useMemo(() => {
    if (!us || !board) return [] as Array<{ intersectionId: string; entryNodeId: string }>;
    const options: Array<{ intersectionId: string; entryNodeId: string }> = [];
    for (const [intersectionId, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId) continue;
      if (us.shafts.some((s) => s.intersectionId === intersectionId)) continue;
      const buildingId = board.buildingByIntersection[intersectionId];
      const building = buildingId ? gameState.buildings.get(buildingId) : undefined;
      if (!building) continue;
      if (!['settlement', 'city', 'metropolis'].includes(building.definitionId)) continue;
      const tileIds = board.topology.intersections[intersectionId]?.tileIds ?? [];
      for (const tileId of tileIds) {
        const node = Object.values(us.undergroundGraph.nodes).find(
          (n) => n.surfaceTileId === tileId,
        );
        if (node) {
          options.push({ intersectionId, entryNodeId: node.id });
          break;
        }
      }
    }
    return options;
  }, [us, board, playerId, gameState.buildings]);

  const tunnelEdges = useMemo(() => {
    if (!us) return [] as string[];
    return Object.keys(us.undergroundGraph.edges).filter(
      (edgeId) => canExtendTunnelToEdge(us, playerId, edgeId).ok,
    );
  }, [us, playerId]);

  const outpostNodes = useMemo(() => {
    if (!us) return [] as string[];
    const network = getPlayerUndergroundNodeIds(us, playerId);
    const occupied = new Set(us.outposts.map((o) => o.nodeId));
    return [...network].filter(
      (nodeId) =>
        !occupied.has(nodeId) && us.revealedUndergroundNodeIds.includes(nodeId),
    );
  }, [us, playerId]);

  const liftNodes = useMemo(() => {
    if (!us || !board) return [] as string[];
    const network = getPlayerUndergroundNodeIds(us, playerId);
    const used = new Set(us.lifts.map((l) => l.nodeId));
    return [...network].filter(
      (nodeId) => {
        const node = us.undergroundGraph.nodes[nodeId];
        if (!node || node.discovery !== 'natural_well' || !node.surfaceEdgeId) return false;
        return (
          !used.has(nodeId) &&
          us.revealedUndergroundNodeIds.includes(nodeId) &&
          !board.roadsByEdge[node.surfaceEdgeId] &&
          !us.lifts.some((lift) => lift.surfaceEdgeId === node.surfaceEdgeId)
        );
      },
    );
  }, [us, board, playerId]);

  const airportIntersections = useMemo(() => {
    if (!us || !board) return [] as string[];
    const list: string[] = [];
    for (const [intersectionId, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId) continue;
      if (us.airports.some((a) => a.intersectionId === intersectionId)) continue;
      const buildingId = board.buildingByIntersection[intersectionId];
      const building = buildingId ? gameState.buildings.get(buildingId) : undefined;
      if (!building) continue;
      if (building.definitionId !== 'city' && building.definitionId !== 'metropolis') continue;
      list.push(intersectionId);
    }
    return list;
  }, [us, board, playerId, gameState.buildings]);

  const beaconHubs = useMemo(() => {
    if (!us) return [] as string[];
    const taken = new Set(us.beacons.map((b) => b.hubId));
    return us.revealedSkyHubIds.filter((hubId) => !taken.has(hubId));
  }, [us]);

  const destinationHubs = useMemo(() => {
    if (!us) return [] as string[];
    return Object.keys(us.skyGraph.hubs);
  }, [us]);

  if (!us) return null;

  const hubLabel = (hubId: string): string => {
    const hub = us.skyGraph.hubs[hubId];
    const index = Math.max(0, destinationHubs.indexOf(hubId));
    return us.revealedSkyHubIds.includes(hubId) && hub
      ? SKY_SITE_LABELS[hub.site]
      : `Zone céleste inexplorée ${index + 1}`;
  };

  const materials = us.playerMaterials[playerId] ?? {};
  const crystal = materials.us_crystal ?? 0;
  const aether = materials.us_aether ?? 0;

  const shafts = us.shafts.filter((s) => s.playerId === playerId).length;
  const tunnels = us.tunnels.filter((t) => t.playerId === playerId).length;
  const outposts = us.outposts.filter((o) => o.playerId === playerId);
  const extractors = outposts.filter((o) => o.upgradedExtractor).length;
  const lifts = us.lifts.filter((l) => l.playerId === playerId).length;
  const airports = us.airports.filter((a) => a.playerId === playerId);
  const myAirships = us.airships.filter((a) => a.playerId === playerId);
  const selectedDispatchShip = myAirships.find((ship) => ship.id === dispatchShipId);
  const dispatchCargoCount = dispatchCargo.reduce((sum, item) => sum + item.amount, 0);
  const playerCommodities = gameState.extensions?.citiesKnights?.playerCommodities[playerId] ?? {};

  const availableCargoAmount = (kind: DispatchCargo['kind'], key: string): number => {
    if (kind === 'resource') return player?.resources[key as ResourceType] ?? 0;
    if (kind === 'commodity') return playerCommodities[key as CkCommodity] ?? 0;
    return materials[key as UndergroundSkyMaterial] ?? 0;
  };

  const addCargoToManifest = () => {
    if (!selectedDispatchShip || cargoAmount <= 0) return;
    const remainingCapacity = selectedDispatchShip.capacity - dispatchCargoCount;
    const alreadyQueued = dispatchCargo
      .filter((item) => item.kind === cargoKind && item.key === cargoKey)
      .reduce((sum, item) => sum + item.amount, 0);
    const amount = Math.min(
      cargoAmount,
      remainingCapacity,
      Math.max(0, availableCargoAmount(cargoKind, cargoKey) - alreadyQueued),
    );
    if (amount <= 0) return;
    setDispatchCargo((current) => {
      const existing = current.find((item) => item.kind === cargoKind && item.key === cargoKey);
      if (!existing) {
        return [...current, { kind: cargoKind, key: cargoKey, amount } as DispatchCargo];
      }
      return current.map((item) =>
        item === existing ? ({ ...item, amount: item.amount + amount } as DispatchCargo) : item,
      );
    });
    setCargoAmount(1);
  };
  const beacons = us.beacons.filter((b) => b.playerId === playerId).length;
  const productiveDiscoveries = new Set([
    'fossil_roots',
    'clay_bank',
    'fungiculture',
    'woolly_lichen',
    'iron_vein',
    'crystal_geode',
    'aether_breath',
    'thermal_spring',
    'ancient_workshop',
  ]);
  const extractorOptions = outposts.filter(
    (outpost) =>
      !outpost.upgradedExtractor &&
      productiveDiscoveries.has(us.undergroundGraph.nodes[outpost.nodeId]?.discovery ?? ''),
  );
  const groundedAirships = myAirships.filter((ship) => !ship.route);
  const etherSailOptions = groundedAirships.filter((ship) => !ship.etherSails);
  const holdOptions = groundedAirships.filter((ship) => !ship.reinforcedHold);

  const undergroundAvailability: Partial<Record<UsBuildKind, number>> = {
    shaft: shaftOptions.length,
    tunnel: tunnelEdges.length,
    outpost: outpostNodes.length,
    extractor: extractorOptions.length,
    lift: liftNodes.length,
  };
  const undergroundInventory: Partial<
    Record<UsBuildKind, { count: number; limit: number }>
  > = {
    shaft: { count: shafts, limit: US_PIECE_LIMITS.shafts },
    tunnel: { count: tunnels, limit: US_PIECE_LIMITS.tunnels },
    outpost: { count: outposts.length, limit: US_PIECE_LIMITS.outposts },
    extractor: { count: extractors, limit: US_PIECE_LIMITS.extractors },
    lift: { count: lifts, limit: US_PIECE_LIMITS.lifts },
  };
  const skyAvailability: Partial<Record<UsBuildKind, number>> = {
    airport: airportIntersections.length,
    airship: airports.filter((airport) => !airport.suspended).length,
    beacon: beaconHubs.length,
    ether_sails: etherSailOptions.length,
    reinforced_hold: holdOptions.length,
  };
  const skyInventory: Partial<Record<UsBuildKind, { count: number; limit: number }>> = {
    airport: { count: airports.length, limit: US_PIECE_LIMITS.airports },
    airship: { count: myAirships.length, limit: US_PIECE_LIMITS.airships },
    beacon: { count: beacons, limit: US_PIECE_LIMITS.beacons },
  };
  const hasUndergroundPlacement =
    canAct &&
    ((shafts < US_PIECE_LIMITS.shafts && shaftOptions.length > 0) ||
      (tunnels < US_PIECE_LIMITS.tunnels && tunnelEdges.length > 0) ||
      (outposts.length < US_PIECE_LIMITS.outposts && outpostNodes.length > 0) ||
      (extractors < US_PIECE_LIMITS.extractors && extractorOptions.length > 0) ||
      (lifts < US_PIECE_LIMITS.lifts && liftNodes.length > 0));
  const hasSkyPlacement =
    canAct &&
    ((airports.length < US_PIECE_LIMITS.airports && airportIntersections.length > 0) ||
      (myAirships.length < US_PIECE_LIMITS.airships &&
        airports.some((airport) => !airport.suspended)) ||
      (beacons < US_PIECE_LIMITS.beacons && beaconHubs.length > 0));

  const surveyUsed = Boolean(us.perTurnUsage[playerId]?.surveyUsed);
  const arrivedAirships = myAirships.filter(
    (ship) => ship.route === null && ship.currentHubId !== null,
  );
  const badgeCount = myPending.length + arrivedAirships.length;

  const ugScore = undergroundMasteryScore(gameState, playerId);
  const skyScore = skyMasteryScore(gameState, playerId);

  const pieceRows: Array<{ label: string; count: number; limit: number }> = [
    { label: 'Puits', count: shafts, limit: US_PIECE_LIMITS.shafts },
    { label: 'Tunnels', count: tunnels, limit: US_PIECE_LIMITS.tunnels },
    { label: 'Avant-postes', count: outposts.length, limit: US_PIECE_LIMITS.outposts },
    { label: 'Extracteurs', count: extractors, limit: US_PIECE_LIMITS.extractors },
    { label: 'Ascenseurs', count: lifts, limit: US_PIECE_LIMITS.lifts },
  ];

  const skyPieceRows: Array<{ label: string; count: number; limit: number }> = [
    { label: 'Aéroports', count: airports.length, limit: US_PIECE_LIMITS.airports },
    { label: 'Dirigeables', count: myAirships.length, limit: US_PIECE_LIMITS.airships },
    { label: 'Balises', count: beacons, limit: US_PIECE_LIMITS.beacons },
  ];

  const dockedForContract = myAirships.filter((s) => !s.route && s.cargo.length > 0);
  const coveringShipForContract = (contract: SkyContract): SkyAirship | undefined => {
    return myAirships.find((ship) => {
      if (ship.route || !cargoCoversContract(ship, contract)) return false;
      const site = contractDeliverySite(contract);
      if (site) {
        const hub = ship.currentHubId ? us.skyGraph.hubs[ship.currentHubId] : null;
        return hub?.site === site;
      }
      return true;
    });
  };
  const undergroundNext =
    shafts === 0
      ? 'Construisez un puits depuis l’un de vos villages ou villes.'
      : us.revealedUndergroundNodeIds.length === 0
        ? 'Prospectez une caverne adjacente à votre réseau.'
        : tunnels === 0
          ? 'Posez un tunnel pour étendre votre réseau.'
          : outposts.length === 0
            ? 'Fondez un avant-poste sur une caverne révélée.'
            : 'Développez vos extracteurs et visez 7 points de maîtrise.';
  const skyNext =
    airports.length === 0
      ? 'Transformez une ville en point de départ avec un aéroport.'
      : myAirships.length === 0
        ? 'Construisez votre premier dirigeable dans un aéroport.'
        : us.revealedSkyHubIds.length === 0
          ? 'Programmez un vol vers un hub céleste.'
          : 'Chargez une livraison, placez des balises et complétez un contrat.';

  let tabBody: ReactNode = null;
  if (tab === 'profondeurs') {
    tabBody = (
      <>
        <RealmGuide
          kind="profondeurs"
          kicker="Réseau d’exploration"
          title="Conquérir les profondeurs"
          description="Creusez depuis la surface, révélez les cavernes puis exploitez le Cristal sans perdre de vue votre réseau."
          steps={[
            'Relier un village ou une ville avec un puits.',
            'Prospecter une caverne, une fois par tour pour 1 blé.',
            'Étendre tunnels et avant-postes pour produire et gagner la maîtrise.',
          ]}
          next={undergroundNext}
        />
        <section className={styles.section} aria-label="Prospection">
          <h4>Prospection</h4>
          <p className={styles.meta}>
            {surveyUsed
              ? 'Relevé déjà effectué ce tour.'
              : 'Relevé disponible (1 blé · 1 / tour).'}
          </p>
          <p className={styles.meta} style={{ marginTop: 4 }}>
            Cavernes révélées : {us.revealedUndergroundNodeIds.length}/
            {Object.keys(us.undergroundGraph.nodes).length}
          </p>
          {canAct && onSurveyCavern && !surveyUsed && surveyTargets.length > 0 && (
            <ul className={styles.actionList}>
              {surveyTargets.slice(0, 6).map((nodeId, index) => (
                <li key={nodeId}>
                  <span>Caverne à prospecter {index + 1}</span>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => onSurveyCavern(nodeId)}
                  >
                    Prospecter
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button type="button" className={styles.constructionPortal} onClick={() => setTab('constructions')}>
          <span className={styles.recipeSigil} data-kind="shaft" aria-hidden="true" />
          <span>
            <small>Atelier dédié</small>
            <strong>Voir toutes les constructions</strong>
            <em>Recettes, réserves et emplacements valides</em>
          </span>
          <b>→</b>
        </button>

        <section className={styles.section} aria-label="Pièces souterraines">
          <h4>Réseau souterrain</h4>
          <ul className={styles.statList}>
            {pieceRows.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <strong>
                  {row.count}/{row.limit}
                </strong>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-label="Maîtrise des profondeurs">
          <h4>Maîtrise</h4>
          <div className={styles.masteryCard}>
            <small>Maître des Profondeurs · seuil {UNDERGROUND_MASTERY_THRESHOLD} · 2 PV</small>
            <strong>
              Votre score {ugScore}
              {us.undergroundMasteryOwnerId === playerId ? ' · titre détenu' : ''}
            </strong>
            <span>Détenteur : {playerName(gameState, us.undergroundMasteryOwnerId)}</span>
          </div>
        </section>
      </>
    );
  } else if (tab === 'alizes') {
    tabBody = (
      <>
        <RealmGuide
          kind="alizes"
          kicker="Commerce aérien"
          title="Maîtriser les alizés"
          description="Les dirigeables transportent vos ressources entre les hubs. Leurs cargaisons permettent d’honorer les contrats."
          steps={[
            'Construire un aéroport sur une ville ou une métropole.',
            'Créer un dirigeable puis programmer sa destination et sa cargaison.',
            'Décharger au hub, poser des balises et livrer les contrats.',
          ]}
          next={skyNext}
        />
        <section className={styles.skyWorkflow} aria-label="Cycle d’une expédition">
          {[
            ['1', 'Construire', 'Aéroport puis dirigeable'],
            ['2', 'Charger', 'Une ou plusieurs matières'],
            ['3', 'Naviguer', 'Choisir un site lisible'],
            ['4', 'Livrer', 'Valider un contrat amarré'],
          ].map(([step, title, detail]) => (
            <div key={step}><b>{step}</b><span><strong>{title}</strong><small>{detail}</small></span></div>
          ))}
        </section>
        <button
          type="button"
          className={styles.fleetPortal}
          onClick={() => {
            if (myAirships.length === 0) {
              setTab('constructions');
              return;
            }
            const ship = groundedAirships[0];
            if (ship) {
              setDispatchShipId(ship.id);
              setDispatchHubId(
                destinationHubs.find((hubId) => hubId !== ship.currentHubId) ?? '',
              );
              setDispatchCargo([]);
            } else {
              fleetRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
          }}
        >
          <span className={styles.recipeSigil} data-kind="airship" aria-hidden="true" />
          <span>
            <small>Accès permanent</small>
            <strong>{myAirships.length > 0 ? 'Ouvrir ma flotte et mes plans de vol' : 'Construire mon premier dirigeable'}</strong>
          </span>
          <b>{myAirships.length > 0 ? `${groundedAirships.length} à quai` : '→'}</b>
        </button>
        <button type="button" className={styles.constructionPortal} onClick={() => setTab('constructions')}>
          <span className={styles.recipeSigil} data-kind="airship" aria-hidden="true" />
          <span>
            <small>Atelier dédié</small>
            <strong>Voir toutes les constructions</strong>
            <em>Aéroports, dirigeables, balises et améliorations</em>
          </span>
          <b>→</b>
        </button>

        <section className={styles.section} aria-label="Pièces aériennes">
          <h4>Réseau aérien</h4>
          <ul className={styles.statList}>
            {skyPieceRows.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <strong>
                  {row.count}/{row.limit}
                </strong>
              </li>
            ))}
          </ul>
          <p className={styles.meta} style={{ marginTop: 6 }}>
            Hubs révélés : {us.revealedSkyHubIds.length}/{Object.keys(us.skyGraph.hubs).length}
          </p>
        </section>

        <section ref={fleetRef} className={`${styles.section} ${styles.fleetSection}`} aria-label="Dirigeables">
          <h4>Dirigeables</h4>
          {myAirships.length === 0 ? (
            <p className={styles.empty}>Aucun dirigeable.</p>
          ) : (
            <ul className={styles.shipList}>
              {myAirships.map((ship) => {
                const eta = ship.route?.etaTurns;
                const status =
                  ship.route != null
                    ? `Vers ${hubLabel(ship.route.destinationHubId)} · ETA ${eta ?? '?'} tour${(eta ?? 0) > 1 ? 's' : ''}`
                    : ship.currentHubId
                      ? `Amarré · ${hubLabel(ship.currentHubId)}`
                      : 'À l’aéroport';
                const cargoCount = ship.cargo.reduce((sum, c) => sum + c.amount, 0);
                return (
                  <li key={ship.id}>
                    <div className={styles.shipMeta}>
                      <span>
                        Capacité {ship.capacity}
                        {ship.etherSails ? ' · voiles d’éther' : ''}
                        {ship.reinforcedHold ? ' · cale renforcée' : ''}
                      </span>
                      <small>
                        {status}
                        {cargoCount > 0 ? ` · cargaison ${cargoCount}` : ''}
                      </small>
                    </div>
                    <strong>{eta != null ? `${eta}t` : ship.currentHubId ? '✓' : '—'}</strong>
                    <div className={styles.shipActions}>
                      {canAct &&
                        onUnloadAirship &&
                        !ship.route &&
                        ship.cargo.length > 0 &&
                        isAirshipAtHomeAirport(gameState, ship) && (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => onUnloadAirship(ship.id)}
                        >
                          Décharger
                        </button>
                      )}
                      {canAct && onDispatchAirship && !ship.route && (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => {
                            setDispatchShipId(ship.id);
                            setDispatchHubId(
                              destinationHubs.find((hubId) => hubId !== ship.currentHubId) ?? '',
                            );
                            setDispatchCargo([]);
                          }}
                        >
                          Expédier
                        </button>
                      )}
                      {canAct && onUpgradeAirship && !ship.etherSails && (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => onUpgradeAirship(ship.id, 'ether_sails')}
                        >
                          Voiles
                        </button>
                      )}
                      {canAct && onUpgradeAirship && !ship.reinforcedHold && (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => onUpgradeAirship(ship.id, 'reinforced_hold')}
                        >
                          Soute
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {dispatchShipId && canAct && onDispatchAirship && (
            <div className={styles.dispatchForm}>
              <div className={styles.dispatchHeading}>
                <span className={styles.recipeSigil} data-kind="airship" aria-hidden="true" />
                <span>
                  <small>Plan de vol</small>
                  <strong>
                    Dirigeable {Math.max(1, myAirships.findIndex((ship) => ship.id === dispatchShipId) + 1)}
                  </strong>
                </span>
                <b>{dispatchCargoCount}/{selectedDispatchShip?.capacity ?? 0}</b>
              </div>
              <label className={styles.field}>
                <span>Destination</span>
                <select
                  value={dispatchHubId}
                  onChange={(e) => setDispatchHubId(e.target.value)}
                >
                  {destinationHubs
                    .filter((hubId) => hubId !== selectedDispatchShip?.currentHubId)
                    .map((hubId) => (
                      <option key={hubId} value={hubId}>
                        {hubLabel(hubId)}
                      </option>
                    ))}
                </select>
              </label>
              <div className={styles.destinationPreview}>
                <span aria-hidden="true">↗</span>
                <div>
                  <small>Destination programmée</small>
                  <strong>{dispatchHubId ? hubLabel(dispatchHubId) : 'Choisissez une destination'}</strong>
                  <p>
                    {dispatchHubId && us.revealedSkyHubIds.includes(dispatchHubId)
                      ? 'Site connu · le dirigeable restera amarré à l’arrivée.'
                      : 'Exploration · le type de site sera révélé à l’arrivée.'}
                  </p>
                </div>
              </div>
              <label className={styles.field}>
                <span>Ajouter à la soute</span>
                <div className={styles.cargoRow}>
                  <select
                    value={cargoKind}
                    onChange={(e) => {
                      const kind = e.target.value as typeof cargoKind;
                      setCargoKind(kind);
                      if (kind === 'resource') setCargoKey('wheat');
                      else if (kind === 'material') setCargoKey('us_crystal');
                      else setCargoKey('ck_cloth');
                    }}
                  >
                    <option value="resource">Ressource</option>
                    <option value="material">Matériau</option>
                    {ckEnabled && <option value="commodity">Marchandise</option>}
                  </select>
                  <select value={cargoKey} onChange={(e) => setCargoKey(e.target.value)}>
                    {cargoKind === 'resource' &&
                      ['wood', 'clay', 'sheep', 'wheat', 'ore'].map((key) => (
                        <option key={key} value={key}>
                          {frResource(key as ResourceType)} · {player?.resources[key as keyof typeof player.resources] ?? 0}
                        </option>
                      ))}
                    {cargoKind === 'material' &&
                      (['us_crystal', 'us_aether'] as UndergroundSkyMaterial[]).map((key) => (
                        <option key={key} value={key}>
                          {MATERIAL_LABELS[key]} · {materials[key] ?? 0}
                        </option>
                      ))}
                    {cargoKind === 'commodity' &&
                      (['ck_cloth', 'ck_coin', 'ck_paper'] as const).map((key) => (
                        <option key={key} value={key}>
                          {frCommodity(key)} · {playerCommodities[key] ?? 0}
                        </option>
                      ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    value={cargoAmount}
                    onChange={(e) => setCargoAmount(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <button
                    type="button"
                    className={styles.addCargoBtn}
                    onClick={addCargoToManifest}
                    disabled={
                      !selectedDispatchShip ||
                      dispatchCargoCount >= selectedDispatchShip.capacity ||
                      availableCargoAmount(cargoKind, cargoKey) <= 0
                    }
                  >
                    Ajouter
                  </button>
                </div>
              </label>
              <div className={styles.manifest} aria-label="Cargaison préparée">
                <div className={styles.manifestTitle}>
                  <strong>Manifeste de soute</strong>
                  <span>Plusieurs matériaux peuvent être combinés</span>
                </div>
                {dispatchCargo.length === 0 ? (
                  <p>Soute vide · l’expédition peut partir sans cargaison.</p>
                ) : (
                  <ul>
                    {dispatchCargo.map((item) => (
                      <li key={`${item.kind}-${item.key}`}>
                        <span>{cargoLabel(item)}</span>
                        <strong>× {item.amount}</strong>
                        <button
                          type="button"
                          aria-label={`Retirer ${cargoLabel(item)}`}
                          onClick={() =>
                            setDispatchCargo((current) => current.filter((entry) => entry !== item))
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={styles.pendingActions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => {
                    onDispatchAirship(dispatchShipId, dispatchHubId, dispatchCargo);
                    setDispatchShipId(null);
                    setDispatchCargo([]);
                  }}
                  disabled={!dispatchHubId}
                >
                  Lancer
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => {
                    setDispatchShipId(null);
                    setDispatchCargo([]);
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </section>

        <section className={styles.section} aria-label="Balises">
          <h4>Balises</h4>
          {beacons === 0 ? (
            <p className={styles.empty}>Aucune balise placée.</p>
          ) : (
            <ul className={styles.statList}>
              {us.beacons
                .filter((b) => b.playerId === playerId)
                .map((beacon, index) => (
                  <li key={beacon.id}>
                    <span>Balise {index + 1}</span>
                    <strong>{hubLabel(beacon.hubId)}</strong>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className={styles.section} aria-label="Maîtrise des alizés">
          <h4>Maîtrise</h4>
          <div className={styles.masteryCard}>
            <small>Maître des Alizés · seuil {SKY_MASTERY_THRESHOLD} · 2 PV</small>
            <strong>
              Votre score {skyScore}
              {us.skyMasteryOwnerId === playerId ? ' · titre détenu' : ''}
            </strong>
            <span>Détenteur : {playerName(gameState, us.skyMasteryOwnerId)}</span>
          </div>
        </section>
      </>
    );
  } else if (tab === 'constructions') {
    tabBody = (
      <>
        <section className={styles.workshopHero}>
          <span className={styles.recipeSigil} data-kind="airship" aria-hidden="true" />
          <div>
            <small>Atelier Souterrain &amp; Ciel</small>
            <h3>Toutes vos constructions, au même endroit</h3>
            <p>Consultez les recettes, vérifiez vos réserves puis choisissez un emplacement lisible — aucun identifiant technique n’est affiché.</p>
          </div>
        </section>

        <section className={styles.buildRealm} data-build-realm="underground">
          <header>
            <div><small>Royaume I</small><strong>Profondeurs</strong></div>
            <b>{hasUndergroundPlacement ? 'Actions disponibles' : 'À préparer'}</b>
          </header>
          <ConstructionBook
            recipes={UNDERGROUND_RECIPES}
            resources={player?.resources ?? {}}
            materials={materials}
            availability={undergroundAvailability}
            inventory={undergroundInventory}
            canAct={canAct}
          />
          <div className={styles.placementTitle}><strong>Emplacements valides</strong><span>Choisissez une destination</span></div>
          {canAct && onBuildShaft && shafts < US_PIECE_LIMITS.shafts && shaftOptions.length > 0 && (
            <ul className={styles.actionList}>{shaftOptions.slice(0, 4).map((option, index) => (
              <li key={`${option.intersectionId}-${option.entryNodeId}`}><span>Accès de surface {index + 1}</span><button type="button" className={styles.actionBtn} onClick={() => onBuildShaft(option.intersectionId, option.entryNodeId)}>Construire le puits</button></li>
            ))}</ul>
          )}
          {canAct && onBuildTunnel && tunnels < US_PIECE_LIMITS.tunnels && tunnelEdges.length > 0 && (
            <ul className={styles.actionList}>{tunnelEdges.slice(0, 4).map((edgeId, index) => (
              <li key={edgeId}><span>Liaison souterraine {index + 1}</span><button type="button" className={styles.actionBtn} onClick={() => onBuildTunnel(edgeId)}>Creuser le tunnel</button></li>
            ))}</ul>
          )}
          {canAct && onBuildOutpost && outposts.length < US_PIECE_LIMITS.outposts && outpostNodes.length > 0 && (
            <ul className={styles.actionList}>{outpostNodes.slice(0, 4).map((nodeId, index) => (
              <li key={nodeId}><span>Caverne révélée {index + 1}</span><button type="button" className={styles.actionBtn} onClick={() => onBuildOutpost(nodeId)}>Fonder l’avant-poste</button></li>
            ))}</ul>
          )}
          {canAct && onUpgradeExtractor && extractors < US_PIECE_LIMITS.extractors && extractorOptions.length > 0 && (
            <ul className={styles.actionList}>{extractorOptions.slice(0, 3).map((outpost, index) => (
              <li key={outpost.id}><span>Avant-poste productif {index + 1}</span><button type="button" className={styles.actionBtn} onClick={() => onUpgradeExtractor(outpost.id)}>Installer l’extracteur</button></li>
            ))}</ul>
          )}
          {canAct && onBuildLift && lifts < US_PIECE_LIMITS.lifts && liftNodes.length > 0 && (
            <ul className={styles.actionList}>{liftNodes.slice(0, 3).map((nodeId, index) => (
              <li key={nodeId}><span>Puits naturel {index + 1}</span><button type="button" className={styles.actionBtn} onClick={() => onBuildLift(nodeId)}>Installer l’ascenseur</button></li>
            ))}</ul>
          )}
          {!hasUndergroundPlacement && <p className={styles.empty}>Aucun emplacement souterrain valide pour le moment. Les recettes restent consultables.</p>}
        </section>

        <section className={styles.buildRealm} data-build-realm="sky">
          <header>
            <div><small>Royaume II</small><strong>Alizés</strong></div>
            <b>{hasSkyPlacement ? 'Actions disponibles' : 'À préparer'}</b>
          </header>
          <ConstructionBook
            recipes={SKY_RECIPES}
            resources={player?.resources ?? {}}
            materials={materials}
            availability={skyAvailability}
            inventory={skyInventory}
            canAct={canAct}
          />
          <div className={styles.placementTitle}><strong>Emplacements valides</strong><span>Choisissez une destination</span></div>
          {canAct && onBuildAirport && airports.length < US_PIECE_LIMITS.airports && airportIntersections.length > 0 && (
            <ul className={styles.actionList}>{airportIntersections.slice(0, 4).map((intersectionId, index) => (
              <li key={intersectionId}><span>Ville éligible {index + 1}</span><button type="button" className={styles.actionBtn} onClick={() => onBuildAirport(intersectionId)}>Construire l’aéroport</button></li>
            ))}</ul>
          )}
          {canAct && onBuildAirship && myAirships.length < US_PIECE_LIMITS.airships && airports.some((airport) => !airport.suspended) && (
            <ul className={styles.actionList}>{airports.filter((airport) => !airport.suspended).slice(0, 4).map((airport, index) => (
              <li key={airport.id}><span>Aéroport actif {index + 1}</span><button type="button" className={styles.actionBtn} onClick={() => onBuildAirship(airport.id)}>Assembler le dirigeable</button></li>
            ))}</ul>
          )}
          {canAct && onBuildBeacon && beacons < US_PIECE_LIMITS.beacons && beaconHubs.length > 0 && (
            <ul className={styles.actionList}>{beaconHubs.slice(0, 4).map((hubId) => (
              <li key={hubId}><span>{hubLabel(hubId)}</span><button type="button" className={styles.actionBtn} onClick={() => onBuildBeacon(hubId)}>Poser la balise</button></li>
            ))}</ul>
          )}
          {canAct && onUpgradeAirship && etherSailOptions.length > 0 && (
            <ul className={styles.actionList}>{etherSailOptions.map((ship) => (
              <li key={`sails-${ship.id}`}><span>Dirigeable {myAirships.indexOf(ship) + 1}</span><button type="button" className={styles.actionBtn} onClick={() => onUpgradeAirship(ship.id, 'ether_sails')}>Ajouter les voiles d’Éther</button></li>
            ))}</ul>
          )}
          {canAct && onUpgradeAirship && holdOptions.length > 0 && (
            <ul className={styles.actionList}>{holdOptions.map((ship) => (
              <li key={`hold-${ship.id}`}><span>Dirigeable {myAirships.indexOf(ship) + 1}</span><button type="button" className={styles.actionBtn} onClick={() => onUpgradeAirship(ship.id, 'reinforced_hold')}>Renforcer la soute</button></li>
            ))}</ul>
          )}
          {!hasSkyPlacement && etherSailOptions.length === 0 && holdOptions.length === 0 && <p className={styles.empty}>Aucun emplacement aérien valide pour le moment. Les recettes restent consultables.</p>}
        </section>
      </>
    );
  } else {
    const faceUp = [
      ...us.faceUpRegularContracts,
      ...(us.faceUpMajorContract ? [us.faceUpMajorContract] : []),
    ];
    const completedRegular = us.completedRegularContracts[playerId] ?? 0;
    const completedMajor = us.completedMajorContracts[playerId];

    tabBody = (
      <>
        <RealmGuide
          kind="contrats"
          kicker="Livraisons célestes"
          title="Transformer les vols en victoire"
          description="Un contrat est une commande publique : réunissez sa cargaison, transportez-la puis livrez-la depuis un dirigeable amarré."
          steps={[
            'Choisir une commande visible et réunir les ressources demandées.',
            'Charger un dirigeable (à quai ou en vol) et rejoindre le hub indiqué.',
            'Livrer uniquement depuis la soute d’un dirigeable amarré.',
          ]}
          next={
            dockedForContract.length > 0
              ? 'Une cargaison est amarrée : vérifiez les contrats livrables.'
              : 'Construisez un aéroport et un dirigeable avant de viser les contrats.'
          }
        />
        <section className={styles.section} aria-label="Contrats visibles">
          <h4>Face visible</h4>
          {faceUp.length === 0 ? (
            <p className={styles.empty}>Aucun contrat disponible.</p>
          ) : (
            <ul className={styles.contractList}>
              {faceUp.map((contract) => {
                const covering = coveringShipForContract(contract);
                const deliverable = Boolean(covering);
                const rewardChoices = contract.rewardClassicChoices;
                const requirements = contractRequirementEntries(contract);
                const totalRequired = requirements.reduce((sum, item) => sum + item.amount, 0);
                const prepared = requirements.reduce((sum, item) => {
                  const inHand = availableCargoAmount(item.kind, item.key);
                  const inShips = myAirships.reduce(
                    (shipTotal, ship) =>
                      shipTotal +
                      ship.cargo
                        .filter((cargo) => cargo.kind === item.kind && cargo.key === item.key)
                        .reduce((cargoTotal, cargo) => cargoTotal + cargo.amount, 0),
                    0,
                  );
                  return sum + Math.min(item.amount, inHand + inShips);
                }, 0);
                const loaded = Math.max(
                  0,
                  ...myAirships.map((ship) =>
                    requirements.reduce((sum, item) => {
                      const amount = ship.cargo
                        .filter((cargo) => cargo.kind === item.kind && cargo.key === item.key)
                        .reduce((cargoTotal, cargo) => cargoTotal + cargo.amount, 0);
                      return sum + Math.min(item.amount, amount);
                    }, 0),
                  ),
                );
                const preparationPercent = totalRequired > 0 ? Math.round((prepared / totalRequired) * 100) : 100;
                const cargoPercent = totalRequired > 0 ? Math.round((loaded / totalRequired) * 100) : 100;
                const tracked = trackedContractId === contract.id;
                return (
                <li key={contract.id} data-tracked={tracked ? '1' : '0'}>
                  <div className={styles.contractKind}>
                    <strong>
                      {CONTRACT_KIND_LABELS[contract.kind]}
                      {contract.isMajor ? ' · Majeur' : ''}
                    </strong>
                    <small>{requirementSummary(contract)}</small>
                    <div className={styles.contractDestination}>
                      <span aria-hidden="true">↗</span>
                      <div>
                        <small>Livraison obligatoire</small>
                        <strong>{contractDeliveryLabel(contract)}</strong>
                      </div>
                    </div>
                    {!covering && (
                      <small>Livraison via soute de dirigeable uniquement.</small>
                    )}
                    <div className={styles.contractProgress}>
                      <div>
                        <span><b>Préparé</b><em>{prepared}/{totalRequired}</em></span>
                        <i><b style={{ width: `${preparationPercent}%` }} /></i>
                      </div>
                      <div>
                        <span><b>En soute</b><em>{loaded}/{totalRequired}</em></span>
                        <i><b style={{ width: `${cargoPercent}%` }} /></i>
                      </div>
                    </div>
                    <ul className={styles.requirementList}>
                      {requirements.map((item) => (
                        <li key={`${item.kind}-${item.key}`}>
                          <span>{cargoLabel(item)}</span>
                          <strong>{Math.min(item.amount, availableCargoAmount(item.kind, item.key))}/{item.amount}</strong>
                        </li>
                      ))}
                    </ul>
                    {contract.isMajor && completedRegular < 2 && (
                      <small>Débloqué après 2 contrats réguliers · {completedRegular}/2</small>
                    )}
                  </div>
                  <div className={styles.badgeRow}>
                    {contract.isMajor ? (
                      <Badge variant="gold">Majeur</Badge>
                    ) : (
                      <Badge variant="neutral">Régulier</Badge>
                    )}
                    {covering && <Badge variant="neutral">Soute prête</Badge>}
                    <button
                      type="button"
                      className={styles.trackBtn}
                      aria-pressed={tracked}
                      onClick={() => setTrackedContractId(tracked ? null : contract.id)}
                    >
                      {tracked ? '✓ Contrat suivi' : 'Suivre ce contrat'}
                    </button>
                    {tracked && (
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => {
                          const ship =
                            groundedAirships.find((candidate) =>
                              isAirshipAtHomeAirport(gameState, candidate),
                            ) ?? groundedAirships[0];
                          if (!ship) {
                            setTab(myAirships.length === 0 ? 'constructions' : 'alizes');
                            return;
                          }
                          let remaining = ship.capacity;
                          const manifest: DispatchCargo[] = [];
                          for (const item of requirements) {
                            const amount = Math.min(
                              item.amount,
                              availableCargoAmount(item.kind, item.key),
                              remaining,
                            );
                            if (amount > 0) {
                              manifest.push({ ...item, amount } as DispatchCargo);
                              remaining -= amount;
                            }
                            if (remaining <= 0) break;
                          }
                          const deliverySite = contractDeliverySite(contract);
                          const preferredHub = deliverySite
                            ? destinationHubs.find(
                                (hubId) =>
                                  us.revealedSkyHubIds.includes(hubId) &&
                                  us.skyGraph.hubs[hubId]?.site === deliverySite,
                              )
                            : undefined;
                          setDispatchShipId(ship.id);
                          setDispatchHubId(
                            preferredHub ??
                              destinationHubs.find((hubId) => hubId !== ship.currentHubId) ??
                              '',
                          );
                          setDispatchCargo(manifest);
                          setTab('alizes');
                        }}
                      >
                        {myAirships.length === 0 ? 'Construire un dirigeable' : 'Préparer le vol'}
                      </button>
                    )}
                    {canAct && onCompleteContract && deliverable && rewardChoices.length <= 1 && (
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() =>
                          onCompleteContract(contract.id, {
                            airshipId: covering?.id,
                            rewardClassic: rewardChoices[0],
                          })
                        }
                      >
                        Livrer
                      </button>
                    )}
                    {canAct &&
                      onCompleteContract &&
                      deliverable &&
                      rewardChoices.length > 1 &&
                      rewardChoices.map((resource) => (
                        <button
                          key={resource}
                          type="button"
                          className={styles.actionBtn}
                          onClick={() =>
                            onCompleteContract(contract.id, {
                              airshipId: covering?.id,
                              rewardClassic: resource,
                            })
                          }
                        >
                          Livrer · {frResource(resource)}
                        </button>
                      ))}
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.section} aria-label="Progression contrats">
          <h4>Vos contrats</h4>
          <ul className={styles.statList}>
            <li>
              <span>Réguliers complétés</span>
              <strong>{completedRegular}</strong>
            </li>
            <li>
              <span>Contrat majeur</span>
              <strong>{completedMajor ? 'Oui' : '—'}</strong>
            </li>
          </ul>
        </section>
      </>
    );
  }

  return (
    <aside
      className={styles.dock}
      data-hud-zone="extensions"
      data-extension="underground-sky"
      data-expanded={open ? 'true' : 'false'}
      aria-label="Extensions"
    >
      <button
        type="button"
        className={styles.launcher}
        aria-expanded={open}
        aria-label={`${open ? 'Fermer' : 'Ouvrir'} Souterrain et Ciel`}
        title="Souterrain & Ciel"
        onClick={() => {
          if (!open) setOpen(true);
          else if (!hasUrgent) setOpen(false);
        }}
      >
        <span className={styles.iconHalo} aria-hidden="true">
          <UsGlyph className={styles.glyph} />
        </span>
        {badgeCount > 0 && (
          <span className={styles.pendingBadge} aria-label={`${badgeCount} alertes`}>
            {badgeCount}
          </span>
        )}
        <span className={styles.tooltip} role="tooltip">
          <small>Extension</small>
          <strong>Souterrain &amp; Ciel</strong>
        </span>
      </button>

      {open && (
        <section className={styles.panel} aria-label="Souterrain et Ciel" data-realm={tab}>
          <header className={styles.header}>
            <div className={styles.realmArt} aria-hidden="true">
              <span className={styles.stratum} />
              <span className={styles.crystalIcon} />
              <span className={styles.cloudIcon} />
            </div>
            <div className={styles.headerRow}>
              <div className={styles.headerBrand}>
                <span className={styles.headerIcon} aria-hidden="true">
                  <UsGlyph className={styles.glyph} />
                </span>
                <div>
                  <span>Extension</span>
                  <h3>Souterrain &amp; Ciel</h3>
                </div>
              </div>
              <button
                type="button"
                className={styles.collapseBtn}
                aria-expanded={true}
                aria-label="Réduire le panneau Souterrain et Ciel"
                onClick={() => setOpen(false)}
                disabled={hasUrgent}
                title={hasUrgent ? 'Résolvez le choix en cours avant de réduire' : 'Réduire'}
              >
                Réduire
              </button>
            </div>
            <div className={styles.materialStrip}>
              <div className={styles.materialChip} data-material="crystal">
                <span className={styles.materialGem} aria-hidden="true" />
                <span className={styles.materialCopy}>
                  <small>Profondeurs</small>
                  {MATERIAL_LABELS.us_crystal}
                </span>
                <strong>{crystal}</strong>
              </div>
              <div className={styles.materialChip} data-material="aether">
                <span className={styles.materialGem} aria-hidden="true" />
                <span className={styles.materialCopy}>
                  <small>Alizés</small>
                  {MATERIAL_LABELS.us_aether}
                </span>
                <strong>{aether}</strong>
              </div>
            </div>
          </header>

          <div className={styles.tabsWrap}>
            <Tabs
              items={TABS}
              value={tab}
              onChange={(id) => {
                const next = id as UsTab;
                setTab(next);
                if (next === 'profondeurs') onLayerChange?.('underground');
                if (next === 'alizes') onLayerChange?.('sky');
              }}
            />
          </div>

          <div ref={bodyRef} className={styles.body}>
            {myPending.length > 0 && (
              <section className={styles.pending} aria-label="Résolutions en attente">
                <h4>Choix en attente</h4>
                {myPending.map((resolution, index) => {
                  if (resolution.kind === 'thermal_output') {
                    return (
                      <div key={`thermal-${index}`} className={styles.pendingBlock}>
                        <p className={styles.pendingHint}>
                          Source thermale — choisissez la production définitive.
                        </p>
                        <div className={styles.pendingActions}>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() =>
                              onChooseThermalOutput?.(resolution.outpostId, 'wheat')
                            }
                          >
                            Blé
                          </button>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() =>
                              onChooseThermalOutput?.(resolution.outpostId, 'sheep')
                            }
                          >
                            Mouton
                          </button>
                        </div>
                      </div>
                    );
                  }
                  if (resolution.kind === 'sky_material_choice') {
                    return (
                      <div key={`sky-${index}`} className={styles.pendingBlock}>
                        <p className={styles.pendingHint}>
                          Ruines suspendues — choisissez un matériau.
                        </p>
                        <div className={styles.pendingActions}>
                          {resolution.choices.map((choice) => (
                            <button
                              key={choice}
                              type="button"
                              className={styles.actionBtn}
                              onClick={() =>
                                onChooseDiscoveryReward?.(resolution.hubId, choice)
                              }
                            >
                              {MATERIAL_LABELS[choice as UndergroundSkyMaterial] ?? choice}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={`disc-${index}`} className={styles.pendingBlock}>
                      <p className={styles.pendingHint}>
                        Découverte — récompense à choisir ({DISCOVERY_LABELS[resolution.discovery] ?? resolution.discovery}).
                      </p>
                      <div className={styles.pendingActions}>
                        {resolution.choices.map((choice) => (
                          <button
                            key={String(choice)}
                            type="button"
                            className={styles.actionBtn}
                            onClick={() =>
                              onChooseDiscoveryReward?.(resolution.nodeId, String(choice))
                            }
                          >
                            {MATERIAL_LABELS[choice as UndergroundSkyMaterial] ??
                              String(choice)}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
            {tabBody}
          </div>
        </section>
      )}
    </aside>
  );
}
