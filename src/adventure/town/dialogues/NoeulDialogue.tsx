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

// 노을 — 바람골 대상 상인. 반말. 호위·재료 의뢰 단골.
const STEPS: QuestLineStep[] = [
  {
    id: "windvale-merchant-hawk-feathers",
    offerText:
      "초원 매 깃털이 세공에 그만이거든. 5장만 모아다 주면 길에서 주운 좋은 걸 나눠 드리지. 깃털로 가벼운 망토 짜는 법도 알려 줌세.",
    activeText: (have, need) => `깃털은 초원 매에게서 나와. 떨어뜨릴 때를 노려. 진행 ${have}/${need}`,
    doneText: "다섯 장 다 모았군. 약속한 거. 좋은 물건이랑, 망토 짜는 법도 함께. 받아.",
  },
  {
    id: "windvale-merchant-escort-raiders",
    offerText:
      "내 짐수레를 노리는 약탈자 놈들 좀 떼어내 줘. 열둘이면 한동안은 길이 조용하지.",
    activeText: (have, need) => `약탈자들은 평원 야영지에 뭉쳐 있어. 진행 ${have}/${need}`,
    doneText: "열둘이나? 한동안은 짐수레 걱정 안 해도 되겠어. 자, 받아.",
  },
  {
    id: "windvale-merchant-escort-hawks",
    offerText:
      "초원 매가 자꾸 짐 위로 내리꽂혀서 깃털이 모이질 않아. 열 마리만 쫓아 주면 길에서 주운 좋은 걸 나눠 드리지.",
    activeText: (have, need) => `매는 하늘에서 내리꽂혀. 그 순간을 노려. 진행 ${have}/${need}`,
    doneText: "이제 짐 위가 조용하군. 좋은 거 나눠 드리지. 받아.",
  },
  {
    id: "windvale-merchant-ash-stone",
    offerText:
      "잿돌이 세공 받침에 그만이거든. 여덟 덩이만 모아다 줘. 잿빛 협로 골렘이 가끔 떨군다더라.",
    activeText: (have, need) => `잿돌은 잿빛 협로 재먼지 골렘에게서 나와. 진행 ${have}/${need}`,
    doneText: "여덟 덩이 다 모았군. 결이 좋아. 자, 사례다.",
  },
];

export function NoeulDialogue({ npc, onClose, quests, completeQuest, inventory }: Props) {
  return (
    <QuestLineDialogue
      npc={npc}
      onClose={onClose}
      quests={quests}
      completeQuest={completeQuest}
      inventory={inventory}
      steps={STEPS}
      idleText="길 위 소문이라면 또 들러. 손 빌릴 일 생기면 그때 부탁하지."
    />
  );
}
