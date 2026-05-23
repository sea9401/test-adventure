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

// 두루 — 마른나루 고물장수. 장사꾼 말투. 옛길 인트로(들고양이 송곳니·노상강도 단검 제작서) →
// 옛 변경 성채 녹슨 쇳조각 deliver (무진의 옛길 정리 완료 후 노출).
const STEPS: QuestLineStep[] = [
  {
    id: "dustford-duru-fangs",
    offerText:
      "옛길에 들고양이가 너무 불었어. 송곳니가 단검이며 장신구에 두루 쓰여. 열 개만 들여와 주면 사례하지. 노상강도 단검 손질하는 법도 알려줄게.",
    activeText: (have, need) => `들고양이는 갈대 그늘에 모여. 통발 헤집는 놈들이니 마음껏 솎아도 돼. 모은 양 ${have}/${need}`,
    doneText: "열 개. 좋아. 손잡이 감을 만큼은 되겠어.\n자, 약속한 사례다. 노상강도 단검 손질하는 법도 함께 가져가.",
    acceptLabel: "들여와 주겠다고 한다",
  },
  {
    id: "dustford-duru-feathers",
    offerText:
      "까마귀 깃도 자꾸 모자라. 두건이며 안감이며. 열두 장만 들여와 주면 후하게 쳐주지.",
    activeText: (have, need) => `깃은 들까마귀 떼한테서 나와. 한 마리 떨어뜨릴 때마다 한두 장씩이야. 모은 양 ${have}/${need}`,
    doneText: "열두 장. 됐어. 한동안 두건은 댈 만하겠군. 자, 쳐준 값이다.",
    acceptLabel: "들여와 주겠다고 한다",
  },
  {
    id: "dustford-duru-scrap",
    offerText:
      "이제 성채도 드나든다며? 그럼 부탁 하나. 녹슨 쇳조각, 그게 다시 벼리면 갑옷이고 무기고 다 돼. 여덟 덩이만 들여와 주면 후하게 쳐주지.",
    activeText: (have, need) => `쇳조각은 녹슨 자동인형이 떨구거나, 탈영병이 무기로 들고 다녀. 모은 양 ${have}/${need}`,
    doneText: "여덟 덩이. 좋아. 모루가 한동안 쉴 틈이 없겠어. 자, 쳐준 값이다.",
    acceptLabel: "들여와 주겠다고 한다",
  },
  {
    // craft_item — 옛 변경 군기 한 폭(frontier_standard_cloak) 1점. duru-scrap 후 노출.
    // 노상강도가 떨구는 군기 조각(tattered_standard_cloak)을 한 번 더 잇대는 업그레이드.
    id: "dustford-duru-standard-restore",
    offerText:
      "성채까지 다닌다며? 그럼 부탁 하나 더. 옛 변경 군기, 한 폭을 잇대 복원한 걸 한 번이라도 두르고 와 줘. 마른나루 노인들이 그 깃 한 번 보고 싶어 해.",
    activeText: (have, need) =>
      `군기 망토는 자네 공방에서 잇대는 거야. 깃 한 폭에 또 한 폭을 겹쳐 기우면 돼. 만든 양 ${have}/${need}`,
    doneText: "그래. 한 세대 만에 그 깃이 다시 펄럭이는군. 노인들이 한참 봤을 거다. 자, 쳐준 값.",
    acceptLabel: "맡아 보겠다고 한다",
  },
];

export function DuruDialogue({ npc, onClose, quests, completeQuest, inventory }: Props) {
  return (
    <QuestLineDialogue
      npc={npc}
      onClose={onClose}
      quests={quests}
      completeQuest={completeQuest}
      inventory={inventory}
      steps={STEPS}
      idleText="옛길도, 성채도 한 번 비운다고 끝이 아니야. 또 손 빌릴 일 생기면 부르고."
    />
  );
}
