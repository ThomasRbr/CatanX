import { GameState } from '../types/game';
import { EngineContext } from './context';
import { CommandResult, commandError, commandSuccess, CommandEmittedEvent } from './errors';
import { setActiveRandom, randomInt, randomChoice } from './rng';
import { setActiveClock, now } from './clock';
import { setActiveIdGenerator, nextId } from './ids';
import type { GameCommand } from '@catanx/protocol';
import { PlayerSetup } from '../engine/game/GameEngine';
import {
  createGame,
  rollDice,
  acknowledgeCollection,
  maybeAcknowledgeCollection,
  hasCkCollectionBlockers,
  processTurn,
  drawDevCard,
  playDevCard,
  handleSetupPlacement,
  discardResources,
  moveRobber,
  stealResource,
  bankTrade,
  hasPlayerRolledDiceThisTurn,
  refreshTrophiesAndVictory,
} from '../engine/game/GameEngine';
import {
  attackUnit,
  castCouncilVote,
  chooseEvent,
  ensurePendingEventChoices,
  moveUnit,
  recruitUnit,
  runDiplomacyCommand,
  startResearch,
} from '../engine/modules/ModuleActions';
import {
  classicBuildRoad,
  classicBuildSettlement,
  classicSetupPlaceRoad,
  classicSetupPlaceSettlement,
  classicUpgradeCity,
} from '../engine/catan/ClassicCommands';
import {
  acceptPlayerTrade,
  cancelPlayerTrade,
  proposePlayerTrade,
  rejectPlayerTrade,
} from '../engine/catan/ClassicPlayerTrade';
import { clearAiMemoryForGame } from '../engine/ai/shared/AiMemory';
import { usesTopologicalPlacement } from '../engine/catan/ClassicBoard';
import { craftRecipe } from '../engine/resources/ProductionSystem';
import { seasonsChoosePreparationCommand } from '../engine/seasons/SeasonSystem';
import { drainSeasonEvents } from '../engine/seasons/events';
import {
  handleUndergroundSkyCommand,
  drainUndergroundSkyEvents,
} from '../engine/undergroundSky';
import {
  handlePactsEmbassiesCommand,
  drainPactsEmbassiesEvents,
} from '../engine/pactsEmbassies';
import { modulesFromConfig } from './presets';
import { validateModules } from './modules';
import {
  ckImproveUrban,
  ckPlaceMetropolis,
  ckChooseAqueduct,
  listFreeMetropolisHosts,
} from '../engine/citiesKnights/urban';
import type { CkUrbanTrack } from '../types/citiesKnights';
import { ckBuildWall } from '../engine/citiesKnights/walls';
import {
  ckRecruitKnight,
  ckActivateKnight,
  ckPromoteKnight,
  ckMoveKnight,
  ckDisplaceKnight,
  ckChaseRobber,
  ckResolveKnightRetreat,
} from '../engine/citiesKnights/knights';
import {
  ckChoosePillageCity,
  ckChooseProgressDeck,
} from '../engine/citiesKnights/invasion';
import { ckDiscardProgress } from '../engine/citiesKnights/progress';
import { PROGRESS_HAND_LIMIT } from '../engine/citiesKnights/progress';
import { ckPlayProgress } from '../engine/citiesKnights/progressEffects';
import type { CkCommodity } from '../types/citiesKnights';
import type { ResourceType } from '../types/resources';

function bindContext(ctx: EngineContext): void {
  setActiveRandom(ctx.random);
  setActiveClock(ctx.clock);
  setActiveIdGenerator(ctx.ids);
}

function currentPlayerId(state: GameState): string | undefined {
  return state.turnOrder[state.currentPlayerIndex];
}

function assertPlayerTurn(state: GameState, playerId: string): CommandResult | null {
  const active = currentPlayerId(state);
  if (!active || active !== playerId) {
    return commandError('not_your_turn', "Ce n'est pas votre tour.", { active, playerId });
  }
  return null;
}

function assertPlayerActionPhase(state: GameState): CommandResult | null {
  if (state.turnPhase !== 'player_action') {
    return commandError('wrong_phase', 'Action indisponible dans cette phase du tour.');
  }
  return null;
}

