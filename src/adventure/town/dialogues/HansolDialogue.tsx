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

// 한솔 — 바람골 길잡이. 반말. 잿빛 협로·봉황령 길 개척. 화산의 심장 메인 의뢰도 이 사람이.
const STEPS: QuestLineStep[] = [
  {
    id: "windvale-pathfinder-golems",
    offerText:
      "봉황령으로 길을 내려는데 재먼지 골렘이 길목을 막고 있어. 15체만 부숴 주면 그 너머로 가는 길을 알려줄게.",
    activeText: (have, need) => `골렘은 잿가루 속에 묻혀 있어. 잘 봐 두고 쳐. 진행 ${have}/${need}`,
    doneText: "길목이 트였군. 잿빛 협로 너머 봉황령으로 가는 길, 이제 알려줄게. 자, 사례다.",
  },
  {
    id: "windvale-volcano-boss",
    offerText:
      "잿빛 협로를 지나 봉황령을 넘으면 화산 지대가 나와. 거기 깊은 곳에. 사람들이 화산의 심장이라 부르는 게 깨어났어. 그놈을 잠재워야 그 너머 천공 성지로 가는 길이 열려. 부탁 좀 할게.",
    activeText: (have, need) => `혼자선 어림없어. 동료 데려가고, 단단히 준비해. 진행 ${have}/${need}`,
    doneText: "정말 잠재웠나… 천공 성지로 가는 길이 열렸어. 고맙다. 자, 약속한 거.",
  },
  {
    id: "windvale-pathfinder-ridge-scout",
    offerText:
      "잿빛 협로를 넘으면 봉황령이야. 거기 불꽃 독수리가 능선을 빙빙 돌아. 열둘만 떨어뜨려 주면 첫 발 디딜 데가 생겨.",
    activeText: (have, need) => `독수리는 능선을 돌아. 내리꽂힐 때를 노려. 진행 ${have}/${need}`,
    doneText: "능선에 첫 발 디딜 데가 생겼어. 봉황령 길은 거기서부터다. 받아.",
  },
  {
    id: "windvale-pathfinder-deep-ridge",
    offerText:
      "능선에 첫 발은 디뎠지. 근데 더 깊이 들어가니 산악 기사단이 진을 제대로 쳤더라. 스무 명만 치워 주면 그 너머로 가는 길이 보여. 약 주머니 더 키워 줄게.",
    activeText: (have, need) => `기사단은 능선 안쪽에 진을 쳤어. 한 명씩 끌어내. 진행 ${have}/${need}`,
    doneText: "능선 안쪽이 트였어. 그 너머가 화산 지대다. 자, 약속한 거. 약 주머니도 손봐 줬고.",
  },
  {
    id: "windvale-pathfinder-foothills",
    offerText:
      "봉황령 능선을 넘으면 화산 지대 어귀야. 거기 불꽃 골렘이 어슬렁대. 광물째 녹아내리는 놈들이라 까다롭지. 열둘만 부숴 주면 화산 지대로 들어서는 길이 트인다.",
    activeText: (have, need) => `골렘은 용암 웅덩이 가에 모여. 열기에 데지 마. 진행 ${have}/${need}`,
    doneText: "화산 지대로 들어서는 길이 트였어. 거기서부턴… 단단히 준비해 가라. 받아.",
  },
];

export function HansolDialogue({ npc, onClose, quests, completeQuest, inventory }: Props) {
  return (
    <QuestLineDialogue
      npc={npc}
      onClose={onClose}
      quests={quests}
      completeQuest={completeQuest}
      inventory={inventory}
      steps={STEPS}
      idleText="능선 너머는 한 번 길 낸다고 끝나는 곳이 아니야. 또 잿가루 묻힐 일 생기면 부르고."
    />
  );
}
