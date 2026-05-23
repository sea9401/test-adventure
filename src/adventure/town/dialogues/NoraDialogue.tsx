import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import { STRANGER_FLAG_TRIAL_STARTED } from "./StrangerDialogue";

const QUEST_ID = "diola-nora-bat-eyes";
const NEED = 10;

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
  storyFlags: ReturnType<typeof useStoryFlags>;
};

export function NoraDialogue({
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
    // 후속 — 리오 들어주기 (talk_to_npc). 박쥐 의뢰가 끝난 뒤에야 노출.
    const listenRio = quests.getEntry("diola-nora-listen-rio");
    if (listenRio.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"리오가 요즘 다 큰 척만 해요. 후드 손님 흉내 내면서요. 어린애가 어른 흉내 내는 게 마음 쓰여서요. 세 번만 그 애 들러줘요. 차 한 잔 끓여 둘게요."}
          primaryAction={{
            label: "들러 보겠다고 한다",
            onClick: () => {
              quests.accept("diola-nora-listen-rio");
              onClose();
            },
          }}
        />
      );
    }
    if (listenRio.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`리오는 보통 마을 어귀에 있어요. 어른 흉내 내려 들지 말고, 그냥 그 애 이야기를 들어 주세요. 들른 횟수 ${listenRio.progress}/3`}
        />
      );
    }
    if (listenRio.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"세 번 다 들러줬다고요? 그 애 표정이 한결 어려졌네요. 자, 약속한 사례. 회복약도 함께."}
          primaryAction={{
            label: "보상을 받는다",
            onClick: () => {
              if (completeQuest("diola-nora-listen-rio")) onClose();
            },
          }}
        />
      );
    }

    // 산하(운향 약초꾼)가 보낸 산정 약초 — 전령이 누구였는지 알아본다(§7.2).
    if (storyFlags.has("sanha_nora_herbs_sent")) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"산하가 보낸 산정 약초, 잘 받았어요! …당신이 전령이었군요. 산기슭 향이 그대로네요. 고마워요.\n차에 한 줌 우려뒀어요. 안개 짙은 밤엔 이게 제일이에요."}
        />
      );
    }
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"다시 와 주셔서 고마워요. 다락도 조용해졌고요.\n안개 짙은 밤은 우리 여관이 제일이에요. 한밤중에 차도 끓여드릴게요."}
      />
    );
  }

  if (entry.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"오, 후드 손님이 보내신 분이군요. 들어와요, 차 한 잔 드릴게요.\n…사실은 부탁이 있어요. 여관 다락에 박쥐가 자꾸 들어와서요. 박쥐 눈알 10개만 모아다 주시면, 며칠 전 사라진 손님이 두고 간 부적을 드릴게요. 어차피 안 찾으러 올 사람 같으니까요."}
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

  const have = inventory.materialCount("bat_eye");
  if (have >= NEED) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"어머, 정말 가져오셨네요. 무서운 일 시켰네요, 미안해요.\n약속한 부적이에요. 닳긴 했지만 매듭은 아직 단단하니까, 잘 지녀 주세요."}
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
      text={`박쥐는 동굴이 많죠. 무리하지 마시고요. 진행: ${have}/${NEED}\n다락에서 또 소리 나면 어쩌나… 부탁할게요.`}
    />
  );
}
