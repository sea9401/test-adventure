import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useCrafting } from "@/adventure/crafting/useCrafting";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { EquippedSlots } from "@/adventure/character/types";
import { ownsEquipment } from "@/adventure/inventory/ownership";

// 동굴 → 깊은 동굴 통로 해금 플래그. 의뢰 수락 시 set.
export const JIMMY_FLAG_DEEP_CAVE_QUEST = "jimmy_deep_cave_quest";

type Props = {
  npc: Npc;
  onClose: () => void;
  crafting: ReturnType<typeof useCrafting>;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  storyFlags: ReturnType<typeof useStoryFlags>;
  inventory: ReturnType<typeof useInventory>;
  equippedSlots: EquippedSlots;
};

export function WoodcutterJimmyDialogue({
  npc,
  onClose,
  crafting,
  quests,
  completeQuest,
  storyFlags,
  inventory,
  equippedSlots,
}: Props) {
  const banditQuest = quests.getEntry("village-jimmy-bandits");
  const deepCaveQuest = quests.getEntry("village-jimmy-deep-cave");

  // 사전 조건 — 대장간 입문 퀘스트(볼드)를 끝낸 뒤 의뢰가 발생.
  if (!crafting.state.boldQuestComplete) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "어이, 모험가 양반.\n오늘도 숲에서 나무 좀 패다 왔지. 별일 없는 게 제일이야, 안 그래?"
        }
      />
    );
  }

  // 히든 — 두더지왕의 드릴을 든(보유/장착) 모험가에게 (§11 hidden-mole-king).
  {
    const mole = quests.getEntry("hidden-mole-king");
    if (
      mole.state !== "completed" &&
      ownsEquipment(inventory.state, equippedSlots, "mole_king_drill")
    ) {
      if (mole.state === "available") {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={
              "그… 그거 두더지왕의 드릴 아니우? 진짜 있었구먼, 그놈.\n그럼 흔적도 있을 거야. 평야 두더지를 백 마리쯤 잡아보쇼. 땅이 들썩이는 자리가 나올 거요. 거기 뭔가 있을 거란 말이지."
            }
            primaryAction={{
              label: "맡겠다",
              onClick: () => {
                quests.accept("hidden-mole-king");
                onClose();
              },
            }}
          />
        );
      }
      if (mole.state === "active") {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={`두더지 백 마리, 만만치 않지. 땅 들썩이는 자리 나오면 알려줘요. 진행 ${mole.progress}/100`}
          />
        );
      }
      if (mole.state === "ready") {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={
              "백 마리나… 그래서, 들썩이던 자리 파봤더니. 옛 굴이 하나 있더라고. 두더지왕이 살던 데래. 자네 드릴이 거기서 나온 거지.\n별 보물은 없었지만, 이야기 하나는 건졌수. 자, 수고비요."
            }
            primaryAction={{
              label: "보고를 마친다",
              onClick: () => {
                if (completeQuest("hidden-mole-king")) onClose();
              },
            }}
          />
        );
      }
    }
  }

  if (banditQuest.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "아, 모험가 양반. 잘 왔어.\n요즘 숲에 산적이 너무 많이 나와서 벌목하러 가질 못하고있어요. 산적들좀 처리해주세요.\n…고맙게도 예비 손도끼 한 자루 챙겨둔 게 있는데, 그거랑 약통 좀 더 쟁여둘 수 있게 해줄게."
        }
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept("village-jimmy-bandits");
            onClose();
          },
        }}
      />
    );
  }

  if (banditQuest.state === "active") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          `숲은 좀 잠잠해졌어요?\n산적 놈들 머릿수 좀 줄여 주쇼. 진행 ${banditQuest.progress}/20`
        }
      />
    );
  }

  if (banditQuest.state === "ready") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "오, 스무 놈이나? 이젠 톱밥 좀 마음 편히 마실 수 있겠네.\n자, 약속한 거. 예비 손도끼랑. 약통도 손봐뒀으니 작은 회복약 한 병쯤은 더 챙길 수 있을 거예요."
        }
        primaryAction={{
          label: "보상을 받는다",
          onClick: () => {
            if (completeQuest("village-jimmy-bandits")) onClose();
          },
        }}
      />
    );
  }

  // 산적 의뢰 완료 후 ─ 깊은 동굴 의뢰 라인.
  if (deepCaveQuest.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "모험가 양반, 마침 잘 왔어.\n요즘 동굴 더 안쪽까지 들어가서 나무를 패다 보니, 광맥이 두꺼운 자리 너머에서 영 안 좋은 기운이 풍기더라고…\n무서워서 도망쳐 나왔는데, 자꾸 마음에 걸려서. 한 번 가서 무엇이 있는지 봐주지 않을래요?"
        }
        primaryAction={{
          label: "맡겠다",
          onClick: () => {
            quests.accept("village-jimmy-deep-cave");
            storyFlags.set(JIMMY_FLAG_DEEP_CAVE_QUEST);
            onClose();
          },
        }}
      />
    );
  }

  if (deepCaveQuest.state === "active") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "동굴 안쪽까진 가봤수? 그 광맥 너머가 영 으스스하던데.\n조심해요. 무리하지 말고."
        }
      />
    );
  }

  if (deepCaveQuest.state === "ready") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "광물을 두른 거대한 골렘이라고? 그게 잠들어 있던 거였구먼…\n일단 잡아 줬으니 한동안은 안심하고 나무를 패겠어요. 자, 약속한 거. 사례금이랑, 약통도 한 칸 더 손봐뒀으니 포션도 한 병씩 더 챙길 수 있을 거요."
        }
        primaryAction={{
          label: "보고를 마친다",
          onClick: () => {
            if (completeQuest("village-jimmy-deep-cave")) onClose();
          },
        }}
      />
    );
  }

  if (deepCaveQuest.state === "completed") {
    // ── 5막 「빈 옥좌의 시대」 Ch 30 「별을 놓는 자」 종착 후 ────────────────
    // 유성이 마을을 떠난 뒤의 회상 톤. 5막 시퀀스의 *마지막* 안내 라인.
    if (storyFlags.has("endgame_complete")) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "유성 노인이 어제 마을을 떴수. 별바다 쪽 길목으로 가더라고. 잔 하나만 우물가에 두고.\n자네 등 뒤가 가벼워 보이오. 그 환영인지 뭔지, 누구의 것도 아닌 자리에 두고 왔다지. 잘했수. 별이 다시 떠올랐는지는 모르겠지만, 광맥 한기는 가셨고, 도끼날이 또 무뎌졌어요. 그러면 된 거지."
          }
        />
      );
    }
    // ── 5막 「빈 옥좌의 시대」 Ch 26 「별이 떨어진 자리」 ────────────────────
    // 옥좌의 주재가 쓰러진 직후 광맥 안쪽으로 별빛이 떨어졌다. 별빛 광맥 수호자를
    // 잠재울 때까지(starfall_warden_felled) 다른 의뢰들보다 우선 노출. 늙은 톤 정착.
    if (
      storyFlags.has("endgame_apex_defeated") &&
      !storyFlags.has("starfall_warden_felled")
    ) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "어이구, 자네…\n옥좌 어쩌고 하는 그 큰 싸움이 끝났다더만. 무사히 돌아와서 다행이여.\n…한데 자네, 큰일이 끝났는데 광맥 안쪽에서 또 한기가 새어 나오기 시작했수. 그놈 잠재웠던 자리 너머. 광맥이 끊긴 데까지 가봤더니 별빛 같은 게 한 점 가라앉아 있더라고. 광맥의 옛 잡것들이 그 빛에 데워져 또 깨어났수.\n…자네 말고는 가볼 사람이 없네. 한 번 더 잠재워주면 안 되겠수?"
          }
          objective={{
            body: "별빛 갱도 안쪽의 별빛 광맥 수호자를 잠재우세요.\n지역 보스 도전 버튼으로 진입합니다. (솔로)",
          }}
        />
      );
    }
    // 광맥 자리 재확인 — visit_region. deep-cave-hunter 노출 전에 우선 노출되는 한 단계.
    const tour = quests.getEntry("village-jimmy-deep-cave-tour");
    if (tour.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "사람들이 안 믿어요. 자네가 봤다는 그 광맥 자리, 한 번 더 가서 확인하고 와 주쇼. 다섯 번이면 마을 사람들도 자네 말을 믿을 게요."
          }
          primaryAction={{
            label: "맡겠다",
            onClick: () => {
              quests.accept("village-jimmy-deep-cave-tour");
              onClose();
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
          text={`광맥 자리, 또 다녀왔수? 다섯 번이면 마을 사람들도 자네 말을 믿을 게요. 다녀온 횟수 ${tour.progress}/5`}
        />
      );
    }
    if (tour.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"다섯 번 다. 좋아. 이제 마을 사람들도 그 광맥 자리 이야기를 믿어. 자, 사례요."}
          primaryAction={{
            label: "보고를 마친다",
            onClick: () => {
              if (completeQuest("village-jimmy-deep-cave-tour")) onClose();
            },
          }}
        />
      );
    }

    // 광맥의 수호자 누적 사냥 "사냥 기록" — 지미가 주는 개인 도전(보스 사냥꾼 칭호 일부).
    const hunter = quests.getEntry("deep-cave-hunter");
    if (hunter.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "그놈, 가끔 다시 깨어난다는 소문이 있더라고. 광물 때문인지 뭔지.\n…열 번이나 잠재우면 동굴 안쪽이 한동안 조용하다고들 하던데. 나야 무서워서 못 가지만, 모험가 양반이라면 기록 한번 채워볼 만하지 않겠어요?"
          }
          primaryAction={{
            label: "맡겠다",
            onClick: () => {
              quests.accept("deep-cave-hunter");
              onClose();
            },
          }}
        />
      );
    }
    if (hunter.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`그 광맥 골렘, 몇 번이나 잡았수? 천천히 해요, 무리하지 말고. 진행 ${hunter.progress}/10`}
        />
      );
    }
    if (hunter.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"열 번이라니… 이젠 톱밥을 발 뻗고 마실 수 있겠수. 자, 약속한 사례요."}
          primaryAction={{
            label: "보고를 마친다",
            onClick: () => {
              if (completeQuest("deep-cave-hunter")) onClose();
            },
          }}
        />
      );
    }
    // 5막 깊이 — 별빛 광맥 수호자를 한 번이라도 베어 본 자에게만 풀리는 히든.
    // 다섯 번을 거두어 오면 옛 광맥 호흡법 한 자락(흡령)을 자네 결에 옮겨 둔다.
    if (storyFlags.has("starfall_warden_felled")) {
      const lifesteal = quests.getEntry("village-jimmy-starfall-deepening");
      if (lifesteal.state === "available") {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={
              "광맥의 수호자가 별빛에 데워져 다시 깨어났다는 말. 자네가 봤다지. 사람들은 안 믿어.\n…다섯 번이면, 다섯 번을 거두어 와 주면, 노친네가 옛 광맥 호흡법 한 자락을 자네 결에 옮겨 둘 테니까. 광맥 안쪽에서 한 점씩 데려오는 결인데, 잘 익히면 자네 손에서 자네한테로 한 점이 돌아올 거요."
            }
            primaryAction={{
              label: "맡겠다",
              onClick: () => {
                quests.accept("village-jimmy-starfall-deepening");
                onClose();
              },
            }}
          />
        );
      }
      if (lifesteal.state === "active") {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={`별빛에 데워진 그 광맥 놈, 또 거두어 오셨수? 다섯이면 호흡법을 옮겨 둘 게요. 진행 ${lifesteal.progress}/5`}
          />
        );
      }
      if (lifesteal.state === "ready") {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={
              "다섯 번을 다. 자네 손이 광맥에 익었수.\n옛 광맥 호흡법, 잔영이 데미지를 한 점씩 자기 결로 옮겨 가는 결이지. 별빛에 데워진 이 결이라야 손에 익혀요. 자, 받아두쇼."
            }
            primaryAction={{
              label: "보고를 마친다",
              onClick: () => {
                if (completeQuest("village-jimmy-starfall-deepening")) onClose();
              },
            }}
          />
        );
      }
    }
    // 5막 Ch 26 종료 후 — 별빛 광맥 수호자를 잠재운 뒤의 회상 라인. 도연 라인보다
    // 시간상 후행이라 우선 노출. 한 자리만 그런 게 아닐 거라는 5막 본격 진입 떡밥.
    if (storyFlags.has("starfall_warden_felled")) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "광맥 안쪽 한기는 자네 덕에 다시 잠잠해졌수. 별빛이라더만. 손에 쥐어보니 옅게 떨리는 게, 옥좌에서 떨어진 거라고들 합디다.\n…한 자리만 그런 게 아닐 거란 얘기가 돕디다. 운향 백운 노인네도 협곡이 다시 들썩인다고 사람을 보냈고, 소만 여울 영감도 갯바람이 차다고 합디다. 자네, 발 닿는 자리마다 한 번씩 들러봐주쇼."
          }
        />
      );
    }
    // 산악 가이드 도연이 산정 협곡 목재를 부쳐옴(§7.1) — 지미가 전령을 알아본다.
    if (storyFlags.has("jimmy_doyeon_timber_done")) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "어, 자네! 도연이 산정 협곡 목재를 부쳐왔더라고. 안 휘는 게 진짜야. 이런 거 어디서 구하나 했는데, 자네가 도연한테 말 넣어준 거지?\n고맙수. 톱밥 한 잔 받아요. 농담이고, 좋은 손잡이 깎으면 자네한테 먼저 보여줄게."
          }
        />
      );
    }
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "덕분에 동굴 안쪽도 마음 편히 다닐 수 있게 됐어요.\n…근데 그놈, 가끔 다시 깨어난다는 소문이 있더라고. 광물 때문인지 뭔지, 가끔 들러서 다잡아 두면 좋을 것 같수."
        }
      />
    );
  }

  // 산적 의뢰만 완료한 단계 — 깊은 동굴 의뢰가 아직 'available' 이 아닌 경우.
  return (
    <NpcDialogue
      npc={npc}
      onClose={onClose}
      text={
        "또 왔수?\n덕분에 숲이 한결 조용해졌어요. 도끼질 소리만 나도 산적들이 알아서 피하더라니까."
      }
    />
  );
}
