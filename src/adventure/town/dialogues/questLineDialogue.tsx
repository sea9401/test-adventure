import { useState } from "react";
import type { Npc } from "@/adventure/data/npcs";
import {
  NpcDialogue,
  type NpcDialogueAction,
  type NpcObjective,
} from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import {
  getQuestById,
  questTargetTotal,
  type Quest,
  type QuestTarget,
} from "@/adventure/data/quests";
import { cooldownStatus } from "@/adventure/quests/cooldown";
import { MATERIALS } from "@/adventure/data/materials";
import { ITEMS } from "@/adventure/data/items";
import { getRegion } from "@/adventure/data/world";
import { formatDuration } from "@/lib/format";

// NPC 가 여러 의뢰를 순차적으로 내주는 다이얼로그용 헬퍼.
// steps 배열을 위→아래로 훑어, "처리 대기"인 첫 의뢰를 보여준다:
//   ready                       → 보상 수령
//   active + deliver + 재료 충분 → 건네주기
//   active                      → 진행도 안내
//   available + 잠금 풀림        → 수주 제안
// 반복 의뢰는 한 번 이상 완료한 뒤엔 "뒤에 아직 대기 중인 의뢰가 있으면" 양보한다
// (= 인트로 반복 의뢰가 후속 라인을 막지 않도록). 모두 끝나면 다시 제안된다.
export type QuestLineStep = {
  id: string;
  /** 수주 가능 시 의뢰 제안 텍스트. */
  offerText: string;
  /** 진행 중 텍스트. kill 은 (진행도, 목표치), deliver 는 (보유, 필요) 가 넘어온다. */
  activeText: (have: number, need: number) => string;
  /** 완료 가능(ready) 또는 deliver 재료 충분 시 텍스트. */
  doneText: string;
  /** 수주 버튼 라벨. 기본 "받아들인다". */
  acceptLabel?: string;
  /**
   * 활성 의뢰 안내 박스("▶ 할 일") 본문. 미지정 시 quest.target 에서 자동 생성.
   * 자동 본문이 부족할 때 (예: "어디 가서 얻나" 정보가 필요한 deliver) 직접 지정.
   * 예: "별빛 광맥 깊은 곳의 별빛 잡몹·잔영에서 조각이 나옵니다."
   */
  objectiveHint?: string;
};

// 활성 의뢰 박스 본문 자동 생성. activeText 가 산문 톤이라 묻혀버리는 "할 일" 을
// 한 줄로 다시 적어준다. objectiveHint 가 지정돼 있으면 그쪽이 우선.
function defaultObjectiveBody(target: QuestTarget): string {
  switch (target.kind) {
    case "kill":
    case "kill_within_hp":
      return `${target.monsterName} 처치`;
    case "no_potion_boss":
      return `${target.monsterName} 처치 (포션 사용 금지)`;
    case "deliver":
      return `${MATERIALS[target.materialId]?.name ?? target.materialId} 모으기`;
    case "talk_to_npc":
      return `${target.npcId} 에게 말 걸기`;
    case "visit_region":
      return `${getRegion(target.regionId)?.name ?? target.regionId} 방문`;
    case "craft_item":
      return `${ITEMS[target.itemId]?.name ?? target.itemId} 제작`;
    case "equip_item":
      return `${ITEMS[target.itemId]?.name ?? target.itemId} 장착`;
    case "equip_set":
      return `한 복 장착 (${target.itemIds.length}종)`;
  }
}

function objectiveProgressLabel(target: QuestTarget): string {
  switch (target.kind) {
    case "kill":
    case "kill_within_hp":
    case "no_potion_boss":
      return "처치";
    case "deliver":
      return "모은 수";
    case "craft_item":
      return "제작";
    case "visit_region":
      return "방문 횟수";
    case "talk_to_npc":
      return "대화";
    case "equip_item":
    case "equip_set":
      return "장착";
  }
}

