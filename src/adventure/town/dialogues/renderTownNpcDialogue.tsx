"use client";

import type { ReactNode } from "react";
import type { Npc } from "@/adventure/data/npcs";
import type { useGame } from "@/adventure/GameContext";
import { BlacksmithDialogue } from "./BlacksmithDialogue";
import { TrainerDialogue } from "./TrainerDialogue";
import { SuzyDialogue } from "./SuzyDialogue";
import { KaiDialogue } from "./KaiDialogue";
import { StrangerDialogue } from "./StrangerDialogue";
import { RioDialogue } from "./RioDialogue";
import { NoraDialogue } from "./NoraDialogue";
import { BoroDialogue } from "./BoroDialogue";
import { MarinDialogue } from "./MarinDialogue";
import { WoodcutterJimmyDialogue } from "./WoodcutterJimmyDialogue";
import { BaekunDialogue } from "./BaekunDialogue";
import { ManwolDialogue } from "./ManwolDialogue";
import { DoyeonDialogue } from "./DoyeonDialogue";
import { SanhaDialogue } from "./SanhaDialogue";
import { PilgrimDialogue } from "./PilgrimDialogue";
import { HaemuDialogue } from "./HaemuDialogue";
import { MaroDialogue } from "./MaroDialogue";
import { NoeulDialogue } from "./NoeulDialogue";
import { HansolDialogue } from "./HansolDialogue";
import { GeomDialogue } from "./GeomDialogue";
import { SionDialogue } from "./SionDialogue";
import { BardDialogue } from "./BardDialogue";
import { YeoulDialogue } from "./YeoulDialogue";
import { HaerangDialogue } from "./HaerangDialogue";
import { GalmaeDialogue } from "./GalmaeDialogue";
import { BomalDialogue } from "./BomalDialogue";
import { MireuDialogue } from "./MireuDialogue";
import { MujinDialogue } from "./MujinDialogue";
import { DuruDialogue } from "./DuruDialogue";
import { NaraeDialogue } from "./NaraeDialogue";
import { SolgaeDialogue } from "./SolgaeDialogue";
import { BoriDialogue } from "./BoriDialogue";
import { YuseongDialogue } from "./YuseongDialogue";
import { MeteorDialogue } from "./MeteorDialogue";

// 마을 NPC 중 커스텀 다이얼로그를 가진 NPC 들의 디스패치 테이블.
// TownView 의 renderNpcDialogue prop 으로 넘겨 사용한다. null 이면 기본 NpcDialogue.
type GameValue = ReturnType<typeof useGame>;

export type TownNpcDialogueDeps = Pick<
  GameValue,
  | "crafting"
  | "inventory"
  | "quests"
  | "completeQuest"
  | "storyFlags"
  | "addNotification"
  | "characterStateHook"
  | "adventureLog"
  | "grantTitle"
  | "claimDialogueReward"
>;

