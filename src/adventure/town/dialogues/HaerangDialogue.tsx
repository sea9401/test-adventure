import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";

// 해랑 — 소만 뱃사공. 반말. 산호초 섬으로 가는 유일한 배.
// 원로 여울의 보증(saltmarsh_vouched) 전엔 안 데려감 → 선저 덧대기(게딱지 ×15 deliver,
// saltmarsh-haerang-hull-plating) 완료 시 ferryman_reef_passage flag 를 켠다(= world 의
// saltmarsh→reef_isle 게이트). 이후 사이렌 쫓기 반복 의뢰(saltmarsh-haerang-reef-runs).
export const FERRYMAN_FLAG_REEF_PASSAGE = "ferryman_reef_passage";

const HULL_QUEST = "saltmarsh-haerang-hull-plating";
const HULL_NEED = 15;
const RUNS_QUEST = "saltmarsh-haerang-reef-runs";
const RUNS_NEED = 20;
const CORAL_BEAR_QUEST = "saltmarsh-haerang-coral-bear";

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
  storyFlags: ReturnType<typeof useStoryFlags>;
};

export function HaerangDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  inventory,
  storyFlags,
}: Props) {
  const vouched = storyFlags.has("saltmarsh_vouched");
  const passage = storyFlags.has(FERRYMAN_FLAG_REEF_PASSAGE);
  const stilled = storyFlags.has("the_deep_one_stilled");

  // 1) 여울의 보증 전 — npcs.ts 의 greeting 그대로.
  if (!vouched) {
    return <NpcDialogue npc={npc} onClose={onClose} />;
  }

  // 2) 보증은 받았으나 아직 선저를 덧대지 않음.
  if (!passage) {
    const hull = quests.getEntry(HULL_QUEST);

    if (hull.state === "active" || hull.state === "ready") {
      const have = inventory.materialCount("crab_shell");
      if (have >= HULL_NEED) {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={"게딱지, 됐어. 선저를 덧대 두지. 이만하면 암초 사이를 지나도 배 밑이 안 갉여.\n자, 사례다. 약속대로 난바다로 데려가 주지. 산호초 섬, 가고 싶을 때 말만 해."}
            primaryAction={{
              label: "건네준다",
              onClick: () => {
                const r = quests.tryDeliver(
                  HULL_QUEST,
                  inventory.materialCount,
                  inventory.consumeMaterial,
                );
                if (r.ok) {
                  storyFlags.set(FERRYMAN_FLAG_REEF_PASSAGE);
                  completeQuest(HULL_QUEST);
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
          text={`게딱지는 모았어? 선저 한 겹 덧대는 데 그게 필요해. 아니면 암초가 배 밑을 갉아. 진행: ${have}/${HULL_NEED}`}
        />
      );
    }

    // available — 선저 덧대기 제안.
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"여울이 자네를 보증했다더군. 그렇다면 데려가 주지. 단, 배부터 손봐야 해.\n암초가 선저를 갉아서, 게딱지 갑판으로 한 겹 덧대야 해. 게딱지 15개만 모아다 줘. 그러면 난바다로 나간다."}
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(HULL_QUEST);
            onClose();
          },
        }}
      />
    );
  }

  // 3) 선저를 덧댐 — 산호초 섬으로 데려갈 수 있음.
  //    a) equip_item: 산호 가시 단검을 한 번이라도 차고 와라 (가벼운 일상 도전).
  //    b) 사이렌 쫓기 반복 의뢰.
  const coralBear = quests.getEntry(CORAL_BEAR_QUEST);
  if (coralBear.state === "ready") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"산호 가시쯤은 손에 익었군. 이제 자넨 난바다 사람일세. 자, 약속한 뱃삯."}
        primaryAction={{
          label: "보상을 받는다",
          onClick: () => {
            if (completeQuest(CORAL_BEAR_QUEST)) onClose();
          },
        }}
      />
    );
  }
  if (coralBear.state === "active") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"산호 가시 단검, 차고 다니라고. 한 번이라도 손에 익히면 그걸로 됐어."}
      />
    );
  }
  if (coralBear.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"암초를 자주 건너는 사람은 산호 가시쯤은 손에 익숙해야 해. 산호 가시 단검 한 번이라도 차고 와 줘. 그래야 뱃삯도 깎아 주지."}
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(CORAL_BEAR_QUEST);
            onClose();
          },
        }}
      />
    );
  }

  const runs = quests.getEntry(RUNS_QUEST);
  if (runs.state === "ready") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"사이렌 노랫소리가 한결 멀어졌어. 뱃길이 수월하겠군. 자, 약속한 거다."}
        primaryAction={{
          label: "보상을 받는다",
          onClick: () => {
            if (completeQuest(RUNS_QUEST)) onClose();
          },
        }}
      />
    );
  }
  if (runs.state === "active") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={`사이렌은 암초 둘레를 빙빙 돌아. 노랫소리 들리는 쪽으로 가면 만나. 진행: ${runs.progress}/${RUNS_NEED}`}
      />
    );
  }
  if (runs.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"건너는 김에 부탁 하나. 난바다를 지날 때마다 사이렌 노랫소리가 뱃머리를 돌려세워. 산호초 사이렌 20만 쫓아 주면 뱃길이 한결 수월하겠어."}
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(RUNS_QUEST);
            onClose();
          },
        }}
      />
    );
  }

  // 반복 의뢰 쿨다운/완료 — 일상 대화.
  return (
    <NpcDialogue
      npc={npc}
      onClose={onClose}
      text={
        stilled
          ? "자네가 그걸 가라앉혔다고 들었어. …물이 다시 따뜻해. 그물도 차오르고.\n산호초 섬, 또 건너갈 일 있거든 언제든 말해. 이젠 뱃길이 편해."
          : "산호초 섬으로? 좋아, 노를 잡지. …암초 밑이 영 조용하지가 않아. 단단히 준비해 둬."
      }
    />
  );
}
