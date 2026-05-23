import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import { KEEP_FLAG_UNSEALED } from "./MujinDialogue";

// 보리 — 마른나루 역참 아이. storyFlag 로 분위기/떡밥 분기 + 성문이 열린 뒤에는
// 본인이 직접 한 번 의뢰를 내준다 (visit_region — 옛 성채를 다섯 번 다녀와 달라).
const KEEP_TOUR_QUEST = "dustford-bori-keep-tour";
const KEEP_TOUR_NEED = 5;

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  storyFlags: ReturnType<typeof useStoryFlags>;
};

export function BoriDialogue({ npc, onClose, quests, completeQuest, storyFlags }: Props) {
  const felled = storyFlags.has("gatekeeper_felled");
  const unsealed = storyFlags.has(KEEP_FLAG_UNSEALED);

  // 무진의 옛길 정리(unsealed)가 끝난 뒤에야 — 성채에 들어갈 수 있는 사람으로서 — 의뢰를
  // 내준다. ready/active 가 분위기 대사보다 우선.
  if (unsealed) {
    const tour = quests.getEntry(KEEP_TOUR_QUEST);
    if (tour.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"다섯 번 다 다녀왔어요? …그럼 이제 다 말해 줘요. 흉벽도, 우물도, 안마당도. 약속한 거예요. 마른 억새밭에서 주운 거예요."}
          primaryAction={{
            label: "이야기해 준다",
            onClick: () => {
              if (completeQuest(KEEP_TOUR_QUEST)) onClose();
            },
          }}
        />
      );
    }
    if (tour.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`옛 성채, 또 다녀왔어요? 한 번씩 갔다 와서 다 말해 줘요. 흉벽도, 우물도. 다녀온 횟수 ${tour.progress}/${KEEP_TOUR_NEED}`}
        />
      );
    }
    if (tour.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"무진 할아버지는 안 데려가 줘요. 아저씨가 다섯 번만 더 갔다 와서, 안이 어떻게 생겼는지 다 말해 줘요. 흉벽도, 우물도, 안마당도. 약속해요?"}
          primaryAction={{
            label: "약속한다",
            onClick: () => {
              quests.accept(KEEP_TOUR_QUEST);
              onClose();
            },
          }}
        />
      );
    }
  }

  if (felled) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "이제 밤에 쿵쿵 소리가 안 나요! 진짜로 멈췄나 봐요.\n…저 까마귀 깃들 중에 제일 큰 거, 아저씨한테 줄게요. 무너진 성벽 위에서 주웠대요. 솔개 아저씨가."
        }
      />
    );
  }
  if (unsealed) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "무너진 벽으로 성채에 들어갔다 왔죠? …거기, 성문 소리 들렸어요? 쿵, 하고요.\n어른들은 그게 그냥 바람에 문이 흔들리는 거래요. 근데 바람은 한밤중에만 부는 게 아니잖아요. 한낮에도 쿵 하면, 그건 안에 있는 게 움직이는 거예요. 난 알아요."
        }
      />
    );
  }
  // greeting 그대로.
  return <NpcDialogue npc={npc} onClose={onClose} />;
}
