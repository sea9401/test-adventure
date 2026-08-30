"use client";

import { useMemo, type ReactNode } from "react";
import {
  GameIdentityContext,
  type GameIdentityState,
} from "./GameIdentityContext";
import {
  GameResourceContext,
  type GameResourceState,
} from "./GameResourceContext";
import {
  GameActivityContext,
  type GameActivityState,
} from "./GameActivityContext";
import { GameWorldContext, type GameWorldState } from "./GameWorldContext";
import type { GameStateValue } from "./GameStateProvider";

export function GameStateSliceProviders({
  value,
  children,
}: {
  value: GameStateValue;
  children: ReactNode;
}) {
  const identity = useMemo<GameIdentityState>(
    () => ({
      viewerUserId: value.viewerUserId,
      viewerGuildId: value.viewerGuildId,
      viewerName: value.viewerName,
      accountName: value.accountName,
      viewerGender: value.viewerGender,
      viewerLevel: value.viewerLevel,
      viewerLevelCap: value.viewerLevelCap,
      viewerJobTier: value.viewerJobTier,
      viewerClass: value.viewerClass,
      viewerExp: value.viewerExp,
      viewerExpToNext: value.viewerExpToNext,
      playerSubtitle: value.playerSubtitle,
      viewerProficiency: value.viewerProficiency,
      setViewerProficiency: value.setViewerProficiency,
    }),
    [
      value.viewerUserId,
      value.viewerGuildId,
      value.viewerName,
      value.accountName,
      value.viewerGender,
      value.viewerLevel,
      value.viewerLevelCap,
      value.viewerJobTier,
      value.viewerClass,
      value.viewerExp,
      value.viewerExpToNext,
      value.playerSubtitle,
      value.viewerProficiency,
      value.setViewerProficiency,
    ],
  );
  const resources = useMemo<GameResourceState>(
    () => ({
      stamina: value.stamina,
      staminaMax: value.staminaMax,
      adventureSupportActive: value.adventureSupportActive,
      adventureSupportTier: value.adventureSupportTier,
      adventureSupportActiveUntil: value.adventureSupportActiveUntil,
      adventureSupportPremiumUntil: value.adventureSupportPremiumUntil,
      staminaRegenBonusPct: value.staminaRegenBonusPct,
      setStamina: value.setStamina,
      staminaPotions: value.staminaPotions,
      hpCharges: value.hpCharges,
      mpCharges: value.mpCharges,
      hp: value.hp,
      setHp: value.setHp,
      gold: value.gold,
      bankedGold: value.bankedGold,
      spendableGold: value.spendableGold,
      setGold: value.setGold,
      setBankedGold: value.setBankedGold,
      coreLoopOn: value.coreLoopOn,
      huntStaminaMode: value.huntStaminaMode,
      atRiskGold: value.atRiskGold,
      setAtRiskGold: value.setAtRiskGold,
      mp: value.mp,
      setMp: value.setMp,
      playerCombat: value.playerCombat,
      applyResourcePatch: value.applyResourcePatch,
    }),
    [
      value.stamina,
      value.staminaMax,
      value.adventureSupportActive,
      value.adventureSupportTier,
      value.adventureSupportActiveUntil,
      value.adventureSupportPremiumUntil,
      value.staminaRegenBonusPct,
      value.setStamina,
      value.staminaPotions,
      value.hpCharges,
      value.mpCharges,
      value.hp,
      value.setHp,
      value.gold,
      value.bankedGold,
      value.spendableGold,
      value.setGold,
      value.setBankedGold,
      value.coreLoopOn,
      value.huntStaminaMode,
      value.atRiskGold,
      value.setAtRiskGold,
      value.mp,
      value.setMp,
      value.playerCombat,
      value.applyResourcePatch,
    ],
  );
  const activity = useMemo<GameActivityState>(
    () => ({
      combatCooldown: value.combatCooldown,
      setCombatCooldown: value.setCombatCooldown,
      offlinePending: value.offlinePending,
      setOfflinePending: value.setOfflinePending,
      offlineHunt: value.offlineHunt,
      setOfflineHunt: value.setOfflineHunt,
      autoGathering: value.autoGathering,
      setAutoGathering: value.setAutoGathering,
      fishingActive: value.fishingActive,
      setFishingActive: value.setFishingActive,
    }),
    [
      value.combatCooldown,
      value.setCombatCooldown,
      value.offlinePending,
      value.setOfflinePending,
      value.offlineHunt,
      value.setOfflineHunt,
      value.autoGathering,
      value.setAutoGathering,
      value.fishingActive,
      value.setFishingActive,
    ],
  );
  const world = useMemo<GameWorldState>(
    () => ({
      currentOutpost: value.currentOutpost,
      setCurrentOutpost: value.setCurrentOutpost,
      discoveredIds: value.discoveredIds,
      setDiscoveredIds: value.setDiscoveredIds,
      occupations: value.occupations,
      treasuries: value.treasuries,
      refreshOccupations: value.refreshOccupations,
      refreshGuildId: value.refreshGuildId,
      refreshGameState: value.refreshGameState,
      gameStateLoaded: value.gameStateLoaded,
      frontierDepth: value.frontierDepth,
      setFrontierDepth: value.setFrontierDepth,
      enterOutpost: value.enterOutpost,
      travelTo: value.travelTo,
      tilePos: value.tilePos,
      setTilePos: value.setTilePos,
      travelToTile: value.travelToTile,
      tileSettlements: value.tileSettlements,
      foundTile: value.foundTile,
      promoteTile: value.promoteTile,
      demolishTile: value.demolishTile,
      tileActionError: value.tileActionError,
      clearTileActionError: value.clearTileActionError,
    }),
    [
      value.currentOutpost,
      value.setCurrentOutpost,
      value.discoveredIds,
      value.setDiscoveredIds,
      value.occupations,
      value.treasuries,
      value.refreshOccupations,
      value.refreshGuildId,
      value.refreshGameState,
      value.gameStateLoaded,
      value.frontierDepth,
      value.setFrontierDepth,
      value.enterOutpost,
      value.travelTo,
      value.tilePos,
      value.setTilePos,
      value.travelToTile,
      value.tileSettlements,
      value.foundTile,
      value.promoteTile,
      value.demolishTile,
      value.tileActionError,
      value.clearTileActionError,
    ],
  );

  return (
    <GameIdentityContext.Provider value={identity}>
      <GameResourceContext.Provider value={resources}>
        <GameActivityContext.Provider value={activity}>
          <GameWorldContext.Provider value={world}>
            {children}
          </GameWorldContext.Provider>
        </GameActivityContext.Provider>
      </GameResourceContext.Provider>
    </GameIdentityContext.Provider>
  );
}
