import { useMemo, useState } from 'react';
import type { ActionLogEntry, GameState } from '@catanx/engine';
import type { SeasonToken } from '../design/tokens';
import { PlayableCardHand } from '../components/HUD/PlayableCardHand';
import { TurnRecap } from '../components/HUD/TurnRecap';
import { CkMoment } from '../components/HUD/CkMoment';
import { SeasonTransitionMoment } from '../components/HUD/SeasonTransitionMoment';
import { OpponentPrepShelf } from '../components/HUD/OpponentPrepShelf';
import { ResourceBar } from '../components/HUD/ResourceBar';
import { SeasonWidget } from '../components/HUD/SeasonWidget';
import { TurnActionPlanner } from '../components/HUD/TurnActionPlanner';
import { BankTradePanel } from '../components/Panels/BankTradePanel';
import { PlayerTradePanel } from '../components/Panels/PlayerTradePanel';
import { PlayerProfileCard } from '../components/Profile/PlayerProfileCard';
import { ProfileAvatar } from '../components/Profile/ProfileAvatar';
import { ProfileCustomizerModal } from '../components/Profile/ProfileCustomizerModal';
import { PORTRAITS, createDefaultProfile, normalizeProfile } from '../profile/profileCatalog';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { Icon } from './icons/Icon';
import { ICON_NAMES } from './icons/names';
import { IconButton } from './IconButton';
import { ModalShell } from './ModalShell';
import { Panel } from './Panel';
import { Progress } from './Progress';
import { Tabs } from './Tabs';
import { Toast } from './Toast';
import { Tooltip } from './Tooltip';
import styles from './UiLabPage.module.css';

const SEASONS: SeasonToken[] = ['spring', 'summer', 'autumn', 'winter'];

const TAB_ITEMS = [
  { id: 'actions', label: 'Actions' },
  { id: 'panels', label: 'Panneaux' },
  { id: 'feedback', label: 'Feedback' },
];

const LAB_RECAP_ACTIONS: ActionLogEntry[] = [
  {
    id: 'lab-action-road',
    turn: 8,
    playerId: 'lab-rival',
    type: 'build',
    description: 'Une route relie désormais les collines au port',
    data: {},
    timestamp: 1,
  },
  {
    id: 'lab-action-urban',
    turn: 8,
    playerId: 'lab-rival',
    type: 'upgrade_city',
    description: 'Amélioration Science → niveau 3',
    data: {},
    timestamp: 2,
  },
];

function createCardLabState(mode: 'development' | 'progress'): GameState {
  const devCards = [
    { id: 'lab-knight', type: 'knight', acquiredTurn: 2, played: false },
    { id: 'lab-roads', type: 'road_building', acquiredTurn: 1, played: false },
    { id: 'lab-plenty', type: 'year_of_plenty', acquiredTurn: 1, played: false },
    { id: 'lab-monopoly', type: 'monopoly', acquiredTurn: 1, played: false },
    { id: 'lab-vp', type: 'victory_point', acquiredTurn: 1, played: false },
  ];
  return {
    currentTurn: 2,
    turnOrder: ['lab-player', 'lab-rival'],
    players: new Map([
      [
        'lab-player',
        {
          id: 'lab-player',
          name: 'Ariane',
          isEliminated: false,
          devCardsPlayedThisTurn: 0,
          devCards: mode === 'development' ? devCards : [],
        },
      ],
      [
        'lab-rival',
        {
          id: 'lab-rival',
          name: 'Bastien',
          isEliminated: false,
          devCardsPlayedThisTurn: 0,
          devCards: [],
        },
      ],
    ]),
    map: new Map([
      ['lab-forest', { id: 'lab-forest', terrain: 'forest', diceValue: 8 }],
      ['lab-fields', { id: 'lab-fields', terrain: 'fields', diceValue: 5 }],
      ['lab-hills', { id: 'lab-hills', terrain: 'hills', diceValue: 9 }],
    ]),
    buildings: new Map(),
    robberPosition: 'lab-hills',
    extensions:
      mode === 'progress'
        ? {
            citiesKnights: {
              progressHands: {
                'lab-player': [
                  { id: 'lab-merchant', type: 'merchant_fleet', deck: 'trade' },
                  { id: 'lab-warlord', type: 'warlord', deck: 'politics' },
                  { id: 'lab-alchemist', type: 'alchemist', deck: 'science' },
                ],
              },
              walls: {},
              knights: [],
            },
          }
        : undefined,
  } as unknown as GameState;
}

