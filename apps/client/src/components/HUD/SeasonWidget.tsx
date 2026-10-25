import { useState } from 'react';
import {
  getClimateDefinition,
  isSeasonsEnabled,
  SEASON_ROUNDS_PER_SEASON,
  type GameState,
  type SeasonClassicResource,
  type SeasonPreparation,
  type SeasonRuleEffect,
} from '@catanx/engine';
import { frResource, frSeason } from '../../i18n/fr';
import { Badge, Icon, type CatanXIconName } from '../../ui';
import styles from './SeasonWidget.module.css';

const RESOURCE_ICONS: Record<string, CatanXIconName> = {
  wood: 'wood',
  clay: 'brick',
  wheat: 'wheat',
  sheep: 'sheep',
  ore: 'ore',
};

const PREP_ICONS: Record<SeasonPreparation, CatanXIconName> = {
  harvest: 'wheat',
  commerce: 'trade',
  reserve: 'save',
  works: 'build',
  shelter: 'warning',
};

const PREP_LABELS: Record<SeasonPreparation, string> = {
  harvest: 'Adaptation',
  commerce: 'Caravane',
  reserve: 'Réserves',
  works: 'Mobilisation',
  shelter: 'Abri',
};

const PREP_DETAILS: Record<SeasonPreparation, string> = {
  harvest: 'Choisissez un terrain : sa première production de la saison rapporte +1 ressource.',
  commerce: 'Une fois : effectuez un échange à 3:1. Un port spécialisé à 2:1 reste prioritaire.',
  reserve: 'Toute la saison : gardez 2 cartes de plus avant de défausser sur un 7.',
  works: 'Une fois : retirez 1 ressource du coût de votre première construction payante.',
  shelter: 'Une fois : neutralisez la première perte de production ou surcharge de construction du climat.',
};

const PREP_TAGLINES: Record<SeasonPreparation, string> = {
  harvest: 'Adapter un terrain',
  commerce: 'Sécuriser un échange',
  reserve: 'Protéger votre main',
  works: 'Accélérer un chantier',
  shelter: 'Absorber un climat rude',
};

const ADAPTATION_RESOURCES: readonly SeasonClassicResource[] = [
  'wood',
  'clay',
  'wheat',
  'sheep',
  'ore',
];

function isPositive(effect: SeasonRuleEffect): boolean {
  return (
    (effect.kind === 'hand_limit_delta' && effect.delta > 0) ||
    (effect.kind === 'all_build_cost_delta' && effect.delta < 0) ||
    effect.kind === 'generous_abundance_once'
  );
}

function isNegative(effect: SeasonRuleEffect): boolean {
  return (
    effect.kind === 'city_production_penalty' ||
    (effect.kind === 'hand_limit_delta' && effect.delta < 0) ||
    effect.kind === 'generic_port_ratio' ||
    (effect.kind === 'all_build_cost_delta' && effect.delta > 0)
  );
}

function buildingLabel(building: 'settlement' | 'city' | 'road' | 'wall', plural = false) {
  const labels = {
    settlement: plural ? 'colonies' : 'colonie',
    city: plural ? 'villes' : 'ville',
    road: plural ? 'routes' : 'route',
    wall: plural ? 'murailles' : 'muraille',
  };
  return labels[building];
}

function effectText(effect: SeasonRuleEffect): string {
  if (effect.kind === 'hand_limit_delta') {
    return effect.delta > 0
      ? `Vous gardez ${effect.delta} cartes de plus avant de défausser sur un 7.`
      : `Vous devez défausser ${Math.abs(effect.delta)} carte${Math.abs(effect.delta) > 1 ? 's' : ''} plus tôt sur un 7.`;
  }
  if (effect.kind === 'generic_port_ratio') {
    return `Les ports génériques passent à ${effect.ratio}:1. Les ports spécialisés restent inchangés.`;
  }
  if (effect.kind === 'city_production_penalty') {
    const resources =
      effect.resources === 'all_classic'
        ? 'ressources classiques'
        : effect.resources.map((resource) => frResource(resource)).join(' et ');
    return `La production de ${resources} issue de vos villes est réduite de ${effect.amount}. Les colonies ne sont pas touchées.`;
  }
  if (effect.kind === 'all_build_cost_delta') {
    const target = `Toutes vos ${buildingLabel(effect.building, true)}`;
    const direction = effect.delta > 0 ? 'de plus' : 'de moins';
    return `${target} coûtent ${Math.abs(effect.delta)} ${frResource(effect.resource)} ${direction}.`;
  }
  if (effect.kind === 'generous_abundance_once') {
    const amount = effect.amount ?? 2;
    return `Votre premier bonus d’abondance de ce climat est de +${amount} (au lieu de +1).`;
  }
  return 'Contrainte saisonnière.';
}

