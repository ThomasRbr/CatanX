import { useMemo } from 'react';
import { TechId } from '@catanx/engine';
import { BuildingId } from '@catanx/engine';
import { UnitType } from '@catanx/engine';
import { ResourceType } from '@catanx/engine';
import { DiplomacyActionType } from '@catanx/engine';
import { useGameStore } from '../store/gameStore';

export function useGameActions() {
  const runDiceRoll = useGameStore((s) => s.runDiceRoll);
  const acknowledgeCollection = useGameStore((s) => s.acknowledgeCollection);
  const endTurn = useGameStore((s) => s.endTurn);
  const placeInitialSettlement = useGameStore((s) => s.placeInitialSettlement);
  const placeInitialRoad = useGameStore((s) => s.placeInitialRoad);
  const placeSetupSettlement = useGameStore((s) => s.placeSetupSettlement);
  const previewInitialSettlement = useGameStore((s) => s.previewInitialSettlement);
  const previewInitialRoad = useGameStore((s) => s.previewInitialRoad);
  const confirmInitialPlacement = useGameStore((s) => s.confirmInitialPlacement);
  const cancelInitialPlacementPreview = useGameStore((s) => s.cancelInitialPlacementPreview);
  const discardOnSeven = useGameStore((s) => s.discardOnSeven);
  const moveRobber = useGameStore((s) => s.moveRobber);
  const stealFromPlayer = useGameStore((s) => s.stealFromPlayer);
  const bankTrade = useGameStore((s) => s.bankTrade);
  const chooseSeasonPreparation = useGameStore((s) => s.chooseSeasonPreparation);
  const usChooseThermalOutput = useGameStore((s) => s.usChooseThermalOutput);
  const usChooseDiscoveryReward = useGameStore((s) => s.usChooseDiscoveryReward);
  const usSurveyCavern = useGameStore((s) => s.usSurveyCavern);
  const usBuildShaft = useGameStore((s) => s.usBuildShaft);
  const usBuildTunnel = useGameStore((s) => s.usBuildTunnel);
  const usBuildOutpost = useGameStore((s) => s.usBuildOutpost);
  const usUpgradeExtractor = useGameStore((s) => s.usUpgradeExtractor);
  const usBuildLift = useGameStore((s) => s.usBuildLift);
  const usBuildAirport = useGameStore((s) => s.usBuildAirport);
  const usBuildAirship = useGameStore((s) => s.usBuildAirship);
  const usUpgradeAirship = useGameStore((s) => s.usUpgradeAirship);
  const usBuildBeacon = useGameStore((s) => s.usBuildBeacon);
  const usDispatchAirship = useGameStore((s) => s.usDispatchAirship);
  const usUnloadAirship = useGameStore((s) => s.usUnloadAirship);
  const usCompleteContract = useGameStore((s) => s.usCompleteContract);
  const peBuildEmbassy = useGameStore((s) => s.peBuildEmbassy);
  const peProposePact = useGameStore((s) => s.peProposePact);
  const peCounterPact = useGameStore((s) => s.peCounterPact);
  const peAcceptPact = useGameStore((s) => s.peAcceptPact);
  const peRejectPact = useGameStore((s) => s.peRejectPact);
  const peBreakPact = useGameStore((s) => s.peBreakPact);
  const peProposeMutualDissolution = useGameStore((s) => s.peProposeMutualDissolution);
  const peAcceptMutualDissolution = useGameStore((s) => s.peAcceptMutualDissolution);
  const peSponsorResolution = useGameStore((s) => s.peSponsorResolution);
  const peCastCouncilVote = useGameStore((s) => s.peCastCouncilVote);
  const peLobbyNeutralDelegation = useGameStore((s) => s.peLobbyNeutralDelegation);
  const peContributeToCrisis = useGameStore((s) => s.peContributeToCrisis);
  const peClaimMandate = useGameStore((s) => s.peClaimMandate);
  const ckImproveUrban = useGameStore((s) => s.ckImproveUrban);
  const ckChooseAqueduct = useGameStore((s) => s.ckChooseAqueduct);
  const ckPlaceMetropolis = useGameStore((s) => s.ckPlaceMetropolis);
  const ckBuildWall = useGameStore((s) => s.ckBuildWall);
  const ckChoosePillageCity = useGameStore((s) => s.ckChoosePillageCity);
  const ckChooseProgressDeck = useGameStore((s) => s.ckChooseProgressDeck);
  const ckDiscardProgress = useGameStore((s) => s.ckDiscardProgress);
  const ckPlayProgress = useGameStore((s) => s.ckPlayProgress);
  const ckRecruitKnight = useGameStore((s) => s.ckRecruitKnight);
  const ckActivateKnight = useGameStore((s) => s.ckActivateKnight);
  const ckPromoteKnight = useGameStore((s) => s.ckPromoteKnight);
  const ckMoveKnight = useGameStore((s) => s.ckMoveKnight);
  const ckDisplaceKnight = useGameStore((s) => s.ckDisplaceKnight);
  const ckChaseRobber = useGameStore((s) => s.ckChaseRobber);
  const ckResolveKnightRetreat = useGameStore((s) => s.ckResolveKnightRetreat);
  const proposePlayerTrade = useGameStore((s) => s.proposePlayerTrade);
  const acceptPlayerTrade = useGameStore((s) => s.acceptPlayerTrade);
  const rejectPlayerTrade = useGameStore((s) => s.rejectPlayerTrade);
  const cancelPlayerTrade = useGameStore((s) => s.cancelPlayerTrade);
  const drawDevCard = useGameStore((s) => s.drawDevCard);
  const playDevCard = useGameStore((s) => s.playDevCard);
  const constructBuilding = useGameStore((s) => s.constructBuilding);
  const buildSettlement = useGameStore((s) => s.buildSettlement);
  const buildRoad = useGameStore((s) => s.buildRoad);
  const upgradeCity = useGameStore((s) => s.upgradeCity);
  const recruitUnit = useGameStore((s) => s.recruitUnit);
  const moveUnit = useGameStore((s) => s.moveUnit);
  const attackUnit = useGameStore((s) => s.attackUnit);
  const fortifyUnit = useGameStore((s) => s.fortifyUnit);
  const buyMarketResource = useGameStore((s) => s.buyMarketResource);
  const sellMarketResource = useGameStore((s) => s.sellMarketResource);
  const startResearch = useGameStore((s) => s.startResearch);
  const applyEventChoice = useGameStore((s) => s.applyEventChoice);
  const dismissPendingEvent = useGameStore((s) => s.dismissPendingEvent);
  const runDiplomacyAction = useGameStore((s) => s.runDiplomacyAction);
  const castCouncilVote = useGameStore((s) => s.castCouncilVote);
  const craftRecipe = useGameStore((s) => s.craftRecipe);
  const saveCurrentGame = useGameStore((s) => s.saveCurrentGame);
  const getCommandLog = useGameStore((s) => s.getCommandLog);
  const replayFromCommandLog = useGameStore((s) => s.replayFromCommandLog);

  return useMemo(
    () => ({
      rollDice: runDiceRoll,
      acknowledgeCollection,
      endTurn,
      placeInitialSettlement: (tileId: string) => placeInitialSettlement(tileId),
      placeInitialRoad: (tileId: string) => placeInitialRoad(tileId),
      placeSetupSettlement: (tileId: string) => placeSetupSettlement(tileId),
      previewInitialSettlement,
      previewInitialRoad,
      confirmInitialPlacement,
      cancelInitialPlacementPreview,
      discardOnSeven,
      moveRobber,
      stealFromPlayer,
      bankTrade,
      chooseSeasonPreparation,
      usChooseThermalOutput,
      usChooseDiscoveryReward,
      usSurveyCavern,
      usBuildShaft,
      usBuildTunnel,
      usBuildOutpost,
      usUpgradeExtractor,
      usBuildLift,
      usBuildAirport,
      usBuildAirship,
      usUpgradeAirship,
      usBuildBeacon,
      usDispatchAirship,
      usUnloadAirship,
      usCompleteContract,
      peBuildEmbassy,
      peProposePact,
      peCounterPact,
      peAcceptPact,
      peRejectPact,
      peBreakPact,
      peProposeMutualDissolution,
      peAcceptMutualDissolution,
      peSponsorResolution,
      peCastCouncilVote,
      peLobbyNeutralDelegation,
      peContributeToCrisis,
      peClaimMandate,
      ckImproveUrban,
      ckChooseAqueduct,
      ckPlaceMetropolis,
      ckBuildWall,
      ckChoosePillageCity,
      ckChooseProgressDeck,
      ckDiscardProgress,
      ckPlayProgress,
      ckRecruitKnight,
      ckActivateKnight,
      ckPromoteKnight,
      ckMoveKnight,
      ckDisplaceKnight,
      ckChaseRobber,
      ckResolveKnightRetreat,
      proposePlayerTrade,
      acceptPlayerTrade,
      rejectPlayerTrade,
      cancelPlayerTrade,
      drawDevCard,
      playDevCard,
      build: (tileId: string, buildingId: BuildingId) => constructBuilding(tileId, buildingId),
      buildSettlement: (intersectionId: string) => buildSettlement(intersectionId),
      buildRoad: (edgeId: string) => buildRoad(edgeId),
      upgradeCity: (intersectionId: string) => upgradeCity(intersectionId),
      recruit: (tileId: string, unitType: UnitType) => recruitUnit(tileId, unitType),
      moveUnit: (unitId: string, targetTileId: string) => moveUnit(unitId, targetTileId),
      attackUnit: (attackerId: string, defenderId: string) => attackUnit(attackerId, defenderId),
      fortifyUnit: (unitId: string) => fortifyUnit(unitId),
      buyResource: (resource: ResourceType, quantity: number) =>
        buyMarketResource(resource, quantity),
      sellResource: (resource: ResourceType, quantity: number) =>
        sellMarketResource(resource, quantity),
      startResearch: (techId: TechId) => startResearch(techId),
      chooseEventOption: (choiceId: string) => applyEventChoice(choiceId),
      dismissEvent: () => dismissPendingEvent(),
      diplomacy: (toPlayerId: string, actionType: DiplomacyActionType, data?: unknown) =>
        runDiplomacyAction(toPlayerId, actionType, data),
      castCouncilVote: (optionId: string) => castCouncilVote(optionId),
      craftRecipe: (buildingId: string, recipeId: string) => craftRecipe(buildingId, recipeId),
      saveGame: (name?: string) => saveCurrentGame(name),
      getCommandLog,
      replayFromCommandLog,
    }),
    [
      acknowledgeCollection,
      applyEventChoice,
      attackUnit,
      bankTrade,
      chooseSeasonPreparation,
      usChooseThermalOutput,
      usChooseDiscoveryReward,
      usSurveyCavern,
      usBuildShaft,
      usBuildTunnel,
      usBuildOutpost,
      usUpgradeExtractor,
      usBuildLift,
      usBuildAirport,
      usBuildAirship,
      usUpgradeAirship,
      usBuildBeacon,
      usDispatchAirship,
      usUnloadAirship,
      usCompleteContract,
      peBuildEmbassy,
      peProposePact,
      peCounterPact,
      peAcceptPact,
      peRejectPact,
      peBreakPact,
      peProposeMutualDissolution,
      peAcceptMutualDissolution,
      peSponsorResolution,
      peCastCouncilVote,
      peLobbyNeutralDelegation,
      peContributeToCrisis,
      peClaimMandate,
      ckImproveUrban,
      ckChooseAqueduct,
      ckPlaceMetropolis,
      ckBuildWall,
      ckChoosePillageCity,
      ckChooseProgressDeck,
      ckDiscardProgress,
      ckPlayProgress,
      ckRecruitKnight,
      ckActivateKnight,
      ckPromoteKnight,
      ckMoveKnight,
      ckDisplaceKnight,
      ckChaseRobber,
      ckResolveKnightRetreat,
      buildRoad,
      buildSettlement,
      buyMarketResource,
      cancelInitialPlacementPreview,
      cancelPlayerTrade,
      castCouncilVote,
      craftRecipe,
      confirmInitialPlacement,
      constructBuilding,
      discardOnSeven,
      dismissPendingEvent,
      drawDevCard,
      endTurn,
      fortifyUnit,
      getCommandLog,
      moveRobber,
      moveUnit,
      placeInitialRoad,
      placeInitialSettlement,
      placeSetupSettlement,
      playDevCard,
      previewInitialRoad,
      previewInitialSettlement,
      proposePlayerTrade,
      acceptPlayerTrade,
      recruitUnit,
      rejectPlayerTrade,
      replayFromCommandLog,
      runDiceRoll,
      runDiplomacyAction,
      saveCurrentGame,
      sellMarketResource,
      startResearch,
      stealFromPlayer,
      upgradeCity,
    ],
  );
}
