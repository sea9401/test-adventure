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

// 해무 — 천공 성지 원로. 메인 라인 "능선 너머의 봉인" (백운에 대응하는 자리).
// A 용암 핵 ×6(→ 봉황갑 제작서) → B 봉황 깃털 ×5(→ 봉황주 제작서) → C 화염 비늘 ×8 → D 봉황 깃털 ×8(→ 봉황 무기 4종 제작서).
// C 완료 시 page.tsx 가 ridge_crosser 칭호 + skyreach_main_cleared flag 부여.
// 정기 토벌 `skyreach-volcano-heart-recurring` 은 길드 게시판(용암 핵 의뢰 후 노출).
const STEPS: QuestLineStep[] = [
  {
    id: "skyreach-haemu-lava-core",
    offerText:
      "…드디어 왔구려. 화산의 심장이 잠든 걸 느꼈소.\n이 성지에는 그것 말고도 잠재워 둔 것이 있소. 그 봉인이 아래에서 올라오는 열기에 무뎌졌소. 용암 핵 여섯 개면 자물쇠를 다시 채울 수 있소. 가져다 주면, 봉황 무구를 벼리는 법도 자네 손에 새겨 주리다.",
    activeText: (have, need) =>
      `용암 핵은 화산 두꺼비나 불꽃 골렘이 떨구오. 진행 ${have}/${need}`,
    doneText:
      "용암 핵 여섯… 됐소. 첫째 자물쇠가 채워졌소.\n약속한 대로. 봉황 무구를 벼리는 법이오. 자네 손에 새겨졌을 게요.",
  },
  {
    id: "skyreach-haemu-phoenix-feather",
    offerText:
      "봉인을 더 단단히 하려면 봉황 깃털 다섯 장이 필요하오. 봉황령의 불꽃 독수리에게서, 혹은 화산의 심장이 떨군 것 중에 있을 게요. 가져오면 봉황주 만드는 법을 더해 주리다.",
    activeText: (have, need) =>
      `봉황 깃털은 봉황령의 불꽃 독수리에게서 나오오. 진행 ${have}/${need}`,
    doneText: "봉황 깃털 다섯 장… 둘째 자물쇠도 채워졌소. 봉황주 만드는 법을 더해 두겠소.",
  },
  {
    id: "skyreach-haemu-flame-scale",
    offerText:
      "마지막이오. 화염 비늘 여덟 장이면 봉인이 완성되오.\n…이 일을 끝내면, 자네에게 들려줄 이야기가 있소. 북쪽에서 온 순례자를 봤다고 했지? 그 이야기와 무관하지 않소.",
    activeText: (have, need) =>
      `화염 비늘은 봉황령 화염 도마뱀에게서 나오오. 진행 ${have}/${need}`,
    doneText:
      "봉인이 완성됐소. …고맙소, 정말로.\n약속대로 들려주리다. 허나 그 전에, 운향의 순례자에게 가 보오. 내 말을 전해 주오: '능선 너머의 봉인은 다시 채워졌다'고. 그가 자네에게 더 말해줄 게요.",
  },
  {
    id: "skyreach-haemu-weapons",
    offerText:
      "봉인이 채워졌으니. 이제 네 손에 무기를 쥐어 줄 차례요. 봉황 깃털 여덟 장이면, 봉황도·봉황패·봉황극·봉황조, 네 자루 전부 벼리는 법을 자네 손에 새겨 주리다. 손에 맞는 걸 골라 쓰시오.",
    activeText: (have, need) =>
      `봉황 깃털은 봉황령의 불꽃 독수리에게서 나오오. 진행 ${have}/${need}`,
    doneText:
      "여덟 장이라… 됐소. 봉황도, 봉황패, 봉황극, 봉황조. 네 자루의 도면이 자네 손에 새겨졌소. 화산의 심장이 떨군 것들로 모루 위에서 벼리시오. 손에 맞는 걸 골라 쓰면 되오.",
  },
];

export function HaemuDialogue({
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
      idleText="봉인은 채워졌소. 허나 아래의 열기는 잦아들 줄 모르니, 길드 게시판에 정기 토벌을 걸어 뒀소. 동료들과 가끔 화산의 심장을 살펴 주오. …운향의 순례자도 잊지 마오."
    />
  );
}
