"use client";

// 협동 보스 기여 보상 테이블 — 소환 정보(목록)·토벌 중(상세) 공용.
// 보상 개편(2026-06-26): 보상은 SP 열매뿐. 도달한 각 보상 티어(GOLD/EPIC/LEGEND)를 독립
//   굴림 → 통과 시 1개(LEGEND 달성 시 최대 3개). 티어별 수령 확률을 표로. myDamage 전달 시
//   내 현재 티어 강조 + 다음 티어까지 남은 데미지 안내(때리는 중 동기부여).

import {
  COOP_SP_FRUIT_CHANCE,
  COOP_TIER_LABEL,
  COOP_TIER_ORDER,
  COOP_TIER_THRESHOLDS,
  COOP_UNIQUE_CHANCE,
  coopBossDurationLabel,
  coopSpFruitMaxAt,
  coopTierForRatio,
  type CoopBossKind,
  type CoopRewardTier,
} from "@/adventure/data/v2/coopBosses";
import { SP_FRUIT, fruitTierForBoss } from "@/adventure/data/v2/spFruit";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";

// 보상 캡션 — 무엇을 주나(SP 열매 이름·효과 + 보스 전용 유니크 트로피). 인라인/모달 공용.
export function CoopRewardCaptions({ kind }: { kind: CoopBossKind }) {
  const fruitTier = fruitTierForBoss(kind.id);
  const fruit = fruitTier != null ? SP_FRUIT[fruitTier] : null;
  const uniqueNames = kind.uniqueIds
    .map((id) => V2_EQUIPMENT[id]?.name)
    .filter((n): n is string => Boolean(n));
  return (
    <div className="space-y-1.5">
      {fruit && (
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          보상 ·{" "}
          <span className="font-medium text-amber-700 dark:text-amber-300">
            {fruit.name}
          </span>{" "}
          <span className="text-zinc-400 dark:text-zinc-500">
            (사용 시 SP 최대치 +{fruit.spPerUse})
          </span>
        </p>
      )}
      {uniqueNames.length > 0 && (
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          트로피 ·{" "}
          <span className="font-medium text-violet-700 dark:text-violet-300">
            {uniqueNames.join(" · ")}
          </span>{" "}
          <span className="text-zinc-400 dark:text-zinc-500">
            (보스 전용 유니크 {uniqueNames.length}종 · EPIC+ 랜덤 1개)
          </span>
        </p>
      )}
    </div>
  );
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function requiredDamage(kind: CoopBossKind, tier: CoopRewardTier): number {
  return Math.ceil(COOP_TIER_THRESHOLDS[tier] * kind.sharedMaxHp);
}

function rewardDropList(kind: CoopBossKind, tier: CoopRewardTier): string {
  const fruitTier = fruitTierForBoss(kind.id);
  const fruit = fruitTier != null ? SP_FRUIT[fruitTier] : null;
  const uniqueNames = kind.uniqueIds
    .map((id) => V2_EQUIPMENT[id]?.name)
    .filter((n): n is string => Boolean(n));
  const fruitChance = COOP_SP_FRUIT_CHANCE[tier];
  const uniqueChance = COOP_UNIQUE_CHANCE[tier];
  const drops: string[] = [];

  if (fruitChance > 0) {
    drops.push(`${fruit?.name ?? "SP 열매"} (${pct(fruitChance)})`);
  }
  if (uniqueChance > 0 && uniqueNames.length > 0) {
    drops.push(`보스 유니크 (${pct(uniqueChance)})`);
  }
  return drops.length > 0 ? drops.join(", ") : "드랍 없음";
}

export function CoopContributionCriteria({ kind }: { kind: CoopBossKind }) {
  return (
    <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-300">
      <p>
        기여도는{" "}
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          내 누적 데미지 ÷ 보스 최대 HP
        </span>
        로 계산합니다. 보스가 처치되었을 때 도달한 가장 높은 티어 기준으로 보상을
        받을 수 있습니다.
      </p>
      <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse text-left">
          <thead className="bg-zinc-100 text-[11px] text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            <tr>
              <th className="border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
                티어
              </th>
              <th className="border-b border-zinc-200 px-2 py-1.5 text-right dark:border-zinc-800">
                비율
              </th>
              <th className="border-b border-zinc-200 px-2 py-1.5 text-right dark:border-zinc-800">
                필요 데미지
              </th>
            </tr>
          </thead>
          <tbody>
            {COOP_TIER_ORDER.map((tier, index) => (
              <tr
                key={tier}
                className={
                  index % 2 === 0
                    ? "bg-white dark:bg-zinc-950"
                    : "bg-zinc-50 dark:bg-zinc-900"
                }
              >
                <td className="border-t border-zinc-100 px-2 py-1.5 font-semibold dark:border-zinc-800">
                  {COOP_TIER_LABEL[tier]}
                </td>
                <td className="border-t border-zinc-100 px-2 py-1.5 text-right font-mono dark:border-zinc-800">
                  {pct(COOP_TIER_THRESHOLDS[tier])}+
                </td>
                <td className="border-t border-zinc-100 px-2 py-1.5 text-right font-mono dark:border-zinc-800">
                  {requiredDamage(kind, tier).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-zinc-500 dark:text-zinc-400">
        GOLD 이상부터 SP 열매를 굴리고, EPIC 이상부터 보스 유니크를 별도로
        굴립니다.
      </p>
    </div>
  );
}

export function CoopRewardTable({
  kind,
  myDamage,
  hideCaptions,
}: {
  kind: CoopBossKind;
  /** 내 누적 기여 — 전달 시 현재 티어 강조 + 다음 티어 진행 안내. */
  myDamage?: number;
  /** 보상 캡션(무엇을 주나)을 인라인에서 숨김 — 상세 화면은 모달 버튼으로 대체. 기본 표시. */
  hideCaptions?: boolean;
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
  // 이 보스의 SP 열매 등급(산악→I·협곡→II·호수→III).
  const fruitTier = fruitTierForBoss(kind.id);
  const fruit = fruitTier != null ? SP_FRUIT[fruitTier] : null;
  const duration = coopBossDurationLabel(kind);
  return (
    <div className="space-y-1.5">
      {/* 보상 캡션(무엇을 주나) — 상세 화면(hideCaptions)은 모달로 빼고, 목록은 인라인 유지. */}
      {!hideCaptions && <CoopRewardCaptions kind={kind} />}
      <div className="overflow-x-auto rounded-md border border-zinc-300 bg-zinc-900 dark:border-zinc-700">
        <table className="min-w-[620px] w-full border-collapse text-center text-xs leading-tight text-zinc-100">
          <thead>
            <tr className="bg-zinc-800">
              <th
                colSpan={3}
                className="border border-zinc-700 px-2 py-1.5 font-semibold"
              >
                소환조건
              </th>
              <th className="border border-zinc-700 px-2 py-1.5 font-semibold">
                소환서 {kind.scrollCost}장
              </th>
              <th className="border border-zinc-700 px-2 py-1.5 font-semibold">
                제한시간
              </th>
            </tr>
            <tr className="bg-zinc-800">
              <th className="w-20 border border-zinc-700 px-2 py-1.5 font-semibold">
                이름
              </th>
              <th className="w-24 border border-zinc-700 px-2 py-1.5 font-semibold">
                체력
              </th>
              <th className="w-28 border border-zinc-700 px-2 py-1.5 font-semibold">
                요구딜
              </th>
              <th className="border border-zinc-700 px-2 py-1.5 font-semibold">
                Droplist
              </th>
              <th className="w-20 border border-zinc-700 px-2 py-1.5 font-semibold">
                {duration}
              </th>
            </tr>
          </thead>
          <tbody>
            {COOP_TIER_ORDER.map((tier, index) => {
              const mine = myTier === tier;
              const rowClass = mine
                ? "bg-amber-500/20 text-amber-100"
                : index % 2 === 0
                  ? "bg-zinc-900"
                  : "bg-zinc-800/80";
              return (
                <tr key={tier} className={rowClass}>
                  {index === 0 && (
                    <>
                      <td
                        rowSpan={COOP_TIER_ORDER.length}
                        className="border border-zinc-700 px-2 py-2 font-semibold align-middle"
                      >
                        {kind.name}
                      </td>
                      <td
                        rowSpan={COOP_TIER_ORDER.length}
                        className="border border-zinc-700 px-2 py-2 font-mono font-semibold align-middle"
                      >
                        {kind.sharedMaxHp.toLocaleString()}
                      </td>
                    </>
                  )}
                  <td className="border border-zinc-700 px-2 py-1.5 align-middle">
                    <span className="block font-mono">
                      {requiredDamage(kind, tier).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {COOP_TIER_LABEL[tier]} · {pct(COOP_TIER_THRESHOLDS[tier])}
                      +
                    </span>
                    {mine && (
                      <span className="ml-1 rounded bg-amber-400 px-1 text-[10px] font-semibold text-zinc-950">
                        현재
                      </span>
                    )}
                  </td>
                  <td className="border border-zinc-700 px-2 py-1.5 align-middle">
                    {rewardDropList(kind, tier)}
                  </td>
                  {index === 0 && (
                    <td
                      rowSpan={COOP_TIER_ORDER.length}
                      className="border border-zinc-700 px-2 py-2 font-semibold align-middle"
                    >
                      {duration}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {myDamage != null && nextTier && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
      {myTier && coopSpFruitMaxAt(myTier) > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          현재 티어 보상 — 토벌 성공 시 {fruit?.name ?? "SP 열매"} 최대{" "}
          {coopSpFruitMaxAt(myTier)}개 (각 단계 확률 독립 굴림)
        </p>
      )}
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        기여 기준 = 내 누적 데미지 ÷ 보스 최대 HP. GOLD 이상 도달 티어를 독립 굴림 —
        통과 시 {fruit?.name ?? "SP 열매"} 1개. LEGEND 달성 시 최대 3개.
      </p>
    </div>
  );
}
