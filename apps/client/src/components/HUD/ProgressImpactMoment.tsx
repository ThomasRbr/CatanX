import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type {
  CkProgressCardType,
  CkProgressPlayImpact,
  CkProgressPlayerImpact,
  GamePacingPreset,
} from '@catanx/engine';
import styles from './ProgressImpactMoment.module.css';

const CARD_META: Record<CkProgressCardType, { title: string; effect: string; sigil: string }> = {
  merchant: { title: 'Marchand', effect: 'Le marchand change de territoire.', sigil: '⚖' },
  merchant_fleet: { title: 'Flotte marchande', effect: 'Un commerce à 2:1 est activé.', sigil: '⚓' },
  trade_harbor: { title: 'Port de commerce', effect: 'Des échanges sont imposés aux adversaires.', sigil: '⇄' },
  resource_monopoly: { title: 'Monopole des ressources', effect: 'Une ressource est prélevée chez les adversaires.', sigil: '◈' },
  commodity_monopoly: { title: 'Monopole des marchandises', effect: 'Une marchandise est prélevée chez les adversaires.', sigil: '◇' },
  master_merchant: { title: 'Maître marchand', effect: 'Deux cartes sont prises à un joueur en tête.', sigil: '♛' },
  bishop: { title: 'Évêque', effect: 'Le brigand se déplace et frappe ses voisins.', sigil: '✦' },
  diplomat: { title: 'Diplomate', effect: 'Une route ouverte est retirée ou déplacée.', sigil: '⚑' },
  intrigue: { title: 'Intrigue', effect: 'Un chevalier adverse est délogé.', sigil: '☩' },
  deserter: { title: 'Déserteur', effect: 'Un chevalier change de camp.', sigil: '⚔' },
  spy: { title: 'Espion', effect: 'Une carte Progrès est dérobée.', sigil: '◉' },
  warlord: { title: 'Seigneur de guerre', effect: 'Tous les chevaliers du joueur sont activés.', sigil: '♜' },
  alchemist: { title: 'Alchimiste', effect: 'Les deux dés numériques sont choisis.', sigil: '✧' },
  crane: { title: 'Grue', effect: 'La prochaine amélioration urbaine coûtera moins cher.', sigil: '⌂' },
  engineer: { title: 'Ingénieur', effect: 'Une muraille est construite gratuitement.', sigil: '▦' },
  inventor: { title: 'Inventeur', effect: 'Deux jetons numériques sont échangés.', sigil: '↻' },
  road_building: { title: 'Construction routière', effect: 'Deux routes gratuites sont accordées.', sigil: '╱' },
  smith: { title: 'Forgeron', effect: 'Jusqu’à deux chevaliers sont promus.', sigil: '⚒' },
};

const LABELS: Record<string, string> = {
  wood: 'bois',
  clay: 'argile',
  wheat: 'blé',
  sheep: 'mouton',
  ore: 'minerai',
  ck_paper: 'papier',
  ck_cloth: 'tissu',
  ck_coin: 'monnaie',
};

interface ProgressImpactMomentProps {
  token: string;
  actorId: string;
  viewerId: string | null;
  playerNames: Record<string, string>;
  impact: CkProgressPlayImpact;
  pacing: GamePacingPreset;
  onComplete?: () => void;
}

function signedAmount(value: number): string {
  return `${value > 0 ? '+' : '−'}${Math.abs(value)}`;
}

function describeImpact(impact: CkProgressPlayerImpact | undefined): string[] {
  if (!impact) return [];
  const fragments: string[] = [];
  for (const [resource, delta] of Object.entries(impact.resourceDelta)) {
    if (delta) fragments.push(`${signedAmount(delta)} ${LABELS[resource] ?? resource}`);
  }
  for (const [commodity, delta] of Object.entries(impact.commodityDelta)) {
    if (delta) fragments.push(`${signedAmount(delta)} ${LABELS[commodity] ?? commodity}`);
  }
  if (impact.progressCardDelta) {
    fragments.push(`${signedAmount(impact.progressCardDelta)} carte Progrès`);
  }
  if (impact.roadsRemoved) fragments.push(`−${impact.roadsRemoved} route`);
  if (impact.roadsAdded) fragments.push(`+${impact.roadsAdded} route`);
  if (impact.knightsRemoved) fragments.push(`−${impact.knightsRemoved} chevalier`);
  if (impact.knightsAdded) fragments.push(`+${impact.knightsAdded} chevalier`);
  if (impact.knightsMoved) fragments.push(`${impact.knightsMoved} chevalier déplacé`);
  if (impact.knightsActivated) fragments.push(`${impact.knightsActivated} chevalier activé`);
  if (impact.knightsPromoted) fragments.push(`${impact.knightsPromoted} chevalier promu`);
  return fragments;
}

export function ProgressImpactMoment({
  token,
  actorId,
  viewerId,
  playerNames,
  impact,
  pacing,
  onComplete,
}: ProgressImpactMomentProps) {
  const [visible, setVisible] = useState(true);
  const duration = pacing === 'epic' ? 6500 : pacing === 'tabletop' ? 5200 : 4200;
  const meta = CARD_META[impact.cardType];
  const actorName = playerNames[actorId] ?? 'Un joueur';
  const targetNames = impact.targetPlayerIds.map((id) => playerNames[id] ?? 'un adversaire');
  const isActor = viewerId === actorId;
  const isTarget = Boolean(viewerId && impact.targetPlayerIds.includes(viewerId));
  const role = isTarget ? 'target' : isActor ? 'actor' : 'observer';
  const ownImpact = viewerId ? impact.impacts[viewerId] : undefined;
  const fragments = useMemo(() => describeImpact(ownImpact), [ownImpact]);

  useEffect(() => {
    setVisible(true);
    const timeout = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, duration);
    return () => window.clearTimeout(timeout);
  }, [duration, onComplete, token]);

  if (!visible) return null;

  const eyebrow = isTarget
    ? 'Carte jouée contre vous'
    : isActor
      ? 'Votre carte Progrès'
      : 'Carte Progrès jouée';
  const sourceLine = isTarget
    ? `${actorName} vous cible`
    : targetNames.length
      ? `${actorName} → ${targetNames.join(', ')}`
      : `${actorName} active son effet`;

  return (
    <article
      className={styles.moment}
      data-deck={impact.deck}
      data-role={role}
      role="status"
      aria-live="assertive"
      style={{ '--impact-duration': `${duration}ms` } as CSSProperties}
    >
      <div className={styles.card} aria-hidden="true">
        <span>{meta.sigil}</span>
        <small>{impact.deck === 'trade' ? 'Commerce' : impact.deck === 'politics' ? 'Politique' : 'Science'}</small>
      </div>
      <div className={styles.copy}>
        <small className={styles.eyebrow}>{eyebrow}</small>
        <strong>{meta.title}</strong>
        <span className={styles.source}>{sourceLine}</span>
        <p>{fragments.length ? fragments.join(' · ') : meta.effect}</p>
      </div>
      <div className={styles.impactMark} aria-hidden="true">
        <i />
        <span>{isTarget ? '!' : meta.sigil}</span>
      </div>
      <span className={styles.timer} aria-hidden="true" />
    </article>
  );
}
