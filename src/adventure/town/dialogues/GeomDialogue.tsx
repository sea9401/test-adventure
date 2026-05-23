import type { Npc } from "@/adventure/data/npcs";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import { QuestLineDialogue, type QuestLineStep } from "./questLineDialogue";

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
};

// 검 — 천공 성지 정찰대원. 대담·말 빠른 반말. 봉황령·화산 지대 순찰.
// 화산의 심장 누적 사냥 의뢰(volcano-heart-hunter)도 이 사람이 — "옛 기록을 다시 써 보겠어?"
const STEPS: QuestLineStep[] = [
  {
    id: "skyreach-guide-knights",
    offerText:
      "봉황령에 모여든 산악 기사들이 성지 순례자들의 발목을 잡고 있어. 20명만 정리해 줘.",
    activeText: (have, need) => `기사들은 떼로 진을 쳐. 흩어뜨리고 하나씩 쳐. 진행 ${have}/${need}`,
    doneText: "스무 명이나? 순례길이 한결 트이겠어. 자, 약속한 거다.",
  },
  {
    id: "skyreach-guide-phoenix-eagles",
    offerText:
      "봉황령 능선에 불꽃 독수리가 너무 늘었어. 15마리만 떨어뜨려 줘. 순찰대가 좀 숨통이 트일 거야.",
    activeText: (have, need) => `독수리는 능선을 돌아. 내리꽂힐 때를 노려. 진행 ${have}/${need}`,
    doneText: "능선이 좀 조용해졌어. 순찰 돌기가 편해졌다. 받아.",
  },
  {
    id: "volcano-heart-hunter",
    offerText:
      "그것을 열 번이나 잠재운 자가 있었다는 옛 기록이 성지에 남아 있어. 솜씨가 있다면, 자네가 그 기록을 다시 써 보겠어?",
    activeText: (have, need) => `한 번에 끝낼 일이 아니야. 매번 단단히 준비해. 진행 ${have}/${need}`,
    doneText: "열 번이라… 성지의 기록이 다시 쓰였어. 대단하다. 자, 받아.",
  },
];

export function GeomDialogue({ npc, onClose, quests, completeQuest, inventory }: Props) {
  return (
    <QuestLineDialogue
      npc={npc}
      onClose={onClose}
      quests={quests}
      completeQuest={completeQuest}
      inventory={inventory}
      steps={STEPS}
      idleText="봉황령도 화산도, 한 번 순찰한다고 끝나는 데가 아니야. 또 손 빌릴 일 생기면 부르지."
    />
  );
}
