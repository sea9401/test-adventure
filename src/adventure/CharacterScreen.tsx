"use client";

import {
  Backpack,
  BookOpen,
  ClipboardText,
  Crown,
  Diamond,
  Scroll,
  Sparkle,
  User,
} from "@phosphor-icons/react";
import { MAX_LEVEL } from "@/lib/leveling";
import {
  PARAGON_TOTAL_CAP,
  pointsFromExp,
  unspentPoints as paragonUnspentPoints,
} from "@/lib/paragon";
import {
  PARAGON_RESPEC_SHARD_COST,
  ParagonView,
} from "@/adventure/character/ParagonView";
import { Card } from "@/components/ui/Card";
import { EntryCard } from "@/components/ui/EntryCard";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { AdventurerCard } from "@/adventure/character/AdventurerCard";
import { CharacterMini } from "@/adventure/character/CharacterMini";
import { SkillsView } from "@/adventure/character/SkillsView";
import { StatsPanel } from "@/adventure/character/StatsPanel";
import { AdventureLogView } from "@/adventure/log/AdventureLogView";
import { computeCompendiumReward } from "@/adventure/log/compendiumReward";
import { RuneView } from "@/adventure/RuneView";
import {
  isFusionError,
  planRuneFusion,
} from "@/adventure/character/runeFusion";
import type { RuneGrade, RuneId } from "@/adventure/data/runes";
import { InventoryView } from "@/adventure/InventoryView";
import { SKILL_BOOKS, type SkillBookId } from "@/adventure/data/skillBooks";
import {
  AP_SKILLS,
  formatAPSkillDescription,
  getAPSkillById,
} from "@/adventure/character/apSkills";
import { RecentLogView } from "@/adventure/RecentLogView";
import { QuestJournalView } from "@/adventure/quests/QuestJournalView";
import { QUESTS } from "@/adventure/data/quests";
import { useGame } from "@/adventure/GameContext";
import { TutorialOverlay } from "@/adventure/tutorial";

