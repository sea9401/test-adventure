"use client";

// 협동 보스 기여 보상 테이블 — 소환 정보(목록)·토벌 중(상세) 공용.
// 보상 개편(2026-06-26): 보상은 SP 열매뿐. 도달한 각 보상 티어(GOLD/EPIC/LEGEND)를 독립
//   굴림 → 통과 시 1개(LEGEND 달성 시 최대 3개). 티어별 수령 확률을 표로. myDamage 전달 시
//   내 현재 티어 강조 + 다음 티어까지 남은 데미지 안내(때리는 중 동기부여).

import { Fragment, type ReactNode } from "react";
import {
  COOP_SP_FRUIT_CHANCE,
  COOP_TIER_LABEL,
  COOP_TIER_ORDER,
  COOP_TIER_THRESHOLDS,
  COOP_UNIQUE_CHANCE,
  coopSpFruitMaxAt,
  coopTierForRatio,
  type CoopBossKind,
} from "@/adventure/data/v2/coopBosses";
import { SP_FRUIT, fruitTierForBoss } from "@/adventure/data/v2/spFruit";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";

// key 있는 Fragment — grid 셀 3개를 행 래퍼 없이 흘리기 위한 래퍼.
function FragmentRow({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}

// 보상 캡션 — 무엇을 주나(SP 열매 이름·효과 + 보스 전용 유니크 트로피·확률). 인라인/모달 공용.
export function CoopRewardCaptions({ kind }: { kind: CoopBossKind }) {
  const fruitTier = fruitTierForBoss(kind.id);
  const fruit = fruitTier != null ? SP_FRUIT[fruitTier] : null;
  const uniqueNames = kind.uniqueIds
    .map((id) => V2_EQUIPMENT[id]?.name)
    .filter((n): n is string => Boolean(n));
  return (
    <div className="space-y-1.5">
      {fruit && (
        <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
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
        <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
          트로피 ·{" "}
          <span className="font-medium text-violet-700 dark:text-violet-300">
            {uniqueNames.join(" · ")}
          </span>{" "}
          <span className="text-zinc-400 dark:text-zinc-500">
            (보스 전용 유니크 {uniqueNames.length}종 · EPIC{" "}
            {Math.round(COOP_UNIQUE_CHANCE.epic * 100)}% · LEGEND{" "}
            {Math.round(COOP_UNIQUE_CHANCE.legend * 100)}% · 랜덤 1개)
          </span>
        </p>
      )}
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
  return (
    <div className="space-y-1.5">
      {/* 보상 캡션(무엇을 주나) — 상세 화면(hideCaptions)은 모달로 빼고, 목록은 인라인 유지. */}
      {!hideCaptions && <CoopRewardCaptions kind={kind} />}
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[11px]">
        <span className="font-medium text-zinc-500 dark:text-zinc-400">
          티어
        </span>
        <span className="text-right font-medium text-zinc-500 dark:text-zinc-400">
          기여 기준
        </span>
        <span className="text-right font-medium text-zinc-500 dark:text-zinc-400">
          SP 열매
        </span>
        {COOP_TIER_ORDER.map((t) => {
          const mine = myTier === t;
          const chance = COOP_SP_FRUIT_CHANCE[t];
          const cell = mine
            ? "bg-amber-50 font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            : "text-zinc-700 dark:text-zinc-300";
          // 외부 grid(3열)에 셀을 직접 흘림 — 행 래퍼 없음(subgrid 회피).
          return (
            <FragmentRow key={t}>
              <span className={`rounded-l px-1 py-0.5 ${cell}`}>
                {COOP_TIER_LABEL[t]}
                {mine && " ← 현재"}
              </span>
              <span className={`px-1 py-0.5 text-right font-mono ${cell}`}>
                {Math.round(COOP_TIER_THRESHOLDS[t] * 100)}%+
              </span>
              <span
                className={`rounded-r px-1 py-0.5 text-right font-mono ${cell}`}
              >
                {chance > 0 ? `${Math.round(chance * 100)}%` : "—"}
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
      {myTier && coopSpFruitMaxAt(myTier) > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          현재 티어 보상 — 토벌 성공 시 {fruit?.name ?? "SP 열매"} 최대{" "}
          {coopSpFruitMaxAt(myTier)}개 (각 단계 확률 독립 굴림)
        </p>
      )}
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        기여 기준 = 내 누적 데미지 ÷ 보스 최대 HP. 도달한 각 티어를 독립 굴림 —
        통과 시 {fruit?.name ?? "SP 열매"} 1개. LEGEND 달성 시 최대 3개.
      </p>
    </div>
  );
}
