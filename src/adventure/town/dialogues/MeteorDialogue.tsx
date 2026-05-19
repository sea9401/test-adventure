import { useEffect } from "react";
import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useInventory } from "@/adventure/inventory/useInventory";

// 5막 「빈 옥좌의 시대」 PR-C — 노수호자 유성(시작 마을 인스턴스) 의 그릇 빚기 라인.
// Ch 26(starfall_warden_felled) 이후 등장 인사, Ch 27(세 잔영 모두 처치) 완료 후
// 별빛 조각 30 deliver 의뢰 노출, 의뢰 완료 시 별빛 깃든 기예 6권 일괄 보상 + Ch 28 완료.
//
// star_haven_elder 와 동일 인물 — 4막 진행 중인 캐릭은 별바다 유성을 보지 못한 채
// 시작 마을에 처음 들어왔을 때 endgame_apex_defeated 미보유 → 짧은 인사로 가드.

const VESSEL_QUEST = "village-meteor-vessel";
const VESSEL_SHARDS = 30;

// 5막 종착 의식 후 풀리는 별빛 재단 무구 5종 제작서 — 유성이 떠나기 전 시작 마을 대장간에
// "별빛 재단법" 을 남기고 간다. starfall_keeper 칭호 보유자에게 자동 학습 (idempotent).
const STARLIT_FORGE_RECIPES: readonly string[] = [
  "starlit_blade",
  "starlit_aegis",
  "starlit_lance",
  "starlit_grip",
  "starlit_mantle",
];

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  storyFlags: ReturnType<typeof useStoryFlags>;
  inventory: ReturnType<typeof useInventory>;
  /** 5막 종착 의식에서 starfall_keeper 칭호 부여 — useTitleGrant 의 grantTitle. */
  grantTitle: (titleId: string) => void;
  /** Ch 30 후 별빛 재단법 5종 자동 학습 — useCrafting.learnRecipe. */
  learnRecipe: (id: string) => void;
};

