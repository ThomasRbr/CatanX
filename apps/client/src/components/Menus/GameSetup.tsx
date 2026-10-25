import { useMemo, useState, useEffect } from 'react';
import {
  CivilizationType,
  PlayerType,
  AIDifficulty,
  type PlayerProfile,
  getAvailableVictoryConditions,
  previewVictoryPointTarget,
  VICTORY_RULE_HINTS,
} from '@catanx/engine';
import {
  GameConfig,
  GamePacingPreset,
  GamePreset,
  MapSize,
  VictoryCondition,
} from '@catanx/engine';
import { frCivilization, frMapSize, frVictoryCondition } from '../../i18n/fr';
import { Button, Panel, Tabs, Badge } from '../../ui';
import styles from './GameSetup.module.css';
import { ProfileAvatar } from '../Profile/ProfileAvatar';
import { ProfileCustomizerModal } from '../Profile/ProfileCustomizerModal';
import {
  createDefaultProfile,
  normalizeProfile,
  profileTitleLabel,
} from '../../profile/profileCatalog';
import { useProfileStore } from '../../store/profileStore';

export interface SetupPayload {
  preset: GamePreset;
  config: Partial<GameConfig>;
  playerNames: string[];
  playerTypes: Record<number, PlayerType>;
  civilizations: Record<number, CivilizationType>;
  aiDifficulties: Record<number, AIDifficulty>;
  profiles: Record<number, PlayerProfile>;
  hotseatMode: boolean;
}

interface GameSetupProps {
  onStart: (payload: SetupPayload) => void;
  onBack: () => void;
  onOpenCivModal: (playerIndex: number) => void;
  civSelections: Record<number, CivilizationType>;
}

const MAP_SIZES: MapSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'epic'];

type WizardStep = 'mode' | 'joueurs' | 'monde';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'mode', label: '1. Mode' },
  { id: 'joueurs', label: '2. Joueurs' },
  { id: 'monde', label: '3. Plateau & extensions' },
];

function defaultName(index: number): string {
  return `Joueur ${index + 1}`;
}

const PRESETS: { id: GamePreset; label: string; description: string }[] = [
  { id: 'classic', label: 'Base CATAN', description: '19 tuiles, 10 PV, règles essentielles' },
  {
    id: 'catanx',
    label: 'CatanX',
    description: 'La base CATAN enrichie : île vivante, saisons et systèmes avancés',
  },
];

const AI_DIFFICULTIES: { id: AIDifficulty; label: string }[] = [
  { id: 'easy', label: 'Facile' },
  { id: 'medium', label: 'Normal' },
  { id: 'hard', label: 'Difficile' },
  { id: 'legendary', label: 'Légendaire' },
];

const PACING_PRESETS: {
  id: GamePacingPreset;
  label: string;
  description: string;
}[] = [
  {
    id: 'dynamic',
    label: 'Dynamique',
    description: 'Transitions courtes et tours IA rapides.',
  },
  {
    id: 'tabletop',
    label: 'Tabletop premium',
    description: 'Rythme posé, lancer lisible et actions jouées une par une.',
  },
  {
    id: 'epic',
    label: 'Épique',
    description: 'Mise en scène ample pour les longues parties.',
  },
];

