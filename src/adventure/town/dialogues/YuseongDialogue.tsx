import { useRef } from "react";
import { X } from "@phosphor-icons/react";
import { useModalA11y } from "@/lib/useModalA11y";
import type { Npc } from "@/adventure/data/npcs";
import { NpcAvatar } from "@/adventure/NpcAvatar";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useAdventureLog } from "@/adventure/log/useAdventureLog";
import { QuestLineDialogue, type QuestLineStep } from "./questLineDialogue";

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
  storyFlags: ReturnType<typeof useStoryFlags>;
  adventureLog: ReturnType<typeof useAdventureLog>;
};

// 노수호자 유성 — 별바다(천공 라인 endgame 정거장) 의 마지막 천공인 후예. 차분한 어른 말투.
// 떠도는 시녀 → 별빛 망령 → 별궤도 자율기 → (폐도 게이트) → 황성 호위병 → (옥좌 게이트) 6단 라인.
//   corridor 5종 + road 5종 제작서를 차례로 풀어 5단 craft chain 의 중간 두 출처를 모음.
//   2개 게이트 의뢰가 천공인의 왕 / 창공의 주재 코옵 보스 진입 자격을 잠그고 풀어준다.
const STEPS: QuestLineStep[] = [
  {
    id: "star-haven-corridor-scouts",
    offerText:
      "별바다에 사람 발소리가 닿은 게 얼마만인지. 첨탑까지 올라온 자라면 이야기가 통하겠소. 회랑에 떠도는 시녀들의 잔영이 별빛 길을 어지럽히고 있소. 열둘만 가라앉혀 주오. 그러면 회랑검과 회랑 방패 벼림법을 자네에게 넘겨주겠소.",
    activeText: (have, need) =>
      `시녀들은 첨탑에서 흘러내린 별빛을 따라 떠도오. 한 자루씩 가라앉히게. 가라앉힌 잔영 ${have}/${need}`,
    doneText:
      "열둘. 회랑이 한 마디 잠잠해졌소. 약속한 대로, 회랑검과 회랑 방패 벼림법을 자네 손에 두었소.",
    acceptLabel: "가라앉히겠다고 한다",
  },
  {
    id: "star-haven-corridor-wraiths",
    offerText:
      "회랑 깊은 곳에 별빛 망령들이 옛 길을 묶어두고 있소. 그들이 풀려야 회랑이 본래 모습으로 돌아오오. 열다섯만 풀어 주면 회랑창과 회랑 너클 벼림법도 함께 넘겨주겠소.",
    activeText: (have, need) =>
      `망령은 회랑 가장 깊은 자리에 매여 있소. 한 마리씩 풀어 주게. 풀어준 망령 ${have}/${need}`,
    doneText:
      "회랑이 한층 가벼워졌소. 약속한 회랑창과 회랑 너클. 자, 받게.",
    acceptLabel: "풀어주겠다고 한다",
  },
  {
    id: "star-haven-corridor-golems",
    offerText:
      "별궤도 자율기들이 옛 회랑의 봉인을 쥐고 있소. 열만 가라앉히면 회랑 망토 벼림법을 자네 어깨에 두르게 해 주겠소. 안에 굳어 있는 별의 정수도 자네 몫이오.",
    activeText: (have, need) =>
      `자율기 안쪽에 별의 정수가 굳어 있으니, 신중히 깨주오. 가라앉힌 자율기 ${have}/${need}`,
    doneText:
      "회랑의 봉인이 마침내 풀렸소. 회랑 망토 벼림법을 자네 어깨에 얹어 두었소. 별의 정수도 챙겨 가게.",
    acceptLabel: "봉인을 풀겠다고 한다",
  },
  {
    id: "star-haven-skyfolk-gate",
    offerText:
      "폐도 깊은 곳, 천공인 사관들의 잔재가 잘못 굳은 봉인을 붙들고 있소. 열만 정리하면 천공인의 왕이 비로소 자네를 마주할 자격을 인정할 것이오. 그 자격 없이는 그 너머의 자에게 닿을 수 없소.",
    activeText: (have, need) =>
      `천공인 사관은 폐도 어디서나 마주칠 수 있소. 한 점씩 정리하시오. 정리한 사관 ${have}/${need}`,
    doneText:
      "폐도의 봉인이 한 겹 풀렸소. 천공인의 왕이 마침내 자네를 받아들일 것이오. 이제 그 자에게 가도 좋소.",
    acceptLabel: "폐도의 봉인을 풀겠다고 한다",
  },
  {
    id: "star-haven-throne-guards",
    offerText:
      "옥좌의 길에서 황성 호위병들이 길을 막고 있소. 열다섯만 정리해 길을 열면 황성 무구 다섯 자루 벼림법을 모두 자네에게 넘겨주겠소. 별바다가 자네에게 줄 수 있는 마지막 선물이오.",
    activeText: (have, need) =>
      `황성 호위병은 옥좌의 길 곳곳에 흩어져 있소. 한 자리씩 정리하며 길을 여게. 정리한 호위병 ${have}/${need}`,
    doneText:
      "길이 열렸소. 황성검·방패·창·너클·망토. 다섯 자루 벼림법을 모두 자네 손에 두었소. 옥좌가 자네를 알아보는 날이 멀지 않았소.",
    acceptLabel: "길을 열겠다고 한다",
  },
  {
    id: "star-haven-apex-gate",
    offerText:
      "옥좌 둘레에 별빛 사도들이 마지막 봉인을 두르고 있소. 열만 가라앉히면 창공의 주재가 자네 앞에 일어설 것이오. 별빛이 그날을 기억할 것이오.",
    activeText: (have, need) =>
      `별빛 사도는 옥좌 둘레 어디서나 마주칠 수 있소. 마지막 봉인을 한 점씩 풀어 주시오. 풀어준 사도 ${have}/${need}`,
    doneText:
      "마지막 봉인이 풀렸소. 창공의 주재가 자네 앞에 일어설 것이오. 옥좌가 자네를 기억할 것이오.",
    acceptLabel: "옥좌의 봉인을 풀겠다고 한다",
  },
  // ── 후반 3보스 도전 의뢰 9종 (보스별 3종 묶음). 게이트 의뢰 완료 후 잠금 해제.
  // 2026-05-19: 협동→솔로 전환 + 카운트 1회로 통일.
  // 별을 지키는 자 (Lv70, 별궤도 자율기 의뢰 완수 후)
  {
    id: "star-haven-keeper-challenge-witness",
    offerText:
      "별을 지키는 자를 한 번 거두어 별빛이 자네를 알아보게 하시오. 별빛이 자네를 한 번 깊이 알아본다면, 그 기억은 평생 가오.",
    activeText: (have, need) =>
      `별빛은 한 결로 모이고 한 결로 흩어지오. 호흡 가다듬고 도전하시오. ${have}/${need}`,
    doneText:
      "별빛이 자네를 깊이 알아봤소. 별빛의 증인. 그 칭호를 두었소.",
    acceptLabel: "별빛의 증인 되겠다고 한다",
  },
  {
    id: "star-haven-keeper-challenge-strike",
    offerText:
      "거의 다치지 않은 채로 별을 지키는 자를 한 번 거두시오. 한 번에 깊이 가르는 자에게만 보이는 자리가 있소.",
    activeText: (have, need) =>
      `흠 없는 한 수는 자네 날이 충분히 깊어야 닿소. ${have}/${need}`,
    doneText:
      "별빛을 흠 없이 가른 한 결을 별빛이 기억했소. 별빛 한 줄기, 자네에게 새겨 두었소.",
    acceptLabel: "별빛 한 줄기 되겠다고 한다",
  },
  {
    id: "star-haven-keeper-challenge-survive",
    offerText:
      "포션을 단 한 병도 꺼내지 말고 별을 지키는 자를 한 번 거두시오. 흔들리지 않는 자세가 별빛에 새겨질 때까지.",
    activeText: (have, need) =>
      `포션 한 병도 없이 별빛 앞에 서는 일은 한 호흡도 어긋나면 안 되오. ${have}/${need}`,
    doneText:
      "맨몸으로 한 결을 마쳤소. 흔들리지 않는 자세. 자네의 깊이오.",
    acceptLabel: "흔들리지 않는 자세 되겠다고 한다",
  },
  // 천공인의 왕 (Lv80, 폐도 게이트 의뢰 완수 후)
  {
    id: "star-haven-king-challenge-witness",
    offerText:
      "천공인의 왕을 한 번 거두어 폐도가 자네를 알아보게 하시오. 폐도가 자네를 알아보는 첫 표식이오.",
    activeText: (have, need) =>
      `폐도의 왕은 별빛보다 무거우오. 깊이 새기시오. ${have}/${need}`,
    doneText:
      "폐도가 자네를 처음 깊이 알아봤소. 폐도의 증인. 그 칭호를 두었소.",
    acceptLabel: "폐도의 증인 되겠다고 한다",
  },
  {
    id: "star-haven-king-challenge-strike",
    offerText:
      "거의 다치지 않은 채로 천공인의 왕을 한 번 거두시오. 폐도가 한 자루 칼에도 흔들리는 순간이 있소.",
    activeText: (have, need) =>
      `흠 없는 한 수는 날이 비로소 깊어진 자만 닿소. ${have}/${need}`,
    doneText:
      "폐도의 왕이 자네 한 결에 흔들렸소. 폐도의 일격. 자네에게 새겨 두었소.",
    acceptLabel: "폐도의 일격 되겠다고 한다",
  },
  {
    id: "star-haven-king-challenge-survive",
    offerText:
      "포션을 단 한 병도 꺼내지 말고 천공인의 왕을 한 번 거두시오. 폐도는 견디는 자만이 풀어낼 수 있소.",
    activeText: (have, need) =>
      `폐도 앞에서 맨몸으로 서는 일은 한 호흡도 어긋나면 안 되오. ${have}/${need}`,
    doneText:
      "폐도의 왕 앞에서 맨몸으로 한 결을 마쳤소. 폐도를 견디는 자. 자네의 깊이오.",
    acceptLabel: "폐도를 견디는 자 되겠다고 한다",
  },
  // 창공의 주재 (Lv90, 옥좌 게이트 의뢰 완수 후)
  {
    id: "star-haven-arbiter-challenge-witness",
    offerText:
      "창공의 주재를 한 번 거두어 옥좌가 자네를 알아보게 하시오. 옥좌가 자네를 처음으로 깊이 인정하는 표식이오.",
    activeText: (have, need) =>
      `옥좌의 무게는 별빛 끝의 무게요. 한 결을 깊이 새기시오. ${have}/${need}`,
    doneText:
      "옥좌가 자네를 깊이 인정했소. 옥좌의 증인. 그 칭호를 두었소.",
    acceptLabel: "옥좌의 증인 되겠다고 한다",
  },
  {
    id: "star-haven-arbiter-challenge-strike",
    offerText:
      "거의 다치지 않은 채로 창공의 주재를 한 번 거두시오. 옥좌도 한 자루 칼에 흔들리는 순간이 있다 들었소.",
    activeText: (have, need) =>
      `흠 없는 한 수는 끝에 닿은 자만이 닿소. ${have}/${need}`,
    doneText:
      "옥좌가 자네 한 결에 흔들렸소. 옥좌의 일격. 자네에게 새겨 두었소.",
    acceptLabel: "옥좌의 일격 되겠다고 한다",
  },
  {
    id: "star-haven-arbiter-challenge-survive",
    offerText:
      "포션을 단 한 병도 꺼내지 말고 창공의 주재를 한 번 거두시오. 옥좌를 견디는 자만이 별빛 끝을 보오.",
    activeText: (have, need) =>
      `옥좌 앞에서 맨몸으로 서는 일은 끝에 닿은 자만이 할 수 있소. ${have}/${need}`,
    doneText:
      "옥좌 앞에서 맨몸으로 한 결을 마쳤소. 옥좌를 견디는 자. 별빛 끝까지 본 자요.",
    acceptLabel: "옥좌를 견디는 자 되겠다고 한다",
  },
];

