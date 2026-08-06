import {
  attackMissPct,
  pveDodgeChance,
  pvpAttackMissPct,
  pvpDodgeChance,
} from "@/adventure/data/v2/v2CombatConstants";
import { actionInterval } from "@/adventure/v2/combat/combatTimeline";
import { SURFACE_INSET } from "@/components/ui/surfaces";

export type CombatMatchupRatings = {
  accuracyRating: number;
  evasionRating: number;
  speed?: number;
};

export type CombatMatchupResult = {
  playerHitPct: number;
  playerDodgePct: number;
  enemyHitPct: number;
};

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function combatMatchupResult(
  player: CombatMatchupRatings,
  enemy: CombatMatchupRatings,
  ruleset: "pve" | "pvp" = "pve",
): CombatMatchupResult {
  const playerDodgePct = clampPct(
    ruleset === "pve"
      ? pveDodgeChance(player.evasionRating, enemy.accuracyRating)
      : pvpDodgeChance(player.evasionRating, enemy.accuracyRating),
  );
  return {
    playerHitPct: clampPct(
      100 - (ruleset === "pvp"
        ? pvpAttackMissPct(enemy.evasionRating, player.accuracyRating)
        : attackMissPct(enemy.evasionRating, player.accuracyRating)),
    ),
    playerDodgePct,
    enemyHitPct: clampPct(100 - playerDodgePct),
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
 * 원본 명중·회피 능력과 상대를 반영한 최종 확률을 한 자리에서 구분해 보여준다.
 * 전투 화면과 협동 보스 화면이 같은 계산과 용어를 사용하도록 하는 공용 표시 컴포넌트다.
 */
export function CombatMatchupSummary({
  player,
  enemy,
  enemyLabel = "적",
  heading = "명중·회피 예상",
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
            내 적중률
          </div>
          <div className="text-base font-semibold tabular-nums text-sky-600 dark:text-sky-400">
            {fmtPct(result.playerHitPct)}
          </div>
          <div className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            내 명중 능력 {fmtRating(player.accuracyRating)} · {enemyLabel} 회피
            능력 {fmtRating(enemy.evasionRating)}
          </div>
        </div>
        <div className="pl-3">
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              내 회피율
            </span>
            <span className="text-[10px] tabular-nums text-rose-600 dark:text-rose-400">
              {enemyLabel} 적중률 {fmtPct(result.enemyHitPct)}
            </span>
          </div>
          <div className="text-base font-semibold tabular-nums text-cyan-600 dark:text-cyan-400">
            {fmtPct(result.playerDodgePct)}
          </div>
          <div className="mt-0.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            내 회피 능력 {fmtRating(player.evasionRating)} · {enemyLabel} 명중
            능력 {fmtRating(enemy.accuracyRating)}
          </div>
        </div>
      </div>
      {actionRatio && (
        <div className="mt-2 border-t border-zinc-200 pt-1.5 text-center text-[10px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          행동 비율 · {actionRatio}
        </div>
      )}
      <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        능력 수치는 확률이 아니며, 양쪽 능력을 계산한 위 값이 실제 확률입니다.
      </p>
    </section>
  );
}
