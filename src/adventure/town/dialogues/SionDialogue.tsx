import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useAdventureLog } from "@/adventure/log/useAdventureLog";
import { QuestLineDialogue, type QuestLineStep } from "./questLineDialogue";

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
  adventureLog: ReturnType<typeof useAdventureLog>;
};

const RELIC_QUEST = "hidden-volcano-relic";

// 시온 — 천공 성지 연금술사. 반말. 화산 재료 연구. 전부 deliver 의뢰.
const STEPS: QuestLineStep[] = [
  {
    id: "skyreach-alchemist-lava-core",
    offerText:
      "용암 핵이 필요한데, 화산 두꺼비나 불꽃 골렘을 잡으면 가끔 나오거든. 5개만 모아다 주면 포션 보유량을 늘려줄게.",
    activeText: (have, need) => `용암 핵은 화산 두꺼비·불꽃 골렘에게서 나와. 진행 ${have}/${need}`,
    doneText: "다섯 개 다 모았군. 약속한 대로. 포션 더 들고 다닐 수 있게 해줄게.",
  },
  {
    id: "skyreach-alchemist-phoenix-feather",
    offerText:
      "봉황 깃털로 점화제를 만들어 봐야겠어. 봉황령 불꽃 독수리에게서 넷만 모아다 줘.",
    activeText: (have, need) => `봉황 깃털은 봉황령 불꽃 독수리에게서 나와. 진행 ${have}/${need}`,
    doneText: "넷이라… 점화제 실험 한번 해볼 수 있겠어. 자, 사례다.",
  },
  {
    id: "skyreach-alchemist-flame-scale",
    offerText:
      "비늘에서 내열제를 추출해야 해. 봉황령 화염 도마뱀의 비늘 여덟 장만 모아다 줘.",
    activeText: (have, need) => `화염 비늘은 봉황령 화염 도마뱀에게서 나와. 진행 ${have}/${need}`,
    doneText: "여덟 장이나. 내열제 충분히 뽑겠어. 받아.",
  },
  {
    id: "skyreach-alchemist-heart-essence",
    offerText:
      "화산의 심장을 잠재울 때마다 떨어지는 것들. 용암 핵. 그걸로 봉인 보강제를 만들어 봐야겠어. 열 개만 모아다 줘.",
    activeText: (have, need) => `심장이 떨군 용암 핵이면 더 좋아. 진행 ${have}/${need}`,
    doneText: "열 개라… 봉인 보강제 한 통은 나오겠어. 자, 사례다. 또 모이면 가져와.",
  },
];

export function SionDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  inventory,
  adventureLog,
}: Props) {
  // 히든 — 심장이 잠든 자리(§11 hidden-volcano-relic). 화산의 심장 5회 처치 후 시온이 입을 연다.
  const heartKills = adventureLog.log.monsters["화산의 심장"]?.kills ?? 0;
  const relic = quests.getEntry(RELIC_QUEST);
  if (heartKills >= 5 && relic.state !== "completed") {
    if (relic.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "심장을 그렇게 여러 번 잠재웠지? …그 자리에 정수가 고였더군. 화산 두꺼비를 충분히 잡으면, 마흔 마리쯤이면, 그 정수가 흘러나올 거야. 그걸로 뭔가 만들어 보고 싶어."
          }
          primaryAction={{
            label: "받아들인다",
            onClick: () => {
              quests.accept(RELIC_QUEST);
              onClose();
            },
          }}
        />
      );
    }
    if (relic.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`두꺼비를 잡을수록 정수가 모여. 화산 지대 웅덩이 가에 많아. 진행 ${relic.progress}/40`}
        />
      );
    }
    if (relic.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "마흔 마리라… 정수가 충분히 흘러나왔어. 심장이 남기고 간 것. 뜨겁고, 무겁고, 아직 살아 있는 것 같아. 이걸로 뭘 만들지는 좀 더 궁리해 봐야겠어.\n자, 사례다. 네 덕이 컸어."
          }
          primaryAction={{
            label: "보상을 받는다",
            onClick: () => {
              if (completeQuest(RELIC_QUEST)) onClose();
            },
          }}
        />
      );
    }
  }

  return (
    <QuestLineDialogue
      npc={npc}
      onClose={onClose}
      quests={quests}
      completeQuest={completeQuest}
      inventory={inventory}
      steps={STEPS}
      idleText="화산 재료는 늘 모자라. 여분 생기면 또 들러. 거래할 게 있을 거야."
    />
  );
}