export function GameSetup({ onStart, onBack, onOpenCivModal, civSelections }: GameSetupProps) {
  const [step, setStep] = useState<WizardStep>('mode');
  // Base CATAN remains the safe default, while the first compact wizard step keeps
  // the full CatanX ruleset explicitly available without restoring preset clutter.
  const [preset, setPreset] = useState<GamePreset>('classic');
  const [playerCount, setPlayerCount] = useState(4);
  const [mapSize, setMapSize] = useState<MapSize>('tiny');
  const [classicBoardLayout, setClassicBoardLayout] = useState<'fixed' | 'random'>('fixed');
  const [victoryTarget, setVictoryTarget] = useState(10);
  const [seed, setSeed] = useState<number>(Math.floor(Date.now() % 1_000_000));
  const [fogOfWar, setFogOfWar] = useState(false);
  const [enableEvents, setEnableEvents] = useState(false);
  const [enableSeasons, setEnableSeasons] = useState(false);
  const [enableDiplomacy, setEnableDiplomacy] = useState(false);
  const [enableMilitary, setEnableMilitary] = useState(false);
  const [enableTechTree, setEnableTechTree] = useState(false);
  const [enableProductionChains, setEnableProductionChains] = useState(false);
  const [worldCouncil, setWorldCouncil] = useState(false);
  const [enableBarbarians, setEnableBarbarians] = useState(false);
  const [enableCitiesKnights, setEnableCitiesKnights] = useState(false);
  const [enableUndergroundSky, setEnableUndergroundSky] = useState(false);
  const [enablePactsEmbassies, setEnablePactsEmbassies] = useState(false);
  const [victoryCondition, setVictoryCondition] = useState<VictoryCondition>('points');
  const [pacingPreset, setPacingPreset] = useState<GamePacingPreset>('dynamic');

  useEffect(() => {
    if (preset === 'classic') {
      setMapSize('tiny');
      setVictoryTarget(10);
      setPlayerCount((count) => (count >= 3 && count <= 4 ? count : 4));
      setFogOfWar(false);
      setEnableEvents(false);
      setEnableSeasons(false);
      setEnableDiplomacy(false);
      setEnableMilitary(false);
      setEnableTechTree(false);
      setEnableProductionChains(false);
      setWorldCouncil(false);
      setEnableBarbarians(false);
      setEnableCitiesKnights(false);
      setEnableUndergroundSky(false);
      setEnablePactsEmbassies(false);
      setVictoryCondition('points');
      setPacingPreset('dynamic');
    } else if (preset === 'catanx') {
      setMapSize('medium');
      setVictoryTarget(15);
      setFogOfWar(true);
      setEnableEvents(true);
      setEnableSeasons(true);
      setEnableDiplomacy(true);
      setEnableMilitary(true);
      setEnableTechTree(true);
      setEnableProductionChains(false);
      setWorldCouncil(true);
      setEnableBarbarians(true);
      setPacingPreset('tabletop');
    }
  }, [preset]);

  const victoryOptions = useMemo(
    () =>
      getAvailableVictoryConditions({
        enableTechTree: preset === 'catanx' || enableTechTree,
        enableDiplomacy: preset === 'catanx' || enableDiplomacy,
        enableMilitary: preset === 'catanx' || enableMilitary,
        enableProductionChains,
        worldCouncil: preset === 'catanx' || worldCouncil,
      }),
    [enableDiplomacy, enableMilitary, enableProductionChains, enableTechTree, preset, worldCouncil],
  );

  useEffect(() => {
    if (!victoryOptions.includes(victoryCondition)) {
      setVictoryCondition(victoryOptions[0] ?? 'points');
    }
  }, [victoryCondition, victoryOptions]);

  const [names, setNames] = useState<string[]>(['Joueur 1', 'Joueur 2', 'Joueur 3', 'Joueur 4']);
  const [playerTypes, setPlayerTypes] = useState<Record<number, PlayerType>>({
    0: 'human',
    1: 'ai',
    2: 'ai',
    3: 'ai',
  });
  const [aiDifficulties, setAiDifficulties] = useState<Record<number, AIDifficulty>>({
    1: 'medium',
    2: 'medium',
    3: 'medium',
  });
  const [hotseatMode, setHotseatMode] = useState(false);
  const [editingProfileIndex, setEditingProfileIndex] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<Record<number, PlayerProfile>>(() => {
    const persisted = useProfileStore.getState().profiles;
    return Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [index, normalizeProfile(persisted[index], index)]),
    );
  });
  const persistProfile = useProfileStore((state) => state.setProfile);

  const displayedNames = useMemo(() => {
    const next = names.slice(0, playerCount);
    while (next.length < playerCount) {
      next.push(defaultName(next.length));
    }
    return next;
  }, [names, playerCount]);

  const presetLabel = preset === 'catanx' ? 'CatanX' : 'Base CATAN';

  const activeFeatures = useMemo(() => {
    const items: string[] = [];
    if (fogOfWar) items.push('Brouillard');
    if (enableEvents) items.push('Événements');
    if (enableSeasons) items.push('Saisons');
    if (enableDiplomacy) items.push('Diplomatie');
    if (enableMilitary) items.push('Armées');
    if (enableTechTree) items.push('Technologies');
    if (enableProductionChains) items.push('Industrie');
    if (worldCouncil) items.push('Conseil');
    if (enableBarbarians) items.push('Barbares');
    if (enableCitiesKnights) items.push('Villes & Chevaliers');
    if (enableUndergroundSky) items.push('Souterrain & Ciel');
    if (enablePactsEmbassies) items.push('Pactes & Ambassades');
    if (hotseatMode) items.push('Passe-et-joue');
    return items;
  }, [
    fogOfWar,
    enableEvents,
    enableSeasons,
    enableDiplomacy,
    enableMilitary,
    enableTechTree,
    enableProductionChains,
    worldCouncil,
    enableBarbarians,
    enableCitiesKnights,
    enableUndergroundSky,
    enablePactsEmbassies,
    hotseatMode,
  ]);

  const victoryBonuses: string[] = [];
  if (enableCitiesKnights) victoryBonuses.push('V&C +3');
  if (enableUndergroundSky) victoryBonuses.push('S&C +5');
  if (enablePactsEmbassies) victoryBonuses.push('P&A +3');
  const effectiveVictoryTarget = previewVictoryPointTarget(
    victoryTarget,
    enableCitiesKnights,
    3,
    enableUndergroundSky,
    5,
    enablePactsEmbassies,
    3,
  );

  const stepIndex = STEPS.findIndex((item) => item.id === step);

  const goNext = () => {
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1]!.id);
    }
  };

  const goPrev = () => {
    if (stepIndex > 0) {
      setStep(STEPS[stepIndex - 1]!.id);
    }
  };

  const handleStart = () => {
    onStart({
      preset,
      config: {
        playerCount,
        pacingPreset,
        mapSize: preset === 'classic' ? 'tiny' : mapSize,
        mapSeed: seed,
        classicBoardLayout: preset === 'classic' ? classicBoardLayout : undefined,
        victoryPointTarget: victoryTarget,
        victoryConditions: [victoryCondition],
        fogOfWar,
        enableEvents,
        enableSeasons,
        enableDiplomacy,
        enableMilitary,
        enableTechTree,
        enableProductionChains,
        worldCouncil,
        barbarianStrength: {
          enabled: enableBarbarians,
          spawnRate: 6,
          strength: 4,
          scaling: true,
          navalBarbarians: false,
        },
        extensions: {
          ...(enableCitiesKnights
            ? {
                citiesKnights: {
                  enabled: true,
                  ruleset: 'catanx-essential-v1' as const,
                  victoryPointBonus: 3 as const,
                  adaptiveBarbarianTrack: true as const,
                },
              }
            : {}),
          seasons: {
            enabled: preset !== 'classic' && enableSeasons,
            ruleset: 'catanx-seasons-v2' as const,
            roundsPerSeason: 5 as const,
            forecastDepth: 1 as const,
            preparationMode: 'secret-simultaneous' as const,
            maxSeverePerYear: 2 as const,
            allowConsecutiveSevere: false as const,
          },
          ...(enableUndergroundSky && preset !== 'classic'
            ? {
                undergroundSky: {
                  enabled: true,
                  ruleset: 'catanx-underground-sky-v1' as const,
                  victoryPointBonus: 5 as const,
                  undergroundGeneration: 'surface-derived' as const,
                  skyGeneration: 'adaptive-network' as const,
                  flightMode: 'programmed' as const,
                  interactionMode: 'soft-competitive' as const,
                },
              }
            : {}),
          ...(enablePactsEmbassies && preset !== 'classic'
            ? {
                pactsEmbassies: {
                  enabled: true,
                  ruleset: 'catanx-pacts-embassies-v1' as const,
                  victoryPointBonus: 3 as const,
                  roundsPerCouncilSession: enableSeasons ? 5 as const : 4 as const,
                  maxActivePactsPerPlayer: 2 as const,
                  maxActiveResolutions: 2 as const,
                  neutralCouncilMode: 'adaptive' as const,
                },
              }
            : {}),
        },
      },
      playerNames: displayedNames,
      playerTypes: displayedNames.reduce<Record<number, PlayerType>>((acc, _name, index) => {
        acc[index] = hotseatMode ? 'human' : index === 0 ? 'human' : (playerTypes[index] ?? 'ai');
        return acc;
      }, {}),
      civilizations: civSelections,
      aiDifficulties: displayedNames.reduce<Record<number, AIDifficulty>>((acc, _name, index) => {
        if (index === 0 || hotseatMode) return acc;
        const type = playerTypes[index] ?? 'ai';
        if (type === 'ai') {
          acc[index] = aiDifficulties[index] ?? 'medium';
        }
        return acc;
      }, {}),
      profiles: displayedNames.reduce<Record<number, PlayerProfile>>((acc, _name, index) => {
        acc[index] = profiles[index] ?? createDefaultProfile(index);
        return acc;
      }, {}),
      hotseatMode,
    });
  };

  const classicLocked = preset === 'classic';

  return (
    <section
      id="catanx-main-content"
      className={styles.root}
      aria-label="Configuration de la partie"
    >
      <Panel variant="lacquer" className={styles.shell}>
        <h2 className={styles.title}>Configuration de la partie</h2>

        <Tabs
          items={STEPS}
          value={step}
          onChange={(id) => setStep(id as WizardStep)}
          aria-label="Étapes de configuration"
        />

        <div className={styles.stepBody}>
          {step === 'mode' && (
            <Panel variant="ivory" className={styles.ivory}>
              <div className={styles.presetGrid}>
                {PRESETS.map((item) => {
                  const selected = preset === item.id;
                  return (
                    <Panel
                      key={item.id}
                      variant="lacquer"
                      role="button"
                      tabIndex={0}
                      className={[styles.presetCard, selected ? styles.presetCardSelected : '']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setPreset(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setPreset(item.id);
                        }
                      }}
                      aria-pressed={selected}
                    >
                      <strong>{item.label}</strong>
                      {selected && (
                        <Badge variant="gold" style={{ marginLeft: 8 }}>
                          Sélectionné
                        </Badge>
                      )}
                      <p className={styles.presetDesc}>{item.description}</p>
                    </Panel>
                  );
                })}
              </div>
            </Panel>
          )}

          {step === 'joueurs' && (
            <Panel variant="ivory" className={styles.ivory}>
              <label className={styles.field}>
                Nombre de joueurs
                <input
                  type="range"
                  min={preset === 'classic' ? 3 : 2}
                  max={preset === 'classic' ? 4 : 8}
                  step={1}
                  value={playerCount}
                  onChange={(e) => setPlayerCount(Number(e.target.value))}
                />
                <div>
                  {playerCount}
                  {preset === 'classic' ? (
                    <span className={styles.hint}> — CATAN : 3 ou 4 (même plateau)</span>
                  ) : null}
                </div>
              </label>

              <label className={styles.checkList} style={{ marginTop: 12 }}>
                <span>
                  <input
                    type="checkbox"
                    checked={hotseatMode}
                    onChange={(e) => setHotseatMode(e.target.checked)}
                  />{' '}
                  Passe-et-joue (tous humains, écran de confidentialité)
                </span>
              </label>

              <div className={styles.playerList}>
                {displayedNames.map((name, index) => (
                  <Panel key={index} variant="lacquer" className={styles.playerRow}>
                    <ProfileAvatar
                      profile={profiles[index] ?? createDefaultProfile(index)}
                      size={42}
                      label={`Profil du joueur ${index + 1}`}
                    />
                    <input
                      value={name}
                      aria-label={`Nom du joueur ${index + 1}`}
                      onChange={(e) => {
                        const copy = [...displayedNames];
                        copy[index] = e.target.value;
                        setNames(copy);
                      }}
                    />
                    <select
                      value={playerTypes[index] ?? (index === 0 ? 'human' : 'ai')}
                      aria-label={`Type du joueur ${index + 1}`}
                      onChange={(e) => {
                        const nextType = e.target.value as PlayerType;
                        setPlayerTypes((prev) => ({
                          ...prev,
                          [index]: index === 0 ? 'human' : nextType,
                        }));
                      }}
                      disabled={index === 0 || hotseatMode}
                    >
                      <option value="human">Humain</option>
                      <option value="ai">IA</option>
                    </select>
                    {(playerTypes[index] ?? (index === 0 ? 'human' : 'ai')) === 'ai' &&
                    index !== 0 &&
                    !hotseatMode &&
                    preset === 'classic' ? (
                      <select
                        value={aiDifficulties[index] ?? 'medium'}
                        aria-label={`Difficulté IA joueur ${index + 1}`}
                        onChange={(e) => {
                          setAiDifficulties((prev) => ({
                            ...prev,
                            [index]: e.target.value as AIDifficulty,
                          }));
                        }}
                      >
                        {AI_DIFFICULTIES.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className={styles.muted}>—</div>
                    )}
                    <div className={styles.playerSignature}>
                      <strong>
                        {profileTitleLabel((profiles[index] ?? createDefaultProfile(index)).title)}
                      </strong>
                      <span>{frCivilization(civSelections[index] ?? 'empire')}</span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => onOpenCivModal(index)}>
                      Civilisation
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setEditingProfileIndex(index)}
                    >
                      Personnaliser
                    </Button>
                  </Panel>
                ))}
              </div>
            </Panel>
          )}

          {step === 'monde' && (
            <div className={styles.mondeLayout}>
              <Panel variant="ivory" className={styles.ivory}>
                <fieldset className={styles.pacingFieldset}>
                  <legend>Rythme de la partie</legend>
                  <div className={styles.pacingGrid}>
                    {PACING_PRESETS.map((item) => {
                      const selected = pacingPreset === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`${styles.pacingCard} ${
                            selected ? styles.pacingCardSelected : ''
                          }`}
                          onClick={() => setPacingPreset(item.id)}
                          aria-pressed={selected}
                        >
                          <strong>{item.label}</strong>
                          {item.id === 'tabletop' && <span>Recommandé</span>}
                          <small>{item.description}</small>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    Taille de la carte
                    <select
                      value={preset === 'classic' ? 'tiny' : mapSize}
                      disabled={preset === 'classic'}
                      onChange={(e) => setMapSize(e.target.value as MapSize)}
                    >
                      {MAP_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {frMapSize(size)}
                        </option>
                      ))}
                    </select>
                    {preset === 'classic' ? (
                      <span className={styles.hint}>
                        Mode Classique = île CATAN officielle (19 tuiles). Pour une carte plus
                        grande, choisissez le mode CatanX ou Personnalisé.
                      </span>
                    ) : null}
                  </label>

                  {preset === 'classic' && (
                    <label className={styles.field}>
                      Disposition du plateau
                      <select
                        value={classicBoardLayout}
                        onChange={(e) =>
                          setClassicBoardLayout(e.target.value as 'fixed' | 'random')
                        }
                      >
                        <option value="fixed">Débutant (fixe)</option>
                        <option value="random">Variable (mélangé)</option>
                      </select>
                      <span className={styles.hint}>
                        Variable : mêmes tuiles/ports, positions aléatoires (6 et 8 séparés).
                      </span>
                    </label>
                  )}

                  <label className={styles.field}>
                    Condition de victoire
                    <select
                      value={victoryCondition}
                      disabled={classicLocked}
                      onChange={(e) => setVictoryCondition(e.target.value as VictoryCondition)}
                    >
                      {victoryOptions.map((item) => (
                        <option key={item} value={item}>
                          {frVictoryCondition(item)}
                        </option>
                      ))}
                    </select>
                    <span className={styles.hint}>{VICTORY_RULE_HINTS[victoryCondition]}</span>
                  </label>

                  <label className={styles.field}>
                    Objectif de victoire (PV)
                    <input
                      type="number"
                      min={6}
                      max={50}
                      value={victoryTarget}
                      disabled={classicLocked}
                      onChange={(e) => setVictoryTarget(Number(e.target.value))}
                    />
                  </label>

                  <label className={styles.field}>
                    Graine de la carte
                    <input
                      type="number"
                      value={seed}
                      onChange={(e) => setSeed(Number(e.target.value))}
                    />
                  </label>
                </div>

                <div className={styles.checkList} style={{ marginTop: 14 }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={fogOfWar}
                      onChange={(e) => setFogOfWar(e.target.checked)}
                      disabled={classicLocked}
                    />
                    Brouillard de guerre
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={enableEvents}
                      onChange={(e) => setEnableEvents(e.target.checked)}
                      disabled={classicLocked}
                    />
                    Événements
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={enableDiplomacy}
                      onChange={(e) => setEnableDiplomacy(e.target.checked)}
                      disabled={classicLocked}
                    />
                    Diplomatie
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={enableMilitary}
                      onChange={(e) => setEnableMilitary(e.target.checked)}
                      disabled={classicLocked}
                    />
                    Armées
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={enableTechTree}
                      onChange={(e) => setEnableTechTree(e.target.checked)}
                      disabled={classicLocked}
                    />
                    Technologies
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={enableProductionChains}
                      onChange={(e) => setEnableProductionChains(e.target.checked)}
                      disabled={classicLocked}
                    />
                    Industrie et craft avancés (extension optionnelle)
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={worldCouncil}
                      onChange={(e) => setWorldCouncil(e.target.checked)}
                      disabled={classicLocked}
                    />
                    Conseil mondial
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={enableBarbarians}
                      onChange={(e) => setEnableBarbarians(e.target.checked)}
                      disabled={classicLocked}
                    />
                    Barbares
                  </label>
                </div>

                <h3 className={styles.summaryTitle} style={{ marginTop: 18 }}>
                  Extensions
                </h3>
                <div className={styles.checkList} style={{ marginTop: 8 }}>
                  <label className={styles.extensionCard}>
                    <input
                      type="checkbox"
                      checked={enableSeasons}
                      onChange={(e) => setEnableSeasons(e.target.checked)}
                      disabled={classicLocked}
                    />
                    <span>
                      <strong>Saisons</strong>
                      <span className={styles.extensionHint}>
                        Climats publics, abondance et préparations. Identité CatanX — indisponible
                        en Classique pur.
                      </span>
                    </span>
                  </label>
                  <label className={styles.extensionCard}>
                    <input
                      type="checkbox"
                      checked={enableCitiesKnights}
                      onChange={(e) => setEnableCitiesKnights(e.target.checked)}
                    />
                    <span>
                      <strong>Villes &amp; Chevaliers</strong>
                      <span className={styles.extensionHint}>
                        Objectif +3 PV · marchandises · chevaliers · barbares. Compatible avec
                        Classique et tous les modules.
                      </span>
                    </span>
                  </label>
                  <label className={styles.extensionCard}>
                    <input
                      type="checkbox"
                      checked={enableUndergroundSky}
                      onChange={(e) => setEnableUndergroundSky(e.target.checked)}
                      disabled={classicLocked}
                    />
                    <span>
                      <strong>Souterrain &amp; Ciel</strong>
                      <span className={styles.extensionHint}>
                        Objectif +5 PV · réseaux verticaux · Cristal &amp; Éther · contrats aériens.
                        Identité CatanX — indisponible en Classique pur.
                      </span>
                    </span>
                  </label>
                  <label className={styles.extensionCard}>
                    <input
                      type="checkbox"
                      checked={enablePactsEmbassies}
                      onChange={(e) => setEnablePactsEmbassies(e.target.checked)}
                      disabled={classicLocked}
                    />
                    <span>
                      <strong>Pactes &amp; Ambassades</strong>
                      <span className={styles.extensionHint}>
                        Objectif +3 PV · ambassades · pactes vérifiables · Conseil mondial ·
                        mandats. Identité CatanX — indisponible en Classique pur.
                      </span>
                    </span>
                  </label>
                </div>
              </Panel>

              <Panel variant="lacquer" className={styles.summary}>
                <h3 className={styles.summaryTitle}>Résumé</h3>
                <ul className={styles.summaryList}>
                  <li>
                    <span>Mode</span>
                    <span>{presetLabel}</span>
                  </li>
                  <li>
                    <span>Joueurs</span>
                    <span>{playerCount}</span>
                  </li>
                  <li>
                    <span>Carte</span>
                    <span>
                      {frMapSize(mapSize)}
                      {preset === 'classic'
                        ? classicBoardLayout === 'random'
                          ? ' · variable'
                          : ' · débutant'
                        : ''}
                    </span>
                  </li>
                  <li>
                    <span>Victoire</span>
                    <span>
                      {frVictoryCondition(victoryCondition)} · {effectiveVictoryTarget} PV
                      {victoryBonuses.length > 0 ? ` (${victoryBonuses.join(', ')})` : ''}
                    </span>
                  </li>
                  <li>
                    <span>Rythme</span>
                    <span>{PACING_PRESETS.find((item) => item.id === pacingPreset)?.label}</span>
                  </li>
                  <li>
                    <span>Graine</span>
                    <span>{seed}</span>
                  </li>
                </ul>
                <div className={styles.features}>
                  {activeFeatures.length === 0 ? (
                    <Badge variant="neutral">Règles essentielles</Badge>
                  ) : (
                    activeFeatures.map((feature) => (
                      <Badge key={feature} variant="season">
                        {feature}
                      </Badge>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <Button variant="ghost" onClick={onBack}>
            Retour
          </Button>
          <div className={styles.footerNav}>
            {stepIndex > 0 && (
              <Button variant="secondary" onClick={goPrev}>
                Précédent
              </Button>
            )}
            {stepIndex < STEPS.length - 1 ? (
              <Button variant="primary" onClick={goNext}>
                Suivant
              </Button>
            ) : (
              <Button variant="primary" onClick={handleStart}>
                Lancer
              </Button>
            )}
          </div>
        </div>
      </Panel>
      {editingProfileIndex !== null && (
        <ProfileCustomizerModal
          open
          playerIndex={editingProfileIndex}
          playerName={displayedNames[editingProfileIndex] ?? defaultName(editingProfileIndex)}
          profile={profiles[editingProfileIndex] ?? createDefaultProfile(editingProfileIndex)}
          civilization={civSelections[editingProfileIndex] ?? 'empire'}
          usedPieceColors={displayedNames
            .map((_name, index) => profiles[index]?.pieceColor)
            .filter((color): color is PlayerProfile['pieceColor'] => Boolean(color))}
          onClose={() => setEditingProfileIndex(null)}
          onSave={(profile) => {
            setProfiles((current) => ({ ...current, [editingProfileIndex]: profile }));
            persistProfile(editingProfileIndex, profile);
            setEditingProfileIndex(null);
          }}
        />
      )}
    </section>
  );
}