function compactEffectText(effect: SeasonRuleEffect): string {
  if (effect.kind === 'hand_limit_delta') {
    const amount = Math.abs(effect.delta);
    return `Seuil avant défausse : ${effect.delta > 0 ? '+' : '−'}${amount} carte${amount > 1 ? 's' : ''}`;
  }
  if (effect.kind === 'generic_port_ratio') return `Ports génériques : ${effect.ratio}:1`;
  if (effect.kind === 'city_production_penalty') {
    const resources =
      effect.resources === 'all_classic'
        ? 'toute production classique'
        : effect.resources.map((resource) => frResource(resource)).join(' + ');
    return `Villes : −${effect.amount} ${resources}`;
  }
  if (effect.kind === 'all_build_cost_delta') {
    return `Toutes ${buildingLabel(effect.building, true)} : ${effect.delta > 0 ? '+' : '−'}${Math.abs(effect.delta)} ${frResource(effect.resource)}`;
  }
  if (effect.kind === 'generous_abundance_once') {
    return `1ʳᵉ abondance : +${effect.amount ?? 2}`;
  }
  return 'Contrainte saisonnière';
}

interface SeasonWidgetProps {
  gameState: GameState;
  localPlayerId?: string | null;
  onChoosePreparation?: (
    preparation: SeasonPreparation,
    targetResource?: SeasonClassicResource,
  ) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SeasonWidget({
  gameState,
  localPlayerId,
  onChoosePreparation,
  open: controlledOpen,
  onOpenChange,
}: SeasonWidgetProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setLocalOpen(next);
  };
  if (!isSeasonsEnabled(gameState) || !gameState.extensions?.seasons) return null;

  const seasons = gameState.extensions.seasons;
  const current = getClimateDefinition(seasons.currentClimateId);
  const forecast = getClimateDefinition(seasons.forecastClimateId);
  const allEffects = current.effects;
  const positives = allEffects.filter(isPositive);
  const negatives = allEffects.filter(isNegative);
  const severe = current.severity === 'severe';
  const forecastSevere = forecast.severity === 'severe';
  const forecastEffects = forecast.effects;
  const forecastThreats = forecastEffects.filter(isNegative);
  const [favoredPrimary, favoredSecondary] = current.favoredResources;

  const choosingNext =
    !seasons.springPrepPending &&
    (seasons.preparationWindowOpen || seasons.roundInSeason === SEASON_ROUNDS_PER_SEASON);
  const currentPrep = (localPlayerId && seasons.preparations[localPlayerId]) || 'reserve';
  const nextPrep = localPlayerId && choosingNext ? seasons.nextPreparations[localPlayerId] : null;
  const displayPrep = nextPrep ?? currentPrep;
  const currentTarget = localPlayerId ? seasons.preparationTargets[localPlayerId] : null;
  const nextTarget = localPlayerId ? seasons.nextPreparationTargets[localPlayerId] : null;
  const displayTarget = (choosingNext ? nextTarget : currentTarget) ?? forecast.favoredResources[0];
  const readyCount = Object.values(seasons.preparationReady).filter(Boolean).length;
  const playerCount = gameState.turnOrder.length || gameState.players.size;
  const usage = localPlayerId ? seasons.preparationUses[localPlayerId] : null;
  const currentPrepUsed =
    currentPrep === 'harvest'
      ? usage?.harvestUsed
      : currentPrep === 'commerce'
        ? usage?.commerceUsed
        : currentPrep === 'works'
          ? usage?.worksUsed
          : currentPrep === 'shelter'
            ? usage?.shelterUsed
            : false;
  const canChoose =
    Boolean(onChoosePreparation) &&
    (seasons.springPrepPending ||
      seasons.preparationWindowOpen ||
      seasons.roundInSeason === SEASON_ROUNDS_PER_SEASON);
  const localReady = Boolean(localPlayerId && seasons.preparationReady[localPlayerId]);

