import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useCharacterState } from "@/adventure/character/useCharacterState";
import type { NotificationKind } from "@/lib/notifications";
import { SKILL_BOOKS } from "@/adventure/data/skillBooks";

const RESOLVE_BOOK_ID = "book_resolve" as const;

// 무진 — 마른나루 옛 수비대장. 차분한 노병. 서편 옛길 메인 라인의 축.
// 두루·나래의 인트로 의뢰를 한 번씩 마치면 마른나루가 자네를 받아들임 → dustford_vouched.
// → 옛길 노상강도 정리(dustford-mujin-clear-road) 완료 시 oldwall_keep_unsealed flag 를 켠다
// (= world 의 dustford→oldwall_keep 게이트, 무너진 북쪽 벽으로 가는 길). → 성채 안 정찰
// (녹슨 쇳조각 ×10 deliver) → 옛 성문지기 처치(kill) → gatekeeper_felled(보스 onDefeatFlag)
// → 정기 토벌 반복 의뢰. 각 의뢰는 quests.ts 의 dustford-mujin-* / dustford-gatekeeper-recurring.
export const DUSTFORD_FLAG_VOUCHED = "dustford_vouched";
export const KEEP_FLAG_UNSEALED = "oldwall_keep_unsealed";

const PORT_TRIAL_QUEST_IDS = [
  "dustford-duru-fangs",
  "dustford-narae-feathers",
] as const;

const CLEAR_ROAD_QUEST = "dustford-mujin-clear-road";
const CLEAR_ROAD_NEED = 15; // 노상강도
const SURVEY_QUEST = "dustford-mujin-keep-survey";
const SURVEY_NEED = 10; // 녹슨 쇳조각
const BOSS_QUEST = "dustford-mujin-gatekeeper";
const RECURRING_QUEST = "dustford-gatekeeper-recurring";
const RECURRING_NEED = 3;

// 보스 처치 후 무진이 내주는 도전 의뢰 — 한 줄로 N 개를 차례로 노출.
// kill_within_hp · no_potion_boss · equip_set 세 가지 새 quest kind 의 인게임 검증 라인.
const CHALLENGE_STEPS: Array<{
  id: string;
  offerText: string;
  activeText: string;
  doneText: string;
}> = [
  {
    id: "dustford-mujin-challenge-pristine",
    offerText:
      "성문지기를 한 번 잠재웠다면 — 두 번째는 흠 없이 가져갈 수 있나? 그놈 빗장이 살갗에 닿기 전에 끝내 보게. HP 70% 이상으로 처치, 한 번.",
    activeText: "흠 없이 — 빗장을 맞지 말고. 사슬을 보고 발을 디뎌.",
    doneText: "흠 없이 잠재웠군. 옛 수비대도 그렇게 했지. 자, 받아.",
  },
  {
    id: "dustford-mujin-challenge-no-potion",
    offerText:
      "옛 수비대는 약 주머니 없이 서 있었어. 한 번만 — 포션 한 병도 쓰지 않고 그놈을 잠재워 보게. 한 번이면 되네.",
    activeText: "약 주머니에 손 대지 마. 자네가 가진 것만으로.",
    doneText: "약 한 모금도 안 마시고 — 그래. 그게 수비대의 기개일세. 받아.",
  },
  {
    id: "dustford-mujin-challenge-garrison-set",
    offerText:
      "한 가지 부탁이 더 있소. 수비대 도검·사슬갑옷·성문지기의 핵 — 셋을 한 복으로 갖춰 한 번이라도 차고 와 주게. 옛 수비대 한 식구가 다시 선 모습을 보고 싶소.",
    activeText: "수비대 도검 + 수비대 사슬갑옷 + 성문지기의 핵 — 셋을 동시에 차야 하오.",
    doneText: "옛 수비대의 한 사람이 다시 섰군. 그 모습이면 됐소 — 받아.",
  },
];

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
  storyFlags: ReturnType<typeof useStoryFlags>;
  characterStateHook: ReturnType<typeof useCharacterState>;
  addNotification: (kind: NotificationKind, text: string) => void;
};

