import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  INVINCIBLE_FORTRESS_BARRIER_TICKS,
  invincibleFortressEnrageMultipliers,
  type InvincibleFortressEnrageTier,
} from "@/adventure/v2/combat/invincibleFortressMechanic";
import type { CoopFortressStatus } from "./useCoopBossState";

const TIER_LABELS = ["없음", "약함", "보통", "강함", "최대"] as const;

function safeTier(value: number): InvincibleFortressEnrageTier {
  return Math.max(0, Math.min(4, Math.floor(value))) as InvincibleFortressEnrageTier;
}

export function InvincibleFortressStatus({
  status,
}: {
  status: CoopFortressStatus;
}) {
  const active = status.fortressBarrierActive === true;
  const ticksRemaining = Math.max(
    0,
    Math.min(
      INVINCIBLE_FORTRESS_BARRIER_TICKS,
      Math.floor(status.fortressBarrierTicksRemaining || 0),
    ),
  );
  const elapsedTicks = INVINCIBLE_FORTRESS_BARRIER_TICKS - ticksRemaining;
  const target = Math.max(1, Math.floor(status.fortressBarrierTarget || 1));
  const rawDamage = Number(status.fortressBarrierDamage);
  const damage = Math.max(
    0,
    Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.floor(Number.isFinite(rawDamage) ? rawDamage : 0),
    ),
  );
  const progressDamage = Math.min(target, damage);
  const damagePct = (progressDamage / target) * 100;
  const currentTier = safeTier(status.fortressEnrageTier || 0);
  const projectedTier = safeTier(status.fortressProjectedEnrageTier || 0);
  const currentMultipliers = invincibleFortressEnrageMultipliers(currentTier);
  const barrierNumber = Math.max(
    1,
    Math.min(
      4,
      Math.floor(status.fortressCompletedBarrierCount || 0) + (active ? 1 : 0),
    ),
  );

  return (
    <span className={`${SURFACE_INSET} block space-y-1.5 px-2.5 py-2 text-left`}>
      <span className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-violet-700 dark:text-violet-300">
          마력 방벽 {barrierNumber}/4
        </span>
        <span className="font-medium text-zinc-600 dark:text-zinc-300">
          {active
            ? `방벽 시험 ${elapsedTicks} / ${INVINCIBLE_FORTRESS_BARRIER_TICKS}틱`
            : `현재 광폭: ${TIER_LABELS[currentTier]} (${currentTier}단계)`}
        </span>
      </span>
      {active ? (
        <>
          <span className="flex items-center justify-between gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
            <span>누적 피해 {damage.toLocaleString("ko-KR")} / {target.toLocaleString("ko-KR")}</span>
            <span>예상 광폭: {TIER_LABELS[projectedTier]}</span>
          </span>
          <span
            role="progressbar"
            aria-label="방벽 누적 피해"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={progressDamage}
            className="block h-2 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800"
          >
            <span
              className="block h-full rounded bg-violet-500 transition-[width]"
              style={{ width: `${damagePct}%` }}
            />
          </span>
          <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
            제한 시간 동안 더 많은 피해를 줄수록 다음 광폭이 약해집니다.
          </span>
        </>
      ) : (
        <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
          공격 +{Math.round((currentMultipliers.atkMult - 1) * 100)}% · 속도 +{Math.round((currentMultipliers.spdMult - 1) * 100)}%
        </span>
      )}
    </span>
  );
}
