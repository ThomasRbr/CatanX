import { GameConfig, VictoryCondition } from '../types/game';

/**
 * Victoires exposables selon les modules actifs.
 * Chaque condition a une règle d'atteinte et une contre-mesure documentée.
 */
export function getAvailableVictoryConditions(config: Pick<
  GameConfig,
  | 'enableTechTree'
  | 'enableDiplomacy'
  | 'enableMilitary'
  | 'enableProductionChains'
  | 'worldCouncil'
>): VictoryCondition[] {
  const list: VictoryCondition[] = ['points', 'domination'];

  if (config.enableTechTree) list.push('science');
  if (config.enableProductionChains) {
    list.push('culture', 'religious', 'economic');
  }
  if (config.enableDiplomacy && config.worldCouncil) list.push('diplomatic');
  if (config.enableMilitary) list.push('elimination');

  return list;
}

export const VICTORY_RULE_HINTS: Record<VictoryCondition, string> = {
  points: 'Atteindre l’objectif de points de victoire.',
  domination: 'Contrôler ≥40 % des tuiles terrestres et mener au classement territorial.',
  science: 'Rechercher assez de technologies (merveille réduit le seuil). Contre : course tech.',
  culture: 'Mener en culture au-delà du seuil. Contre : production culturelle adverse.',
  religious: 'Mener en foi au-delà du seuil. Contre : production de foi adverse.',
  economic: 'Mener en richesse (coins/or/gemmes). Contre : commerce adverse.',
  diplomatic:
    'Alliés (1 en 2 joueurs, sinon 2), pas de guerre, influence élevée (élection conseil aide). Contre : ruptures.',
  elimination: 'Être le dernier joueur non éliminé. Contre : alliances militaires.',
};
