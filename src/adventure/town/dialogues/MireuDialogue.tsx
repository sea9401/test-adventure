import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import { FERRYMAN_FLAG_REEF_PASSAGE } from "./HaerangDialogue";

// 미르 — 소만 갯마을 아이. storyFlag 로 분위기/떡밥 분기 + 해랑이 배를 내준 뒤에는
// 본인이 직접 한 번 의뢰를 내준다 (visit_region — 산호초 섬을 다섯 번 다녀와 달라).
const REEF_TOUR_QUEST = "saltmarsh-mireu-reef-tour";
const REEF_TOUR_NEED = 5;

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  storyFlags: ReturnType<typeof useStoryFlags>;
};

export function MireuDialogue({ npc, onClose, quests, completeQuest, storyFlags }: Props) {
  const stilled = storyFlags.has("the_deep_one_stilled");
  const crossed = storyFlags.has(FERRYMAN_FLAG_REEF_PASSAGE);

  // 해랑이 배를 내준 뒤에야 — 산호초 섬을 본 적 있는 사람으로서 — 의뢰를 내준다.
  // ready/active 가 우선 (수령·진행 도중 분위기 대사가 가로채면 안 됨). 보스 처치 후에도
  // 의뢰가 끝나지 않았다면 의뢰 분기를 그대로 유지.
  if (crossed) {
    const tour = quests.getEntry(REEF_TOUR_QUEST);
    if (tour.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"다섯 번 다 다녀왔어요? …그럼 이제 다 말해 줘요. 안개도, 사이렌 노래도, 가시 산호도. 약속한 거예요. 갯벌에서 주운 거예요."}
          primaryAction={{
            label: "이야기해 준다",
            onClick: () => {
              if (completeQuest(REEF_TOUR_QUEST)) onClose();
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
          text={`산호초 섬, 또 다녀왔어요? 한 번씩 갔다 와서 다 말해 줘요. 안개도, 사이렌 노래도. 다녀온 횟수 ${tour.progress}/${REEF_TOUR_NEED}`}
        />
      );
    }
    if (tour.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"해랑 아저씨는 안 데려가 줘요. 아저씨가 다섯 번만 더 갔다 와서, 산호초 섬이 어떻게 생겼는지 다 말해 줘요. 안개도, 사이렌 노래도, 가시 산호도. 약속해요?"}
          primaryAction={{
            label: "약속한다",
            onClick: () => {
              quests.accept(REEF_TOUR_QUEST);
              onClose();
            },
          }}
        />
      );
    }
  }

  if (stilled) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "이제 갯벌이 안 출렁여요! 한낮에도요. 진짜로 가라앉았나 봐요.\n…저 조개껍데기들 중에 제일 큰 거, 아저씨한테 줄게요. 암초 밑에서 주웠대요. 해랑 아저씨가."
        }
      />
    );
  }
  if (crossed) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "해랑 아저씨 배 타고 암초 너머 갔었죠? …거기, 노랫소리 들렸어요? 사이렌 거요.\n어른들은 갯벌이 출렁이는 건 물때 때문이래요. 근데 물때는 달이 정하는 거잖아요. 한낮인데 출렁이면, 그건 밑에 있는 게 숨 쉬는 거예요. 난 알아요."
        }
      />
    );
  }
  // greeting 그대로.
  return <NpcDialogue npc={npc} onClose={onClose} />;
}
