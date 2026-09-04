import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  SKYWARD_CRYSTAL_EYE_AIM_TICKS,
  SKYWARD_CRYSTAL_EYE_EXPOSURE_DAMAGE_PCT,
  SKYWARD_CRYSTAL_EYE_EXPOSURE_TICKS,
  SKYWARD_CRYSTAL_EYE_STACK_CAP,
} from "@/adventure/v2/combat/skywardCrystalEyeMechanic";
import type { CoopSkywardCrystalEyeStatus } from "./useCoopBossState";

export function SkywardCrystalEyeStatus({
  status,
}: {
  status: CoopSkywardCrystalEyeStatus;
}) {
  const aimTicks = Math.max(
    0,
    Math.min(
      SKYWARD_CRYSTAL_EYE_AIM_TICKS,
      Math.floor(status.crystalEyeAimTicksRemaining ?? SKYWARD_CRYSTAL_EYE_AIM_TICKS),
    ),
  );
  const stacks = Math.max(
    0,
    Math.min(
      SKYWARD_CRYSTAL_EYE_STACK_CAP,
      Math.floor(status.crystalEyeDisruptionStacks ?? 0),
    ),
  );
  const power = status.crystalEyeProjectedPowerPct ?? 100;
  const basePower = status.crystalEyeBasePowerPct ?? 330;
  const exposureTicks = Math.max(
    0,
    Math.min(
      SKYWARD_CRYSTAL_EYE_EXPOSURE_TICKS,
      Math.floor(status.crystalEyeCoreExposureTicksRemaining ?? 0),
    ),
  );
  const exposed = status.crystalEyeCoreExposed === true && exposureTicks > 0;
  const lastPower = status.crystalEyeLastArtilleryPowerPct ?? null;
  const lastStacks = status.crystalEyeLastArtilleryStacks ?? null;
  const lastDamage = status.crystalEyeLastArtilleryDamage ?? null;
  const progressPct = (stacks / SKYWARD_CRYSTAL_EYE_STACK_CAP) * 100;

  return (
    <span className={`${SURFACE_INSET} block space-y-1.5 px-2.5 py-2 text-left`}>
      <span className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-sky-700 dark:text-sky-300">
          천공 포격까지 {aimTicks}틱
        </span>
        <span className="font-medium text-zinc-600 dark:text-zinc-300">
          조준 붕괴 {stacks} / {SKYWARD_CRYSTAL_EYE_STACK_CAP}
        </span>
      </span>
      <span
        role="progressbar"
        aria-label="조준 붕괴"
        aria-valuemin={0}
        aria-valuemax={SKYWARD_CRYSTAL_EYE_STACK_CAP}
        aria-valuenow={stacks}
        className="block h-2 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800"
      >
        <span
          className="block h-full rounded bg-sky-500 transition-[width]"
          style={{ width: `${progressPct}%` }}
        />
      </span>
      <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
        현재 예상 포격 위력 {power}% · 기본 계수 {basePower}%
      </span>
      {exposed && (
        <span className="block font-medium text-[10px] text-violet-700 dark:text-violet-300">
          수정 핵 노출 {exposureTicks}틱 · 받는 피해 +{SKYWARD_CRYSTAL_EYE_EXPOSURE_DAMAGE_PCT}%
        </span>
      )}
      {lastPower !== null && lastStacks !== null ? (
        <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
          직전 포격 {lastStacks}중첩 · 위력 {lastPower}%
          {lastDamage !== null && ` · 실제 피해 ${lastDamage.toLocaleString("ko-KR")}`}
        </span>
      ) : (
        <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
          연타와 치명타로 포격 위력을 낮출 수 있습니다.
        </span>
      )}
    </span>
  );
}
