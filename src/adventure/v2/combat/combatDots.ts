import { PLAYER_BLEED_ATK_COEF_PER_STACK, BLEED_MAX_STACKS, POISON_CAP_ATK_COEF, POISON_FULL_BUILD_DAMAGE_MULT, POISON_MAX_STACKS } from "@/adventure/data/v2/v2CombatConstants";
import { distributeBoostedHits } from "./hitDistribution";

// 대상 행동마다 피해 적용 후 turns -= 1. 같은 tag는 스택 누적 및 지속시간 갱신.
export type V2DotTag = "bleed" | "poison" | "burn";
export type V2Dot = {
  tag: V2DotTag;
  label: string;
  stacks: number;
  maxStacks: number;
  turns: number;
  flatPerStack: number;
  atkCoefPerStack: number;
  pctMaxHpPerStack: number;
  sourceAtk: number;
  /** 플레이어 맹독처럼 상한 계산 뒤 최종 DoT 피해에 적용하는 배율. 미지정은 1. */
  finalDamageMult?: number;
};
export type V2DotList = readonly V2Dot[];

// 플레이어 중독은 완성 세팅(+122.4%)의 기존 피해를 기준점으로 고정한다.
// 먼저 기존 완성 세팅과 같은 파라미터로 상한까지 계산하고, 실제 맹독 투자 배율을
// 기준점(2.224) 대비 최종 배율로 적용해 고체력 대상에서도 투자량이 선형으로 반영된다.
export function applyPlayerPoisonDamageScaling(
  dots: readonly V2Dot[],
  poisonDamagePct = 0,
): V2Dot[] {
  const actualMult = 1 + Math.max(0, poisonDamagePct) / 100;
  const finalDamageMult = actualMult / POISON_FULL_BUILD_DAMAGE_MULT;
  return dots.map((dot) =>
    dot.tag === "poison"
      ? {
          ...dot,
          flatPerStack:
            dot.flatPerStack * POISON_FULL_BUILD_DAMAGE_MULT,
          atkCoefPerStack:
            dot.atkCoefPerStack * POISON_FULL_BUILD_DAMAGE_MULT,
          pctMaxHpPerStack:
            dot.pctMaxHpPerStack * POISON_FULL_BUILD_DAMAGE_MULT,
          finalDamageMult:
            (dot.finalDamageMult ?? 1) * finalDamageMult,
        }
      : dot,
  );
}

// 모든 v2 DoT 의 1틱 피해 = floor(스택 수 × 스택당 피해) (음수 클램프). 갈래 A(리스트 dot,
// stacks=1)와 갈래 B(출혈·독공 스택 풀)가 공유하는 단일 공식. 스택당 피해의 구성(정액 vs
// 정액+독공%HP)은 출처별로 다르며 호출부에서 합성한다.
//   floor — 평타 데미지(v2DamageAmount)와 동일하게 정수로 떨어뜨린다. ATK 계수(0.08)·%최대HP
//   비례라 곱이 소수로 나오는데, 그대로 HP·로그에 들어가면 "출혈 12.84 피해"처럼 지저분해진다.
//   곱을 floor(스택당이 아니라) — 원시값에 가장 충실(예 3×8.96=26.88 → 26).
export function dotTickDamage(stacks: number, perStack: number): number {
  return Math.max(0, Math.floor(stacks * perStack));
}

export function v2DotPerStackDamage(
  dot: V2Dot,
  targetMaxHp: number,
  maxHpDamageMult = 1,
): number {
  const hpComponent =
    dot.pctMaxHpPerStack > 0
      ? Math.min(
          targetMaxHp * dot.pctMaxHpPerStack,
          dot.sourceAtk * POISON_CAP_ATK_COEF,
        )
      : 0;
  return (
    dot.flatPerStack +
    dot.sourceAtk * dot.atkCoefPerStack +
    hpComponent * Math.max(0, maxHpDamageMult)
  ) * Math.max(0, dot.finalDamageMult ?? 1);
}

// tick: dot 들 turns -1 + 총 dmg 합산. turns 0 도달 dot drop.
// turns +0 시드 정책 — applyV2DotsToTarget 가 그대로 박음 (cd/buff 의 +1 시드와 다름).
// 이유: dot 은 tick 시점에 즉시 dmg 적용 + turns-1. buff 는 tick 후 turns > 0 이어야 active.
export function tickV2Dots(
  dots: V2DotList,
  targetMaxHp = 0,
  maxHpDamageMult = 1,
): { nextDots: V2Dot[]; totalDmg: number; ticks: V2DotTick[] } {
  const nextDots: V2Dot[] = [];
  const ticks: V2DotTick[] = [];
  let totalDmg = 0;
  for (const d of dots) {
    if (d.turns <= 0) continue;
    const damage = dotTickDamage(
      d.stacks,
      v2DotPerStackDamage(d, targetMaxHp, maxHpDamageMult),
    );
    totalDmg += damage;
    if (damage > 0) {
      ticks.push({ tag: d.tag, label: d.label, damage });
    }
    if (d.turns > 1) nextDots.push({ ...d, turns: d.turns - 1 });
    // turns === 1 → drop (이번 turn 이 마지막 적용).
  }
  return { nextDots, totalDmg, ticks };
}

