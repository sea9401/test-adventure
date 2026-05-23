import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useInventory } from "@/adventure/inventory/useInventory";
import {
  SUZY_FLAG_ACCEPTED,
  SUZY_FLAG_KAI_SEEN,
  SUZY_FLAG_COMPLETE,
} from "./SuzyDialogue";

// 카이의 두 번째 떡밥 — 수지 의뢰가 완전히 끝난 뒤 새로 열림.
// 호수에 이상한 게 있다, 후드 쓴 사람이 알지도 모른다는 힌트.
export const KAI_FLAG_LAKE_HINT = "kai_lake_hint";

// lakeHint 까지 진행한 뒤(= 카이가 호수 이상을 털어놓은 뒤)에야 진짜로 도전 의뢰를 내준다 —
// "호수 님프를 흠 없이 다섯" (kill_within_hp). 카이의 결("그 노랫소리에 만져지기 전에 끝내야 해")
// 을 그대로 잇는다.
const PRISTINE_QUEST = "diola-kai-pristine-nymphs";
const PRISTINE_NEED = 5;
// 잔상 히든 — pristine 완료 후 풀리는 요정 가루 ×10 deliver. 보상: book_afterimage.
const AFTERIMAGE_QUEST = "diola-kai-afterimage";
const AFTERIMAGE_NEED = 10;

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  storyFlags: ReturnType<typeof useStoryFlags>;
  inventory: ReturnType<typeof useInventory>;
};

export function KaiDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  storyFlags,
  inventory,
}: Props) {
  const accepted = storyFlags.has(SUZY_FLAG_ACCEPTED);
  const kaiSeen = storyFlags.has(SUZY_FLAG_KAI_SEEN);
  const suzyComplete = storyFlags.has(SUZY_FLAG_COMPLETE);
  const lakeHint = storyFlags.has(KAI_FLAG_LAKE_HINT);

  // Stage C — 수지의 부탁을 받았고, 아직 카이에게 듣지 못한 경우.
  if (accepted && !kaiSeen) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "아, 시작 마을에서 오셨다고요? 혹시 우리 수지가 보냈어요?\n아이고, 면목이 없네요. 요즘 호수 일이 얼마나 바쁜지, 새벽에 나가서 밤늦게야 들어오니까 편지 쓸 짬이 안 났어요. 매일 '오늘은 꼭 써야지' 하면서도 손도 못 댔는데… 벌써 한 달이 됐네요.\n돌아가시면 수지한테 좀 전해주세요. 잘 지내고 있으니 걱정 말라고. 일 정리되는 대로 꼭 한번 다녀가겠다고. 정말 미안하다고요."
        }
        primaryAction={{
          label: "고맙다고 한다",
          onClick: () => {
            storyFlags.set(SUZY_FLAG_KAI_SEEN);
            onClose();
          },
        }}
      />
    );
  }

  // Stage E — 수지 의뢰가 완전히 끝난 뒤(보상까지 수령), 카이가 새로운 이야기.
  // 일에 쫓겨 말 못 하던 진짜 이유 — 호수가 이상하다.
  if (suzyComplete && !lakeHint) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "수지 잘 만나고 오셨다고요? 다행이네요, 정말.\n…사실은요. 일이 바쁜 것도 맞는데, 그것만은 아니에요. 요즘 호수가 이상해요. 새벽마다 그물을 걷으러 나가면 물안개 너머에서 묘한 노랫소리 같은 게 들리고, 어떤 날은 잡혀 올라온 물고기가 전부 굳어서 돌처럼 뻣뻣해요.\n수지한테는 차마 이런 말 못 하겠어서… 누구한테도 말 안 했는데, 여관에 후드 쓴 사람이 묵고 있다고 들었어요. 폐허 쪽 길도 안다고 하더군요. 한번 찾아가 보세요."
        }
        primaryAction={{
          label: "여관으로 가본다",
          onClick: () => {
            storyFlags.set(KAI_FLAG_LAKE_HINT);
            onClose();
          },
        }}
      />
    );
  }

  // Stage F — lakeHint 단계까지 진행한 뒤. 카이가 직접 호수 도전 의뢰를 내준다.
  // 노랫소리에 만져지기 전에 — HP 70% 이상 유지하며 호수 님프 다섯.
  if (lakeHint) {
    const e = quests.getEntry(PRISTINE_QUEST);
    if (e.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"다섯 다. 노랫소리에 만져지지 않고. 새벽 그물이 한결 가벼워졌어요. 자, 약속한 사례요."}
          primaryAction={{
            label: "보상을 받는다",
            onClick: () => {
              if (completeQuest(PRISTINE_QUEST)) onClose();
            },
          }}
        />
      );
    }
    if (e.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`그 노랫소리에 만져지기 전에 끝내야 해요. 한 마리라도 들리면 다음 한 마리는 손이 떨립니다. 흠 없이 잡은 수 ${e.progress}/${PRISTINE_NEED}`}
        />
      );
    }
    if (e.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"그 노랫소리에 만져지기 전에 끝내야 해요. 호수 님프 다섯을. HP 70% 이상으로. 흠 없이 잡고 오세요. 그래야 새벽 그물을 다시 걷을 수 있을 거예요."}
          primaryAction={{
            label: "맡겠다고 한다",
            onClick: () => {
              quests.accept(PRISTINE_QUEST);
              onClose();
            },
          }}
        />
      );
    }
    // pristine 완료 후 히든 — 닿기 전의 결 (요정 가루 ×10 → 잔상 스킬북).
    if (e.state === "completed") {
      const ai = quests.getEntry(AFTERIMAGE_QUEST);
      if (ai.state === "available") {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={
              "노랫소리에 만져지지 않고 다섯을 잡으셨죠. 그 결을 한 권으로 옮겨 드릴게요.\n요정 가루 열 점만 모아 오세요. 호수 님프가 가끔 떨궈요. 그걸로 잔상의 결을 자네 검에 옮겨 드릴게요."
            }
            primaryAction={{
              label: "받아들인다",
              onClick: () => {
                quests.accept(AFTERIMAGE_QUEST);
                onClose();
              },
            }}
          />
        );
      }
      if (ai.state === "active") {
        const have = inventory.materialCount("fairy_dust");
        if (have >= AFTERIMAGE_NEED) {
          return (
            <NpcDialogue
              npc={npc}
              onClose={onClose}
              text={
                "열 점. 새벽 안개가 잡힌 결이네요. 잔상의 결을 옮겨 드릴게요. 받으세요."
              }
              primaryAction={{
                label: "건네준다",
                onClick: () => {
                  const r = quests.tryDeliver(
                    AFTERIMAGE_QUEST,
                    inventory.materialCount,
                    inventory.consumeMaterial,
                  );
                  if (r.ok) {
                    completeQuest(AFTERIMAGE_QUEST);
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
            text={`요정 가루는 호수 님프가 가끔 떨궈요. 진행 ${have}/${AFTERIMAGE_NEED}`}
          />
        );
      }
    }
  }

  // 그 외에는 기본 인사 (npcs.ts 의 greeting 사용).
  return <NpcDialogue npc={npc} onClose={onClose} />;
}
