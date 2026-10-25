/**
 * Catalogue des crises — Pactes & Ambassades.
 * Injection conditionnelle selon les extensions actives.
 */

export type PeExtensionId = 'citiesKnights' | 'seasons' | 'undergroundSky';

export interface CrisisDefinition {
  id: string;
  title: string;
  description: string;
  /** Présente uniquement si toutes les extensions listées sont actives. */
  requiredExtensions?: PeExtensionId[];
  /** Pénalité légère (4 rondes) en cas d’échec — interprétée par le moteur. */
  mildPenaltyEffectId: string;
}

export interface PeExtensionsEnabled {
  citiesKnights?: boolean;
  seasons?: boolean;
  undergroundSky?: boolean;
}

export const CRISIS_CATALOG: readonly CrisisDefinition[] = [
  // ── Crises de base (toujours disponibles) ─────────────────────────────────
  {
    id: 'pe_crisis_famine_greniers',
    title: 'Famine des greniers',
    description:
      'Les réserves alimentaires s’épuisent. Le Conseil appelle à une contribution urgente en blé et mouton.',
    mildPenaltyEffectId: 'crisis_penalty_hand_limit_minus_1',
  },
  {
    id: 'pe_crisis_penurie_bois',
    title: 'Pénurie de bois',
    description:
      'Les forêts se taisent. Sans apport collectif, les chantiers civils ralentissent.',
    mildPenaltyEffectId: 'crisis_penalty_civil_cost_plus_1',
  },
  {
    id: 'pe_crisis_blocus_ports',
    title: 'Blocus des ports',
    description:
      'Des corsaires menacent les côtes. Une levée commune doit rouvrir les comptoirs.',
    mildPenaltyEffectId: 'crisis_penalty_port_ratio_worse',
  },
  {
    id: 'pe_crisis_route_coupee',
    title: 'Route coupée',
    description:
      'Un éboulement isole les caravanes. Le Conseil exige des ressources pour rétablir le passage.',
    mildPenaltyEffectId: 'crisis_penalty_trade_ratio_plus_1',
  },
  {
    id: 'pe_crisis_epidemie_marches',
    title: 'Épidémie des marchés',
    description:
      'La contagion frappe les foires. Une aide matérielle rapide contient la panique commerciale.',
    mildPenaltyEffectId: 'crisis_penalty_hand_limit_minus_1',
  },
  {
    id: 'pe_crisis_incendie_entrepots',
    title: 'Incendie des entrepôts',
    description:
      'Les entrepôts brûlent. Sans secours, le seuil de stockage communal s’effondre.',
    mildPenaltyEffectId: 'crisis_penalty_hand_limit_minus_2',
  },

  // ── Villes & Chevaliers ────────────────────────────────────────────────────
  {
    id: 'pe_crisis_pression_barbare',
    title: 'Pression barbare',
    description:
      'Les barbares massent leurs forces. Marchandises et ressources doivent armer la défense commune.',
    requiredExtensions: ['citiesKnights'],
    mildPenaltyEffectId: 'crisis_penalty_civil_cost_plus_1',
  },
  {
    id: 'pe_crisis_metropoles_affamees',
    title: 'Métropoles affamées',
    description:
      'Les métropoles réclament du papier, du tissu et des monnaies. L’échec affaiblit le commerce urbain.',
    requiredExtensions: ['citiesKnights'],
    mildPenaltyEffectId: 'crisis_penalty_trade_ratio_plus_1',
  },

  // ── Saisons ───────────────────────────────────────────────────────────────
  {
    id: 'pe_crisis_hiver_rigoureux',
    title: 'Hiver rigoureux',
    description:
      'Un froid hors saison frappe l’île. Sans stock collectif, les préparatifs climatiques coûtent plus cher.',
    requiredExtensions: ['seasons'],
    mildPenaltyEffectId: 'crisis_penalty_civil_cost_plus_1',
  },
  {
    id: 'pe_crisis_secheresse_prolongee',
    title: 'Sécheresse prolongée',
    description:
      'Les climats s’enchaînent sans pluie. Le Conseil organise une réserve d’urgence.',
    requiredExtensions: ['seasons'],
    mildPenaltyEffectId: 'crisis_penalty_hand_limit_minus_1',
  },

  // ── Souterrain & Ciel ─────────────────────────────────────────────────────
  {
    id: 'pe_crisis_faille_instable',
    title: 'Faille instable',
    description:
      'Le Souterrain tremble. Cristal et argile sont requis pour consolider les tunnels.',
    requiredExtensions: ['undergroundSky'],
    mildPenaltyEffectId: 'crisis_penalty_tunnel_cost_plus_1',
  },
  {
    id: 'pe_crisis_turbulences_alizes',
    title: 'Turbulences des alizés',
    description:
      'Le Ciel se déchaîne. Éther et mouton doivent stabiliser les routes aériennes.',
    requiredExtensions: ['undergroundSky'],
    mildPenaltyEffectId: 'crisis_penalty_airship_budget_minus_1',
  },
] as const;

const BY_ID = new Map(CRISIS_CATALOG.map((c) => [c.id, c]));

export function getCrisisById(id: string): CrisisDefinition | undefined {
  return BY_ID.get(id);
}

function extensionsSatisfied(
  required: PeExtensionId[] | undefined,
  enabled: PeExtensionsEnabled,
): boolean {
  if (!required || required.length === 0) return true;
  return required.every((ext) => Boolean(enabled[ext]));
}

/** Crises injectables selon les extensions actives de la partie. */
export function listAvailableCrises(
  extensionsEnabled: PeExtensionsEnabled,
): CrisisDefinition[] {
  return CRISIS_CATALOG.filter((c) =>
    extensionsSatisfied(c.requiredExtensions, extensionsEnabled),
  );
}