function createSeasonLabState(season: SeasonToken): GameState {
  const climates = {
    spring: ['spring_gentle_renewal', 'summer_golden'],
    summer: ['summer_golden', 'autumn_golden_harvest'],
    autumn: ['autumn_equinox_storm', 'winter_clear_frost'],
    winter: ['winter_announced_blizzard', 'spring_gentle_renewal'],
  } as const;
  const [currentClimateId, forecastClimateId] = climates[season];
  return {
    turnOrder: ['lab-player', 'lab-ai-1', 'lab-ai-2', 'lab-ai-3'],
    config: {
      mode: 'catanx',
      extensions: {
        seasons: {
          enabled: true,
          ruleset: 'catanx-seasons-v2',
          roundsPerSeason: 5,
          forecastDepth: 1,
          preparationMode: 'secret-simultaneous',
          maxSeverePerYear: 2,
          allowConsecutiveSevere: false,
        },
      },
    },
    extensions: {
      seasons: {
        currentSeason: season,
        roundInSeason: 5,
        seasonYear: 2,
        currentClimateId,
        forecastClimateId,
        decks: { spring: [], summer: [], autumn: [], winter: [] },
        discards: { spring: [], summer: [], autumn: [], winter: [] },
        severeClimatesThisYear: season === 'autumn' || season === 'winter' ? 1 : 0,
        previousClimateWasSevere: false,
        preparations: {
          'lab-player': 'reserve',
          'lab-ai-1': 'reserve',
          'lab-ai-2': 'reserve',
          'lab-ai-3': 'reserve',
        },
        nextPreparations: {
          'lab-player': null,
          'lab-ai-1': 'shelter',
          'lab-ai-2': null,
          'lab-ai-3': 'commerce',
        },
        preparationTargets: {
          'lab-player': null,
          'lab-ai-1': null,
          'lab-ai-2': null,
          'lab-ai-3': null,
        },
        nextPreparationTargets: {
          'lab-player': null,
          'lab-ai-1': null,
          'lab-ai-2': null,
          'lab-ai-3': null,
        },
        preparationReady: {
          'lab-player': false,
          'lab-ai-1': true,
          'lab-ai-2': false,
          'lab-ai-3': true,
        },
        preparationUses: {
          'lab-player': {
            harvestUsed: false,
            commerceUsed: false,
            worksUsed: false,
            shelterUsed: false,
          },
        },
        climateUses: {},
        climateGlobalUses: {},
        history: [],
        preparationWindowOpen: true,
        springPrepPending: false,
      },
    },
  } as unknown as GameState;
}