export function MeteorDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  storyFlags,
  inventory,
  grantTitle,
  learnRecipe,
}: Props) {
  // 마이그레이션 — 이미 endgame_complete 인 캐릭은 본 PR 시점에 별빛 재단법이 학습돼 있지
  // 않다. 유성을 한 번 더 만나면 그 자리에서 보강 (learnRecipe 자체가 idempotent).
  useEffect(() => {
    if (storyFlags.has("endgame_complete")) {
      for (const id of STARLIT_FORGE_RECIPES) learnRecipe(id);
    }
  }, [storyFlags, learnRecipe]);

  // 4막 미완 — 옥좌의 주재 협동전 클리어 전. 옥좌의 자리를 본 적이 없으니 모르는 사람.
  if (!storyFlags.has("endgame_apex_defeated")) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "…먼 길이었네. 자네는 아직 옥좌의 자리를 보지 못했지.\n천천히 가시게. 자리는 가지 않는다네."
        }
      />
    );
  }

  // Ch 27 미완 — 세 잔영(거인·수심의 메아리·성문지기) 중 하나라도 미처치.
  const ch27Done =
    storyFlags.has("starlit_giant_quelled") &&
    storyFlags.has("starlit_deep_quelled") &&
    storyFlags.has("starlit_gate_quelled");

  if (!ch27Done) {
    const quelled =
      (storyFlags.has("starlit_giant_quelled") ? 1 : 0) +
      (storyFlags.has("starlit_deep_quelled") ? 1 : 0) +
      (storyFlags.has("starlit_gate_quelled") ? 1 : 0);
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "별바다에서 여기까지 걸어왔네. …옛 봉인 자리 세 곳에 별이 더 떨어졌다 들었으니.\n자네가 셋을 모두 잠재울 때까지 — 우물가에 앉아 기다리지. 산정 협곡, 안개 너머 산호초, 옛 변경 성채. 셋 다 자네 손이 닿아야 하네."
        }
        objective={{
          body: "별빛 협곡의 거인 잔영, 안개 산호초의 수심의 메아리, 옛 변경 성채의 성문지기 잔영. 세 잔영을 모두 잠재워야 합니다.\n운향 백운, 소만 여울, 마른나루 무진과 먼저 이야기해 보세요.",
          progress: `잠재운 잔영 ${quelled}/3`,
        }}
      />
    );
  }

  // Ch 27 완료 후 — 그릇 빚기 의뢰 (별빛 조각 30 deliver).
  const vessel = quests.getEntry(VESSEL_QUEST);
  if (vessel.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "잘 왔네. 셋을 모두 잠재웠다더군 — 자네 손에 별빛이 들렸을 게야.\n…한 자리에 모일 빛을 두려면, 그릇이 필요하네. 누구의 것도 아닌 빛을, 누구의 것도 아닌 자리에 두기 위한 그릇. 별빛 조각 서른 점이면 충분해. 자네가 거두어 가져와 주게. 내가 그것으로 마지막 그릇을 빚어 두지."
        }
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(VESSEL_QUEST);
            onClose();
          },
        }}
      />
    );
  }

  if (vessel.state === "active") {
    const have = inventory.materialCount("starfall_shard");
    if (have >= VESSEL_SHARDS) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "…서른 점. 그래, 충분하네.\n자, 받게 — 그릇을 빚는 자리에 자네가 쓸 결 여섯 권을 같이 묶어 두었네. 별빛에 닿은 자만이 풀 수 있는 결이지. 익히든 두든, 자네의 것이야."
          }
          primaryAction={{
            label: "건네준다",
            onClick: () => {
              const r = quests.tryDeliver(
                VESSEL_QUEST,
                inventory.materialCount,
                inventory.consumeMaterial,
              );
              if (r.ok) {
                completeQuest(VESSEL_QUEST);
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
        text={`별빛 조각이 얼마나 모였나? 서른 점이 되거든 다시 오시게.`}
        objective={{
          body: "별빛 광맥, 별빛 협곡, 별빛 산호초, 별빛 옛 성채의 별빛 잡몹과 잔영에서 별빛 조각이 나옵니다.",
          progress: `모은 수 ${have}/${VESSEL_SHARDS}`,
        }}
      />
    );
  }

  // Ch 30 종착 — apex_phantom_seen(고탑 50층 환영) 본 후 의식 컷씬 1회.
  // 누르면 endgame_complete flag set + starfall_keeper 칭호 grant + 별빛 재단법 5종 학습.
  // 모두 idempotent (learnRecipe known no-op).
  if (
    storyFlags.has("apex_phantom_seen") &&
    !storyFlags.has("endgame_complete")
  ) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "…자네 등 뒤로 옥좌의 환영이 따라왔구먼. 고탑 위에서 자네가 본 그 자리.\n그릇은 빚어 두었네. 자, 내 앞에 내밀어 보게. 그 환영을 그릇 안에 한 점 한 점 놓아주면 되네. 누구의 것도 아닌 빛은, 누구의 것도 아닌 자리에. 자네에게도, 누구에게도 묶이지 않게.\n…그리고 내가 떠나기 전에 한 가지 더. 시작 마을 대장간에 별빛 재단법을 남기고 가겠네. 자네가 거둔 잔영 셋의 결을 창공 무구 위에 다시 둘러 단조할 수 있도록. 누구의 것도 아닌 빛으로 빚어낸 무구, 자네가 두든 누가 두든 자기 결을 스스로 잡는 자루가 될 게야."
        }
        primaryAction={{
          label: "그릇을 내민다",
          onClick: () => {
            storyFlags.set("endgame_complete");
            grantTitle("starfall_keeper");
            for (const id of STARLIT_FORGE_RECIPES) learnRecipe(id);
            onClose();
          },
        }}
      />
    );
  }

  // endgame_complete 후 — 유성 작별 회상 라인. (NPC 등장 자체는 그대로 두되 후일담 톤.)
  if (storyFlags.has("endgame_complete")) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "잔은 비었고, 옥좌의 자리도 비었어. 자네 등 뒤가 가벼워졌지.\n…나는 내일이면 별바다로 돌아가네. 한 자리에 모이지 않을 빛을 자네가 거두어 주었으니 — 그 자리에 술 한 잔을 두고 떠나야지. 자네는 자네의 길을 가시게. 봉인은 더 이상 봉인이 아니야."
        }
      />
    );
  }

  // 의뢰 완료 후 ~ Ch 29 미진입 — 옥좌 환영 떡밥. 고탑 50층까지는 자네 몫이라는 안내.
  return (
    <NpcDialogue
      npc={npc}
      onClose={onClose}
      text={
        "그릇은 빚어 두었네. 자네에게 묶지 않을 결로, 누구의 것도 아닌 자리에. 별빛이 한 점 한 점 그릇 가장자리에 가라앉는 것을 자네도 보겠지.\n옛 옥좌의 환영이 아직 자네 등을 따라온다는 얘기를 들었네. 그것을 마지막으로 떼어 내는 자리는 고탑 위일 게야. 자기가 만든 자리로 자기가 가 닿는 그 길."
      }
      objective={{
        body: "고탑 50층까지 올라가 옛 옥좌의 환영을 만나야 합니다.\n환영을 본 뒤 다시 유성에게 돌아오면 됩니다.",
      }}
    />
  );
}