function buildObjective(
  quest: Quest,
  step: QuestLineStep,
  have: number,
  need: number,
): NpcObjective {
  const body = step.objectiveHint ?? defaultObjectiveBody(quest.target);
  return {
    body,
    progress: `${objectiveProgressLabel(quest.target)} ${have}/${need}`,
  };
}

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
  steps: QuestLineStep[];
  /** 보여줄 의뢰가 하나도 없을 때(전부 완료/쿨다운/잠금) 일상 대화. */
  idleText: string;
  /** 일상 대화에 곁들이는 액션 — 스킬북 판매·재화 환전 등. 비우면 평범한 인사. */
  idleAction?: NpcDialogueAction;
};

export function QuestLineDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  inventory,
  steps,
  idleText,
  idleAction,
}: Props) {
  // 다이얼로그 열린 시각을 한 번 캡처 — 짧은 모달이라 stale 우려 없음.
  // (Date.now() 를 render 본문에서 직접 부르면 react-hooks/purity 룰에 걸린다.)
  const [now] = useState(() => Date.now());
  const resolved = steps.map((step) => {
    const quest = getQuestById(step.id);
    if (!quest) return { step, quest: undefined as Quest | undefined, entry: undefined, pending: false };
    const entry = quests.getEntry(step.id);
    let pending = false;
    if (entry.state === "ready" || entry.state === "active") pending = true;
    else if (entry.state === "available") {
      // 선행 의뢰 게이트 — completedCount > 0 로 검사. (선행이 repeatable 이면 claim 후
      // state 가 "available" 로 돌아가므로 "completed" 만 보면 후속이 영원히 안 열린다.)
      const locked =
        !!quest.requiresQuestCompleted &&
        quests.getEntry(quest.requiresQuestCompleted).completedCount === 0;
      pending = !locked;
    }
    return { step, quest, entry, pending };
  });

  for (let i = 0; i < resolved.length; i += 1) {
    const r = resolved[i];
    if (!r.quest || !r.entry || !r.pending) continue;

    // 인트로 반복 의뢰가 후속 라인을 막지 않도록 — 한 번 이상 완료했고 뒤에 대기 중인 게 있으면 양보.
    if (r.quest.repeatable && r.entry.completedCount > 0) {
      const laterPending = resolved.slice(i + 1).some((x) => x.pending);
      if (laterPending) continue;
    }

    const { quest, entry, step } = r;
    const need = questTargetTotal(quest.target);

    if (entry.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={step.doneText}
          primaryAction={{
            label: "보상을 받는다",
            onClick: () => {
              if (completeQuest(step.id)) onClose();
            },
          }}
        />
      );
    }

    if (entry.state === "active") {
      if (quest.target.kind === "deliver") {
        const have = inventory.materialCount(quest.target.materialId);
        if (have >= need) {
          return (
            <NpcDialogue
              npc={npc}
              onClose={onClose}
              text={step.doneText}
              primaryAction={{
                label: "건네준다",
                onClick: () => {
                  const res = quests.tryDeliver(
                    step.id,
                    inventory.materialCount,
                    inventory.consumeMaterial,
                  );
                  if (res.ok) {
                    completeQuest(step.id);
                    onClose();
                  }
                },
              }}
            />
          );
        }
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={step.activeText(have, need)}
            objective={buildObjective(quest, step, have, need)}
          />
        );
      }
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={step.activeText(entry.progress, need)}
          objective={buildObjective(quest, step, entry.progress, need)}
        />
      );
    }

    // available — 쿨다운 중이면 accept 가 silently no-op 이므로 받기 버튼 대신
    // "재의뢰 X 후" 안내문만 표시. (이전엔 버튼이 보였는데 눌러도 아무 반응 없어 "먹통" 신고 다수.)
    const cd = cooldownStatus(quest, entry, now);
    if (cd.onCooldown) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`${step.offerText}\n\n(아직 ${formatDuration(cd.remaining)} 후에 다시 부탁할 수 있겠어.)`}
        />
      );
    }
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={step.offerText}
        primaryAction={{
          label: step.acceptLabel ?? "받아들인다",
          onClick: () => {
            quests.accept(step.id);
            onClose();
          },
        }}
      />
    );
  }

  return (
    <NpcDialogue
      npc={npc}
      onClose={onClose}
      text={idleText}
      primaryAction={idleAction}
    />
  );
}
