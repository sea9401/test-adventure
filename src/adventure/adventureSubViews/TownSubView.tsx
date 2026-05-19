"use client";

import { useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TownView } from "@/adventure/TownView";
import { renderTownNpcDialogue } from "@/adventure/town/dialogues/renderTownNpcDialogue";
import { useGame } from "@/adventure/GameContext";
import { npcHasAcceptableQuest } from "@/adventure/quests/npcAvailability";
import type { NpcId } from "@/adventure/data/npcs";

export function TownSubView() {
  const {
    currentRegion,
    back,
    pendingTownNpcId,
    setPendingTownNpcId,
    crafting,
    inventory,
    adventureLog,
    characterStateHook,
    quests,
    storyFlags,
    completeQuest,
    addNotification,
    grantTitle,
    claimDialogueReward,
  } = useGame();

  const characterLevel = characterStateHook.state.level;
  const getQuestEntry = quests.getEntry;
  // 분 단위 틱 — 쿨다운 경계가 풀리면 다음 틱에서 뱃지가 자연스럽게 켜진다.
  // (TownScreen 길드 보드와 동일한 패턴.)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const hasAvailableQuest = (npcId: NpcId) =>
    npcHasAcceptableQuest(npcId, characterLevel, getQuestEntry, now);

  return (
    <div className="space-y-3">
      <SubViewHeader title={currentRegion.name} onBack={back} />
      <TownView
        region={currentRegion}
        initialNpcId={pendingTownNpcId ?? undefined}
        onInitialNpcConsumed={() => setPendingTownNpcId(null)}
        hasAvailableQuest={hasAvailableQuest}
        onTalkClose={(npcId, regionId) => {
          adventureLog.incrementNpcTalk(npcId);
          adventureLog.addTownNpcTalked(regionId, npcId);
          // talk_to_npc 의뢰 — 대화창 닫을 때 1회 누적.
          quests.recordTalk(npcId);
        }}
        renderNpcDialogue={(npc, close) =>
          renderTownNpcDialogue(npc, close, {
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
          })
        }
      />
    </div>
  );
}
