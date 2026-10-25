import type { TurnPhase } from '@catanx/engine';

export interface TutorialStep {
  id: string;
  title: string;
  detail: string;
  done: boolean;
}

export interface TutorialContext {
  classicMode: boolean;
  citiesKnights?: boolean;
  isInitialPlacement: boolean;
  placementStep?: 'settlement' | 'road' | null;
  hasRolledDiceThisTurn: boolean;
  selectedTileId: string | null;
  sidePanelTab: 'tile' | 'build' | 'trade' | 'units' | 'city';
  currentTurn: number;
  turnPhase: TurnPhase | string;
  hasBuiltThisTurn: boolean;
  hasTradedThisTurn: boolean;
  hasEndedTurnOnce: boolean;
  /** C&K : au moins un chevalier du joueur local. */
  hasCkKnight?: boolean;
  /** C&K : piste barbares a avancé ou invasion vue. */
  hasSeenBarbarians?: boolean;
  /** C&K : amélioration urbaine effectuée. */
  hasImprovedUrban?: boolean;
}

function classicSteps(ctx: TutorialContext): TutorialStep[] {
  if (ctx.isInitialPlacement) {
    return [
      {
        id: 'camera',
        title: 'Explorer la carte',
        detail: 'Clic droit pour deplacer, molette pour zoomer.',
        done: true,
      },
      {
        id: 'settlement',
        title: ctx.citiesKnights
          ? 'Poser colonie puis ville'
          : 'Poser un village',
        detail: ctx.citiesKnights
          ? 'Première construction : colonie. Seconde : ville (ressources).'
          : 'Cliquez une intersection libre, puis confirmez.',
        done: ctx.placementStep === 'road',
      },
      {
        id: 'road',
        title: 'Poser une route',
        detail: 'Reliez votre village sur une arete libre, puis confirmez.',
        done: false,
      },
    ];
  }

  const sevenPhases = ['discard_resources', 'move_robber', 'steal_resource'];
  const sevenResolved =
    ctx.hasRolledDiceThisTurn && !sevenPhases.includes(String(ctx.turnPhase));

  const base: TutorialStep[] = [
    {
      id: 'camera',
      title: 'Explorer la carte',
      detail: 'Clic droit pour deplacer, molette pour zoomer.',
      done: true,
    },
    {
      id: 'dice',
      title: ctx.citiesKnights ? 'Lancer les 3 dés' : 'Lancer les des',
      detail: ctx.citiesKnights
        ? 'Deux dés numériques + dé Événement (navire ou porte).'
        : 'Declenchez la production ou le 7 avec le bouton principal.',
      done: ctx.hasRolledDiceThisTurn,
    },
  ];

  if (ctx.citiesKnights) {
    base.push(
      {
        id: 'ck_barbarians',
        title: 'Surveiller les barbares',
        detail:
          'Chaque navire avance la piste. À la fin : invasion. Activez vos chevaliers.',
        done: Boolean(ctx.hasSeenBarbarians) || ctx.currentTurn > 3,
      },
      {
        id: 'ck_knights',
        title: 'Recruter un chevalier',
        detail: 'Via le menu V&C (coin droit, bouton Ouvrir) : 1 mouton + 1 minerai.',
        done: Boolean(ctx.hasCkKnight) || ctx.currentTurn > 5,
      },
      {
        id: 'ck_urban',
        title: 'Améliorer une ville',
        detail: 'Dépensez des marchandises pour Commerce, Politique ou Science.',
        done: Boolean(ctx.hasImprovedUrban) || ctx.currentTurn > 6,
      },
    );
  } else {
    base.push({
      id: 'seven',
      title: 'Gerer le 7',
      detail: 'Defaussez, deplacez le brigand et volez si necessaire.',
      done: sevenResolved,
    });
  }

  base.push(
    {
      id: 'build',
      title: 'Construire',
      detail: 'Ouvrez Construction pour poser routes, villages ou villes.',
      done: ctx.hasBuiltThisTurn || ctx.sidePanelTab === 'build',
    },
    {
      id: 'trade',
      title: 'Commercer',
      detail: 'Echangez avec la banque ou les ports via Commerce.',
      done: ctx.hasTradedThisTurn || ctx.sidePanelTab === 'trade',
    },
    {
      id: 'turn',
      title: 'Terminer le tour',
      detail: 'Quand vos actions sont faites, passez au joueur suivant.',
      done: ctx.hasEndedTurnOnce,
    },
  );

  return base;
}

function catanxSteps(ctx: TutorialContext): TutorialStep[] {
  const hasSelectedTile = Boolean(ctx.selectedTileId);
  const hasOpenedActionPanel = ctx.sidePanelTab !== 'tile';

  const steps: TutorialStep[] = [
    {
      id: 'camera',
      title: 'Prendre la camera en main',
      detail: 'Clic droit pour deplacer, molette pour zoomer.',
      done: true,
    },
    {
      id: 'dice',
      title: ctx.citiesKnights ? 'Lancer les 3 dés' : 'Lancer les des',
      detail: ctx.citiesKnights
        ? 'Production, dé Événement, et piste des barbares.'
        : 'Declenchez la production du tour.',
      done: ctx.hasRolledDiceThisTurn,
    },
  ];

  if (ctx.citiesKnights) {
    steps.push(
      {
        id: 'ck_panel',
        title: 'Menu Villes & Chevaliers',
        detail: 'Coin droit : pastille V&C compacte — Ouvrir pour marchandises, pistes et chevaliers.',
        done: ctx.currentTurn > 1,
      },
      {
        id: 'ck_knights',
        title: 'Défense chevaliers',
        detail: 'Menu V&C → Recruter sur la carte, puis cliquez une intersection libre de votre réseau (1 mouton + 1 minerai). Activez ensuite avec 1 blé.',
        done: Boolean(ctx.hasCkKnight) || ctx.currentTurn > 4,
      },
    );
  } else {
    steps.push(
      {
        id: 'tile',
        title: 'Inspecter une tuile',
        detail: 'Cliquez une tuile pour voir production et proprietaire.',
        done: hasSelectedTile,
      },
      {
        id: 'panel',
        title: 'Choisir une action',
        detail: 'Ouvrez Construction, Commerce, Unites ou Ville.',
        done: hasOpenedActionPanel,
      },
    );
  }

  steps.push({
    id: 'turn',
    title: 'Terminer un tour',
    detail: 'Cliquez Fin du tour quand vos actions sont faites.',
    done: ctx.hasEndedTurnOnce || ctx.currentTurn > 1,
  });

  return steps;
}

export function buildTutorialSteps(ctx: TutorialContext): TutorialStep[] {
  return ctx.classicMode ? classicSteps(ctx) : catanxSteps(ctx);
}

export function findActiveTutorialStep(steps: TutorialStep[]): TutorialStep {
  return steps.find((step) => !step.done) ?? steps[steps.length - 1]!;
}
