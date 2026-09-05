import {
  evasionDamageReductionPct,
  magicDefenseDamageReductionPct,
  physicalDefenseDamageReductionPct,
  pveEvasionDamageReductionPct,
  pvpEvasionDamageReductionPct,
  partitionWithMagicBarrier,
} from "@/adventure/data/v2/v2CombatConstants";
import { actionInterval } from "@/adventure/v2/combat/combatTimeline";
import { damageBetween } from "@/adventure/v2/combat/combatShared";
import { SURFACE_INSET } from "@/components/ui/surfaces";

export type CombatMatchupRatings = {
  accuracyRating: number;
  evasionRating: number;
  speed?: number;
  physicalDefense?: number;
  magicDefense?: number;
  magicBarrierAbsorbPct?: number;
  magicBarrierEfficiencyPct?: number;
  magicBarrierDurability?: number;
  incomingAttack?: number;
  incomingAttackType?: "physical" | "magic";
  magicPenetration?: number;
  /** 중독 등 최대 HP 비례 지속 피해 성분에만 적용하는 콘텐츠 배율. */
  maxHpDamageMult?: number;
  /** 중독·출혈 등 상태 피해 전체에 마지막으로 적용하는 경감률. */
  statusDamageReductionPct?: number;
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
  const incomingAttack = Math.max(0, Math.floor(enemy.incomingAttack ?? 0));
  const defenseForIncomingAttack =
    incomingAttackType === "magic"
      ? (player.magicDefense ?? 0)
      : (player.physicalDefense ?? 0);
  const playerDefenseReductionPct = hasDefensePreview
    ? clampPct(
        ruleset === "pvp" && incomingAttack > 0
            ? 100 *
              (1 -
                damageBetween(
                  incomingAttack,
                  defenseForIncomingAttack,
                ) /
                  incomingAttack)
            : incomingAttackType === "magic"
              ? magicDefenseDamageReductionPct(
                  player.magicDefense ?? 0,
                  enemy.magicPenetration,
                )
              : physicalDefenseDamageReductionPct(
                  player.physicalDefense ?? 0,
                ),
      )
    : 0;
  const incomingDamage = incomingAttack;
  const barrierDurability = Math.max(0, player.magicBarrierDurability ?? 0);
  const playerBarrierAbsorbPct =
    barrierDurability > 0 && incomingDamage > 0
      ? clampPct(player.magicBarrierAbsorbPct ?? 0)
      : 0;
  const barrierPartition = partitionWithMagicBarrier(
    incomingDamage,
    barrierDurability,
    playerBarrierAbsorbPct,
    player.magicBarrierEfficiencyPct ?? 0,
  );
  const mitigatedBodyDamage =
    barrierPartition.bodyRawDamage *
    (1 - playerDefenseReductionPct / 100) *
    (1 - playerEvasionReductionPct / 100);
  const playerDirectDamageRetainedPct = hasDefensePreview
    ? incomingDamage > 0
      ? (100 * (mitigatedBodyDamage + barrierPartition.spillDamage)) /
        incomingDamage
      : 0
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
  const maxHpDamageMult = Math.max(0, enemy.maxHpDamageMult ?? 1);
  const statusDamageReductionPct = clampPct(
    enemy.statusDamageReductionPct ?? 0,
  );
  const hasStatusDamagePreview =
    enemy.maxHpDamageMult != null ||
    enemy.statusDamageReductionPct != null;

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
                {" "}· 방어 전 피해에서 {fmtPct(result.playerBarrierAbsorbPct)} 분리
                {player.magicBarrierDurability != null &&
                  ` (남은 ${Math.round(player.magicBarrierDurability).toLocaleString()})`}
              </>
            )}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            마나 채널에는 방어·회피가 적용되지 않고, 몸통 피해에 방어·회피 적용 후 넘친 피해를 합칩니다. 현재 상대의 일반 직접 공격 기준입니다.
          </p>
        </div>
      )}
      {hasStatusDamagePreview && (
        <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              지속 피해 보정
            </span>
            <span className="text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300">
              최대 HP 비례 성분 {fmtPct(maxHpDamageMult * 100)}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            상태 피해 {fmtPct(statusDamageReductionPct)} 경감 · 중독은 스택·적 최대 HP·내 공격력 상한을 먼저 계산합니다.
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