export function UiLabPage() {
  const [season, setSeason] = useState<SeasonToken>('summer');
  const [highContrast, setHighContrast] = useState(false);
  const [tab, setTab] = useState('actions');
  const [modalOpen, setModalOpen] = useState(false);
  const [progress, setProgress] = useState(42);
  const [cardLabMode, setCardLabMode] = useState<'development' | 'progress'>('development');
  const [momentReplay, setMomentReplay] = useState(0);
  const [tradeLabMode, setTradeLabMode] = useState<'bank' | 'players' | 'incoming'>('bank');
  const [profileLab, setProfileLab] = useState(() => createDefaultProfile(0));
  const [profileLabOpen, setProfileLabOpen] = useState(false);
  const cardLabState = useMemo(() => createCardLabState(cardLabMode), [cardLabMode]);
  const seasonLabState = useMemo(() => createSeasonLabState(season), [season]);

  const seasonLabel = useMemo(() => {
    const labels: Record<SeasonToken, string> = {
      spring: 'Printemps',
      summer: 'Été',
      autumn: 'Automne',
      winter: 'Hiver',
    };
    return labels[season];
  }, [season]);

  return (
    <div
      className={styles.page}
      data-season={season}
      data-contrast={highContrast ? 'high' : 'standard'}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CatanX Next · tabletop collector</p>
          <h1 className={styles.title}>UI Lab</h1>
          <p className={styles.lede}>
            Bibliothèque de primitives — acrylique givré, papier premium et céramique mate. Saison
            active : {seasonLabel}.
          </p>
        </div>
        <div className={styles.controls}>
          <label className={styles.control}>
            <span>Saison</span>
            <select
              value={season}
              onChange={(event) => setSeason(event.target.value as SeasonToken)}
              aria-label="Sélecteur de saison"
            >
              {SEASONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.controlCheck}>
            <input
              type="checkbox"
              checked={highContrast}
              onChange={(event) => setHighContrast(event.target.checked)}
            />
            <span>Contraste élevé</span>
          </label>
        </div>
      </header>

      <p className={styles.motionNote} role="note">
        Mouvement : les transitions utilisent <code>--motion-feedback</code> /{' '}
        <code>--motion-control</code> / <code>--motion-panel</code>. Sous{' '}
        <code>prefers-reduced-motion</code>, les animations non essentielles sont coupées.
      </p>

      <section className={styles.section}>
        <h2>Boutons</h2>
        <div className={styles.row}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" size="sm">
            SM
          </Button>
          <Button variant="primary" size="lg">
            LG
          </Button>
          <Button variant="secondary" fullWidth>
            Full width
          </Button>
        </div>
        <div className={styles.row}>
          <IconButton icon="settings" aria-label="Réglages" />
          <IconButton icon="help" aria-label="Aide" variant="gold" />
          <IconButton icon="save" aria-label="Sauvegarder" variant="ghost" />
          <IconButton icon="menu" aria-label="Menu" size="lg" />
        </div>
      </section>

      <section className={styles.section}>
        <h2>Icônes</h2>
        <div className={styles.iconGrid}>
          {ICON_NAMES.map((name) => (
            <Tooltip key={name} title={name} content={`Icône ${name}`}>
              <span className={styles.iconCell}>
                <Icon name={name} size={22} title={name} />
                <span>{name}</span>
              </span>
            </Tooltip>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Panneaux & cartes</h2>
        <div className={styles.grid3}>
          <Panel variant="glass">
            <strong>Acrylique</strong>
            <p>Surface givrée, lisible et prête pour les contrôles de jeu.</p>
          </Panel>
          <Panel variant="paper">
            <strong>Papier</strong>
            <p>Contenu de lecture — graphite sur ivoire froid.</p>
          </Panel>
          <Panel variant="dock">
            <strong>Dock</strong>
            <p>Bandeau compact pour HUD / actions.</p>
          </Panel>
        </div>
        <div className={styles.row}>
          <Card title="Carte ressource">Bois · Brique · Mouton</Card>
          <Card title="Victoire">Objectifs et points de prestige.</Card>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Badges</h2>
        <div className={styles.row}>
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="gold">Gold</Badge>
          <Badge variant="season">Season</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="danger">Danger</Badge>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Onglets</h2>
        <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} />
        <Panel variant="glass" className={styles.tabPanel}>
          Onglet actif : <Badge variant="gold">{tab}</Badge>
        </Panel>
      </section>

      <section className={styles.section}>
        <h2>Progression & toasts</h2>
        <div className={styles.stack}>
          <Progress value={progress} label="Construction" />
          <div className={styles.row}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setProgress((v) => Math.max(0, v - 10))}
            >
              −10
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setProgress((v) => Math.min(100, v + 10))}
            >
              +10
            </Button>
          </div>
          <div className={styles.toastRow}>
            <Toast message="Info — tour prêt." variant="info" />
            <Toast message="Succès — échange validé." variant="success" />
            <Toast message="Attention — ressources insuffisantes." variant="warning" />
            <Toast message="Erreur — action refusée." variant="danger" />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Mains de cartes</h2>
        <div className={styles.row}>
          <Button
            data-testid="lab-development-hand"
            size="sm"
            variant={cardLabMode === 'development' ? 'primary' : 'secondary'}
            onClick={() => setCardLabMode('development')}
          >
            Développement
          </Button>
          <Button
            data-testid="lab-progress-hand"
            size="sm"
            variant={cardLabMode === 'progress' ? 'primary' : 'secondary'}
            onClick={() => setCardLabMode('progress')}
          >
            Progrès V&amp;C
          </Button>
        </div>
        <div className={styles.cardHandStage}>
          <div>
            <span className={styles.cardStageLabel}>APERÇU HUD · CLIQUEZ POUR DÉPLIER</span>
            <PlayableCardHand
              state={cardLabState}
              playerId="lab-player"
              canAct
              canPlayAlchemist={cardLabMode === 'progress'}
              onPlayDevelopment={() => ({ ok: true })}
              onPlayProgress={() => ({ ok: true })}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Identité joueur</h2>
        <div className={styles.row}>
          <Button variant="primary" onClick={() => setProfileLabOpen(true)}>
            Ouvrir l’atelier de profil
          </Button>
        </div>
        <div className={styles.profileStage}>
          <PlayerProfileCard
            name="Ariane"
            profile={profileLab}
            civilization="merchants"
            victoryPoints={7}
            handSize={5}
            devCardCount={2}
          />
          <div className={styles.avatarShelf}>
            {PORTRAITS.map((portrait, index) => (
              <ProfileAvatar
                key={portrait.id}
                profile={{
                  ...profileLab,
                  portrait: portrait.id,
                  accessory: 'none',
                  aura: 'none',
                }}
                size={62}
                label={`${portrait.label}, variante de profil ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Comptoir de commerce</h2>
        <div className={styles.row}>
          <Button
            size="sm"
            variant={tradeLabMode === 'bank' ? 'primary' : 'secondary'}
            onClick={() => setTradeLabMode('bank')}
          >
            Banque & ports
          </Button>
          <Button
            size="sm"
            variant={tradeLabMode === 'players' ? 'primary' : 'secondary'}
            onClick={() => setTradeLabMode('players')}
          >
            Entre joueurs
          </Button>
          <Button
            size="sm"
            variant={tradeLabMode === 'incoming' ? 'primary' : 'secondary'}
            onClick={() => setTradeLabMode('incoming')}
          >
            Offre reçue
          </Button>
        </div>
        <div
          className={tradeLabMode === 'incoming' ? styles.incomingTradeStage : styles.tradeStage}
        >
          {tradeLabMode === 'bank' ? (
            <BankTradePanel
              getRatio={(resource) => (resource === 'wood' ? 3 : 4)}
              available={{ wood: 5, clay: 2, wheat: 1, sheep: 3, ore: 0 }}
              bankStock={{ wood: 14, clay: 17, wheat: 12, sheep: 16, ore: 9 }}
              onTrade={() => ({ ok: true })}
            />
          ) : tradeLabMode === 'players' ? (
            <PlayerTradePanel
              partners={[
                { id: 'lab-rival', name: 'Bastien' },
                { id: 'lab-third', name: 'Chloé' },
              ]}
              available={{ wood: 5, clay: 2, wheat: 1, sheep: 3, ore: 0 }}
              pending={null}
              canPropose
              onPropose={() => undefined}
              onAccept={() => undefined}
              onReject={() => undefined}
              onCancel={() => undefined}
            />
          ) : (
            <PlayerTradePanel
              partners={[]}
              available={{ wood: 5, clay: 2, wheat: 1, sheep: 3, ore: 0 }}
              pending={{
                id: 'lab-incoming-trade',
                fromName: 'Bastien',
                toName: 'Vous',
                give: { ore: 1 },
                receive: { wood: 2 },
                role: 'target',
              }}
              canPropose={false}
              onPropose={() => undefined}
              onAccept={() => undefined}
              onReject={() => undefined}
              onCancel={() => undefined}
            />
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Ressources & améliorations urbaines</h2>
        <div className={styles.resourceBarStage}>
          <ResourceBar
            resources={{ wood: 3, clay: 2, sheep: 4, wheat: 1, ore: 2 }}
            commodities={{ ck_cloth: 2, ck_coin: 1, ck_paper: 4 }}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2>Carte HUD Saisons</h2>
        <div className={styles.seasonWidgetStage}>
          <SeasonWidget
            gameState={seasonLabState}
            localPlayerId="lab-player"
            onChoosePreparation={() => undefined}
            open
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2>Centre de commande du tour</h2>
        <div className={styles.turnPlannerStage}>
          <TurnActionPlanner
            currentTurn={9}
            phase="start_of_turn"
            hasRolledDiceThisTurn={false}
            pendingChoice={false}
            selectedTileId={null}
            sidePanelTab="tile"
            actionCountThisTurn={0}
            advancedVisible={false}
            onRollDice={() => undefined}
            onOpenEvent={() => undefined}
            onOpenTab={() => undefined}
            onOpenTech={() => undefined}
            onOpenDiplomacy={() => undefined}
            onEndTurn={() => undefined}
            onToggleAdvanced={() => undefined}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2>Moments de partie</h2>
        <Button size="sm" variant="secondary" onClick={() => setMomentReplay((value) => value + 1)}>
          Rejouer les moments
        </Button>
        <div className={styles.momentStage}>
          <SeasonTransitionMoment
            token={`lab-season-${momentReplay}`}
            season="winter"
            climateId="winter_announced_blizzard"
            year={2}
            pacing="tabletop"
            motionEnabled
          />
          <CkMoment
            token={`lab-ck-${momentReplay}`}
            kind="ship"
            title="Le navire barbare se rapproche"
            detail="4/7 étapes vers Catan"
            pacing="tabletop"
          />
          <TurnRecap
            token={`lab-recap-${momentReplay}`}
            playerName="Bastien"
            turn={8}
            entries={LAB_RECAP_ACTIONS}
            pacing="tabletop"
          />
          <OpponentPrepShelf
            activePlayerName="Bastien"
            resources={{ wood: 1, clay: 1, wheat: 0, sheep: 1, ore: 2 }}
            citiesKnights
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2>Modal</h2>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          Ouvrir la modale
        </Button>
        <ModalShell
          open={modalOpen}
          title="Conseil stratégique"
          onClose={() => setModalOpen(false)}
        >
          <p>
            Escape ferme la modale. Rôle <code>dialog</code>, fond ivoire pour la lecture, en-tête
            laqué.
          </p>
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Compris
          </Button>
        </ModalShell>
      </section>
      <ProfileCustomizerModal
        open={profileLabOpen}
        playerIndex={0}
        playerName="Ariane"
        profile={profileLab}
        civilization="merchants"
        usedPieceColors={['red', 'green']}
        onClose={() => setProfileLabOpen(false)}
        onSave={(profile) => {
          setProfileLab(normalizeProfile(profile));
          setProfileLabOpen(false);
        }}
      />
    </div>
  );
}