export function MujinDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  inventory,
  storyFlags,
  characterStateHook,
  addNotification,
}: Props) {
  const vouched = storyFlags.has(DUSTFORD_FLAG_VOUCHED);
  const unsealed = storyFlags.has(KEEP_FLAG_UNSEALED);
  const felled = storyFlags.has("gatekeeper_felled");

  const clearRoad = quests.getEntry(CLEAR_ROAD_QUEST);
  const survey = quests.getEntry(SURVEY_QUEST);
  const boss = quests.getEntry(BOSS_QUEST);
  const recurring = quests.getEntry(RECURRING_QUEST);

  // ── 정기 토벌 반복 의뢰 (옛 성문지기 처치 이후) ──
  if (recurring.state === "ready") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"또 잠재웠구려. 성문이 한동안은 조용하겠어 — 자, 약속한 사례요."}
        primaryAction={{
          label: "보상을 받는다",
          onClick: () => {
            if (completeQuest(RECURRING_QUEST)) onClose();
          },
        }}
      />
    );
  }
  if (recurring.state === "active") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={`그것은 한 번 잠재워도 또 깨어나오. 세 번은 더 다녀와야 성문이 가라앉을 게요. — 진행 ${recurring.progress}/${RECURRING_NEED}`}
      />
    );
  }

  // ── 옛 성문지기 처치 의뢰 ──
  if (boss.state === "ready") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"…옛 성문지기가 멈췄다고. 자네가 그것을 잠재웠어.\n한 세대 동안 빈 성벽을 지키던 게 — 마침내 쉬는군. 마른나루가 성채를 되찾을 수 있겠소. 우물도, 밭도. 자, 우선 이거라도 받아 주게."}
        primaryAction={{
          label: "보상을 받는다",
          onClick: () => {
            if (completeQuest(BOSS_QUEST)) onClose();
          },
        }}
      />
    );
  }
  if (boss.state === "active") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={`혼자선 어림없는 상대요. 단단히 채비하고, 동료를 데려가게. 그건 사람을 막으라 만든 것이 아니야 — 군대를 막으라 만든 거지. — 진행 ${boss.progress}/1`}
      />
    );
  }
  if (boss.state === "completed") {
    // 도전 의뢰 — pristine / no-potion / garrison-set. 한 번에 하나씩 차례로 노출.
    for (const step of CHALLENGE_STEPS) {
      const e = quests.getEntry(step.id);
      if (e.state === "ready") {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={step.doneText}
            primaryAction={{
              label: "보상을 받는다",
              onClick: () => {
                if (completeQuest(step.id)) onClose();
              },
            }}
          />
        );
      }
      if (e.state === "active") {
        return <NpcDialogue npc={npc} onClose={onClose} text={step.activeText} />;
      }
      if (e.state === "available") {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={step.offerText}
            primaryAction={{
              label: "받아들인다",
              onClick: () => {
                quests.accept(step.id);
                onClose();
              },
            }}
          />
        );
      }
      // completed — 다음 step 으로.
    }
    if (recurring.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"한 번 잠재웠다고 끝이 아니오. 또 성문이 깨어나거든 — 옛 성문지기를 세 번 더 잠재워 주게. 마른나루가 자네를 잊지 않을 게요."}
          primaryAction={{
            label: "받아들인다",
            onClick: () => {
              quests.accept(RECURRING_QUEST);
              onClose();
            },
          }}
        />
      );
    }
    // 보스 처치 후 idle — 결의 스킬북 판매 (옛 수비대 호흡법). 중복 가드.
    const book = SKILL_BOOKS[RESOLVE_BOOK_ID];
    const price = book.price ?? 0;
    const alreadyKnown = (
      characterStateHook.state.learnedAPSkills ?? []
    ).includes("결의");
    const alreadyHas = inventory.skillBookCount(RESOLVE_BOOK_ID) > 0;
    const offerBook = felled && !alreadyKnown && !alreadyHas;
    // 5막 「빈 옥좌의 시대」 PR-B2 — 별빛 성채. Ch 26(starfall_warden_felled) 부터 활성.
    // 책 제안이 활성일 때는 그쪽이 우선(원래 라인 유지), 그 외엔 5막 분기 노출.
    const starfall = storyFlags.has("starfall_warden_felled");
    const gateQuelled = storyFlags.has("starlit_gate_quelled");
    const starfallLine =
      starfall && !gateQuelled
        ? "…자네, 마침 잘 왔소. 산정 백운 영감도, 소만 여울 노인네도 사람을 보냈더만 — 별빛이 옛 봉인 자리로 떨어졌단 얘기. 우리 성채도 그렇소.\n빈 성벽 안쪽에서 빗장 들어 올리는 쇳소리가 다시 들리오. 한 세대 동안 지키던 자가 별빛에 데워져, 잔영으로 돌아왔다오. 단단히 채비하고 동료를 데려가 — 한 번 더 잠재워 주게."
        : starfall && gateQuelled
          ? "잔영도 잠들었소. 자네 손에 거두어진 별빛 한 점이 — 빗장 위에서 가볍게 떨고 있다지.\n세 자리 모두 잠재웠다면 — 떨어진 별빛이 한데 모일 자리가 있을 게요. 별바다 노수호자한테 가 보게. 자네를 기다리고 있을 거요."
          : null;
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          offerBook
            ? `성채에 다시 사람이 든다오. 갈라진 우물을 메우고, 막사를 헐어 새로 짓고. …자네가 한 일이야.\n\n…그리고, 옛 수비대의 호흡법을 한 권 묶어 뒀소. "${book.name}" — ${price}G 면 자네 거요.`
            : starfallLine ??
              (felled
                ? "성채에 다시 사람이 든다오. 갈라진 우물을 메우고, 막사를 헐어 새로 짓고. …자네가 한 일이야.\n옛 변경의 일이 다 끝난 건 아닐지 몰라도 — 이 마을은 자네를 식구로 기억할 게요."
                : "…고맙소. 진심으로. 마른나루는 자네를 잊지 않을 게요.")
        }
        objective={
          !offerBook && starfall && !gateQuelled
            ? {
                body: "별빛 성채의 성문지기 잔영을 잠재우세요.\n지역 보스 도전 버튼으로 진입합니다.",
              }
            : !offerBook && starfall && gateQuelled
              ? {
                  body: "시작 마을 우물가의 별바다 노수호자 유성에게 가 보세요.",
                }
              : undefined
        }
        primaryAction={
          offerBook
            ? {
                label: `${book.name} 구매 (${price}G)`,
                onClick: () => {
                  if (characterStateHook.state.gold < price) {
                    addNotification("info", "골드가 부족합니다.");
                    return;
                  }
                  characterStateHook.addGold(-price);
                  inventory.addSkillBook(RESOLVE_BOOK_ID, 1);
                  addNotification(
                    "item",
                    `${book.name} 을(를) 구매했습니다. 가방에서 사용하세요.`,
                  );
                  onClose();
                },
              }
            : undefined
        }
      />
    );
  }

  // ── 성채 안 정찰 의뢰 완료 → 보스 의뢰 제안 ──
  if (survey.state === "completed") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"자네가 가져온 쇳조각을 봤네. …이만큼 쌓였다면 성채는 아직 멀쩡해. 다시 쓸 수 있어. 한 가지만 빼면 — 성문지기.\n그건 사람을 막으라 만든 게 아니야. 한 세대 전, 변경을 넘어오던 군대를 막으라 세운 거지. 군대는 오지 않았고, 그것만 남아 빈 벽을 지켜. 단단히 준비해 가서 그것을 잠재워 주게. 마른나루의 명운이 거기 달렸소."}
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(BOSS_QUEST);
            onClose();
          },
        }}
      />
    );
  }

  // ── 성채 안 정찰 의뢰 (deliver: 녹슨 쇳조각 ×10) ──
  if (survey.state === "ready" || survey.state === "active") {
    const have = inventory.materialCount("scrap_iron");
    if (have >= SURVEY_NEED) {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"열 덩이 — 그래. 녹슨 자동인형의 쇳조각이야. 이게 이만큼 쌓였다면…\n됐소. 잠깐 앉아 보게. 자네에게 할 이야기가 있어. 성문지기에 대해서."}
          primaryAction={{
            label: "건네준다",
            onClick: () => {
              const r = quests.tryDeliver(
                SURVEY_QUEST,
                inventory.materialCount,
                inventory.consumeMaterial,
              );
              if (r.ok) {
                completeQuest(SURVEY_QUEST);
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
        text={`녹슨 쇳조각은 자동인형이나 탈영병한테서 나오오. 열 덩이면 성채가 아직 쓸 만한지 보일 게요. 진행: ${have}/${SURVEY_NEED}`}
      />
    );
  }

  // ── 옛길을 정리해 성벽 길을 연 뒤 — 성채 정찰 의뢰 제안 ──
  if (unsealed && survey.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"무너진 북쪽 벽으로 일꾼들을 데리고 들어가 봤네. …성채는 생각보다 멀쩡해. 다만 자네에게 부탁이 있소.\n안에 녹슨 쇳조각이 얼마나 쌓였는지 봐 와 주게 — 열 덩이면 충분해. 재건에 쓸 만한지, 아니면 그냥 무너뜨려야 할지 알 수 있소."}
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(SURVEY_QUEST);
            onClose();
          },
        }}
      />
    );
  }

  // ── 옛길 노상강도 정리 의뢰 (완료 시 oldwall_keep_unsealed flag) ──
  if (clearRoad.state === "ready") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"옛길이 트였군. 이제 일꾼들을 데리고 성채 북쪽, 무너진 벽으로 들어갈 수 있어. 자네도 그 길을 알아 두게 — 성문은 안에서 잠겨 있으니, 무너진 벽이 유일한 길이오.\n자, 약속한 사례. 그리고 — 성채는 이제 자네에게도 열렸소."}
        primaryAction={{
          label: "보상을 받는다",
          onClick: () => {
            if (completeQuest(CLEAR_ROAD_QUEST)) {
              storyFlags.set(KEEP_FLAG_UNSEALED);
              onClose();
            }
          },
        }}
      />
    );
  }
  if (clearRoad.state === "active") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={`옛길의 노상강도가 길을 막아 — 일꾼을 데리고 성채까지 갈 수가 없소. 열다섯만 솎아 주게. — 진행 ${clearRoad.progress}/${CLEAR_ROAD_NEED}`}
      />
    );
  }
  if (vouched && clearRoad.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"마른나루가 자네를 받아들였다더군. 그렇다면 부탁이 있소.\n옛길 끝, 무너진 성채로 가는 길이 있어 — 성문은 자동인형이 안에서 잠갔지만, 북쪽 벽이 무너진 자리로 들 수 있소. 다만 옛길에 눌러앉은 노상강도가 길을 막아. 열다섯만 솎아 주면, 일꾼을 데리고 가 그 길을 열겠소. 그때 자네도 데려가지."}
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(CLEAR_ROAD_QUEST);
            onClose();
          },
        }}
      />
    );
  }

  // ── 아직 마른나루의 신임을 못 얻음 ──
  if (vouched) {
    // (clearRoad 가 어떤 이유로 available 도 아닌 비정상 상태 — 일상 대화로 폴백)
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"옛길 끝의 성채 말이오. …밤마다 성문이 쿵쿵거리는 소리, 들었을 거요. 그것이 멈추지 않는 한 마른나루는 옛 우물도, 밭도 되찾지 못해. 자네가 그 너머를 봐 와 줘야겠소."}
      />
    );
  }
  const portHelped = PORT_TRIAL_QUEST_IDS.every(
    (id) => quests.getEntry(id).completedCount > 0,
  );
  if (portHelped) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"두루도, 나래도 자네를 받아들였군. …그렇다면 마른나루도 자네를 받아들이오.\n이제 이야기를 하지. 옛길 끝, 무너진 변경 성채 말이오 — 거기 가야 할 일이 있소. 채비가 되거든 다시 오시오."}
        primaryAction={{
          label: "그러겠다고 한다",
          onClick: () => {
            storyFlags.set(DUSTFORD_FLAG_VOUCHED);
            onClose();
          },
        }}
      />
    );
  }
  const helpedCount = PORT_TRIAL_QUEST_IDS.filter(
    (id) => quests.getEntry(id).completedCount > 0,
  ).length;
  return (
    <NpcDialogue
      npc={npc}
      onClose={onClose}
      text={`마른나루가 자네를 알아야, 우리 이야기도 시작되오. 두루와 나래의 부탁을 한 번씩 들어주게. 둘이 자네를 받아들이면, 그때 다시 오시오. — ${helpedCount}/2`}
    />
  );
}
