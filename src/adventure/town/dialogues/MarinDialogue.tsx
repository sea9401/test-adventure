import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useAdventureLog } from "@/adventure/log/useAdventureLog";
import { STRANGER_FLAG_RUINS_GUIDE } from "./StrangerDialogue";

// 마린의 의뢰는 폐허(ruins) 가 열린 뒤에야 진행 가능 — 영혼 결정은 망령 드롭.
// 의뢰 완료 시 '디올라의 친구' 칭호가 page.tsx 의 completeQuest 에서 부여된다.
const QUEST_ID = "diola-marin-soul-crystals";
const NEED = 3;

// 산정 교역로 개통(§7.2) — 운향 백운 라인이 mountain_trade_open flag 를 켜면 노출.
const MT_QUEST = "diola-marin-mountain-trade";
const MT_NEED = 30;

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
  storyFlags: ReturnType<typeof useStoryFlags>;
  adventureLog: ReturnType<typeof useAdventureLog>;
};

export function MarinDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  inventory,
  storyFlags,
  adventureLog,
}: Props) {
  const ruinsGuided = storyFlags.has(STRANGER_FLAG_RUINS_GUIDE);
  const entry = quests.getEntry(QUEST_ID);

  // 산정 교역로 — 운향 백운이 mountain_trade_open 을 켜면, 영혼 결정 라인과 별개로 진행.
  if (storyFlags.has("mountain_trade_open")) {
    const mtq = quests.getEntry(MT_QUEST);
    if (mtq.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"산정 길이 다시 안전해졌다고. 백운이 전하더라고? …그렇다면 거래를 트지.\n우리 쪽 길목도 정리가 필요하오. 폐허 어귀 늑대 서른 마리만 솎아 주시오. 그러면 디올라와 운향 사이로 짐수레가 다시 오갈 게요."}
          primaryAction={{
            label: "받아들인다",
            onClick: () => {
              quests.accept(MT_QUEST);
              onClose();
            },
          }}
        />
      );
    }
    if (mtq.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`폐허 어귀 늑대들은 좀 정리됐소? 그 길목이 트여야 짐수레가 산을 오르오. 진행 ${mtq.progress}/${MT_NEED}`}
        />
      );
    }
    if (mtq.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"길목이 트였구려. 이제 디올라와 운향 사이로 짐수레가 오갈 게요. 백운에게도 그리 전해 주시오.\n자, 약속한 사례요."}
          primaryAction={{
            label: "보상을 받는다",
            onClick: () => {
              if (completeQuest(MT_QUEST)) onClose();
            },
          }}
        />
      );
    }
    // mtq.state === "completed" — 아래 영혼 결정 라인 / 일상 대화로 흐른다.
  }

  if (entry.state === "completed") {
    // 영혼 결정 라인 마무리 후 — 첫 모험가의 의장 (equip_set). 다른 분기보다 우선.
    const firstGear = quests.getEntry("diola-marin-first-gear-set");
    // 부적을 판 캐릭("불효자" 칭호 보유)은 부적이 영영 안 돌아오므로(재제작·드랍 없음)
    // 의뢰를 제안/진행하지 않고 거절 멘트로 흘려보낸다. available 단계는 NPC 뱃지도
    // npcHasAcceptableQuest 의 isPermanentlyBlocked 에서 차단. 이미 받고 나서 판
    // active 케이스도 같은 거절 멘트로 안내(active 는 어차피 뱃지에 안 잡힘).
    if (
      (firstGear.state === "available" || firstGear.state === "active") &&
      adventureLog.log.titles.unfilial
    ) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"…자네 어머니의 부적, 두 푼 돈에 넘긴 손이라 들었네.\n그 손으로는 우리 마을 사람들 앞에 처음의 모습을 보일 수 없어. 첫 모험가의 의장 얘기는, 다른 사람을 찾으시오."}
        />
      );
    }
    if (firstGear.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"자네가 처음 손에 든 것. 나뭇가지·천 옷·어머니의 부적. 한 번이라도 다시 한 복으로 차고 와 보게. 우리 마을 사람들도 한 번 봐야 해. 자네가 어디서 시작했는지를."}
          primaryAction={{
            label: "그러겠다고 한다",
            onClick: () => {
              quests.accept("diola-marin-first-gear-set");
              onClose();
            },
          }}
        />
      );
    }
    if (firstGear.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"세 가지. 다 한 복으로. 인벤토리에 두지 말고 몸에. 잠깐이라도 좋아."}
        />
      );
    }
    if (firstGear.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"…그 모습, 우리 마을 사람들도 한 번씩은 봤어. 자네가 어디서 시작했는지를. 자, 약속한 사례요."}
          primaryAction={{
            label: "보상을 받는다",
            onClick: () => {
              if (completeQuest("diola-marin-first-gear-set")) onClose();
            },
          }}
        />
      );
    }

    const tradeOpen = storyFlags.has("diola_unhyang_trade_done");
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          tradeOpen
            ? "…자네는 이제 디올라의 식구나 다름없네. 산정과의 길도 다시 이어졌고.\n안개 너머의 일이 아직 다 끝난 건 아니지만, 두 마을 모두 자네를 기억할 거요."
            : "…자네는 이제 디올라의 식구나 다름없네.\n안개 너머의 일이 아직 다 끝난 건 아니지만, 우리 마을은 자네를 기억할 거요."
        }
      />
    );
  }

  // 폐허 안내 받기 전 — 마린은 마을의 흐름을 따른다.
  if (!ruinsGuided) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"…자네는 아직 마을의 일을 다 보지 않았어.\n여관 구석의 손님과 먼저 이야기를 해보게. 그 사람의 안내가 있어야 우리 이야기도 시작되네."}
      />
    );
  }

  if (entry.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"…자네가 폐허에 들어갔다고 들었네. 무사한 모습을 보니 다행일세.\n옛 기록에 따르면, 폐허에서 나온 영혼 결정 셋만 있으면 이 마을과 폐허의 매듭을 풀 단서가 잡힌다고 했네. 떠도는 망령이 그것을 가지고 있어. 모아 주겠나?"}
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(QUEST_ID);
            onClose();
          },
        }}
      />
    );
  }

  const have = inventory.materialCount("soul_crystal");
  if (have >= NEED) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"…셋이라. 자네 손에 든 그것은, 우리가 잊고 살아온 무언가의 조각이야.\n고맙네. 진심으로. 이 작은 어촌이 자네에게 진 빚은 잊지 않을 게요."}
        primaryAction={{
          label: "건네준다",
          onClick: () => {
            const r = quests.tryDeliver(
              QUEST_ID,
              inventory.materialCount,
              inventory.consumeMaterial,
            );
            if (r.ok) {
              // deliver 성공하면 재료는 이미 소비됨 — completeQuest 가 어떤 이유로 false 라도
              // (현재 코드상 일어나기 어렵지만 방어적으로) 다이얼로그는 닫아 stuck 방지.
              // 보상은 길드 게시판의 ready 큐에서 회수 가능.
              completeQuest(QUEST_ID);
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
      text={`영혼 결정은 떠도는 망령이 가지고 있다고 들었네. 진행: ${have}/${NEED}\n…서두를 필요는 없네. 오래된 일이니까.`}
    />
  );
}
