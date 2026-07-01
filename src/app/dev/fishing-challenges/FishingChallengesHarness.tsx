"use client";

import { useState } from "react";
import { FishingDailyChallengeView } from "@/adventure/v2/FishingDailyChallengeView";
import {
  type FishingDailyState,
  applyCatch,
  deriveFishingContractViews,
  deriveFishingDailyViews,
  emptyFishingDaily,
  fishingContractById,
  fishingDailyById,
} from "@/adventure/data/v2/fishingDailyChallenges";
import {
  addFishingCatchXp,
  deriveFishingGoalViews,
  emptyFishingProgression,
  fishingGoalById,
} from "@/adventure/v2/fishingProgression";
import { nextDailyResetAt } from "@/adventure/data/v2/v2RepeatQuests";
import type {
  ClaimResult,
  FishingChallengesState,
} from "@/adventure/v2/useFishingDailyChallenge";

// mock 진행 — 8마리(d_catch8 완료)·희귀↑ trout×2+marlin×1=3(d_rare3 완료)·3종(d_variety6 진행).
function buildMockState(): FishingDailyState {
  let s = emptyFishingDaily("dev");
  for (let i = 0; i < 5; i += 1) s = applyCatch(s, "crucian_carp", "dev");
  for (let i = 0; i < 5; i += 1) s = applyCatch(s, "carp", "dev", 90);
  s = applyCatch(s, "trout", "dev", 60);
  s = applyCatch(s, "trout", "dev", 62);
  s = applyCatch(s, "marlin", "dev", 180);
  s = applyCatch(s, "goldeye", "dev", 70);
  return s;
}

function buildMockProgression() {
  let s = emptyFishingProgression();
  for (let i = 0; i < 25; i += 1) s = addFishingCatchXp(s, "crucian_carp").state;
  for (let i = 0; i < 8; i += 1) s = addFishingCatchXp(s, "carp").state;
  for (let i = 0; i < 2; i += 1) s = addFishingCatchXp(s, "platinum_carp").state;
  return s;
}

// /dev/fishing-challenges — mock 진행으로 일일 도전 UI QA(로그인·DB 없이). 수령은 로컬 적립.
export function FishingChallengesHarness() {
  const [base] = useState(buildMockState);
  const [progression, setProgression] = useState(buildMockProgression);
  const [coins, setCoins] = useState(120);
  const [claimed, setClaimed] = useState<string[]>(["d_rare3"]); // d_rare3 은 이미 수령 상태로 시작
  const [claimedContracts, setClaimedContracts] = useState<string[]>([]);
  const [claimedGoals, setClaimedGoals] = useState<string[]>([]);

  const state: FishingChallengesState = {
    challenges: deriveFishingDailyViews({ ...base, claimed, claimedContracts }),
    contracts: deriveFishingContractViews({ ...base, claimed, claimedContracts }),
    goals: deriveFishingGoalViews({ ...progression, claimedGoals }),
    coins,
    nextResetAt: nextDailyResetAt(new Date()),
  };

  const claim = async (id: string): Promise<ClaimResult> => {
    const def = fishingDailyById(id);
    if (def) {
      if (claimed.includes(id)) return { ok: false, message: "이미 받은 보상이다." };
      setClaimed((c) => [...c, id]);
      setCoins((v) => v + def.rewardCoins);
      return { ok: true, message: `낚시 코인 ${def.rewardCoins}개를 받았다.` };
    }
    const contract = fishingContractById(id);
    if (contract) {
      if (claimedContracts.includes(id)) {
        return { ok: false, message: "이미 받은 보상이다." };
      }
      setClaimedContracts((c) => [...c, id]);
      setCoins((v) => v + contract.rewardCoins);
      return { ok: true, message: `낚시 코인 ${contract.rewardCoins}개를 받았다.` };
    }
    const goal = fishingGoalById(id);
    if (goal) {
      if (claimedGoals.includes(id)) {
        return { ok: false, message: "이미 받은 보상이다." };
      }
      setClaimedGoals((c) => [...c, id]);
      setProgression((s) => ({ ...s, claimedGoals: [...s.claimedGoals, id] }));
      setCoins((v) => v + goal.rewardCoins);
      return { ok: true, message: `낚시 코인 ${goal.rewardCoins}개를 받았다.` };
    }
    return { ok: false, message: "알 수 없는 도전이다." };
  };

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[560px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          DEV 하니스 — mock 의뢰/누적 목표, 코인 120. 수령 시 로컬 적립(새로고침 초기화).
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