export function applyCommand(
  state: GameState | null,
  command: GameCommand,
  context: EngineContext,
): CommandResult {
  bindContext(context);
  const events: CommandEmittedEvent[] = [];

  switch (command.type) {
    case 'create_game': {
      const issues = validateModules(modulesFromConfig(command.config));
      if (issues.length > 0) {
        return commandError('invalid_config', issues[0].message, { issues });
      }
      const next = createGame(command.config, command.players as unknown as PlayerSetup[]);
      // IDs déterministes (sims) : repartir sans mémoire IA résiduelle
      clearAiMemoryForGame(next.id);
      events.push({ type: 'game_created', payload: { gameId: next.id } });
      return commandSuccess(next, events);
    }

    case 'roll_dice': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      if (hasPlayerRolledDiceThisTurn(state, command.playerId)) {
        return commandError('dice_already_rolled', 'Les dés ont déjà été lancés ce tour.');
      }
      const roll = rollDice(state);
      events.push({ type: 'dice_rolled', payload: { ...roll } });
      events.push(...drainSeasonEvents(state));
      return commandSuccess(state, events);
    }

    case 'acknowledge_collection': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      if (hasCkCollectionBlockers(state)) {
        return commandError(
          'ck_pending',
          'Résolvez les actions Villes & Chevaliers en attente avant de continuer.',
        );
      }
      acknowledgeCollection(state);
      events.push({ type: 'collection_acknowledged', payload: { playerId: command.playerId } });
      return commandSuccess(state, events);
    }

    case 'end_turn': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const phaseErr = assertPlayerActionPhase(state);
      if (phaseErr) return phaseErr;
      const blocking = state.extensions?.citiesKnights?.pendingResolutions.find(
        (r) =>
          // Ces résolutions bloquent tout le monde (sinon softlock / tour sauté)
          r.kind === 'knight_retreat' ||
          r.kind === 'pillage_city' ||
          r.kind === 'choose_progress_deck' ||
          r.kind === 'discard_progress' ||
          (r.playerId === command.playerId &&
            (r.kind === 'aqueduct' || r.kind === 'place_metropolis')),
      );
      if (blocking) {
        const ck = state.extensions?.citiesKnights;
        const drop = () => {
          if (ck) {
            ck.pendingResolutions = ck.pendingResolutions.filter((r) => r.id !== blocking.id);
          }
        };
        if (blocking.kind === 'place_metropolis') {
          const track = blocking.data?.track as CkUrbanTrack | undefined;
          const hosts = track
            ? listFreeMetropolisHosts(state, blocking.playerId, track)
            : [];
          if (hosts.length === 0) drop();
          else {
            return commandError(
              'ck_pending',
              `Résolvez d'abord : ${blocking.kind.replace(/_/g, ' ')}.`,
            );
          }
        } else if (blocking.kind === 'discard_progress') {
          const handLen = ck?.progressHands[blocking.playerId]?.length ?? 0;
          if (handLen <= PROGRESS_HAND_LIMIT) drop();
          else {
            return commandError(
              'ck_pending',
              `Résolvez d'abord : ${blocking.kind.replace(/_/g, ' ')}.`,
            );
          }
        } else if (blocking.kind === 'aqueduct') {
          const bank = state.bank;
          const has =
            !bank ||
            (['wood', 'clay', 'wheat', 'sheep', 'ore'] as const).some(
              (r) => (bank[r] ?? 0) > 0,
            );
          if (!has) drop();
          else {
            return commandError(
              'ck_pending',
              `Résolvez d'abord : ${blocking.kind.replace(/_/g, ' ')}.`,
            );
          }
        } else if (blocking.kind === 'choose_progress_deck') {
          const has = (['science', 'politics', 'trade'] as const).some(
            (d) =>
              (ck?.progressDecks[d]?.length ?? 0) > 0 ||
              (ck?.progressDiscards?.[d]?.length ?? 0) > 0,
          );
          if (!has) drop();
          else {
            return commandError(
              'ck_pending',
              `Résolvez d'abord : ${blocking.kind.replace(/_/g, ' ')}.`,
            );
          }
        } else {
          return commandError(
            'ck_pending',
            `Résolvez d'abord : ${blocking.kind.replace(/_/g, ' ')}.`,
          );
        }
      }

      const usPending = state.extensions?.undergroundSky?.pendingResolutions.find(
        (r) => r.playerId === command.playerId,
      );
      if (usPending) {
        return commandError(
          'us_pending',
          `Résolvez d'abord : ${usPending.kind.replace(/_/g, ' ')}.`,
        );
      }

      const next = processTurn(state);
      events.push({ type: 'turn_ended', payload: { turn: next.currentTurn } });
      events.push(...drainSeasonEvents(next));
      return commandSuccess(next, events);
    }

    case 'draw_dev_card': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const phaseErr = assertPlayerActionPhase(state);
      if (phaseErr) return phaseErr;
      const result = drawDevCard(command.playerId, state);
      if (!result.success) {
        return commandError(
          'draw_dev_card_failed',
          result.reason ?? "Impossible d'acheter une carte.",
        );
      }
      events.push({ type: 'dev_card_drawn', payload: { cardType: result.card?.type } });
      return commandSuccess(state, events);
    }

    case 'play_dev_card': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const phaseErr = assertPlayerActionPhase(state);
      if (phaseErr) return phaseErr;
      const result = playDevCard(
        command.playerId,
        command.cardId,
        command.targetPlayerId ?? null,
        command.targetTileId ?? null,
        state,
      );
      if (!result.success) {
        return commandError(
          'play_dev_card_failed',
          result.reason ?? 'Impossible de jouer la carte.',
        );
      }
      events.push({ type: 'dev_card_played', payload: { cardId: command.cardId } });
      return commandSuccess(state, events);
    }

    case 'setup_placement': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      if (usesTopologicalPlacement(state)) {
        return commandError(
          'setup_use_intersection',
          'Utilisez setup_place_settlement / setup_place_road (intersections / arêtes).',
        );
      }
      const result = handleSetupPlacement(command.playerId, command.tileId, state);
      if (!result.success) {
        return commandError('setup_placement_failed', result.reason ?? 'Placement invalide.');
      }
      events.push({ type: 'setup_placed', payload: { tileId: command.tileId } });
      return commandSuccess(state, events);
    }

    case 'setup_place_settlement': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = classicSetupPlaceSettlement(
        command.playerId,
        command.intersectionId,
        state,
      );
      if (!result.success) {
        return commandError(
          'setup_place_settlement_failed',
          result.reason ?? 'Placement de village invalide.',
        );
      }
      events.push({
        type: 'setup_settlement_placed',
        payload: { intersectionId: command.intersectionId },
      });
      return commandSuccess(state, events);
    }

    case 'setup_place_road': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = classicSetupPlaceRoad(command.playerId, command.edgeId, state);
      if (!result.success) {
        return commandError(
          'setup_place_road_failed',
          result.reason ?? 'Placement de route invalide.',
        );
      }
      events.push({ type: 'setup_road_placed', payload: { edgeId: command.edgeId } });
      return commandSuccess(state, events);
    }

    case 'build_settlement': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = classicBuildSettlement(command.playerId, command.intersectionId, state);
      if (!result.success) {
        return commandError(
          'build_settlement_failed',
          result.reason ?? 'Construction de village impossible.',
        );
      }
      events.push({
        type: 'settlement_built',
        payload: { intersectionId: command.intersectionId },
      });
      return commandSuccess(state, events);
    }

    case 'build_road': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = classicBuildRoad(command.playerId, command.edgeId, state, {
        useSeasonPreparation: command.useSeasonPreparation,
        pactId: command.pactId,
      });
      if (!result.success) {
        return commandError('build_road_failed', result.reason ?? 'Construction de route impossible.');
      }
      events.push({ type: 'road_built', payload: { edgeId: command.edgeId } });
      return commandSuccess(state, events);
    }

    case 'upgrade_city': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = classicUpgradeCity(command.playerId, command.intersectionId, state);
      if (!result.success) {
        return commandError('upgrade_city_failed', result.reason ?? 'Amélioration en ville impossible.');
      }
      events.push({ type: 'city_upgraded', payload: { intersectionId: command.intersectionId } });
      return commandSuccess(state, events);
    }

    case 'discard_resources': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = discardResources(
        command.playerId,
        command.resources,
        state,
        command.commodities,
        command.undergroundSkyMaterials,
      );
      if (!result.success) {
        return commandError('discard_failed', result.reason ?? 'Défausse invalide.');
      }
      events.push({ type: 'resources_discarded', payload: { playerId: command.playerId } });
      return commandSuccess(state, events);
    }

    case 'move_robber': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const result = moveRobber(command.playerId, command.tileId, state);
      if (!result.success) {
        return commandError('move_robber_failed', result.reason ?? 'Déplacement invalide.');
      }
      events.push({ type: 'robber_moved', payload: { tileId: command.tileId } });
      return commandSuccess(state, events);
    }

    case 'steal_resource': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const result = stealResource(command.playerId, command.targetPlayerId, state);
      if (!result.success) {
        return commandError('steal_failed', result.reason ?? 'Vol impossible.');
      }
      events.push({ type: 'resource_stolen', payload: { targetPlayerId: command.targetPlayerId } });
      return commandSuccess(state, events);
    }

    case 'bank_trade': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const phaseErr = assertPlayerActionPhase(state);
      if (phaseErr) return phaseErr;
      const result = bankTrade(
        command.playerId,
        command.give,
        command.receive,
        state,
        command.giveCommodities,
        command.receiveCommodities,
        {
          useSeasonPreparation: command.useSeasonPreparation,
          giveMaterials: command.giveMaterials,
          receiveMaterials: command.receiveMaterials,
        },
      );
      if (!result.success) {
        return commandError('bank_trade_failed', result.reason ?? 'Échange impossible.');
      }
      events.push({ type: 'bank_traded', payload: { give: command.give, receive: command.receive } });
      return commandSuccess(state, events);
    }

    case 'propose_player_trade': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      if (command.giveMaterials || command.receiveMaterials) {
        return commandError(
          'materials_player_trade_unsupported',
          'Les matériaux Souterrain & Ciel ne sont pas encore échangeables entre joueurs — utilisez la banque.',
        );
      }
      const result = proposePlayerTrade(
        command.playerId,
        command.toPlayerId,
        command.give,
        command.receive,
        state,
        command.giveCommodities,
        command.receiveCommodities,
      );
      if (!result.success) {
        return commandError(
          'propose_player_trade_failed',
          result.reason ?? 'Offre impossible.',
        );
      }
      events.push({
        type: 'player_trade_proposed',
        payload: { tradeId: result.trade?.id, toPlayerId: command.toPlayerId },
      });
      return commandSuccess(state, events);
    }

    case 'accept_player_trade': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = acceptPlayerTrade(command.playerId, command.tradeId, state);
      if (!result.success) {
        return commandError(
          'accept_player_trade_failed',
          result.reason ?? 'Acceptation impossible.',
        );
      }
      events.push({ type: 'player_trade_accepted', payload: { tradeId: command.tradeId } });
      return commandSuccess(state, events);
    }

    case 'reject_player_trade': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = rejectPlayerTrade(command.playerId, command.tradeId, state);
      if (!result.success) {
        return commandError(
          'reject_player_trade_failed',
          result.reason ?? 'Refus impossible.',
        );
      }
      events.push({ type: 'player_trade_rejected', payload: { tradeId: command.tradeId } });
      return commandSuccess(state, events);
    }

    case 'cancel_player_trade': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = cancelPlayerTrade(command.playerId, command.tradeId, state);
      if (!result.success) {
        return commandError(
          'cancel_player_trade_failed',
          result.reason ?? 'Annulation impossible.',
        );
      }
      events.push({ type: 'player_trade_cancelled', payload: { tradeId: command.tradeId } });
      return commandSuccess(state, events);
    }

    case 'choose_event': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = chooseEvent(command.playerId, command.eventId, command.choiceId, state);
      if (!result.success) {
        return commandError('choose_event_failed', result.reason ?? 'Choix impossible.');
      }
      ensurePendingEventChoices(state);
      events.push({
        type: 'event_choice_made',
        payload: { eventId: command.eventId, choiceId: command.choiceId },
      });
      return commandSuccess(state, events);
    }

    case 'start_research': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const phaseErr = assertPlayerActionPhase(state);
      if (phaseErr) return phaseErr;
      const result = startResearch(command.playerId, command.techId, state);
      if (!result.success) {
        return commandError('start_research_failed', result.reason ?? 'Recherche impossible.');
      }
      events.push({ type: 'research_started', payload: { techId: command.techId } });
      return commandSuccess(state, events);
    }

    case 'diplomacy_action': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const phaseErr = assertPlayerActionPhase(state);
      if (phaseErr) return phaseErr;
      const result = runDiplomacyCommand(
        command.playerId,
        command.toPlayerId,
        command.actionType,
        command.data,
        state,
      );
      if (!result.success) {
        return commandError('diplomacy_failed', result.reason ?? 'Diplomatie impossible.');
      }
      events.push({
        type: 'diplomacy_action',
        payload: { actionType: command.actionType, toPlayerId: command.toPlayerId },
      });
      return commandSuccess(state, events);
    }

    case 'council_vote': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      if (state.config.extensions?.pactsEmbassies?.enabled) {
        return commandError(
          'council_vote_legacy',
          'Utilisez pe_cast_council_vote (Pactes & Ambassades).',
        );
      }
      const result = castCouncilVote(command.playerId, command.optionId, state);
      if (!result.success) {
        return commandError('council_vote_failed', result.reason ?? 'Vote impossible.');
      }
      events.push({ type: 'council_voted', payload: { optionId: command.optionId } });
      return commandSuccess(state, events);
    }

    case 'recruit_unit': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const phaseErr = assertPlayerActionPhase(state);
      if (phaseErr) return phaseErr;
      const result = recruitUnit(command.playerId, command.tileId, command.unitType, state);
      if (!result.success) {
        return commandError('recruit_failed', result.reason ?? 'Recrutement impossible.');
      }
      events.push({
        type: 'unit_recruited',
        payload: { tileId: command.tileId, unitType: command.unitType },
      });
      return commandSuccess(state, events);
    }

    case 'attack_unit': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const phaseErr = assertPlayerActionPhase(state);
      if (phaseErr) return phaseErr;
      const result = attackUnit(command.playerId, command.attackerId, command.defenderId, state);
      if (!result.success) {
        return commandError('attack_failed', result.reason ?? 'Attaque impossible.');
      }
      events.push({
        type: 'unit_attacked',
        payload: { attackerId: command.attackerId, defenderId: command.defenderId },
      });
      return commandSuccess(state, events);
    }

    case 'move_unit': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const phaseErr = assertPlayerActionPhase(state);
      if (phaseErr) return phaseErr;
      const result = moveUnit(command.playerId, command.unitId, command.targetTileId, state);
      if (!result.success) {
        return commandError('move_failed', result.reason ?? 'Déplacement impossible.');
      }
      events.push({
        type: 'unit_moved',
        payload: { unitId: command.unitId, targetTileId: command.targetTileId },
      });
      return commandSuccess(state, events);
    }

    case 'craft_recipe': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const turnErr = assertPlayerTurn(state, command.playerId);
      if (turnErr) return turnErr;
      const phaseErr = assertPlayerActionPhase(state);
      if (phaseErr) return phaseErr;
      const result = craftRecipe(command.playerId, command.buildingId, command.recipeId, state);
      if (!result.success) {
        return commandError('craft_failed', result.reason ?? 'Craft impossible.');
      }
      events.push({
        type: 'recipe_crafted',
        payload: { buildingId: command.buildingId, recipeId: command.recipeId },
      });
      return commandSuccess(state, events);
    }

    case 'ck_improve_urban': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckImproveUrban(
        command.playerId,
        command.track,
        state,
        command.metropolisIntersectionId,
      );
      if (!result.success) {
        return commandError('ck_improve_failed', result.reason ?? 'Amélioration impossible.');
      }
      events.push({ type: 'ck_urban_improved', payload: { track: command.track } });
      return commandSuccess(state, events);
    }

    case 'ck_place_metropolis': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckPlaceMetropolis(
        command.playerId,
        command.track,
        command.intersectionId,
        state,
      );
      if (!result.success) {
        return commandError('ck_metropolis_failed', result.reason ?? 'Métropole impossible.');
      }
      events.push({
        type: 'ck_metropolis_placed',
        payload: { track: command.track, intersectionId: command.intersectionId },
      });
      return commandSuccess(state, events);
    }

    case 'ck_build_wall': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckBuildWall(command.playerId, command.intersectionId, state, {
        useSeasonPreparation: command.useSeasonPreparation,
      });
      if (!result.success) {
        return commandError('ck_wall_failed', result.reason ?? 'Muraille impossible.');
      }
      events.push({ type: 'ck_wall_built', payload: { intersectionId: command.intersectionId } });
      return commandSuccess(state, events);
    }

    case 'ck_recruit_knight': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckRecruitKnight(command.playerId, command.intersectionId, state);
      if (!result.success) {
        return commandError('ck_recruit_failed', result.reason ?? 'Recrutement impossible.');
      }
      refreshTrophiesAndVictory(state);
      events.push({ type: 'ck_knight_recruited', payload: { intersectionId: command.intersectionId } });
      return commandSuccess(state, events);
    }

    case 'ck_activate_knight': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckActivateKnight(command.playerId, command.knightId, state);
      if (!result.success) {
        return commandError('ck_activate_failed', result.reason ?? 'Activation impossible.');
      }
      events.push({ type: 'ck_knight_activated', payload: { knightId: command.knightId } });
      return commandSuccess(state, events);
    }

    case 'ck_promote_knight': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckPromoteKnight(command.playerId, command.knightId, state);
      if (!result.success) {
        return commandError('ck_promote_failed', result.reason ?? 'Promotion impossible.');
      }
      events.push({ type: 'ck_knight_promoted', payload: { knightId: command.knightId } });
      return commandSuccess(state, events);
    }

    case 'ck_move_knight': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckMoveKnight(
        command.playerId,
        command.knightId,
        command.toIntersectionId,
        state,
      );
      if (!result.success) {
        return commandError('ck_move_failed', result.reason ?? 'Déplacement impossible.');
      }
      refreshTrophiesAndVictory(state);
      events.push({
        type: 'ck_knight_moved',
        payload: { knightId: command.knightId, to: command.toIntersectionId },
      });
      return commandSuccess(state, events);
    }

    case 'ck_displace_knight': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckDisplaceKnight(
        command.playerId,
        command.knightId,
        command.targetKnightId,
        state,
      );
      if (!result.success) {
        return commandError('ck_displace_failed', result.reason ?? 'Délogement impossible.');
      }
      refreshTrophiesAndVictory(state);
      events.push({
        type: 'ck_knight_displaced',
        payload: { knightId: command.knightId, target: command.targetKnightId },
      });
      return commandSuccess(state, events);
    }

    case 'ck_chase_robber': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckChaseRobber(
        command.playerId,
        command.knightId,
        command.tileId,
        state,
      );
      if (!result.success) {
        return commandError('ck_chase_failed', result.reason ?? 'Chasse impossible.');
      }
      events.push({ type: 'ck_robber_chased', payload: { knightId: command.knightId } });
      return commandSuccess(state, events);
    }

    case 'ck_resolve_knight_retreat': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckResolveKnightRetreat(
        command.playerId,
        command.knightId,
        command.toIntersectionId,
        state,
      );
      if (!result.success) {
        return commandError('ck_retreat_failed', result.reason ?? 'Retraite impossible.');
      }
      refreshTrophiesAndVictory(state);
      maybeAcknowledgeCollection(state);
      events.push({ type: 'ck_knight_retreated', payload: { knightId: command.knightId } });
      return commandSuccess(state, events);
    }

    case 'ck_aqueduct_choose': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckChooseAqueduct(
        command.playerId,
        command.resource as import('../types/resources').ResourceType,
        state,
      );
      if (!result.success) {
        return commandError('ck_aqueduct_failed', result.reason ?? 'Aqueduc impossible.');
      }
      maybeAcknowledgeCollection(state);
      events.push({ type: 'ck_aqueduct', payload: { resource: command.resource } });
      return commandSuccess(state, events);
    }

    case 'ck_choose_pillage_city': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckChoosePillageCity(command.playerId, command.intersectionId, state);
      if (!result.success) {
        return commandError('ck_pillage_failed', result.reason ?? 'Pillage impossible.');
      }
      maybeAcknowledgeCollection(state);
      events.push({
        type: 'ck_city_pillaged',
        payload: { intersectionId: command.intersectionId },
      });
      return commandSuccess(state, events);
    }

    case 'ck_choose_progress_deck': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckChooseProgressDeck(command.playerId, command.deck, state);
      if (!result.success) {
        return commandError('ck_progress_draw_failed', result.reason ?? 'Pioche impossible.');
      }
      maybeAcknowledgeCollection(state);
      events.push({ type: 'ck_progress_drawn', payload: { deck: command.deck } });
      return commandSuccess(state, events);
    }

    case 'ck_discard_progress': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckDiscardProgress(command.playerId, command.cardId, state);
      if (!result.success) {
        return commandError('ck_progress_discard_failed', result.reason ?? 'Défausse impossible.');
      }
      maybeAcknowledgeCollection(state);
      events.push({ type: 'ck_progress_discarded', payload: { cardId: command.cardId } });
      return commandSuccess(state, events);
    }

    case 'ck_play_progress': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = ckPlayProgress(command.playerId, command.cardId, state, {
        tileId: command.tileId,
        resource: command.resource as ResourceType | undefined,
        commodity: command.commodity as CkCommodity | undefined,
        targetPlayerId: command.targetPlayerId,
        edgeId: command.edgeId,
        toEdgeId: command.toEdgeId,
        knightId: command.knightId,
        knightIds: command.knightIds,
        intersectionId: command.intersectionId,
        toIntersectionId: command.toIntersectionId,
        die1: command.die1,
        die2: command.die2,
        tokenTileA: command.tokenTileA,
        tokenTileB: command.tokenTileB,
        stealCardId: command.stealCardId,
        take: command.take,
      });
      if (!result.success) {
        return commandError('ck_play_progress_failed', result.reason ?? 'Carte impossible.');
      }
      events.push({ type: 'ck_progress_played', payload: { cardId: command.cardId } });
      return commandSuccess(state, events);
    }

    case 'seasons_choose_preparation': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = seasonsChoosePreparationCommand(
        state,
        command.playerId,
        command.preparation,
        command.targetResource,
      );
      if (result.error) {
        return commandError('seasons_prep_failed', result.error);
      }
      events.push(...result.events);
      return commandSuccess(state, events);
    }

    case 'us_build_shaft':
    case 'us_survey_cavern':
    case 'us_build_tunnel':
    case 'us_build_outpost':
    case 'us_upgrade_extractor':
    case 'us_build_lift':
    case 'us_choose_thermal_output':
    case 'us_choose_discovery_reward':
    case 'us_build_airport':
    case 'us_build_airship':
    case 'us_upgrade_airship':
    case 'us_build_beacon':
    case 'us_dispatch_airship':
    case 'us_unload_airship':
    case 'us_complete_contract': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = handleUndergroundSkyCommand(state, command);
      if (!result.ok) return result;
      events.push(...(result.events ?? []));
      events.push(...drainUndergroundSkyEvents(state));
      return commandSuccess(result.state, events);
    }

    case 'pe_build_embassy':
    case 'pe_propose_pact':
    case 'pe_counter_pact':
    case 'pe_accept_pact':
    case 'pe_reject_pact':
    case 'pe_break_pact':
    case 'pe_propose_mutual_dissolution':
    case 'pe_accept_mutual_dissolution':
    case 'pe_sponsor_resolution':
    case 'pe_cast_council_vote':
    case 'pe_lobby_neutral_delegation':
    case 'pe_contribute_to_crisis':
    case 'pe_claim_mandate': {
      if (!state) return commandError('no_game', 'Aucune partie en cours.');
      const result = handlePactsEmbassiesCommand(state, command);
      if (!result.ok) return result;
      events.push(...(result.events ?? []));
      events.push(...drainPactsEmbassiesEvents(state));
      return commandSuccess(result.state, events);
    }

    default:
      return commandError('unknown_command', 'Commande non reconnue.');
  }
}

export function replayCommands(commands: GameCommand[], context: EngineContext): CommandResult {
  let state: GameState | null = null;
  let last: CommandResult = commandError('empty_replay', 'Journal de commandes vide.');

  for (const command of commands) {
    last = applyCommand(state, command, context);
    if (!last.ok) return last;
    state = last.state;
  }

  if (!state) return commandError('empty_replay', 'Journal de commandes vide.');
  return commandSuccess(state, []);
}
