import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import { STORY_QUESTS } from "@/adventure/data/storyQuests";
import { ownsEquipment } from "@/adventure/inventory/ownership";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useCharacterState } from "@/adventure/character/useCharacterState";
import type { DialogueRewardId } from "@/adventure/data/dialogueRewards";
import type { NotificationKind } from "@/lib/notifications";

type Props = {
  npc: Npc;
  onClose: () => void;
  storyFlags: ReturnType<typeof useStoryFlags>;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
  characterStateHook: ReturnType<typeof useCharacterState>;
  /** 1회성 보상 서버 mutator — character/inventory/storyFlags 통째 교체 + dialogue close. */
  claimDialogueReward: (
    id: DialogueRewardId,
    opts?: { onSuccess?: () => void },
  ) => Promise<void>;
  addNotification: (kind: NotificationKind, text: string) => void;
};

const ORE_QUEST = "unhyang-manwol-ore-demo";
const ORE_NEED = 6;
const WEAPONS_QUEST = "unhyang-manwol-weapons";
const WEAPONS_NEED = 8;

// ── 부러진 영웅검 복원(storyQuests: hero_sword_restoration) ──
// 만월 재회(manwol_bold_reunion_done) + 천공 성지 보스(volcano_heart_defeated) 이후 해금.
// hero_broken_sword 윗동강을 맡기면 → 운봉석 검신 → 화염 능선 재료 날밑 → 벼리기 → hero_sword(legendary).
// flag 릴레이: hero_sword_started → hero_sword_ore_done → hero_sword_core_done → hero_sword_forging → hero_sword_restored.
const HERO_ORE_NEED = 16;
const HERO_CORE = { lava_core: 6, flame_scale: 8, phoenix_feather: 3 } as const;
const HERO_QUEST_TITLE = STORY_QUESTS.hero_sword_restoration.title;