export type V2DotTick = Pick<V2Dot, "tag" | "label"> & {
  damage: number;
};

// DoT 로그용 타격 분배. 엔진은 취약·PvP 보정을 여러 DoT의 총합에 한 번
// 적용하므로, 표시할 때만 원본 피해 비율로 다시 나눈다. 반환 합은 반드시 totalDamage와
// 같아 HP 차감값과 로그 합계가 어긋나지 않는다.
export function distributeV2DotTicks(
  ticks: readonly V2DotTick[],
  totalDamage: number,
): V2DotTick[] {
  const distributed = distributeBoostedHits(
    ticks.map((tick) => tick.damage),
    totalDamage,
  );
  return ticks
    .map((tick, index) => ({ ...tick, damage: distributed[index] ?? 0 }))
    .filter((tick) => tick.damage > 0);
}

export function v2DotLogLabel(tick: Pick<V2DotTick, "tag" | "label">): string {
  // 전투 문장에서는 효과명 "연소"보다 상태명 "화상"이 자연스럽다.
  return tick.tag === "burn" ? "화상" : tick.label;
}

export function v2DotLogCause(tick: Pick<V2DotTick, "tag" | "label">): string {
  const label = v2DotLogLabel(tick);
  // 받침 ㄹ 뒤에는 "으로"가 아닌 "로"를 쓴다: 출혈로 / 중독으로 / 화상으로.
  return `${label}${tick.tag === "bleed" ? "로" : "으로"}`;
}

export function makeBleedDot(args: {
  stacks?: number;
  turns?: number;
  flatPerStack: number;
  atkCoefPerStack?: number;
  sourceAtk: number;
}): V2Dot {
  return {
    tag: "bleed",
    label: "출혈",
    stacks: args.stacks ?? 1,
    maxStacks: BLEED_MAX_STACKS,
    turns: args.turns ?? 3,
    flatPerStack: args.flatPerStack,
    atkCoefPerStack:
      args.atkCoefPerStack ?? PLAYER_BLEED_ATK_COEF_PER_STACK,
    pctMaxHpPerStack: 0,
    sourceAtk: args.sourceAtk,
  };
}

export function makePoisonDot(args: {
  stacks?: number;
  turns?: number;
  pctMaxHpPerStack: number;
  sourceAtk: number;
}): V2Dot {
  return {
    tag: "poison",
    label: "중독",
    stacks: args.stacks ?? 1,
    maxStacks: POISON_MAX_STACKS,
    turns: args.turns ?? 3,
    flatPerStack: 0,
    atkCoefPerStack: 0,
    pctMaxHpPerStack: args.pctMaxHpPerStack,
    sourceAtk: args.sourceAtk,
  };
}

// target 의 dot 목록 갱신. 같은 tag 가 들어오면 스택 누적 + refresh, 새 tag 는 append.
// turns 는 그대로 박는다 — tick 시점에 즉시 dmg 적용 + turns-1 패턴이라 cd 의 +1 시드 패턴과 다름.
// 의도: N=3 → 3번 tick 마다 dmg 적용.
export function applyV2DotsToTarget(
  current: V2DotList,
  toApply: ReadonlyArray<V2Dot>,
): V2Dot[] {
  if (toApply.length === 0) return [...current];
  const byTag = new Map<V2DotTag, V2Dot>(current.map((d) => [d.tag, d]));
  for (const a of toApply) {
    const prev = byTag.get(a.tag);
    byTag.set(a.tag, {
      ...a,
      stacks: Math.min(a.maxStacks, (prev?.stacks ?? 0) + a.stacks),
    });
  }
  return Array.from(byTag.values());
}

export type BleedChangeIntent = {
  stacksToAdd: number;
  setTurns?: number;
  extendTurns?: number;
  maxTurns?: number;
  reason: "refresh" | "extend";
};

export function bleedChangeLogText(
  change: Pick<BleedChangeIntent, "reason">,
  resultingTurns: number,
): string {
  return change.reason === "refresh"
    ? `출혈 지속이 ${resultingTurns}회로 갱신됐다.`
    : `출혈 지속이 ${resultingTurns}회로 늘어났다.`;
}

/** 출혈 사냥은 기존 출혈의 출처 계수를 건드리지 않고 스택과 남은 횟수만 바꾼다. */
export function applyBleedChangeToDots(
  current: V2DotList,
  change: BleedChangeIntent | undefined,
): V2Dot[] {
  if (!change) return [...current];
  return current.map((dot) => {
    if (dot.tag !== "bleed" || dot.turns <= 0) return dot;
    const setTurns =
      change.setTurns == null
        ? dot.turns
        : Math.max(dot.turns, Math.max(0, Math.floor(change.setTurns)));
    const extendedTurns =
      setTurns + Math.max(0, Math.floor(change.extendTurns ?? 0));
    const turns =
      change.maxTurns == null
        ? extendedTurns
        : Math.min(
            Math.max(0, Math.floor(change.maxTurns)),
            extendedTurns,
          );
    return {
      ...dot,
      stacks: Math.min(
        BLEED_MAX_STACKS,
        dot.maxStacks,
        Math.max(0, dot.stacks + Math.floor(change.stacksToAdd)),
      ),
      turns,
    };
  });
}
