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

// 도연 — 산악 가이드. 협곡/산기슭/봉황령/운저 평원 사정에 밝다.
// 인트로 절벽 늑대(반복, 단검 제작서) → 산기슭·협곡 사이드 → 봉황령·운저 평원 의뢰.
const STEPS: QuestLineStep[] = [
  {
    id: "unhyang-doyeon-stone-frogs",
    offerText:
      "산기슭 바위 두꺼비, 그놈들 등껍데기가 길을 막아. 열다섯 마리만 치워 주면 짐꾼들 발이 좀 편해질 거야. 가는 김에 협곡 무리장 늑대도 한 마리 봐 두면 굵은 송곳니가 나올 거야. 그게 나오면 단검 만드는 법도 함께 알려줄게.",
    activeText: (have, need) => `바위 두꺼비는 비탈 그늘에 모여 있어. 진행 ${have}/${need}`,
    doneText: "두꺼비들 치웠구나. 길이 한결 낫겠어. 자, 약속한 단검 만드는 법이다. 자네 손에 굵은 송곳니가 들어오면 한 자루 다듬어 봐.",
  },
  {
    id: "village-jimmy-doyeon-timber",
    offerText:
      "시작 마을 나무꾼 지미가 그러던데. 산정 협곡엔 안 휘는 목재가 난다고. 그게 절벽 늑대 소굴 안쪽에 있어.\n열다섯 마리만 정리해 주면 안전하게 베어 와서 지미한테 부쳐 줄게.",
    activeText: (have, need) => `소굴 안쪽 늑대들이 문제야. 길부터 트자. 진행 ${have}/${need}`,
    doneText: "소굴이 트였어. 목재 베어다 지미한테 부쳐 줄게. 자, 자네 몫이야.",
  },
  {
    id: "unhyang-guide-cloud-raiders",
    offerText:
      "운향 아래로 내려가면 너른 들판이 펼쳐져 있어. 요즘 거기 떠돌이 약탈자 무리가 자리를 잡았다더군. 15명만 손봐 주겠나?",
    activeText: (have, need) => `약탈자들은 평원 야영지에 뭉쳐 있어. 진행 ${have}/${need}`,
    doneText: "평원이 좀 트였겠군. 짐수레가 다니기 한결 낫겠어. 받아.",
  },
  {
    id: "unhyang-guide-bison-down",
    offerText:
      "산정 아래 들판 가봤어? 들소 떼가 길을 떡 막아. 스무 마리만 솎아 주면 짐수레가 좀 다닐 거야.",
    activeText: (have, need) => `들소는 떼로 밀어붙이니까 한 놈씩 떼어내. 진행 ${have}/${need}`,
    doneText: "들판 길이 트였구나. 고맙다. 자, 받아.",
  },
  {
    id: "unhyang-guide-phoenix-hunt",
    offerText:
      "봉황령에 불꽃 독수리가 너무 많아. 15마리만 정리해 주면 능선이 좀 안전해질 거야.",
    activeText: (have, need) =>
      `독수리는 능선을 빙빙 돌아. 내리꽂힐 때를 노려. 진행 ${have}/${need}`,
    doneText: "능선이 좀 조용해졌겠어. 순례자들도 한시름 놓겠지. 받아.",
  },
  {
    id: "unhyang-guide-flame-lizards",
    offerText:
      "봉황령 능선 바위틈에 화염 도마뱀이 들끓어. 15마리만 정리해 주면 길이 좀 트일 거야.",
    activeText: (have, need) => `도마뱀은 바위틈 그늘에 숨어. 비늘이 뜨거우니 조심하고. 진행 ${have}/${need}`,
    doneText: "바위틈이 트였겠어. 능선 길이 한결 낫겠다. 받아.",
  },
  {
    id: "unhyang-guide-ridge-storm",
    offerText:
      "봉황령 바위틈에 화염 도마뱀이 또 둥지를 텄어. 열여덟만 정리해 주면 순례길이 한동안 트일 거야.",
    activeText: (have, need) => `도마뱀은 바위틈 그늘에 숨어 비늘을 달궈. 한 놈씩 끌어내. 진행 ${have}/${need}`,
    doneText: "둥지를 다 치웠구나. 순례길이 한동안은 조용하겠어. 받아.",
  },
];

export function DoyeonDialogue({
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
      idleText="협곡도, 능선도 한 번 정리한다고 끝나는 곳이 아니야. 또 부탁할 일이 생기면 말할게."
    />
  );
}
