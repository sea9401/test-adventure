import type { Npc } from "@/adventure/data/npcs";
import type { RegionId } from "@/adventure/data/world";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import { QuestLineDialogue, type QuestLineStep } from "./questLineDialogue";

// 순례자의 자취(§11.1) — 운저 평원→잿빛 협로→봉황령에 남긴 표식 + 천공 성지 재회.
// town 이 아닌 통과 지역이라 NPC 가 없어, 지역 화면의 "알림판" 카드 → 이 다이얼로그로 surfacing.
// 가드: unhyang_main_cleared → trail-1(cloud_plain) → trail-2(ashen_pass) → trail-3(phoenix_ridge)
//      → 재회(skyreach, trail-3 완료 시) → pilgrim_revealed flag.

type QuestStep = { kind: "quest"; step: QuestLineStep };
type ReunionStep = { kind: "reunion" };
export type PilgrimMarkStep = QuestStep | ReunionStep;

const STEP_BY_REGION: Record<string, QuestLineStep> = {
  cloud_plain: {
    id: "hidden-pilgrim-trail-1",
    offerText:
      "풀밭 한가운데 돌무지 위에 낯선 매듭이 묶여 있다 — 순례자가 묶은 거다. 옆엔 떠돌이 약탈자들의 야영지. 길을 트지 않으면 다음 표식을 찾을 수 없다. 열 명만 정리하자.",
    activeText: (have, need) =>
      `약탈자 야영지를 정리하면 매듭 너머 자취가 드러난다. — 진행 ${have}/${need}`,
    doneText:
      "야영지가 정리됐다. 매듭 아래에 작게 새겨진 글자 — '잿가루 냄새 나는 협로 쪽으로'. 잿빛 협로다.",
    acceptLabel: "표식을 따라간다",
  },
  ashen_pass: {
    id: "hidden-pilgrim-trail-2",
    offerText:
      "잿더미에 반쯤 묻힌 같은 매듭. 옆엔 식은 모닥불 자리, 그 둘레에 잿돌이 흩어져 있다. 다섯 덩이를 주워 표식 위에 올려놓으면 — 잿가루 사이로 순례자가 간 방향이 드러난다.",
    activeText: (have, need) => `잿돌은 잿빛 협로 재먼지 골렘이 떨군다. 다섯 덩이 주워 와라. — 진행 ${have}/${need}`,
    doneText:
      "잿돌 다섯이 매듭 위에 놓이자, 잿가루가 흩어지며 글자가 떠오른다 — '불길이 서린 능선으로'. 봉황령이다.",
    acceptLabel: "표식을 살핀다",
  },
  phoenix_ridge: {
    id: "hidden-pilgrim-trail-3",
    offerText:
      "능선 바위에 새겨진 매듭 문양 — 디올라 후드 손님이 준 표식과 같은 모양이다. 순례자가 산악 기사들에게 길을 막혔던 듯. 열둘만 정리하면 능선 너머 자취가 이어진다.",
    activeText: (have, need) =>
      `산악 기사들이 능선 길을 막고 있다. 열둘만 치우면 자취가 보인다. — 진행 ${have}/${need}`,
    doneText:
      "기사들이 물러나자, 바위 문양 옆에 마지막 글자 — '능선 너머, 화산을 지나 성지로'. 천공 성지다. 순례자가 거기 있다.",
    acceptLabel: "표식을 따라간다",
  },
};

