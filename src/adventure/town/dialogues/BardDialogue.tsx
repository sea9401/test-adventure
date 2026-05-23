import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { EquippedSlots } from "@/adventure/character/types";
import { ownedUniqueItemCount } from "@/adventure/inventory/ownership";

const FOCUSED_BREATH = "windvale-bard-focused-breath";
const FOCUSED_BREATH_NEED = 3;

type Props = {
  npc: Npc;
  onClose: () => void;
  storyFlags: ReturnType<typeof useStoryFlags>;
  inventory: ReturnType<typeof useInventory>;
  equippedSlots: EquippedSlots;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
};

// 떠돌이 음유시인 — §11 hidden-lucky-collector + 호흡 라인(book_focused_breath).
// 유실된 명품(unique) 2종 보유 → bard_lucky_collected flag → lucky_finder 칭호(useTitleGrants).
// bard_lucky_collected 이후 풀리는 히든 라인 — 봉황 깃털 ×3 → 집중의 호흡 스킬북.
export function BardDialogue({
  npc,
  onClose,
  storyFlags,
  inventory,
  equippedSlots,
  quests,
  completeQuest,
}: Props) {
  const collected = storyFlags.has("bard_lucky_collected");

  if (collected) {
    // 히든 — 한 호흡의 결. 봉황 깃털 ×3 deliver.
    const breath = quests.getEntry(FOCUSED_BREATH);
    if (breath.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "행운이 붙은 손이라면, 한 가지 더 일러둘게.\n노래는 한 호흡으로 끝나야 결이 잡혀. 봉황 깃털 셋만 가져다 주면, 진짜 불을 머금은 깃이라야. 그 호흡의 결을 자네 검에 옮겨 줄게."
          }
          primaryAction={{
            label: "받아들인다",
            onClick: () => {
              quests.accept(FOCUSED_BREATH);
              onClose();
            },
          }}
        />
      );
    }
    if (breath.state === "active") {
      const have = inventory.materialCount("phoenix_feather");
      if (have >= FOCUSED_BREATH_NEED) {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={
              "셋. 결이 살아 있군. 호흡 한 자락 옮길 만한 깃이야.\n자, 집중의 호흡. 받게. 다음 휘두름엔 잊지 말고."
            }
            primaryAction={{
              label: "건네준다",
              onClick: () => {
                const r = quests.tryDeliver(
                  FOCUSED_BREATH,
                  inventory.materialCount,
                  inventory.consumeMaterial,
                );
                if (r.ok) {
                  completeQuest(FOCUSED_BREATH);
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
          text={`봉황 깃털은 봉황령 능선. 불꽃 독수리한테서 나오지. 진행 ${have}/${FOCUSED_BREATH_NEED}`}
        />
      );
    }

    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "행운은 이미 자네 손에 붙었어. 노래대로.\n…그러니 다음 번 굉장한 발견이 있거든, 그건 운이 아니라 자네 솜씨인 거다. 잊지 마."
        }
      />
    );
  }

  const uniques = ownedUniqueItemCount(inventory.state, equippedSlots);

  if (uniques >= 2) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "오호. 두 점이군. 유실품을 둘이나 그러모은 손이야.\n옛 노래대로다. 행운이 자네 손에 붙어. 어디서 떨어진 건지도 모를 명품이 두 번이나 자네한테 왔다면, 세 번째도 올 거야. 그게 노래의 끝이지."
        }
        primaryAction={{
          label: "노래를 듣는다",
          onClick: () => {
            storyFlags.set("bard_lucky_collected");
            onClose();
          },
        }}
      />
    );
  }

  if (uniques >= 1) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "한 점은 있군. 유실된 명품. 어디서 떨어진 건지도 모를 물건이지.\n노래는 두 점부터 시작돼. 하나 더 그러모으거든 다시 와. 그때 끝까지 불러줄게."
        }
      />
    );
  }

  return <NpcDialogue npc={npc} onClose={onClose} />;
}
