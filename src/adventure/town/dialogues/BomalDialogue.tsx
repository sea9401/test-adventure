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

// 보말 — 소만 여각 주인. 푸근한 존댓말. 게딱지 deliver 인트로(회복약) → 곳간 채우기(약 주머니+1)
// → 산호초 섬 갑각 약탈자 정리 (해랑의 선저 덧대기 완료 후 노출).
const STEPS: QuestLineStep[] = [
  {
    id: "saltmarsh-bomal-crab-shells",
    offerText:
      "손님상에 올릴 게장을 담그려는데 게딱지가 모자라네요. 열 개만 들여와 주면 섭섭잖게 사례할게요. 손님이 두고 간 회복약도 좀 챙겨 드리고.",
    activeText: (have, need) => `게딱지는 집게발 게한테서 나와요. 통째로 가져오면 손질은 제가 할게요. 모은 양 ${have}/${need}`,
    doneText: "열 개. 고마워요. 이만하면 게장 한 독은 담그겠네.\n자, 약속한 사례. 회복약도 챙겨 가요.",
  },
  {
    id: "saltmarsh-bomal-galley-larder",
    offerText:
      "대상 길손이 줄줄이 들이닥칠 철이라 곳간을 단단히 채워야 해요. 게딱지 열다섯 개만 더 들여와 주면, 손님이 두고 간 약 주머니를 손봐서 드릴게요. 더 많이 들어가게요.",
    activeText: (have, need) => `많이 필요해요. 게장에, 통발에, 손님상에. 모은 양 ${have}/${need}`,
    doneText: "곳간이 든든하네요. 자. 약 주머니, 솜씨 좋게 손봐 뒀어요. 이제 약을 한 종류씩 더 챙길 수 있을 거예요.",
    acceptLabel: "들여와 주겠다고 한다",
  },
  {
    id: "saltmarsh-bomal-reef-stew",
    offerText:
      "난바다에서 갑각 약탈자들이 어선까지 따라붙는대요. 열다섯만 정리해 주면 어선이 다시 나갈 거예요. 그래야 손님상에 생선이 오르죠.",
    activeText: (have, need) => `약탈자들은 암초 그늘에 떼로 숨어요. 한 놈씩 끌어내는 게 나아요. 진행 ${have}/${need}`,
    doneText: "어선이 다시 나가겠네요. 생선 들어오면 한 상 차려 드릴게요. 우선 이거 받아요.",
  },
  {
    // talk_to_npc — 미르(갯마을 아이)를 세 번 들어주기. bomal-crab-shells 완료 후 노출.
    id: "saltmarsh-bomal-listen-mireu",
    offerText:
      "그 애가 요즘 통 말이 적어요. 미르요. 한낮에도 갯벌만 보고 있고요. 들어줄 사람이 있어야지요. 세 번만 미르와 이야기를 나눠 주세요. 사례는 손님이 두고 간 회복약으로 챙겨 드릴게요.",
    activeText: (have, need) =>
      `미르는 보통 한낮에 갯벌 끝에 있어요. 말이 적은 애한테는 답을 재촉하지 말고. 나눈 이야기 ${have}/${need}`,
    doneText: "세 번. 고마워요. 미르가 한결 표정이 환해졌어요. 자, 약속한 사례. 회복약도 함께.",
    acceptLabel: "들러 보겠다고 한다",
  },
];

export function BomalDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  inventory,
}: Props) {
  return (
    <QuestLineDialogue
      npc={npc}
      onClose={onClose}
      quests={quests}
      completeQuest={completeQuest}
      inventory={inventory}
      steps={STEPS}
      idleText="갯벌 다녀오느라 시장하죠? …또 곳간이 비거든 말해요. 그땐 또 부탁할 테니."
    />
  );
}
