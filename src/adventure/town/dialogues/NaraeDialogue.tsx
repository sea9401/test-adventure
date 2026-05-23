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

// 나래 — 마른나루 역참 주인. 푸근한 존댓말. 까마귀 깃 deliver 인트로(회복약) → 겨우살이 채우기
// (약 주머니 +1) → 옛 변경 성채 탈영 약탈자 정리 (무진의 옛길 정리 완료 후 노출).
const STEPS: QuestLineStep[] = [
  {
    id: "dustford-narae-feathers",
    offerText:
      "손님 베개 속 채울 깃이 영 모자라네요. 까마귀 깃 열 장만 들여와 주면 잠자리가 한결 나을 텐데. 손님이 두고 간 회복약도 챙겨 드리고요.",
    activeText: (have, need) => `깃은 들까마귀 떼한테서 나와요. 옛길에 잔뜩 있어요. 모은 양 ${have}/${need}`,
    doneText: "열 장. 고마워요. 이만하면 베개 두엇은 채우겠네.\n자, 약속한 사례. 회복약도 챙겨 가요.",
    acceptLabel: "들여와 주겠다고 한다",
  },
  {
    id: "dustford-narae-larder",
    offerText:
      "찬바람 들 철이라 깃을 넉넉히 둬야 해요. 까마귀 깃 열다섯 장만 더 들여와 주면, 손님이 두고 간 약 주머니를 솜씨 좋게 손봐서 드릴게요. 더 많이 들어가게요.",
    activeText: (have, need) => `이불에, 베개에, 외풍 막는 데에. 깃은 늘 모자라요. 모은 양 ${have}/${need}`,
    doneText: "곳간이 든든하네요. 자. 약 주머니, 손봐 뒀어요. 이제 약을 한 종류씩 더 챙길 수 있을 거예요.",
    acceptLabel: "들여와 주겠다고 한다",
  },
  {
    id: "dustford-narae-keep-stew",
    offerText:
      "옛 성채에 눌러앉은 탈영병들이 옛길 행상까지 따라붙는대요. 열다섯만 정리해 주면 행상이 다시 다닐 거예요. 그래야 손님상에 올릴 게 들어오죠.",
    activeText: (have, need) => `탈영병들은 무너진 막사에 떼로 숨어요. 한 놈씩 끌어내는 게 나아요. 진행 ${have}/${need}`,
    doneText: "행상이 다시 다니겠네요. 물자 들어오면 한 상 차려 드릴게요. 우선 이거 받아요.",
  },
  {
    // talk_to_npc — 보리(역참 아이)를 세 번 들어주기. narae-feathers 완료 후 노출.
    id: "dustford-narae-listen-bori",
    offerText:
      "그 애가 요즘 통 말이 적어요. 보리요. 밤마다 옛길 끝 쪽을 본대요. 들어줄 사람이 있어야지요. 세 번만 보리와 이야기를 나눠 주세요. 사례는 손님이 두고 간 회복약으로 챙겨 드릴게요.",
    activeText: (have, need) =>
      `보리는 보통 마른 억새밭에 있어요. 무섭지 않냐고 묻지 말고, 그냥 듣기만 해도 돼요. 나눈 이야기 ${have}/${need}`,
    doneText: "세 번. 고마워요. 보리가 한결 표정이 환해졌어요. 자, 약속한 사례. 회복약도 함께.",
    acceptLabel: "들러 보겠다고 한다",
  },
];

export function NaraeDialogue({ npc, onClose, quests, completeQuest, inventory }: Props) {
  return (
    <QuestLineDialogue
      npc={npc}
      onClose={onClose}
      quests={quests}
      completeQuest={completeQuest}
      inventory={inventory}
      steps={STEPS}
      idleText="옛길 걸어오느라 시장하죠? …또 곳간이 비거든 말해요. 그땐 또 부탁할 테니."
    />
  );
}
