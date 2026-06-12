"use client";

// 협동 보스 기여 보상 테이블 — 소환 정보(목록)·토벌 중(상세) 공용.
// 티어별 기준/골드(누적)/유니크 확률. myDamage 전달 시 내 현재 티어 행 강조 +
// 다음 티어까지 남은 데미지 안내(때리는 중 동기부여).

import { Fragment, type ReactNode } from "react";
import {
  COOP_TIER_LABEL,
  COOP_TIER_ORDER,
  COOP_TIER_THRESHOLDS,
  coopTierForRatio,
  sumCoopGold,
  type CoopBossKind,
} from "@/adventure/data/v2/coopBosses";

// key 있는 Fragment — grid 셀 4개를 행 래퍼 없이 흘리기 위한 래퍼.
function FragmentRow({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}

export function CoopRewardTable({
  kind,
  myDamage,
}: {
  kind: CoopBossKind;
  /** 내 누적 기여 — 전달 시 현재 티어 강조 + 다음 티어 진행 안내. */
  myDamage?: number;
}) {
  const myTier =
    myDamage != null && myDamage > 0
      ? coopTierForRatio(myDamage / kind.sharedMaxHp)
      : null;
  const nextTier =
    myDamage != null
      ? COOP_TIER_ORDER.find(
          (t) => myDamage < COOP_TIER_THRESHOLDS[t] * kind.sharedMaxHp,
        )
      : undefined;
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[11px]">
        <span className="font-medium text-zinc-500 dark:text-zinc-400">
          티어
        </span>
        <span className="text-right font-medium text-zinc-500 dark:text-zinc-400">
          기여 기준
        </span>
        <span className="text-right font-medium text-zinc-500 dark:text-zinc-400">
          골드
        </span>
        <span className="text-right font-medium text-zinc-500 dark:text-zinc-400">
          유니크
        </span>
        {COOP_TIER_ORDER.map((t) => {
          const mine = myTier === t;
          const cell = mine
            ? "bg-amber-50 font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            : "text-zinc-700 dark:text-zinc-300";
          // 외부 grid(4열)에 셀을 직접 흘림 — 행 래퍼 없음(subgrid 회피).
          return (
            <FragmentRow key={t}>
              <span className={`rounded-l px-1 py-0.5 ${cell}`}>
                {COOP_TIER_LABEL[t]}
                {mine && " ← 현재"}
              </span>
              <span className={`px-1 py-0.5 text-right font-mono ${cell}`}>
                {Math.round(COOP_TIER_THRESHOLDS[t] * 100)}%+
              </span>
              <span className={`px-1 py-0.5 text-right font-mono ${cell}`}>
                {sumCoopGold(kind, t).toLocaleString()}
              </span>
              <span className={`rounded-r px-1 py-0.5 text-right font-mono ${cell}`}>
                {Math.round(kind.rewards[t].uniqueChance * 100)}%
              </span>
            </FragmentRow>
          );
        })}
      </div>
      {myDamage != null && nextTier && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          다음 티어({COOP_TIER_LABEL[nextTier]})까지{" "}
          <span className="font-mono font-medium text-zinc-700 dark:text-zinc-200">
            {Math.max(
              0,
              Math.ceil(
                COOP_TIER_THRESHOLDS[nextTier] * kind.sharedMaxHp - myDamage,
              ),
            ).toLocaleString()}
          </span>{" "}
          데미지
        </p>
      )}
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        기여 기준 = 내 누적 데미지 ÷ 보스 최대 HP. 골드는 도달 티어까지 합산
        지급, 유니크는 도달 티어 확률로 1회 굴림. 첫 토벌 시 칭호.
      </p>
    </div>
  );
}
