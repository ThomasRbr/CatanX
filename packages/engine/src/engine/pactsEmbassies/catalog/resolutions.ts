/**
 * Catalogue des résolutions — Pactes & Ambassades.
 * Effets data-driven (effectId) interprétés par le moteur.
 */

import type { ResolutionCategory } from '../../../types/pactsEmbassies';

/** Domaine d’effet autorisé (commerce, ports, main, civils, ambassades, US). */
export type ResolutionEffectKind =
  | 'trade_ratio'
  | 'ports'
  | 'hand_limit'
  | 'civil_build_cost'
  | 'embassy'
  | 'tunnel'
  | 'airship'
  | 'contract'
  | 'crystal'
  | 'aether';

export interface ResolutionDefinition {
  id: string;
  category: ResolutionCategory;
  title: string;
  description: string;
  effectKind: ResolutionEffectKind;
  /** effectId interprété par le moteur (variante modérée). */
  moderateEffect: string;
  /** effectId interprété par le moteur (variante ambitieuse). */
  ambitiousEffect: string;
}

export const RESOLUTION_CATALOG: readonly ResolutionDefinition[] = [
  // ── Commerce (6) ──────────────────────────────────────────────────────────
  {
    id: 'pe_res_charte_caravanes',
    category: 'commerce',
    title: 'Charte des caravanes',
    description:
      'Le Conseil assouplit les ratios d’échange avec la banque pour fluidifier les caravanes.',
    effectKind: 'trade_ratio',
    moderateEffect: 'trade_ratio_bank_3',
    ambitiousEffect: 'trade_ratio_bank_2',
  },
  {
    id: 'pe_res_edits_foires',
    category: 'commerce',
    title: 'Édits des foires',
    description:
      'Les foires saisonnières ouvrent un taux préférentiel sur un type de ressource choisi.',
    effectKind: 'trade_ratio',
    moderateEffect: 'trade_ratio_any_one_2',
    ambitiousEffect: 'trade_ratio_any_two_2',
  },
  {
    id: 'pe_res_privilege_comptoirs',
    category: 'commerce',
    title: 'Privilège des comptoirs',
    description:
      'Les ports génériques deviennent plus avantageux pour tous les comptoirs côtiers.',
    effectKind: 'ports',
    moderateEffect: 'port_generic_2',
    ambitiousEffect: 'port_generic_2_and_special_bonus',
  },
  {
    id: 'pe_res_marche_unique',
    category: 'commerce',
    title: 'Marché unique',
    description:
      'Un marché unifié autorise un échange banque supplémentaire par tour pour chaque joueur.',
    effectKind: 'trade_ratio',
    moderateEffect: 'bank_trade_extra_1',
    ambitiousEffect: 'bank_trade_extra_2',
  },
  {
    id: 'pe_res_quotas_echange',
    category: 'commerce',
    title: 'Quotas d’échange',
    description:
      'Les échanges entre joueurs bénéficient d’un bonus de volume contrôlé par le Conseil.',
    effectKind: 'trade_ratio',
    moderateEffect: 'player_trade_bonus_slot_1',
    ambitiousEffect: 'player_trade_bonus_slot_2',
  },
  {
    id: 'pe_res_libre_passage',
    category: 'commerce',
    title: 'Libre-passage douanier',
    description:
      'Les ports spécialisés voient leur ratio réduit ; le libre-passage accélère le commerce côtier.',
    effectKind: 'ports',
    moderateEffect: 'port_special_2_to_1',
    ambitiousEffect: 'port_all_improved',
  },

  // ── Infrastructure (6) ────────────────────────────────────────────────────
  {
    id: 'pe_res_voies_royales',
    category: 'infrastructure',
    title: 'Voies royales',
    description:
      'Les routes et constructions civiles voient leur coût allégé par décret du Conseil.',
    effectKind: 'civil_build_cost',
    moderateEffect: 'civil_cost_discount_1_resource',
    ambitiousEffect: 'civil_cost_discount_2_resources',
  },
  {
    id: 'pe_res_ponts_chaussees',
    category: 'infrastructure',
    title: 'Ponts et chaussées',
    description:
      'Les travaux de voirie réduisent le coût de la prochaine route construite.',
    effectKind: 'civil_build_cost',
    moderateEffect: 'road_cost_discount_1',
    ambitiousEffect: 'road_cost_discount_2',
  },
  {
    id: 'pe_res_relais_postaux',
    category: 'infrastructure',
    title: 'Relais postaux',
    description:
      'Le réseau de relais autorise une ambassade à moindre coût pendant la session.',
    effectKind: 'embassy',
    moderateEffect: 'embassy_cost_discount_1',
    ambitiousEffect: 'embassy_cost_discount_2',
  },
  {
    id: 'pe_res_arsenal_civil',
    category: 'infrastructure',
    title: 'Arsenal civil',
    description:
      'Les ateliers civils réduisent le coût des colonies et villes pour tous.',
    effectKind: 'civil_build_cost',
    moderateEffect: 'settlement_cost_discount_1',
    ambitiousEffect: 'city_cost_discount_1',
  },
  {
    id: 'pe_res_grands_travaux',
    category: 'infrastructure',
    title: 'Grands travaux',
    description:
      'Un programme d’équipement abaisse le coût d’une pièce civile au choix par joueur.',
    effectKind: 'civil_build_cost',
    moderateEffect: 'civil_any_discount_1_once',
    ambitiousEffect: 'civil_any_discount_1_twice',
  },
  {
    id: 'pe_res_entrepots_communaux',
    category: 'infrastructure',
    title: 'Entrepôts communaux',
    description:
      'Les entrepôts publics relèvent le seuil de main avant la défausse au 7.',
    effectKind: 'hand_limit',
    moderateEffect: 'hand_limit_8',
    ambitiousEffect: 'hand_limit_9',
  },

  // ── Solidarité (6) ────────────────────────────────────────────────────────
  {
    id: 'pe_res_greniers_partages',
    category: 'solidarity',
    title: 'Greniers partagés',
    description:
      'La solidarité alimentaire étend la capacité de main et protège les stocks modestes.',
    effectKind: 'hand_limit',
    moderateEffect: 'hand_limit_plus_1',
    ambitiousEffect: 'hand_limit_plus_2',
  },
  {
    id: 'pe_res_droit_asile',
    category: 'solidarity',
    title: 'Droit d’asile commercial',
    description:
      'Les ambassades deviennent plus accessibles ; l’asile diplomatique est garanti.',
    effectKind: 'embassy',
    moderateEffect: 'embassy_build_sheep_waived',
    ambitiousEffect: 'embassy_build_half_cost',
  },
  {
    id: 'pe_res_main_ouverte',
    category: 'solidarity',
    title: 'Main ouverte',
    description:
      'Le Conseil encourage la générosité : seuil de défausse relevé pour tous.',
    effectKind: 'hand_limit',
    moderateEffect: 'hand_limit_8',
    ambitiousEffect: 'hand_limit_10',
  },
  {
    id: 'pe_res_pacte_sobriete',
    category: 'solidarity',
    title: 'Pacte de sobriété',
    description:
      'Les constructions civiles partagent un coût réduit en échange d’une discipline commune.',
    effectKind: 'civil_build_cost',
    moderateEffect: 'civil_cost_shared_discount_1',
    ambitiousEffect: 'civil_cost_shared_discount_2',
  },
  {
    id: 'pe_res_fraternite_ports',
    category: 'solidarity',
    title: 'Fraternité des ports',
    description:
      'Tous les ports côtiers offrent temporairement le ratio générique amélioré.',
    effectKind: 'ports',
    moderateEffect: 'port_generic_as_3',
    ambitiousEffect: 'port_generic_as_2',
  },
  {
    id: 'pe_res_levee_solidarite',
    category: 'solidarity',
    title: 'Levée de solidarité',
    description:
      'Une levée commune finance une réduction sur le coût d’ambassade pour chaque joueur.',
    effectKind: 'embassy',
    moderateEffect: 'embassy_cost_ore_waived',
    ambitiousEffect: 'embassy_second_half_price',
  },

  // ── Monde vertical (6) — Souterrain & Ciel ─────────────────────────────────
  {
    id: 'pe_res_corridors_souterrains',
    category: 'vertical_world',
    title: 'Corridors souterrains',
    description:
      'Le Conseil subventionne le forage : tunnels et prospections coûtent moins cher.',
    effectKind: 'tunnel',
    moderateEffect: 'tunnel_cost_discount_1',
    ambitiousEffect: 'tunnel_cost_discount_clay_waived',
  },
  {
    id: 'pe_res_alizes_publics',
    category: 'vertical_world',
    title: 'Alizés publics',
    description:
      'Les courants aériens publics augmentent le budget de vol des dirigeables.',
    effectKind: 'airship',
    moderateEffect: 'airship_budget_plus_1',
    ambitiousEffect: 'airship_budget_plus_2',
  },
  {
    id: 'pe_res_reserve_cristal',
    category: 'vertical_world',
    title: 'Réserve de cristal',
    description:
      'Une réserve partagée facilite l’échange de Cristal auprès de la banque.',
    effectKind: 'crystal',
    moderateEffect: 'crystal_bank_trade_3',
    ambitiousEffect: 'crystal_bank_trade_2',
  },
  {
    id: 'pe_res_vent_ether',
    category: 'vertical_world',
    title: 'Vent d’éther',
    description:
      'Les courants d’Éther réduisent le coût des voiles et balises aériennes.',
    effectKind: 'aether',
    moderateEffect: 'aether_upgrade_discount_1',
    ambitiousEffect: 'aether_bank_trade_2',
  },
  {
    id: 'pe_res_contrats_etat',
    category: 'vertical_world',
    title: 'Contrats d’État',
    description:
      'L’État commissionne des livraisons : récompenses de contrats aériens majorées.',
    effectKind: 'contract',
    moderateEffect: 'contract_reward_plus_1',
    ambitiousEffect: 'contract_reward_plus_2',
  },
  {
    id: 'pe_res_reseau_vertical',
    category: 'vertical_world',
    title: 'Réseau vertical',
    description:
      'Un réseau unifié allège tunnels et dirigeables pour relier Surface, Profondeurs et Ciel.',
    effectKind: 'tunnel',
    moderateEffect: 'tunnel_and_airship_discount_1',
    ambitiousEffect: 'vertical_network_boost',
  },
] as const;

const BY_ID = new Map(RESOLUTION_CATALOG.map((r) => [r.id, r]));

export function getResolutionById(id: string): ResolutionDefinition | undefined {
  return BY_ID.get(id);
}