export function YuseongDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  inventory,
  storyFlags,
  adventureLog,
}: Props) {
  const apexDefeated = storyFlags.has("endgame_apex_defeated");
  const endedSealed = storyFlags.has("ending_sealed");
  const endedThroned = storyFlags.has("ending_throned");

  // 엔딩 분기 — 창공의 주재를 잠재운 직후, 아직 결정 안 한 상태면 우선 분기 모달.
  if (apexDefeated && !endedSealed && !endedThroned) {
    return (
      <EpilogueChoice
        npc={npc}
        onClose={onClose}
        storyFlags={storyFlags}
        adventureLog={adventureLog}
      />
    );
  }

  // 엔딩 이후 idleText — 두 분기의 후일담을 한 줄로.
  const idleText = endedSealed
    ? "옥좌가 다시 봉인됐소. 별빛이 다시 묶여 있구려. 자네 한 사람 손으로 세상이 사람의 자리로 돌아왔소. 늦은 잔 한 잔, 같이 비우시려나."
    : endedThroned
      ? "옥좌의 주인, 다시 별바다에 와 주셔서 고맙소. 별빛이 자네를 두르고 있는 게 보이오. 부르는 자가 되어버린 지금도 사람의 자리에 들러 주는 자요."
      : "별바다에 발걸음이 닿으면 언제든 다시 들르시오. 옛 봉인을 가라앉히는 일은 한 사람만으로는 끝나지 않으니.";

  return (
    <QuestLineDialogue
      npc={npc}
      onClose={onClose}
      quests={quests}
      completeQuest={completeQuest}
      inventory={inventory}
      steps={STEPS}
      idleText={idleText}
    />
  );
}

