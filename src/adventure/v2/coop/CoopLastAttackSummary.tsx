"use client";

import { FilmStrip } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import type { CoopAttackResult } from "./useCoopBossState";

export type CoopLastAttackSummaryData = Pick<
  CoopAttackResult,
  | "attackId"
  | "damageDealt"
  | "damageTaken"
  | "diedEarly"
  | "defeated"
  | "isSupport"
  | "killingBlowReward"
>;

// 공격 직후 토벌 화면에 남기는 결과 요약. 재공격·보상 수령 버튼은 그대로 위에 두고,
// 전투 과정은 "전투 기록 보기"로 따로 연다.
export function CoopLastAttackSummary({
  result,
  onOpenAttackLog,
}: {
  result: CoopLastAttackSummaryData;
  onOpenAttackLog: (attackId: number) => void;
}) {
  const outcome = result.defeated
    ? "처치"
    : result.diedEarly
      ? "전투불능"
      : "공격 완료";
  return (
    <div className={`${SURFACE_INSET} mx-auto w-full max-w-xs space-y-2 p-3 text-left`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">방금 공격</span>
        {result.isSupport && (
          <span className="text-xs text-emerald-700 dark:text-emerald-300">무료 지원</span>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">준 피해</dt>
          <dd className="truncate font-semibold tabular-nums text-rose-600 dark:text-rose-400">
            {result.damageDealt.toLocaleString()}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">받은 피해</dt>
          <dd className="truncate font-semibold tabular-nums">
            {result.damageTaken.toLocaleString()}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">결과</dt>
          <dd
            className={`font-semibold ${
              result.defeated
                ? "text-emerald-700 dark:text-emerald-400"
                : result.diedEarly
                  ? "text-rose-600 dark:text-rose-400"
                  : ""
            }`}
          >
            {outcome}
          </dd>
        </div>
      </dl>
      {result.killingBlowReward && (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          처치 확정타 보너스 · 협동 주화 ×{result.killingBlowReward.coin} +{" "}
          {result.killingBlowReward.bossMaterialName} ×
          {result.killingBlowReward.bossMaterialCount}
        </p>
      )}
      <Button
        variant="secondary"
        size="sm"
        fullWidth
        onClick={() => onOpenAttackLog(result.attackId)}
      >
        <FilmStrip size={16} />
        전투 기록 보기
      </Button>
    </div>
  );
}