export function CharacterScreen() {
  const {
    character,
    subView,
    setSubView,
    back,
    characterStateHook,
    paragon,
    inventory,
    adventureLog,
    notifications,
    effectiveSkillNameList,
    effectiveFeatNames,
    characterFeats,
    skillLayout,
    training,
    playerCombat,
    totalStats,
    baseAllocatedStats,
    addNotification,
    handleEquipFromInventory,
    handleEquipInstanceFromInventory,
    handleUnequip,
    handleDepositToVault,
    handleWithdrawFromVault,
    handlePurchaseRune,
    quests,
    crafting,
  } = useGame();

  const activeQuestCount = QUESTS.reduce((n, q) => {
    const e = quests.getEntry(q.id);
    return e.state === "active" || e.state === "ready" ? n + 1 : n;
  }, 0);

  if (subView === null) {
    return (
      <div className="space-y-2">
        <EntryCard
          icon={<User size={28} weight="duotone" className="text-blue-500" />}
          title="내 정보"
          description="캐릭터 정보와 능력치를 확인합니다."
          onClick={() => setSubView("info")}
        />
        <EntryCard
          icon={
            <Backpack size={28} weight="duotone" className="text-emerald-500" />
          }
          title="가방"
          description="모험에 필요한 물건들을 챙길 수 있는 가방이다."
          onClick={() => setSubView("inventory")}
        />
        <EntryCard
          icon={
            <Sparkle size={28} weight="duotone" className="text-amber-500" />
          }
          title="스킬"
          description={
            character.skills.length > 0
              ? `보유 스킬 ${character.skills.length}개`
              : "아직 익힌 스킬이 없습니다."
          }
          onClick={() => setSubView("skills")}
        />
        <EntryCard
          icon={
            <BookOpen size={28} weight="duotone" className="text-emerald-600" />
          }
          title="모험의 서"
          description="지금까지의 여정과 발견을 기록합니다."
          onClick={() => setSubView("adventure-log")}
        />
        <EntryCard
          icon={
            <ClipboardText
              size={28}
              weight="duotone"
              className="text-yellow-700"
            />
          }
          title="의뢰 수첩"
          description={
            activeQuestCount > 0
              ? `진행 중인 의뢰 ${activeQuestCount}건`
              : "진행 중인 의뢰가 없습니다."
          }
          onClick={() => setSubView("quests")}
        />
        <EntryCard
          icon={<Scroll size={28} weight="duotone" className="text-rose-500" />}
          title="최근 기록"
          description={
            notifications.list.length > 0
              ? `최근 알림 ${notifications.list.length}개`
              : "아직 기록된 알림이 없습니다."
          }
          onClick={() => setSubView("recent-log")}
        />
        <EntryCard
          icon={<Diamond size={28} weight="duotone" className="text-violet-500" />}
          title="룬"
          description="3개의 슬롯에 룬을 장착해 영구 능력치를 더한다."
          onClick={() => setSubView("runes")}
        />
        {character.level >= MAX_LEVEL && (
          <EntryCard
            icon={
              <Crown size={28} weight="duotone" className="text-violet-500" />
            }
            title="파라곤"
            description={(() => {
              const pts = pointsFromExp(paragon.state.paragonExp);
              const unspent = paragonUnspentPoints(paragon.state);
              if (pts >= PARAGON_TOTAL_CAP) return "모든 파라곤 포인트 졸업.";
              if (unspent > 0) return `미분배 포인트 ${unspent}개 보유.`;
              return `${pts} / ${PARAGON_TOTAL_CAP} pt — 만렙 EXP 누적.`;
            })()}
            onClick={() => setSubView("paragon")}
          />
        )}
      </div>
    );
  }

  if (subView === "runes") {
    const tokenCount = inventory.materialCount("tower_token");
    const handleFuseRune = (id: RuneId, grade: RuneGrade) => {
      const have = inventory.runeCount(id, grade);
      const shardCount = inventory.materialCount("starfall_shard");
      const plan = planRuneFusion(id, grade, have, shardCount);
      if (isFusionError(plan)) {
        if (plan === "max_grade") {
          addNotification("info", "6T 룬은 합성할 수 없다.");
        } else if (plan === "insufficient_shard") {
          addNotification(
            "info",
            "5 → 6 강화에 별빛 조각 20개가 필요하다.",
          );
        } else if (grade === 5) {
          addNotification(
            "info",
            "5 → 6 강화에 5T 룬 1개와 별빛 조각 20개가 필요하다.",
          );
        } else {
          addNotification(
            "info",
            "합성에 필요한 룬이 부족하다 (1T 3개·2T 4개·3T 5개·4T 6개).",
          );
        }
        return;
      }
      if (!inventory.consumeRune(id, grade, plan.consumed)) return;
      if (plan.extraMaterial) {
        inventory.consumeMaterial(
          plan.extraMaterial.id,
          plan.extraMaterial.count,
        );
      }
      inventory.addRune(id, plan.toGrade, plan.produced);
      addNotification(
        "info",
        plan.extraMaterial
          ? `${grade}T ×${plan.consumed} + 별빛 조각 ×${plan.extraMaterial.count} → ${plan.toGrade}T ×1 강화.`
          : `${grade}T × ${plan.consumed} → ${plan.toGrade}T ×1 합성.`,
      );
    };
    return (
      <div className="space-y-3">
        <SubViewHeader title="룬" onBack={back} />
        <RuneView
          equippedRunes={characterStateHook.state.equippedRunes ?? []}
          runeInventory={inventory.state.runes ?? {}}
          tokenCount={tokenCount}
          shardCount={inventory.materialCount("starfall_shard")}
          onEquip={(slotIndex, rune) =>
            characterStateHook.setEquippedRuneAt(slotIndex, rune)
          }
          onFuse={handleFuseRune}
          onBuy={(id, grade) => handlePurchaseRune(id, grade, 1)}
        />
      </div>
    );
  }

  if (subView === "paragon") {
    const shardCount = inventory.materialCount("starfall_shard");
    const handleCommit = (next: Parameters<typeof paragon.setAllocations>[0]) => {
      const ok = paragon.setAllocations(next);
      if (!ok) {
        addNotification("info", "분배 합계가 보유 파라곤 포인트를 넘는다.");
      }
      return ok;
    };
    const handleRespec = (): boolean => {
      if (shardCount < PARAGON_RESPEC_SHARD_COST) {
        addNotification(
          "info",
          `별빛 조각 ${PARAGON_RESPEC_SHARD_COST}개가 필요하다.`,
        );
        return false;
      }
      if (!inventory.consumeMaterial("starfall_shard", PARAGON_RESPEC_SHARD_COST)) {
        return false;
      }
      paragon.respec();
      addNotification(
        "info",
        `별빛 조각 ×${PARAGON_RESPEC_SHARD_COST} 소비하고 파라곤 분배를 되돌렸다.`,
      );
      return true;
    };
    return (
      <div className="space-y-3">
        <SubViewHeader title="파라곤" onBack={back} />
        <ParagonView
          state={paragon.state}
          shardCount={shardCount}
          onCommit={handleCommit}
          onRespec={handleRespec}
        />
      </div>
    );
  }

  if (subView === "info") {
    return (
      <div className="space-y-3">
        <SubViewHeader title="내 정보" onBack={back} />
        <CharacterMini character={character} />
        <Card as="section" padding="md">
          <div className="space-y-4">
            <AdventurerCard character={character} />
            <div className="border-t border-zinc-200 dark:border-zinc-800" />
            <StatsPanel
              stats={baseAllocatedStats}
              totalStats={totalStats}
              combat={{ atk: playerCombat.atk, def: playerCombat.def }}
            />
          </div>
        </Card>
      </div>
    );
  }

  if (subView === "inventory") {
    return (
      <div className="space-y-3">
        <TutorialOverlay
          stepId="tutorial.inventory.intro"
          title="가방 사용법"
          body={
            <>
              <p>
                장비를 <b>착용</b> 하면 능력치가 오른다. 같은 부위에 더 좋은
                장비를 끼면 자동으로 교체된다.
              </p>
              <p>
                더 이상 안 쓰는 장비는 <b>버려서</b> 가방 공간을 비울 수 있다.
              </p>
              <p>
                모은 <b>재료</b> 는 마을 <b>대장간</b> 에서 장비 제작·분해에
                쓰인다.
              </p>
            </>
          }
        />
        <SubViewHeader title="가방" onBack={back} />
        <InventoryView
          inventory={inventory.state}
          equipped={character.equipped}
          learnedAPSkillNames={characterStateHook.state.learnedAPSkills}
          onEquip={handleEquipFromInventory}
          onEquipInstance={handleEquipInstanceFromInventory}
          onUnequip={handleUnequip}
          onUseSkillBook={(id: SkillBookId) => {
            const book = SKILL_BOOKS[id];
            const apSkill = getAPSkillById(book.learnsSkillId);
            if (!apSkill) {
              addNotification("info", "알 수 없는 스킬북입니다.");
              return;
            }
            // 이미 학습한 경우 — 책 소비 막고 알림.
            if (characterStateHook.state.learnedAPSkills?.includes(apSkill.name)) {
              addNotification("info", `${apSkill.name}: 이미 학습한 스킬입니다.`);
              return;
            }
            if (!inventory.consumeSkillBook(id, 1)) {
              addNotification("info", "스킬북이 부족합니다.");
              return;
            }
            characterStateHook.learnAPSkill(apSkill.name);
            addNotification(
              "milestone",
              `${apSkill.name} 학습 — 슬롯에 장착하면 발동합니다.`,
            );
          }}
        />
      </div>
    );
  }

  if (subView === "skills") {
    return (
      <div className="space-y-3">
        <SubViewHeader title="스킬" onBack={back} />
        <SkillsView
          skills={character.skills}
          apSkills={AP_SKILLS.filter((s) =>
            characterStateHook.state.learnedAPSkills?.includes(s.name),
          ).map((s) => ({
            name: s.name,
            description: formatAPSkillDescription(s),
          }))}
          apSkillConditions={characterStateHook.state.apSkillConditions}
          onSetAPSkillCondition={characterStateHook.setAPSkillCondition}
          equippedNames={effectiveSkillNameList}
          normalSlots={skillLayout.normalSlots}
          feats={characterFeats}
          equippedFeats={effectiveFeatNames}
          featSlots={skillLayout.featSlots}
          onEquip={(name) => {
            if (effectiveSkillNameList.includes(name)) return;
            if (effectiveSkillNameList.length >= skillLayout.normalSlots) return;
            characterStateHook.setEquippedSkills([
              ...effectiveSkillNameList,
              name,
            ]);
          }}
          onUnequip={(name) => {
            characterStateHook.setEquippedSkills(
              effectiveSkillNameList.filter((n) => n !== name),
            );
          }}
          onEquipFeat={(name) => {
            if (effectiveFeatNames.includes(name)) return;
            // 빈 슬롯 인덱스를 찾아 그 자리에 장착. 모두 차 있으면 무시.
            for (let i = 0; i < skillLayout.featSlots; i += 1) {
              if (!effectiveFeatNames[i]) {
                characterStateHook.setEquippedFeatAt(i, name);
                return;
              }
            }
          }}
          onUnequipFeat={(name) => {
            const slotIndex = effectiveFeatNames.indexOf(name);
            if (slotIndex >= 0) {
              characterStateHook.setEquippedFeatAt(slotIndex, null);
            }
          }}
        />
      </div>
    );
  }

  if (subView === "adventure-log") {
    const reward = computeCompendiumReward(adventureLog.log);
    const handleClaimCompendium = () => {
      if (reward.available <= 0) return;
      const n = reward.available;
      training.addPoints(n);
      adventureLog.addCompendiumClaimed(n);
      addNotification(
        "info",
        `도감 마일스톤으로 단련 포인트 +${n} 수령했다.`,
      );
    };
    return (
      <div className="space-y-3">
        <SubViewHeader
          title="모험의 서"
          onBack={back}
          right={
            reward.available > 0 ? (
              <button
                type="button"
                onClick={handleClaimCompendium}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
              >
                <Sparkle size={14} weight="duotone" />
                단련 +{reward.available} 수령
              </button>
            ) : undefined
          }
        />
        <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
          도감 등록 {reward.counts.total}개 · 다음 단련 +1까지{" "}
          {reward.toNext}개
        </p>
        <AdventureLogView
          log={adventureLog.log}
          stats={character.stats}
          equippedTitleId={characterStateHook.equippedTitleId}
          onEquipTitle={characterStateHook.setEquippedTitle}
          titleCounters={{
            battleLosses: adventureLog.log.battleLosses ?? 0,
            trainingCount: training.completedCount,
            chatCount: adventureLog.log.chatCount ?? 0,
            healingCount: adventureLog.log.healingCount ?? 0,
            npcTalkCount: Object.values(adventureLog.log.npcs).reduce(
              (max, e) => Math.max(max, e?.talkCount ?? 0),
              0,
            ),
          }}
          knownRecipes={crafting.state.known}
          shareableRecipes={crafting.state.shareable}
          inventory={inventory.state}
          vault={inventory.state.vault}
          onDepositToVault={handleDepositToVault}
          onWithdrawFromVault={handleWithdrawFromVault}
          learnedAPSkills={characterStateHook.state.learnedAPSkills}
        />
      </div>
    );
  }

  if (subView === "quests") {
    return (
      <div className="space-y-3">
        <TutorialOverlay
          stepId="tutorial.quest.intro"
          title="의뢰 수첩"
          body={
            <>
              <p>받은 의뢰의 진행도가 여기 모인다.</p>
              <p>
                조건을 모두 채우면 <b>완료 가능</b> 표시가 뜬다.
              </p>
              <p>의뢰를 준 NPC 에게 돌아가 대화로 보상을 수령한다.</p>
              <p>
                NPC 의 이야기 의뢰는 <b>1회성</b>. 반복 농사가 필요하면{" "}
                <b>길드 게시판</b> 을 이용한다.
              </p>
            </>
          }
        />
        <SubViewHeader title="의뢰 수첩" onBack={back} />
        <QuestJournalView getEntry={quests.getEntry} />
      </div>
    );
  }

  if (subView === "recent-log") {
    return (
      <div className="space-y-3">
        <SubViewHeader title="최근 기록" onBack={back} />
        <RecentLogView
          notifications={notifications.list}
          onClear={notifications.clear}
        />
      </div>
    );
  }

  return null;
}