export function renderTownNpcDialogue(
  npc: Npc,
  close: () => void,
  deps: TownNpcDialogueDeps,
): ReactNode {
  const {
    crafting,
    inventory,
    quests,
    completeQuest,
    storyFlags,
    addNotification,
    characterStateHook,
    adventureLog,
    grantTitle,
    claimDialogueReward,
  } = deps;

  switch (npc.id) {
    case "village_blacksmith_bold":
      return (
        <BlacksmithDialogue
          npc={npc}
          onClose={close}
          crafting={crafting}
          inventory={inventory}
          quests={quests}
          completeQuest={completeQuest}
          storyFlags={storyFlags}
          addNotification={addNotification}
          characterStateHook={characterStateHook}
        />
      );
    case "village_trainer_smith":
      return (
        <TrainerDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
        />
      );
    case "village_woodcutter_jimmy":
      return (
        <WoodcutterJimmyDialogue
          npc={npc}
          onClose={close}
          crafting={crafting}
          quests={quests}
          completeQuest={completeQuest}
          storyFlags={storyFlags}
          inventory={inventory}
          equippedSlots={characterStateHook.equippedSlots}
        />
      );
    case "village_pilgrim_meteor":
      return (
        <MeteorDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          storyFlags={storyFlags}
          inventory={inventory}
          grantTitle={grantTitle}
          learnRecipe={crafting.learnRecipe}
        />
      );
    case "village_suzy":
      return (
        <SuzyDialogue
          npc={npc}
          onClose={close}
          storyFlags={storyFlags}
          claimDialogueReward={claimDialogueReward}
          addNotification={addNotification}
        />
      );
    case "diola_fisher":
      return (
        <KaiDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          storyFlags={storyFlags}
          inventory={inventory}
        />
      );
    case "diola_stranger":
      return (
        <StrangerDialogue
          npc={npc}
          onClose={close}
          storyFlags={storyFlags}
          quests={quests}
        />
      );
    case "diola_kid":
      return (
        <RioDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          storyFlags={storyFlags}
        />
      );
    case "diola_innkeeper":
      return (
        <NoraDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          storyFlags={storyFlags}
        />
      );
    case "diola_merchant":
      return (
        <BoroDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          storyFlags={storyFlags}
        />
      );
    case "diola_elder":
      return (
        <MarinDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          storyFlags={storyFlags}
          adventureLog={adventureLog}
        />
      );
    case "unhyang_elder":
      return (
        <BaekunDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          storyFlags={storyFlags}
          inventory={inventory}
        />
      );
    case "unhyang_smith":
      return (
        <ManwolDialogue
          npc={npc}
          onClose={close}
          storyFlags={storyFlags}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          characterStateHook={characterStateHook}
          claimDialogueReward={claimDialogueReward}
          addNotification={addNotification}
        />
      );
    case "unhyang_guide":
      return (
        <DoyeonDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
        />
      );
    case "unhyang_herbalist":
      return (
        <SanhaDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          characterStateHook={characterStateHook}
          addNotification={addNotification}
        />
      );
    case "unhyang_pilgrim":
      return (
        <PilgrimDialogue
          npc={npc}
          onClose={close}
          storyFlags={storyFlags}
          quests={quests}
          completeQuest={completeQuest}
          adventureLog={adventureLog}
        />
      );
    case "windvale_bard":
      return (
        <BardDialogue
          npc={npc}
          onClose={close}
          storyFlags={storyFlags}
          inventory={inventory}
          equippedSlots={characterStateHook.equippedSlots}
          quests={quests}
          completeQuest={completeQuest}
        />
      );
    case "windvale_keeper":
      return (
        <MaroDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
        />
      );
    case "windvale_merchant":
      return (
        <NoeulDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
        />
      );
    case "windvale_pathfinder":
      return (
        <HansolDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
        />
      );
    case "skyreach_elder":
      return (
        <HaemuDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
        />
      );
    case "skyreach_guide":
      return (
        <GeomDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
        />
      );
    case "skyreach_alchemist":
      return (
        <SionDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          adventureLog={adventureLog}
        />
      );
    case "star_haven_elder":
      return (
        <YuseongDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          storyFlags={storyFlags}
          adventureLog={adventureLog}
        />
      );
    case "saltmarsh_elder":
      return (
        <YeoulDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          storyFlags={storyFlags}
        />
      );
    case "saltmarsh_ferryman":
      return (
        <HaerangDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          storyFlags={storyFlags}
        />
      );
    case "saltmarsh_salter":
      return (
        <GalmaeDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
        />
      );
    case "saltmarsh_innkeeper":
      return (
        <BomalDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
        />
      );
    case "saltmarsh_kid":
      return (
        <MireuDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          storyFlags={storyFlags}
        />
      );
    case "dustford_keeper":
      return (
        <MujinDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          storyFlags={storyFlags}
          characterStateHook={characterStateHook}
          addNotification={addNotification}
        />
      );
    case "dustford_scavenger":
      return (
        <DuruDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
        />
      );
    case "dustford_innkeeper":
      return (
        <NaraeDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
        />
      );
    case "dustford_hunter":
      return (
        <SolgaeDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          characterStateHook={characterStateHook}
          addNotification={addNotification}
        />
      );
    case "dustford_kid":
      return (
        <BoriDialogue
          npc={npc}
          onClose={close}
          quests={quests}
          completeQuest={completeQuest}
          storyFlags={storyFlags}
        />
      );
    default:
      return null;
  }
}
