import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import { STORY_QUESTS } from "@/adventure/data/storyQuests";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { DialogueRewardId } from "@/adventure/data/dialogueRewards";
import type { NotificationKind } from "@/lib/notifications";

export const SUZY_FLAG_ACCEPTED = "suzy_husband_news_accepted";
export const SUZY_FLAG_KAI_SEEN = "suzy_husband_news_kai_seen";
export const SUZY_FLAG_COMPLETE = "suzy_husband_news_complete";

type Props = {
  npc: Npc;
  onClose: () => void;
  storyFlags: ReturnType<typeof useStoryFlags>;
  /** 1회성 보상 서버 mutator — character/inventory/storyFlags 통째 교체 + dialogue close. */
  claimDialogueReward: (
    id: DialogueRewardId,
    opts?: { onSuccess?: () => void },
  ) => Promise<void>;
  addNotification: (kind: NotificationKind, text: string) => void;
};

export function SuzyDialogue({
  npc,
  onClose,
  storyFlags,
  claimDialogueReward,
  addNotification,
}: Props) {
  const accepted = storyFlags.has(SUZY_FLAG_ACCEPTED);
  const kaiSeen = storyFlags.has(SUZY_FLAG_KAI_SEEN);
  const complete = storyFlags.has(SUZY_FLAG_COMPLETE);

  // Stage A — 첫 대화. 부탁 받기.
  if (!accepted) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "아, 모험가 분이세요?\n혹시 디올라 쪽에 들르실 일 있으면… 우리 그이 좀 봐주세요. 호숫가에서 일한다고 갔는데, 벌써 한 달째 편지 한 통이 없네요.\n살아만 있으면 됐어요. 정말로요."
        }
        primaryAction={{
          label: "부탁을 들어준다",
          onClick: () => {
            storyFlags.set(SUZY_FLAG_ACCEPTED);
            onClose();
          },
        }}
      />
    );
  }

  // Stage B — 카이를 아직 못 만남.
  if (!kaiSeen) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "디올라에는 가보셨어요?\n호숫가에서 일하는 사람이라면, 아마 어부들이 알 거예요. 새벽에 호수에 나가는 사람들 말이에요."
        }
      />
    );
  }

  // Stage C — 소식 전달. 보상.
  if (!complete) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "정말요? 그이가 무사하다고요?\n혹시 무슨 일이 생긴 건 아닐까, 다친 건 아닐까… 매일 밤 잠도 제대로 못 잤어요. 덕분에 한시름 덜었네요.\n변변찮지만 이거라도 받아주세요. 직접 우린 회복약이에요. 정말 고마워요."
        }
        primaryAction={{
          label: "감사 인사를 받는다",
          onClick: () => {
            void claimDialogueReward("suzy_husband_news", {
              onSuccess: () => {
                addNotification(
                  "quest_complete",
                  `${STORY_QUESTS.suzy_husband_news.title} 완료 — 골드 +30, 명성 +1, 작은 회복약 ×2`,
                );
                onClose();
              },
            });
          },
        }}
      />
    );
  }

  // Stage D — 끝. 일상 대화.
  return (
    <NpcDialogue
      npc={npc}
      onClose={onClose}
      text={
        "오셨어요. 그이가 봄에는 잠깐 다녀간다고 했어요.\n그때까지 또 뜨개질이나 하고 있어야죠."
      }
    />
  );
}
