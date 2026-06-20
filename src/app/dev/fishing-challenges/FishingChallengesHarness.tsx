"use client";

import { useState } from "react";
import { FishingDailyChallengeView } from "@/adventure/v2/FishingDailyChallengeView";
import {
  type FishingDailyState,
  applyCatch,
  deriveFishingDailyViews,
  emptyFishingDaily,
  fishingDailyById,
} from "@/adventure/data/v2/fishingDailyChallenges";
import { nextDailyResetAt } from "@/adventure/data/v2/v2RepeatQuests";
import type {
  ClaimResult,
  FishingChallengesState,
} from "@/adventure/v2/useFishingDailyChallenge";

// mock 진행 — 8마리(d_catch8 완료)·희귀↑ trout×2+marlin×1=3(d_rare3 완료)·3종(d_variety6 진행).
function buildMockState(): FishingDailyState {
  let s = emptyFishingDaily("dev");
  for (let i = 0; i < 5; i += 1) s = applyCatch(s, "crucian_carp", "dev");
  s = applyCatch(s, "trout", "dev");
  s = applyCatch(s, "trout", "dev");
  s = applyCatch(s, "marlin", "dev");
  return s;
}

// /dev/fishing-challenges — mock 진행으로 일일 도전 UI QA(로그인·DB 없이). 수령은 로컬 적립.
export function FishingChallengesHarness() {
  const [base] = useState(buildMockState);
  const [coins, setCoins] = useState(120);
  const [claimed, setClaimed] = useState<string[]>(["d_rare3"]); // d_rare3 은 이미 수령 상태로 시작

  const state: FishingChallengesState = {
    challenges: deriveFishingDailyViews({ ...base, claimed }),
    coins,
    nextResetAt: nextDailyResetAt(new Date()),
  };

  const claim = async (id: string): Promise<ClaimResult> => {
    const def = fishingDailyById(id);
    if (!def) return { ok: false, message: "알 수 없는 도전이다." };
    if (claimed.includes(id)) return { ok: false, message: "이미 받은 보상이다." };
    setClaimed((c) => [...c, id]);
    setCoins((v) => v + def.rewardCoins);
    return { ok: true, message: `낚시 코인 ${def.rewardCoins}개를 받았다.` };
  };

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[560px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          DEV 하니스 — mock 진행(8마리·희귀 3·3종, 코인 120). 수령 시 로컬 적립(새로고침 초기화).
        </div>
      </div>
      <FishingDailyChallengeView
        state={state}
        loading={false}
        claiming={null}
        onClaim={claim}
      />
    </div>
  );
}