// 엔딩 분기 — 봉인 / 앉음. 한 번 결정하면 flag + 칭호로 영구 기록.
function EpilogueChoice({
  npc,
  onClose,
  storyFlags,
  adventureLog,
}: {
  npc: Npc;
  onClose: () => void;
  storyFlags: ReturnType<typeof useStoryFlags>;
  adventureLog: ReturnType<typeof useAdventureLog>;
}) {
  const firedRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);

  const choose = (kind: "sealed" | "throned") => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (kind === "sealed") {
      storyFlags.set("ending_sealed");
      adventureLog.markTitleObtained("apex_sealer");
    } else {
      storyFlags.set("ending_throned");
      adventureLog.markTitleObtained("apex_inheritor");
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="yuseong-epilogue-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        ref={contentRef}
        className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <NpcAvatar npc={npc} size={112} />
            <div className="min-w-0">
              <div
                id="yuseong-epilogue-title"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {npc.name}
              </div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {npc.description}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
          {
            "옥좌가 비어 있소. 별빛 한 점이 자네 손 쪽으로 흘러왔구려.\n\n나는 한 세대를 옥좌 앞에서 별빛이 닳아 가는 걸 세고 있었지. 마지막 결정은 내가 내릴 수 없는 거요. 자네가 내려야 하오.\n\n자네 손이 닿으면, 옥좌는 다시 봉인되오. 별빛이 다시 묶이는 자리로. 세상이 사람의 자리로 돌아오오.\n자네 발이 닿으면, 옥좌는 자네를 받소. 별빛이 다음 주인을 받아 가는 자리로. 자네가 부르는 자가 되오.\n\n…한 번만 정하시오. 한 사람의 손에 달린 거요."
          }
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => choose("sealed")}
            className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            손을 뻗어 옥좌를 다시 봉인한다
          </button>
          <button
            type="button"
            onClick={() => choose("throned")}
            className="w-full rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
          >
            발을 옮겨 옥좌에 앉는다
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            …아직 정하지 못한다
          </button>
        </div>
      </div>
    </div>
  );
}
