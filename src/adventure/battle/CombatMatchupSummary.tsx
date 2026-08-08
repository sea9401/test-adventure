import {
  evasionDamageReductionPct,
  magicDefenseDamageReductionPct,
  physicalDefenseDamageReductionPct,
  pveEvasionDamageReductionPct,
  pvpEvasionDamageReductionPct,
} from "@/adventure/data/v2/v2CombatConstants";
import { actionInterval } from "@/adventure/v2/combat/combatTimeline";
import { SURFACE_INSET } from "@/components/ui/surfaces";

export type CombatMatchupRatings = {
  accuracyRating: number;
  evasionRating: number;
  speed?: number;
  physicalDefense?: number;
  magicDefense?: number;
  magicBarrierAbsorbPct?: number;
  magicBarrierDurability?: number;
  incomingAttack?: number;
  incomingAttackType?: "physical" | "magic";
};

export type CombatMatchupResult = {
  playerDamageRetainedPct: number;
  playerEvasionReductionPct: number;
  enemyEvasionReductionPct: number;
  playerDefenseReductionPct: number;
  playerDirectDamageRetainedPct: number | null;
  playerBarrierAbsorbPct: number;
};

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function combatMatchupResult(
  player: CombatMatchupRatings,
  enemy: CombatMatchupRatings,
  ruleset: "pve" | "pvp" = "pve",
): CombatMatchupResult {
  const playerEvasionReductionPct = clampPct(
    ruleset === "pve"
      ? pveEvasionDamageReductionPct(
          player.evasionRating,
          enemy.accuracyRating,
        )
      : pvpEvasionDamageReductionPct(
          player.evasionRating,
          enemy.accuracyRating,
        ),
  );
  const enemyEvasionReductionPct = clampPct(
    ruleset === "pvp"
      ? pvpEvasionDamageReductionPct(
          enemy.evasionRating,
          player.accuracyRating,
        )
      : evasionDamageReductionPct(
          enemy.evasionRating,
          player.accuracyRating,
        ),
  );
  const hasDefensePreview =
    player.physicalDefense != null || player.magicDefense != null;
  const incomingAttackType = enemy.incomingAttackType ?? "physical";
  const playerDefenseReductionPct = hasDefensePreview
    ? clampPct(
        incomingAttackType === "magic"
          ? magicDefenseDamageReductionPct(
              enemy.incomingAttack ?? 0,
              player.magicDefense ?? 0,
            )
          : physicalDefenseDamageReductionPct(
              player.physicalDefense ?? 0,
            ),
      )
    : 0;
  const damageBeforeBarrier = hasDefensePreview
    ? Math.max(0, enemy.incomingAttack ?? 0) *
      (1 - playerDefenseReductionPct / 100) *
      (1 - playerEvasionReductionPct / 100)
    : 0;
  const barrierDurability = Math.max(0, player.magicBarrierDurability ?? 0);
  const playerBarrierAbsorbPct =
    barrierDurability > 0 && damageBeforeBarrier > 0
      ? Math.min(
          clampPct(player.magicBarrierAbsorbPct ?? 0),
          (barrierDurability / damageBeforeBarrier) * 100,
        )
      : 0;
  const playerDirectDamageRetainedPct = hasDefensePreview
    ? 100 *
      (1 - playerDefenseReductionPct / 100) *
      (1 - playerEvasionReductionPct / 100) *
      (1 - playerBarrierAbsorbPct / 100)
    : null;
  return {
    playerDamageRetainedPct: 100 - enemyEvasionReductionPct,
    playerEvasionReductionPct,
    enemyEvasionReductionPct,
    playerDefenseReductionPct,
    playerDirectDamageRetainedPct,
    playerBarrierAbsorbPct,
  };
}

export function actionFrequencyLabel(
  playerSpd: number,
  enemySpd: number,
): string {
  const playerInterval = actionInterval(playerSpd);
  const enemyInterval = actionInterval(enemySpd);
  const ratio = enemyInterval / Math.max(1, playerInterval);
  return `적 1회당 내 ${ratio.toFixed(1)}회`;
}

function fmtRating(value: number): string {
  return Number.isInteger(value)
    ? Math.round(value).toLocaleString()
    : value.toFixed(1);
}

function fmtPct(value: number): string {
  return `${Math.round(clampPct(value))}%`;
}

/**
 * 원본 적중도·회피도와 상대를 반영한 최종 직접 피해 경감률을 보여준다.
 * 전투 화면과 협동 보스 화면이 같은 계산과 용어를 사용하도록 하는 공용 표시 컴포넌트다.
 */
export function CombatMatchupSummary({
  player,
  enemy,
  enemyLabel = "적",
  heading = "적중·회피 경감 예상",
  ruleset = "pve",
}: {
  player: CombatMatchupRatings;
  enemy: CombatMatchupRatings;
  enemyLabel?: string;
  heading?: string | false;
  ruleset?: "pve" | "pvp";
}) {
  const result = combatMatchupResult(player, enemy, ruleset);
  const actionRatio =
    player.speed != null && enemy.speed != null
      ? actionFrequencyLabel(player.speed, enemy.speed)
      : null;

  return (
    <section className={`${SURFACE_INSET} px-3 py-2.5`}>
      {heading && (
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            {heading}
          </h3>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            상대 능력 반영
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-700">
        <div className="pr-3">
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
            내 공격 피해 유지
          </div>
          <div className="text-base font-semibold tabular-nums text-sky-600 dark:text-sky-400">
            {fmtPct(result.playerDamageRetainedPct)}
          </div>
          <div className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            내 적중도 {fmtRating(player.accuracyRating)} · {enemyLabel} 회피도{" "}
            {fmtRating(enemy.evasionRating)} · 경감 {fmtPct(result.enemyEvasionReductionPct)}
          </div>
        </div>
        <div className="pl-3">
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              내 회피 경감률
            </span>
          </div>
          <div className="text-base font-semibold tabular-nums text-cyan-600 dark:text-cyan-400">
            {fmtPct(result.playerEvasionReductionPct)}
          </div>
          <div className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            내 회피도 {fmtRating(player.evasionRating)} · {enemyLabel} 적중도{" "}
            {fmtRating(enemy.accuracyRating)}
          </div>
        </div>
      </div>
      {result.playerDirectDamageRetainedPct != null && (
        <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              내 최종 직접 피해
            </span>
            <span className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {fmtPct(result.playerDirectDamageRetainedPct)} 받음
            </span>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {enemy.incomingAttackType === "magic" ? "마법 방어" : "물리 방어"} 경감{" "}
            {fmtPct(result.playerDefenseReductionPct)} · 회피 경감{" "}
            {fmtPct(result.playerEvasionReductionPct)}
            {result.playerBarrierAbsorbPct > 0 && (
              <>
                {" "}· 마나 실드 {fmtPct(result.playerBarrierAbsorbPct)}
                {player.magicBarrierDurability != null &&
                  ` (남은 ${Math.round(player.magicBarrierDurability).toLocaleString()})`}
              </>
            )}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            현재 상대의 일반 직접 공격 기준입니다. 관통·상태 피해·반사 피해와 전투 중 효과는 별도로 적용됩니다.
          </p>
        </div>
      )}
      {actionRatio && (
        <div className="mt-2 border-t border-zinc-200 pt-1.5 text-center text-[10px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          행동 비율 · {actionRatio}
        </div>
      )}
      <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        일반 회피는 공격을 빗나가게 하지 않고 직접 피해를 줄입니다. 완전 회피는 별도
        스킬과 기믹으로만 발동합니다.
      </p>
    </section>
  );
}
