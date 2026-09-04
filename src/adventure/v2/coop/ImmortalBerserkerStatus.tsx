import { SURFACE_INSET } from "@/components/ui/surfaces";
import type { CoopImmortalBerserkerStatus as Status } from "./useCoopBossState";

function safeLifeIndex(value: number | undefined): 0 | 1 | 2 {
  return Math.max(0, Math.min(2, Math.floor(value ?? 0))) as 0 | 1 | 2;
}

function percent(multiplier: number | undefined): number {
  return Math.max(0, Math.round(((multiplier ?? 1) - 1) * 100));
}

export function ImmortalBerserkerStatus({
  status,
  compact = false,
}: {
  status: Status;
  compact?: boolean;
}) {
  const lifeIndex = safeLifeIndex(status.immortalLifeIndex);
  const lifeHp = Math.max(0, Math.floor(status.immortalLifeHp ?? 0));
  const lifeMaxHp = Math.max(1, Math.floor(status.immortalLifeMaxHp ?? 1));
  const atkPct = percent(status.immortalAtkMult);
  const spdPct = percent(status.immortalSpdMult);
  const regenActions = Math.max(
    0,
    Math.floor(status.immortalRegenActionsRemaining ?? 0),
  );
  const regenUses = Math.max(
    0,
    Math.floor(status.immortalRegenUsesRemaining ?? 0),
  );
  const nextRegen = Math.max(
    0,
    Math.floor(status.immortalNextRegenAmount ?? 0),
  );

  return (
    <span className={`${SURFACE_INSET} block space-y-1.5 px-2.5 py-2 text-left`}>
      <span className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-rose-700 dark:text-rose-300">
          생명 {lifeIndex + 1} / 3
        </span>
        <span className="font-medium text-zinc-600 dark:text-zinc-300">
          공격력 +{atkPct}% · 행동 속도 +{spdPct}%
        </span>
      </span>
      <span
        aria-label="현재 생명 단계"
        className="grid grid-cols-3 gap-1"
      >
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`h-1.5 rounded ${
              index < lifeIndex
                ? "bg-zinc-400 dark:bg-zinc-600"
                : index === lifeIndex
                  ? "bg-rose-500"
                  : "bg-zinc-200 dark:bg-zinc-700"
            }`}
          />
        ))}
      </span>
      {!compact && (
        <>
          <span className="flex items-center justify-between gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
            <span>
              현재 생명 {lifeHp.toLocaleString("ko-KR")} / {lifeMaxHp.toLocaleString("ko-KR")}
            </span>
            <span>
              {regenUses > 0 ? `재생까지 ${regenActions}행동` : "재생 소진"}
            </span>
          </span>
          <span className="flex items-center justify-between gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
            <span>남은 재생 {regenUses}회</span>
            {nextRegen > 0 && (
              <span>다음 재생 +{nextRegen.toLocaleString("ko-KR")}</span>
            )}
          </span>
        </>
      )}
    </span>
  );
}
