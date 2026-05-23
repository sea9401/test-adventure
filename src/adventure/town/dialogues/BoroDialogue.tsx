import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import { STRANGER_FLAG_TRIAL_STARTED } from "./StrangerDialogue";

const QUEST_ID = "diola-boro-spider-silk";
const NEED = 30;

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
  storyFlags: ReturnType<typeof useStoryFlags>;
};

export function BoroDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  inventory,
  storyFlags,
}: Props) {
  const trialStarted = storyFlags.has(STRANGER_FLAG_TRIAL_STARTED);
  const entry = quests.getEntry(QUEST_ID);

  if (!trialStarted) {
    return <NpcDialogue npc={npc} onClose={onClose} />;
  }

  if (entry.state === "completed") {
    // 후속 — 산적 단검 차고 와 (equip_item). 거미줄 의뢰가 끝난 뒤에야 노출.
    const bearDagger = quests.getEntry("diola-boro-bandit-dagger-bear");
    if (bearDagger.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"다음에 거래소에 오실 땐. 산적 단검 한 자루라도 차고 와 주세요. 다른 손님이 그 모습을 보면 따라 거래하거든요. 거래는 양쪽이 다 좋아야 거래라잖아요?"}
          primaryAction={{
            label: "맡겠다고 한다",
            onClick: () => {
              quests.accept("diola-boro-bandit-dagger-bear");
              onClose();
            },
          }}
        />
      );
    }
    if (bearDagger.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"인벤토리에 두지 마시고, 손에. 그래야 다른 손님 눈에 띄지요."}
        />
      );
    }
    if (bearDagger.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"오, 산적 단검 차고 오셨네요. 그 모습이면 됐어요. 자, 약속한 답례요."}
          primaryAction={{
            label: "보상을 받는다",
            onClick: () => {
              if (completeQuest("diola-boro-bandit-dagger-bear")) onClose();
            },
          }}
        />
      );
    }
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"또 들러 주셨군요. 좋은 물건 들여놨거든요. 한번 보고 가시겠어요?\n…아, 그건 농담이고요. 거래는 늘 환영이지요."}
      />
    );
  }

  if (entry.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"오, 후드 손님이 추천해 주신 분이군요. 사근사근하게 모실게요.\n거미줄 재고가 자꾸 모자랍니다. 10개만 모아 주시면, 답례로 골드와 명성을 두둑이 드리지요. 거래는 양쪽이 다 좋아야 거래라잖아요?"}
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(QUEST_ID);
            onClose();
          },
        }}
      />
    );
  }

  const have = inventory.materialCount("spider_silk");
  if (have >= NEED) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"이만큼이나! 거래는 좋아하시는 분이군요.\n약속한 답례, 받으시지요. …이 정도면 다음에 더 큰 일도 같이할 수 있겠어요."}
        primaryAction={{
          label: "건네준다",
          onClick: () => {
            const r = quests.tryDeliver(
              QUEST_ID,
              inventory.materialCount,
              inventory.consumeMaterial,
            );
            if (r.ok) {
              completeQuest(QUEST_ID);
              onClose();
            }
          },
        }}
      />
    );
  }

  return (
    <NpcDialogue
      npc={npc}
      onClose={onClose}
      text={`외곽 숲의 거미가 잘 떨어뜨립니다. 진행: ${have}/${NEED}\n…너무 늦진 않게요. 재고 떨어지면 손님이 기다려요.`}
    />
  );
}