// 만월 — "운봉석을 벼리는 법"(견갑 확정) → "운봉 네 자루"(무기 4종 제작서 확정) → 볼드 재회(§7.1)
// → 부러진 영웅검 복원(§12). 거인 처치 전엔 도전 종용 → 처치 후 운봉석 deliver 라인 → 제작 안내/심부름.
export function ManwolDialogue({
  npc,
  onClose,
  storyFlags,
  quests,
  completeQuest,
  inventory,
  characterStateHook,
  claimDialogueReward,
  addNotification,
}: Props) {
  const giantDefeated = storyFlags.has("peak_giant_defeated");

  if (!giantDefeated) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "운봉석은 함부로 두드리면 깨져버려.\n…자네가 거인의 뼛조각을 가져올 만큼 강해졌을 때, 다시 와. 그때 진짜 무기를 만들어 주지."
        }
      />
    );
  }

  const ore = quests.getEntry(ORE_QUEST);

  // ── "운봉석을 벼리는 법" — 견갑 제작서 시연 ──
  if (ore.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "거인을 잠재웠다고? …거짓말이라도 그 비늘은 못 가져올 텐데. 좋아, 믿어 주지.\n그럼 한 가지 — 운봉석은 제대로 다룰 줄 아는 손이 드물어. 자네가 운봉석 여섯 덩이만 가져오면, 거인 어깨 비늘로 견갑을 어떻게 짜는지 시연해 줌세. 보고 나면 자네 손에도 새겨질 거야."
        }
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(ORE_QUEST);
            onClose();
          },
        }}
      />
    );
  }
  if (ore.state === "active") {
    const have = inventory.materialCount("unbong_ore");
    if (have >= ORE_NEED) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "운봉석 여섯 덩이… 제대로 골라왔군. 자, 잘 보게 — 비늘 결을 따라 운봉석을 끼워 넣고, 이렇게.\n됐어. 이제 자네 손에도 새겨졌을 거야. 견갑 제작서일세."
          }
          primaryAction={{
            label: "건네준다",
            onClick: () => {
              const r = quests.tryDeliver(
                ORE_QUEST,
                inventory.materialCount,
                inventory.consumeMaterial,
              );
              if (r.ok) {
                completeQuest(ORE_QUEST);
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
        text={`운봉석은 거인을 잠재울 때 떨어진다네. 충분히 모아 오게. — 진행 ${have}/${ORE_NEED}`}
      />
    );
  }

  // ── "운봉 네 자루" — 무기 4종 제작서 확정 루트 (견갑 시연 완료 후) ──
  const weapons = quests.getEntry(WEAPONS_QUEST);
  if (weapons.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "견갑은 봤으니 이제 무기 차례야. 운봉석 여덟 덩이만 더 가져와 봐 — 대검, 방벽, 장창, 발톱. 네 자루 전부 벼리는 법을 자네 손에 새겨 줌세."
        }
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(WEAPONS_QUEST);
            onClose();
          },
        }}
      />
    );
  }
  if (weapons.state === "active") {
    const have = inventory.materialCount("unbong_ore");
    if (have >= WEAPONS_NEED) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "운봉석 여덟 덩이… 좋아. 대검, 방벽, 장창, 발톱 — 네 자루의 결을 차례로 잡아 보겠네. 잘 봐 두게.\n됐어. 네 자루 전부, 자네 손에 새겨졌어. 손에 맞는 걸 골라 벼리게."
          }
          primaryAction={{
            label: "건네준다",
            onClick: () => {
              const r = quests.tryDeliver(
                WEAPONS_QUEST,
                inventory.materialCount,
                inventory.consumeMaterial,
              );
              if (r.ok) {
                completeQuest(WEAPONS_QUEST);
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
        text={`무기 네 자루를 벼리려면 운봉석이 좀 들어가. 여덟 덩이 채워 오게. — 진행 ${have}/${WEAPONS_NEED}`}
      />
    );
  }

  // weapons.state === "completed" — 제작 안내 + 볼드 재회 라인(§7.1).
  const craftHint =
    "운봉 무기 네 자루든 견갑이든 — 제작서는 자네 손에 다 새겨졌어. 거인이 떨군 비늘·운봉석·단단한 수정으로, 대장간 모루 위에 올려놓고 두드려보게.";
  const errandGiven = storyFlags.has("manwol_bold_errand_given");
  const letterDelivered = storyFlags.has("manwol_bold_letter_delivered");
  const reunionDone = storyFlags.has("manwol_bold_reunion_done");

  // ── 볼드 재회까지 끝낸 뒤 — 부러진 영웅검 복원 라인(§12) ──
  if (reunionDone) {
    const reunionLine =
      "볼드, 그 대머리 영감 잘 산다니 다행이군. 녀석 망치질은 여전한가 모르겠어.";

    if (storyFlags.has("hero_sword_restored")) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`영웅검은 손에 익었나? …그 윗동강 하나로 그만한 검이 나올 줄은. 옛 영웅도 만족할 거야.\n${reunionLine}\n…${craftHint}`}
        />
      );
    }

    const volcanoDefeated = storyFlags.has("volcano_heart_defeated");
    const started = storyFlags.has("hero_sword_started");
    const ownsBroken = ownsEquipment(
      inventory.state,
      characterStateHook.equippedSlots,
      "hero_broken_sword",
    );

    // 의뢰 개시 전.
    if (!started) {
      // 천공 성지 보스 미처치 / 윗동강 미보유 — 평소 재회 idle + (보스 처치했으면) 떡밥.
      if (!volcanoDefeated || !ownsBroken) {
        const breadcrumb = volcanoDefeated
          ? "\n\n…참, 폐허 늑대들이 옛 검의 윗동강 하나를 물고 다닌다는 소문이 있어. 진짜라면 — 그건 내가 손볼 수 있는 물건일지도 모르겠군."
          : "";
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={`${reunionLine}\n…${craftHint}${breadcrumb}`}
          />
        );
      }
      // 윗동강 보유 + 천공 성지 보스 처치 → 의뢰 개시.
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "…잠깐, 그 검. 자루 쪽을 이리 줘 보게.\n…윗동강뿐이군. 날밑은 떨어져 나갔고, 검신도 반이 없어. 그런데 이 결 — 옛 영웅검이야. 진짜.\n되살릴 수 있어. 단, 손이 많이 가. 운봉석으로 검신을 새로 잇고, 날밑은 화염 능선 너머의 것으로 둘러야 해. 맡기겠나?"
          }
          primaryAction={{
            label: "윗동강을 맡긴다",
            onClick: () => {
              // 드랍 품질(0~2) 어느 칸에 있든 한 자루 회수. 장착 중이면 회수 실패 → 안내.
              const taken =
                inventory.consumeDroppedEquipment("hero_broken_sword", 2, 1) ||
                inventory.consumeDroppedEquipment("hero_broken_sword", 1, 1) ||
                inventory.consumeDroppedEquipment("hero_broken_sword", 0, 1);
              if (!taken) {
                addNotification(
                  "milestone",
                  "부러진 영웅검을 장착 해제한 뒤 다시 만월에게 가져가자.",
                );
                onClose();
                return;
              }
              storyFlags.set("hero_sword_started");
              addNotification(
                "quest_complete",
                `${HERO_QUEST_TITLE} — 만월이 윗동강을 맡았다. 운봉석 ${HERO_ORE_NEED}덩이를 모아 오자.`,
              );
              onClose();
            },
          }}
        />
      );
    }

    // 의뢰 진행 중 — 단계별 분기.
    const oreDone = storyFlags.has("hero_sword_ore_done");
    const coreDone = storyFlags.has("hero_sword_core_done");
    const forging = storyFlags.has("hero_sword_forging");

    // 2단계 — 운봉석 검신.
    if (!oreDone) {
      const have = inventory.materialCount("unbong_ore");
      if (have >= HERO_ORE_NEED) {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={`운봉석 열여섯 덩이… 검신 하나에 이만큼이 들어가. 결을 잡아 두지.\n다음은 날밑이야. 화염 능선 너머 — 용암 핵 ${HERO_CORE.lava_core}, 화염 비늘 ${HERO_CORE.flame_scale}, 봉황 깃털 ${HERO_CORE.phoenix_feather}. 그래야 옛 영웅검에 어울리는 날밑이 나와.`}
            primaryAction={{
              label: "운봉석을 건넨다",
              onClick: () => {
                if (!inventory.consumeMaterial("unbong_ore", HERO_ORE_NEED)) {
                  onClose();
                  return;
                }
                storyFlags.set("hero_sword_ore_done");
                onClose();
              },
            }}
          />
        );
      }
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`검신을 새로 이으려면 운봉석이 많이 들어. 거인이 떨군 걸 모아 오게. — 진행 ${have}/${HERO_ORE_NEED}`}
        />
      );
    }

    // 3단계 — 화염 능선 재료 날밑.
    if (!coreDone) {
      const lc = inventory.materialCount("lava_core");
      const fs = inventory.materialCount("flame_scale");
      const pf = inventory.materialCount("phoenix_feather");
      const enough =
        lc >= HERO_CORE.lava_core &&
        fs >= HERO_CORE.flame_scale &&
        pf >= HERO_CORE.phoenix_feather;
      if (enough) {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={
              "용암 핵에 화염 비늘, 봉황 깃털까지 — 다 됐군. 날밑은 이걸로 둘러 주지.\n검신·날밑·윗동강, 셋이 다 모였어. 모루에 올려놓고 벼리는 데 시간이 좀 걸려. 잠시 뒤에 다시 오게."
            }
            primaryAction={{
              label: "재료를 건넨다",
              onClick: () => {
                if (
                  inventory.materialCount("lava_core") < HERO_CORE.lava_core ||
                  inventory.materialCount("flame_scale") <
                    HERO_CORE.flame_scale ||
                  inventory.materialCount("phoenix_feather") <
                    HERO_CORE.phoenix_feather
                ) {
                  onClose();
                  return;
                }
                inventory.consumeMaterial("lava_core", HERO_CORE.lava_core);
                inventory.consumeMaterial("flame_scale", HERO_CORE.flame_scale);
                inventory.consumeMaterial(
                  "phoenix_feather",
                  HERO_CORE.phoenix_feather,
                );
                storyFlags.set("hero_sword_core_done");
                onClose();
              },
            }}
          />
        );
      }
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`날밑 재료가 아직이야. 용암 핵 ${lc}/${HERO_CORE.lava_core}, 화염 비늘 ${fs}/${HERO_CORE.flame_scale}, 봉황 깃털 ${pf}/${HERO_CORE.phoenix_feather} — 화염 능선 너머에서 구할 수 있어.`}
        />
      );
    }

    // 4단계 — 벼리는 중.
    if (!forging) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "아직 모루 위야. 운봉석 검신을 윗동강에 잇고, 날밑을 두르는 중 — 서두르면 또 부러져. 조금만 더 기다리게."
          }
          primaryAction={{
            label: "기다린다",
            onClick: () => {
              storyFlags.set("hero_sword_forging");
              onClose();
            },
          }}
        />
      );
    }

    // 5단계 — 완성품 수령.
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "…됐어. 받게.\n윗동강에 운봉석 검신을 잇고, 화염 능선의 것으로 날밑을 둘렀어. 묵직하지? 옛 영웅이 들었을 때 그대로야. 그 무게, 휘두르면 곧 위력이 돼.\n— 영웅검일세. 자네 손에 있어야 할 물건이야."
        }
        primaryAction={{
          label: "영웅검을 받는다",
          onClick: () => {
            void claimDialogueReward("manwol_hero_sword", {
              onSuccess: () => {
                addNotification(
                  "quest_complete",
                  `${HERO_QUEST_TITLE} 완료 — 영웅검 획득! (+골드 400 / +명성 8)`,
                );
                onClose();
              },
            });
          },
        }}
      />
    );
  }
  if (letterDelivered) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "녀석한테 다녀왔나? …볼드, 그 까칠한 대머리 영감 아직 살아 있다니 다행이야. 망치질 하나는 쓸 만했지.\n자, 자네 약통 좀 손봐줬어 — 회복약 몇 병이랑, 한 칸 더. 고맙네."
        }
        primaryAction={{
          label: "받는다",
          onClick: () => {
            inventory.addPotionCapacity(1);
            inventory.add("potion_heal_s", 5);
            storyFlags.set("manwol_bold_reunion_done");
            onClose();
          },
        }}
      />
    );
  }
  if (errandGiven) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={`볼드한테 그 손잡이 전해줬나? 시작 마을, 대머리 영감일세 — 못 알아볼 리 없어.\n…아 참, ${craftHint}`}
      />
    );
  }
  return (
    <NpcDialogue
      npc={npc}
      onClose={onClose}
      text={`${craftHint}\n…그리고 한 가지 더. 시작 마을에 볼드라는 대머리 영감 아직 살아 있나? 망치질 하나는 쓸 만했지 — 이 손잡이 좀 전해 주게. '만월이 보낸다'고 하면 알 거야.`}
      primaryAction={{
        label: "손잡이를 받는다",
        onClick: () => {
          storyFlags.set("manwol_bold_errand_given");
          onClose();
        },
      }}
    />
  );
}
