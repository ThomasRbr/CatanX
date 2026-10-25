/**
 * Catalogue des mandats — Pactes & Ambassades.
 * Conditions évaluées côté moteur ; injection selon extensions actives.
 */

import type { PeExtensionId, PeExtensionsEnabled } from './crises';

export interface MandateDefinition {
  id: string;
  title: string;
  description: string;
  /** Condition métier (ex. pacts_honored, embassy_count). */
  conditionKind: string;
  conditionData?: Record<string, unknown>;
  /** Présent uniquement si toutes les extensions listées sont actives. */
  requiredExtensions?: PeExtensionId[];
}

export const MANDATE_CATALOG: readonly MandateDefinition[] = [
  // ── Mandats de base ───────────────────────────────────────────────────────
  {
    id: 'pe_mandate_parole_donnee',
    title: 'Parole donnée',
    description:
      'Honorer deux pactes jusqu’à leur terme sans rupture unilatérale.',
    conditionKind: 'pacts_honored',
    conditionData: { count: 2 },
  },
  {
    id: 'pe_mandate_sceau_adopte',
    title: 'Sceau adopté',
    description:
      'Faire adopter deux résolutions que vous avez parrainées en variante ambitieuse.',
    conditionKind: 'resolutions_adopted',
    conditionData: { count: 2, sponsored: true },
  },
  {
    id: 'pe_mandate_reseau_diplomatique',
    title: 'Réseau diplomatique',
    description: 'Posséder deux ambassades actives simultanément.',
    conditionKind: 'embassy_count',
    conditionData: { count: 2, activeOnly: true },
  },
  {
    id: 'pe_mandate_renommee_eclatante',
    title: 'Renommée éclatante',
    description: 'Atteindre une réputation de 5 ou plus.',
    conditionKind: 'reputation_min',
    conditionData: { min: 5 },
  },
  {
    id: 'pe_mandate_sauveur_du_conseil',
    title: 'Sauveur du Conseil',
    description:
      'Contribuer suffisamment à deux crises résolues avec succès (au moins 2 points chacune).',
    conditionKind: 'crisis_contributions',
    conditionData: { successfulCrises: 2, minPointsPerCrisis: 2 },
  },
  {
    id: 'pe_mandate_voix_du_hemicycle',
    title: 'Voix de l’hémicycle',
    description: 'Déposer un vote valide lors de trois sessions du Conseil.',
    conditionKind: 'council_votes',
    conditionData: { count: 3 },
  },
  {
    id: 'pe_mandate_passage_allie',
    title: 'Passage allié',
    description:
      'Utiliser trois fois une infrastructure alliée (route, tunnel ou trajet aérien) grâce à un pacte.',
    conditionKind: 'allied_infra_usage',
    conditionData: { count: 3 },
  },
  {
    id: 'pe_mandate_premier_negociant',
    title: 'Premier négociant',
    description:
      'Conclure le premier échange valide de la ronde lors de quatre rondes distinctes.',
    conditionKind: 'first_trades',
    conditionData: { count: 4 },
  },

  // ── Villes & Chevaliers ────────────────────────────────────────────────────
  {
    id: 'pe_mandate_consul_metropolitain',
    title: 'Consul métropolitain',
    description:
      'Maintenir une ambassade active sur une métropole pendant deux sessions complètes.',
    conditionKind: 'embassy_count',
    conditionData: { count: 1, onMetropolis: true, sessionsHeld: 2 },
    requiredExtensions: ['citiesKnights'],
  },
  {
    id: 'pe_mandate_levees_marchandes',
    title: 'Levées marchandes',
    description:
      'Contribuer au moins 4 points de marchandises CK à des crises résolues.',
    conditionKind: 'crisis_contributions',
    conditionData: { commodityPoints: 4 },
    requiredExtensions: ['citiesKnights'],
  },

  // ── Saisons ───────────────────────────────────────────────────────────────
  {
    id: 'pe_mandate_garde_des_climats',
    title: 'Garde des climats',
    description:
      'Participer aux votes de trois sessions correspondant à trois saisons distinctes.',
    conditionKind: 'council_votes',
    conditionData: { count: 3, distinctSeasons: true },
    requiredExtensions: ['seasons'],
  },

  // ── Souterrain & Ciel ─────────────────────────────────────────────────────
  {
    id: 'pe_mandate_pont_des_trois_mondes',
    title: 'Pont des trois mondes',
    description:
      'Utiliser quatre fois une infrastructure alliée souterraine ou aérienne (passage / alizés).',
    conditionKind: 'allied_infra_usage',
    conditionData: { count: 4, layers: ['underground', 'sky'] },
    requiredExtensions: ['undergroundSky'],
  },
] as const;

const BY_ID = new Map(MANDATE_CATALOG.map((m) => [m.id, m]));

export function getMandateById(id: string): MandateDefinition | undefined {
  return BY_ID.get(id);
}

function extensionsSatisfied(
  required: PeExtensionId[] | undefined,
  enabled: PeExtensionsEnabled,
): boolean {
  if (!required || required.length === 0) return true;
  return required.every((ext) => Boolean(enabled[ext]));
}

/** Mandats injectables selon les extensions actives de la partie. */
export function listAvailableMandates(
  extensionsEnabled: PeExtensionsEnabled,
): MandateDefinition[] {
  return MANDATE_CATALOG.filter((m) =>
    extensionsSatisfied(m.requiredExtensions, extensionsEnabled),
  );
}
