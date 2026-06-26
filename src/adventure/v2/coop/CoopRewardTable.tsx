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
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { TITLES } from "@/adventure/data/titles";
import {
  SP_FRUIT,
  SP_FRUIT_DROP_MIN_TIER,
  fruitTierForBoss,
} from "@/adventure/data/v2/spFruit";

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
  // 획득 가능 보상의 실제 이름 — "뭘 얻나"를 구체적으로 표기(확률·티어는 아래 표).
  const uniqueNames = kind.uniqueIds
    .map((id) => V2_EQUIPMENT[id]?.name)
    .filter((n): n is string => Boolean(n));
  const fruitTier = fruitTierForBoss(kind.id);
  const fruit = fruitTier != null ? SP_FRUIT[fruitTier] : null;
  const titleName = TITLES[kind.titleId]?.name ?? null;
  const fruitTierLabel = COOP_TIER_LABEL[SP_FRUIT_DROP_MIN_TIER];
  return (
    <div className="space-y-2">
      {/* 획득 가능 보상 — 구체 아이템(이름). 확률/티어는 아래 표. */}
      <div className="space-y-0.5">
        <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          획득 가능
        </div>
        <ul className="space-y-0.5 text-[11px] text-zinc-700 dark:text-zinc-300">
          <li>
            🪙 <span className="font-medium">골드</span>
            <span className="text-zinc-400 dark:text-zinc-500">
              {" "}
              — 기여 티어까지 누적
            </span>
          </li>
          {uniqueNames.map((n) => (
            <li key={n}>
              ⚔️{" "}
              <span className="font-medium text-amber-700 dark:text-amber-300">
                {n}
              </span>
              <span className="text-zinc-400 dark:text-zinc-500">
                {" "}
                — 보스 전용 유니크 (기여 티어 확률)
              </span>
            </li>
          ))}
          {fruit && (
            <li>
              🍂{" "}
              <span className="font-medium text-amber-700 dark:text-amber-300">
                {fruit.name}
              </span>
              <span className="text-zinc-400 dark:text-zinc-500">
                {" "}
                — {fruitTierLabel} 티어 이상 기여 시 1개 · 사용하면 SP 최대치 +
                {fruit.spPerUse}
              </span>
            </li>
          )}
          {titleName && (
            <li>
              🏅 <span className="font-medium">{titleName}</span>
              <span className="text-zinc-400 dark:text-zinc-500">
                {" "}
                — 첫 토벌 칭호
              </span>
            </li>
          )}
        </ul>
      </div>

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
        지급, 유니크는 도달 티어 확률로 1회 굴림. SP 열매는 {fruitTierLabel} 티어
        이상, 칭호는 첫 토벌 시 지급.
      </p>
    </div>
  );
}