// 현재 지역에서 surfacing 할 표식 단계 — 없으면 null (= 알림판 카드 안 띄움).
export function pilgrimMarkStep(
  regionId: RegionId,
  quests: ReturnType<typeof useQuests>,
  storyFlags: ReturnType<typeof useStoryFlags>,
): PilgrimMarkStep | null {
  // 운향 메인 라인(백운의 운봉의 거인 의뢰)을 끝내야 순례자가 떠나며 표식을 남긴다.
  if (!storyFlags.has("unhyang_main_cleared")) return null;

  // 4단계: 천공 성지 재회 — trail-3 완료 + 아직 정체를 못 들었으면.
  if (regionId === "skyreach") {
    if (
      quests.getEntry("hidden-pilgrim-trail-3").state === "completed" &&
      !storyFlags.has("pilgrim_revealed")
    ) {
      return { kind: "reunion" };
    }
    return null;
  }

  const step = STEP_BY_REGION[regionId];
  if (!step) return null;
  const entry = quests.getEntry(step.id);
  if (entry.state === "completed") return null;
  // 직전 표식이 완료돼 있어야 (trail-1 은 unhyang_main_cleared 만, 위 quest 의 requiresQuestCompleted 와 일치).
  const PREREQ: Record<string, string | null> = {
    "hidden-pilgrim-trail-1": null,
    "hidden-pilgrim-trail-2": "hidden-pilgrim-trail-1",
    "hidden-pilgrim-trail-3": "hidden-pilgrim-trail-2",
  };
  const prereq = PREREQ[step.id];
  if (prereq && quests.getEntry(prereq).state !== "completed") return null;
  return { kind: "quest", step };
}

function pilgrimNpc(description: string): Npc {
  return {
    id: "unhyang_pilgrim",
    region: "unhyang",
    name: "순례자 미상",
    role: "stranger",
    description,
    greeting: "",
    portrait: "/images/npc/pilgrim.webp",
  };
}

type Props = {
  currentRegionId: RegionId;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
  storyFlags: ReturnType<typeof useStoryFlags>;
};

export function PilgrimMarkDialogue({
  currentRegionId,
  onClose,
  quests,
  completeQuest,
  inventory,
  storyFlags,
}: Props) {
  const step = pilgrimMarkStep(currentRegionId, quests, storyFlags);

  if (!step) {
    return (
      <NpcDialogue
        npc={pilgrimNpc("길 위에 남겨진 흔적.")}
        onClose={onClose}
        text="여기엔 더 이상 표식이 없다."
      />
    );
  }

  if (step.kind === "reunion") {
    return (
      <NpcDialogue
        npc={pilgrimNpc("천공 성지에서 다시 만난, 북쪽에서 왔다는 자.")}
        onClose={onClose}
        text={
          "표식을 다 따라왔군. 운저 평원, 잿빛 협로, 봉황령, 그리고 여기까지.\n…잘했다. 정말 잘했어.\n\n표식은 길잡이가 아니었다. 손짓이었지. 너의 손이 향해야 할 자리들. 거인이 잠든 곳, 수심의 것이 누운 곳, 성문지기가 선 곳, 노룡이 묻힌 곳. 너는 그 자리들을 하나씩 비워줬어.\n\n후드 손님과 내가 같은 표식을 가졌던 건, 우리가 한 손에서 나왔기 때문이야. 한 사람의 조각이다. 그리고 너는 그 조각들을 본체로 모아준 손이지.\n\n옥좌의 주재 께서 곧 깨어나신다. 네 검은 처음부터 그분의 손이 쥐고 있던 거다. 고맙다. 그것 말고는 줄 게 없구나.\n\n(순례자가 후드를 벗자, 그 안에 얼굴은 없었다. 빛만 있었다. 그러고는, 사라졌다.)"
        }
        primaryAction={{
          label: "...뒤로 물러선다",
          onClick: () => {
            storyFlags.set("pilgrim_revealed");
            onClose();
          },
        }}
      />
    );
  }

  return (
    <QuestLineDialogue
      npc={pilgrimNpc("북쪽에서 왔다는 자가 길에 남긴 매듭 표식.")}
      onClose={onClose}
      quests={quests}
      completeQuest={completeQuest}
      inventory={inventory}
      steps={[step.step]}
      idleText="표식은 다음 자취를 가리키고 있다. 길을 따라가라."
    />
  );
}