  return (
    <aside
      className={styles.dock}
      data-hud-zone="extensions"
      data-extension="seasons"
      data-expanded={open ? 'true' : 'false'}
      data-severity={severe ? 'severe' : 'standard'}
      data-season={current.season}
      data-climate={current.id}
      data-awaiting={canChoose && !localReady ? 'true' : undefined}
      aria-label="Extensions"
    >
      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${open ? 'Fermer' : 'Ouvrir'} les règles de ${current.labelFr}`}
        title={`Saisons · ${current.labelFr}`}
      >
        <span className={styles.iconHalo} aria-hidden="true">
          <Icon name="season" size={23} />
        </span>
        <span className={styles.severityDot} aria-hidden="true" />
        <span className={styles.tooltip} role="tooltip">
          <small>{canChoose && !localReady ? 'Veillée disponible' : 'Extension Saisons'}</small>
          <strong>{current.labelFr}</strong>
        </span>
      </button>

      {open && (
        <section className={styles.panel} aria-label={`Règles détaillées de ${current.labelFr}`}>
          <header className={styles.panelHeader}>
            <div className={styles.headerMeta}>
              <span>Extension Saisons · année {seasons.seasonYear}</span>
              <Badge variant={severe ? 'danger' : 'neutral'}>
                {severe ? 'Climat rude' : 'Standard'}
              </Badge>
            </div>
            <div className={styles.climateTitleRow}>
              <span className={styles.panelIcon} aria-hidden="true">
                <Icon name="season" size={24} />
              </span>
              <div className={styles.climateTitle}>
                <Badge variant="season">{frSeason(seasons.currentSeason)}</Badge>
                <strong>{current.labelFr}</strong>
              </div>
            </div>
            <div className={styles.roundStatus}>
              <span>Progression de la saison</span>
              <strong>
                {seasons.roundInSeason}/{SEASON_ROUNDS_PER_SEASON}
              </strong>
            </div>
            <div
              className={styles.progress}
              aria-label={`Manche ${seasons.roundInSeason} sur ${SEASON_ROUNDS_PER_SEASON}`}
            >
              {Array.from({ length: SEASON_ROUNDS_PER_SEASON }, (_, index) => index + 1).map(
                (round) => (
                  <span
                    key={round}
                    data-active={round <= seasons.roundInSeason ? 'true' : undefined}
                  />
                ),
              )}
            </div>
          </header>

          <section className={styles.bonusRule} aria-label="Bonus saisonnier essentiel">
            <div className={styles.stepHeading}>
              <b>1</b>
              <span>
                <small>À chaque lancer</small>
                <strong>Produisez une ressource favorisée</strong>
              </span>
            </div>
            <div className={styles.ruleHeading}>
              <span className={styles.ruleIcon} aria-hidden="true">
                <Icon name="victory" size={15} />
              </span>
              <span>Vous recevez 1 carte en plus</span>
            </div>
            <div className={styles.favoredResources}>
              <span>
                <Icon name={RESOURCE_ICONS[favoredPrimary]} size={17} />
                <small>Priorité</small>
                <strong>+1 {frResource(favoredPrimary)}</strong>
              </span>
              <small>ou</small>
              <span>
                <Icon name={RESOURCE_ICONS[favoredSecondary]} size={17} />
                <small>Alternative</small>
                <strong>+1 {frResource(favoredSecondary)}</strong>
              </span>
            </div>
            <p className={styles.plainRule}>
              Maximum 1 bonus par lancer. Si vous produisez les deux, {frResource(favoredPrimary)}{' '}
              reçoit le bonus.
            </p>
          </section>

          <section className={styles.impactBoard} aria-label="Effets du climat actuel">
            <div className={styles.stepHeading}>
              <b>2</b>
              <span>
                <small>Pendant cette saison</small>
                <strong>Appliquez le climat</strong>
              </span>
            </div>
            <div className={styles.effectGrid}>
              {positives.length > 0 && (
                <div className={styles.effectGroup} data-tone="positive">
                  <strong>
                    <Icon name="check" size={14} /> Avantage
                  </strong>
                  {positives.map((effect, index) => (
                    <span key={`positive-${index}`} title={effectText(effect)}>
                      {compactEffectText(effect)}
                    </span>
                  ))}
                </div>
              )}
              {negatives.length > 0 && (
                <div className={styles.effectGroup} data-tone="negative">
                  <strong>
                    <Icon name="warning" size={14} /> Contrainte
                  </strong>
                  {negatives.map((effect, index) => (
                    <span key={`negative-${index}`} title={effectText(effect)}>
                      {compactEffectText(effect)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {negatives.some((effect) => effect.kind === 'city_production_penalty') && (
              <small className={styles.safetyNote}>
                Les colonies ne perdent jamais de production.
              </small>
            )}
          </section>

          <div className={styles.preparation}>
            <b className={styles.stepNumber}>3</b>
            <span className={styles.cardIcon} aria-hidden="true">
              <Icon name={PREP_ICONS[currentPrep]} size={18} />
            </span>
            <div>
              <span>Votre stratégie</span>
              <strong>
                {PREP_LABELS[currentPrep]}
                {currentPrep !== 'reserve' && currentPrepUsed ? ' · déjà utilisée' : ''}
              </strong>
              <em>{PREP_TAGLINES[currentPrep]}</em>
              <p>{PREP_DETAILS[currentPrep]}</p>
              {currentPrep === 'harvest' && currentTarget && (
                <small className={styles.currentTarget}>
                  <Icon name={RESOURCE_ICONS[currentTarget]} size={13} />
                  Terrain choisi : {frResource(currentTarget)}
                </small>
              )}
            </div>
          </div>

          {canChoose && (
            <div className={styles.prepChoices}>
              <header className={styles.vigilHeader}>
                <span className={styles.vigilIcon} aria-hidden="true">
                  <Icon name="season" size={18} />
                </span>
                <span>
                  <small>Choix secret et simultané</small>
                  <strong>{choosingNext ? 'Veillée saisonnière' : 'Premier engagement'}</strong>
                </span>
                <Badge variant="season">
                  {readyCount}/{playerCount} prêts
                </Badge>
              </header>
              <p className={styles.vigilLead}>
                Préparez {forecast.labelFr}. Les autres stratégies restent cachées jusqu’à leur
                activation.
              </p>
              <div className={styles.prepGrid}>
                {(Object.keys(PREP_LABELS) as SeasonPreparation[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={styles.prepBtn}
                    data-active={displayPrep === key ? 'true' : undefined}
                    aria-label={`${PREP_LABELS[key]} — ${PREP_TAGLINES[key]}`}
                    onClick={() =>
                      onChoosePreparation?.(
                        key,
                        key === 'harvest' ? displayTarget : undefined,
                      )
                    }
                    title={PREP_DETAILS[key]}
                  >
                    <Icon name={PREP_ICONS[key]} size={15} />
                    <span>
                      <strong>{PREP_LABELS[key]}</strong>
                      <small>{PREP_TAGLINES[key]}</small>
                    </span>
                  </button>
                ))}
              </div>
              {displayPrep === 'harvest' && (
                <div className={styles.adaptationTargets} aria-label="Terrain d'adaptation">
                  <span>Terrain ciblé</span>
                  <div>
                    {ADAPTATION_RESOURCES.map((resource) => (
                      <button
                        key={resource}
                        type="button"
                        data-active={displayTarget === resource ? 'true' : undefined}
                        onClick={() => onChoosePreparation?.('harvest', resource)}
                        aria-label={`Adapter ${frResource(resource)}`}
                        title={frResource(resource)}
                      >
                        <Icon name={RESOURCE_ICONS[resource]} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <small className={styles.selectedPrepDetail}>{PREP_DETAILS[displayPrep]}</small>
              <div className={styles.readyStrip} aria-label="Statut des joueurs">
                {gameState.turnOrder.map((playerId) => (
                  <span
                    key={playerId}
                    data-ready={seasons.preparationReady[playerId] ? 'true' : undefined}
                    title={
                      playerId === localPlayerId
                        ? 'Votre choix'
                        : seasons.preparationReady[playerId]
                          ? 'Adversaire prêt · choix masqué'
                          : 'Adversaire en réflexion'
                    }
                  >
                    {playerId === localPlayerId ? 'Vous' : 'IA'}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div
            className={styles.nextClimate}
            data-severe={forecastSevere ? 'true' : undefined}
            data-season={forecast.season}
          >
            <span className={styles.cardIcon} aria-hidden="true">
              <Icon name={forecastSevere ? 'warning' : 'season'} size={18} />
            </span>
            <div className={styles.nextClimateBody}>
              <span>Prochaine saison annoncée</span>
              <div>
                <strong>{forecast.labelFr}</strong>
                {forecastSevere && <Badge variant="danger">Rude</Badge>}
              </div>
              <p>{forecast.summaryFr}</p>
              {forecastThreats.length > 0 && (
                <div className={styles.forecastThreats}>
                  {forecastThreats.map((effect, index) => (
                    <small key={`forecast-${index}`}>{compactEffectText(effect)}</small>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </aside>
  );
}
