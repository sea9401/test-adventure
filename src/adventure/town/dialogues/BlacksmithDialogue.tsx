import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import { STORY_QUESTS } from "@/adventure/data/storyQuests";
import type { useCrafting } from "@/adventure/crafting/useCrafting";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useCharacterState } from "@/adventure/character/useCharacterState";
import type { NotificationKind } from "@/lib/notifications";
import { SKILL_BOOKS } from "@/adventure/data/skillBooks";

const MANA_QUEST = "village-bold-mana-crystal";
const MANA_NEED = 5;

// 그림자 베기 스킬북 — 볼드가 챙겨둔 1권. 이미 학습/소지 중이면 자동으로 숨어 중복 판매 X.
const SHADOW_CUT_BOOK_ID = "book_shadow_cut" as const;

type Props = {
  npc: Npc;
  onClose: () => void;
  crafting: ReturnType<typeof useCrafting>;
  inventory: ReturnType<typeof useInventory>;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  storyFlags: ReturnType<typeof useStoryFlags>;
  addNotification: (kind: NotificationKind, text: string) => void;
  characterStateHook: ReturnType<typeof useCharacterState>;
};

export function BlacksmithDialogue({
  npc,
  onClose,
  crafting,
  inventory,
  quests,
  completeQuest,
  storyFlags,
  addNotification,
  characterStateHook,
}: Props) {
  const knowsBat = crafting.knows("baseball_bat");
  const craftedBat = crafting.hasCrafted("baseball_bat");
  const armorReceived = crafting.state.boldQuestComplete;
  const slimeQuestDone = crafting.state.boldSlimeQuestComplete;
  const hasSlimeCore = inventory.materialCount("slime_core") > 0;

  // Stage A — 처음. 제작서 주기.
  if (!knowsBat) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "처음 보는데… 모험가인가?\n그 나무 막대 들고 마을 밖으로 나가는 건 위험하네.\n자, 받아. 야구 방망이 제작서다. 대장간에 가서 직접 만들어 봐."
        }
        primaryAction={{
          label: "제작서를 받는다",
          onClick: () => {
            crafting.learnRecipe("baseball_bat");
            onClose();
          },
        }}
      />
    );
  }

  // Stage B — 제작서를 받았지만 아직 안 만듦.
  if (!craftedBat) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "방망이는 잘 만들고 있나?\n대장간 앞에서 망설이지 말게. 제작서대로 두드리면 되네."
        }
      />
    );
  }

  // Stage C — 만들어 옴. 가죽갑옷 주기.
  if (!armorReceived) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "오, 제대로 만들었군!\n…그런 천 옷으로 어딜 다녀. 이거도 챙겨가라. 낡은 가죽갑옷이지만, 그쪽 천 쪼가리보단 백 배 낫지."
        }
        primaryAction={{
          label: "낡은 가죽갑옷을 받는다",
          onClick: () => {
            inventory.addEquipment("old_leather_armor");
            crafting.setBoldQuestComplete();
            addNotification(
              "quest_complete",
              `${STORY_QUESTS.bold_blacksmith_intro.title} 완료`,
            );
            onClose();
          },
        }}
      />
    );
  }

  // Stage D — 슬라임 핵을 들고 오면 1회성. 제작법을 받음(핵은 소모 X).
  if (armorReceived && !slimeQuestDone && hasSlimeCore) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "어, 이건… 슬라임 핵 아닌가?\n이걸로 꽤 괜찮은 방어구를 만들 수 있다네. 내가 장비 제조법을 주지. 슬라임 조각도 함께 챙겨서 대장간으로 오게."
        }
        primaryAction={{
          label: "제조법을 받는다",
          onClick: () => {
            crafting.learnRecipe("squishy_armor");
            crafting.setBoldSlimeQuestComplete();
            addNotification(
              "quest_complete",
              `${STORY_QUESTS.bold_slime_core.title} 완료`,
            );
            onClose();
          },
        }}
      />
    );
  }

  // 만월의 손잡이 — 운향 만월이 맡긴 심부름(§7.1). 한 번만, 회복약 한 보따리로 답례.
  if (
    storyFlags.has("manwol_bold_errand_given") &&
    !storyFlags.has("manwol_bold_letter_delivered")
  ) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "만월이? …그 까칠한 노인네가 아직 살아 있구먼. 이 손잡이, 만월이 솜씨가 맞아. 결을 보면 알지.\n답례다. 약통에 좋은 거 좀 채워뒀어. 만월이한테 전해 줘. 망치질 아직 죽지 않았다고."
        }
        primaryAction={{
          label: "답례를 받는다",
          onClick: () => {
            inventory.add("potion_heal_s", 5);
            storyFlags.set("manwol_bold_letter_delivered");
            addNotification(
              "quest_complete",
              `${STORY_QUESTS.manwol_bold_reunion.title}. 볼드에게 전함`,
            );
            onClose();
          },
        }}
      />
    );
  }

  // 마정석 시연(§10.1) — 깊은 동굴을 아는(jimmy_deep_cave_quest) 모험가에게 노출.
  if (storyFlags.has("jimmy_deep_cave_quest")) {
    const mana = quests.getEntry(MANA_QUEST);
    if (mana.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "동굴 안쪽 큰 광맥, 거기 있던 놈한테서 마정석이 나온다지? 그거 제대로 다루려면 손이 익어야 해.\n다섯 덩이만 가져와 봐. 그걸로 시연을 보여주지. 보고 나면 자네도 마정석 무기를 벼릴 수 있을 거야."
          }
          primaryAction={{
            label: "받아들인다",
            onClick: () => {
              quests.accept(MANA_QUEST);
              onClose();
            },
          }}
        />
      );
    }
    if (mana.state === "active") {
      const have = inventory.materialCount("mana_crystal");
      if (have >= MANA_NEED) {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={
              "마정석 다섯… 제대로 골라왔군. 잘 봐. 결을 따라 이렇게 두드리면, 깨지지 않고 빛이 안에 머물지.\n됐어. 자네 손에도 새겨졌을 거다. 마정석 팔찌 제작서다."
            }
            primaryAction={{
              label: "건네준다",
              onClick: () => {
                const r = quests.tryDeliver(
                  MANA_QUEST,
                  inventory.materialCount,
                  inventory.consumeMaterial,
                );
                if (r.ok) {
                  completeQuest(MANA_QUEST);
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
          text={`마정석은 동굴 안쪽 그 광맥 골렘이 떨군다네. 다섯 덩이 채워 오게. 진행 ${have}/${MANA_NEED}`}
        />
      );
    }
  }

  // 마정석 라인 마무리 — 자네 손으로 마정석 검 한 자루 짜 봐 (craft_item).
  // mana-crystal 완료 후 노출. 짜고 와서 신고하면 완료.
  if (quests.getEntry(MANA_QUEST).state === "completed") {
    const swordQuest = quests.getEntry("village-bold-mana-sword-craft");
    if (swordQuest.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "팔찌까지 짜 봤으니, 이젠 칼이야. 마정석 검을 자네 손으로 한 자루 짜 봐. 그래야 그 마정석이 손에 어떻게 익는지 알지."
          }
          primaryAction={{
            label: "맡겠다",
            onClick: () => {
              quests.accept("village-bold-mana-sword-craft");
              onClose();
            },
          }}
        />
      );
    }
    if (swordQuest.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"마정석 검, 자네 공방에서 짜 봐. 결을 보고 두드리면 빛이 안에 머문다."}
        />
      );
    }
    if (swordQuest.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"오, 한 자루. 결이 곧군. 자네 손에 마정석이 익었어. 자, 약속한 사례다."}
          primaryAction={{
            label: "보고를 마친다",
            onClick: () => {
              if (completeQuest("village-bold-mana-sword-craft")) onClose();
            },
          }}
        />
      );
    }
  }

  // 히든 deliver 의뢰 공용 노드 — 조건이 안 맞거나 이미 완료면 null.
  const deliverNode = (opts: {
    id: string;
    materialId: Parameters<typeof inventory.materialCount>[0];
    need: number;
    gateOk: boolean;
    offer: string;
    done: string;
    active: (have: number, need: number) => string;
  }) => {
    if (!opts.gateOk) return null;
    const e = quests.getEntry(opts.id);
    if (e.state === "completed") return null;
    if (e.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={opts.offer}
          primaryAction={{
            label: "받아들인다",
            onClick: () => {
              quests.accept(opts.id);
              onClose();
            },
          }}
        />
      );
    }
    // active
    const have = inventory.materialCount(opts.materialId);
    if (have >= opts.need) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={opts.done}
          primaryAction={{
            label: "건네준다",
            onClick: () => {
              const r = quests.tryDeliver(
                opts.id,
                inventory.materialCount,
                inventory.consumeMaterial,
              );
              if (r.ok) {
                completeQuest(opts.id);
                onClose();
              }
            },
          }}
        />
      );
    }
    return (
      <NpcDialogue npc={npc} onClose={onClose} text={opts.active(have, opts.need)} />
    );
  };

  // 히든 — 광맥의 끝(deep-cave-hunter 완료 후). 마정석 ×20.
  const veinNode = deliverNode({
    id: "hidden-deepest-vein",
    materialId: "mana_crystal",
    need: 20,
    gateOk: quests.getEntry("deep-cave-hunter").state === "completed",
    offer:
      "광맥의 수호자를 그렇게 여러 번 잠재웠으면, 동굴 안쪽 더 깊은 데 마정석이 진하게 고였을 거다. 스무 덩이만 가져와 봐. 광맥의 끝이 어디까지 뻗었는지 가늠해 보자.",
    done:
      "스무 덩이라… 이건 평범한 광맥에서 나올 양이 아니야. 동굴 안쪽에. 우리가 못 본 게 더 있어. 언젠가 누가 그 끝까지 가겠지. 자, 사례다.",
    active: (h, n) => `마정석은 광맥 골렘이 떨군다네. 동굴 안쪽으로 더 들어가 봐. 진행 ${h}/${n}`,
  });
  if (veinNode) return veinNode;

  // 히든 — 마저 두드린 것(만월↔볼드 재회 완료 후). 단단한 결정 ×8.
  const duelNode = deliverNode({
    id: "hidden-blacksmith-duel",
    materialId: "hard_crystal",
    need: 8,
    gateOk: storyFlags.has("manwol_bold_reunion_done"),
    offer:
      "옛날에 만월이랑 무기 하나를 절반씩 만들다 싸우고 헤어졌지. 둘 다 다시 만났으니… 마저 완성해 볼까 싶어. 단단한 결정 여덟 덩이만 가져와 봐.",
    done:
      "여덟 덩이… 됐어. 만월이 절반, 내 절반. 이제야 한 자루가 됐군. 도면은 만월이가 갖고 있으니 거기서 마저 베껴 가. 둘 다 살아 있길 잘했어. 자, 사례다.",
    active: (h, n) => `단단한 결정은 협곡·동굴 깊은 데서 나오지. 진행 ${h}/${n}`,
  });
  if (duelNode) return duelNode;

  // Stage E — 끝. 일상 대화 + 그림자 베기 스킬북 판매.
  // 학습·소지 중이면 판매 옵션 자체를 숨겨 중복 구매 방지.
  const shadowCutBook = SKILL_BOOKS[SHADOW_CUT_BOOK_ID];
  const shadowCutPrice = shadowCutBook.price ?? 0;
  const shadowCutKnown = (
    characterStateHook.state.learnedAPSkills ?? []
  ).includes("그림자 베기");
  const shadowCutOwned =
    inventory.skillBookCount(SHADOW_CUT_BOOK_ID) > 0;
  const offerShadowCut = !shadowCutKnown && !shadowCutOwned;
  return (
    <NpcDialogue
      npc={npc}
      onClose={onClose}
      text={
        offerShadowCut
          ? `왔구나.\n잘 지내고 있나? 무기 손볼 일 있으면 또 들르게.\n\n…그리고, "${shadowCutBook.name}" 가 하나 있는데. ${shadowCutPrice}G 면 자네 거다.`
          : "왔구나.\n잘 지내고 있나? 무기 손볼 일 있으면 또 들르게."
      }
      primaryAction={
        offerShadowCut
          ? {
              label: `${shadowCutBook.name} 구매 (${shadowCutPrice}G)`,
              onClick: () => {
                if (characterStateHook.state.gold < shadowCutPrice) {
                  addNotification("info", "골드가 부족합니다.");
                  return;
                }
                characterStateHook.addGold(-shadowCutPrice);
                inventory.addSkillBook(SHADOW_CUT_BOOK_ID, 1);
                addNotification(
                  "item",
                  `${shadowCutBook.name} 을(를) 구매했습니다. 가방에서 사용하세요.`,
                );
                onClose();
              },
            }
          : undefined
      }
    />
  );
}
