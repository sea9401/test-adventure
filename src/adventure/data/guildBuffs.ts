import type { GuildGrade } from "./guildQuests";

// 길드 버프 — 길드 fameAvailable 을 소비해 켜는 영구 효과.
// 슬롯 수는 길드 등급에서 결정 (F·E=1, D·C=2, B·A=3, S=4).
// 같은 종류는 한 슬롯만, 슬롯 간 효과는 곱셈으로 누적.

export type GuildBuffId =
  | "exp_boost"
  | "train_speed"
  | "drop_boost"
  | "fame_boost"
  | "boss_attempt";

export type GuildBuffTier = 1 | 2 | 3 | 4 | 5;

// 효과 타입 — 곱셈 4종 + 보스 쿨다운 감소 1종.
// exp/drop/fame_mult: multiplier ≥ 1 (1.01~1.05). train_speed_mult: multiplier ≤ 1
// (0.97~0.85 — 훈련 소요시간에 곱한다). boss_cooldown_reduction_pct: 정수 % (10~50).
export type GuildBuffEffect =
  | { kind: "exp_mult"; value: number }
  | { kind: "train_speed_mult"; value: number }
  | { kind: "drop_mult"; value: number }
  | { kind: "fame_mult"; value: number }
  | { kind: "boss_cooldown_reduction_pct"; value: number };

export type GuildBuffTierDef = {
  tier: GuildBuffTier;
  // 현재 티어로 가는 신규/업글 비용 (fameAvailable 소비).
  installCost: number;
  // 누적 합 — 다운그레이드/해제 시 50% 환급 계산용.
  cumulativeCost: number;
  effect: GuildBuffEffect;
};

export type GuildBuffDef = {
  id: GuildBuffId;
  name: string;
  description: string;
  tiers: GuildBuffTierDef[];
};

// 슬롯 한 칸에 저장되는 형 — DB JSONB 와 동일 구조.
export type GuildBuffSlot = {
  buffId: GuildBuffId;
  tier: GuildBuffTier;
  installedAt: string;
};

// 비용 곡선: T1=2000, +4000, +6000, +8000, +10000 → 누적 2000/6000/12000/20000/30000.
// 한 버프 만렙은 30k 명성 — S급 임계(120k)에서 4개 모두 만렙(120k)이 임계와 맞물려
// 장기 운영 보상으로 남는다.
// 2026-05-22: 증분이 단조 증가하도록 조정(종전 +6000/+6000 으로 T3·T4 비용이 같던 것을
// +6000/+8000/+10000 으로). 증분(installCost) 차감 모델이라 기존 투자분 소급 재청구 없음 —
// 미래 업그레이드 비용만 상승. (uninstall 50% 환급은 현 cost 테이블 기준이라 기존 T4/T5
// 슬롯의 환급이 미세 증가하나 항상 손실폭이라 비악용.)
const TIER_COSTS = [2000, 4000, 6000, 8000, 10000] as const;
const CUMULATIVE_TIER_COSTS = [2000, 6000, 12000, 20000, 30000] as const;

// 임의 tier(1~5, 범위 밖은 클램프)의 누적 투자 비용 — 더 이상 카탈로그에 없는 버프 슬롯의
// 환급 계산 등에 사용 (정의가 사라진 buffId 라 GUILD_BUFFS 로는 못 찾으므로).
export function cumulativeCostForTier(tier: number): number {
  const i = Math.min(Math.max(Math.trunc(tier), 1), 5) - 1;
  return CUMULATIVE_TIER_COSTS[i];
}

function buildTiers(values: [number, number, number, number, number],
  kind: GuildBuffEffect["kind"]): GuildBuffTierDef[] {
  let cum = 0;
  return values.map((v, i) => {
    cum += TIER_COSTS[i];
    return {
      tier: (i + 1) as GuildBuffTier,
      installCost: TIER_COSTS[i],
      cumulativeCost: cum,
      effect: { kind, value: v } as GuildBuffEffect,
    };
  });
}

export const GUILD_BUFFS: Record<GuildBuffId, GuildBuffDef> = {
  exp_boost: {
    id: "exp_boost",
    name: "사냥경험 결사",
    description: "길드원의 전투 EXP 획득량을 증가시킨다.",
    tiers: buildTiers([1.01, 1.02, 1.03, 1.04, 1.05], "exp_mult"),
  },
  train_speed: {
    id: "train_speed",
    name: "수련 결사",
    description: "훈련장 수련에 걸리는 시간을 단축한다.",
    tiers: buildTiers([0.97, 0.94, 0.91, 0.88, 0.85], "train_speed_mult"),
  },
  drop_boost: {
    id: "drop_boost",
    name: "행운의 별 결사",
    description: "아이템 드랍 확률을 추가로 끌어올린다 (LUK 위에 곱셈).",
    tiers: buildTiers([1.005, 1.01, 1.015, 1.02, 1.025], "drop_mult"),
  },
  fame_boost: {
    id: "fame_boost",
    name: "명성 결사",
    description: "캐릭터가 얻는 개인 명성을 증가시킨다.",
    tiers: buildTiers([1.01, 1.02, 1.03, 1.04, 1.05], "fame_mult"),
  },
  boss_attempt: {
    id: "boss_attempt",
    name: "결의의 깃발",
    description: "보스 도전 누진 쿨다운을 감소시킨다 (10%~50%).",
    tiers: buildTiers([10, 20, 30, 40, 50], "boss_cooldown_reduction_pct"),
  },
};

export const GUILD_BUFF_IDS: GuildBuffId[] = [
  "exp_boost",
  "train_speed",
  "drop_boost",
  "fame_boost",
  "boss_attempt",
];

export function isGuildBuffId(v: unknown): v is GuildBuffId {
  return typeof v === "string" && (GUILD_BUFF_IDS as string[]).includes(v);
}

export function getBuffTier(slot: GuildBuffSlot): GuildBuffTierDef | null {
  const def = GUILD_BUFFS[slot.buffId];
  if (!def) return null;
  return def.tiers[slot.tier - 1] ?? null;
}

// 등급 → 슬롯 한도. G 등급은 슬롯 없음 (Phase A 만 도달 가능).
export function buffSlotsForGrade(grade: GuildGrade): number {
  switch (grade) {
    case "G":
      return 0;
    case "F":
    case "E":
      return 1;
    case "D":
    case "C":
      return 2;
    case "B":
    case "A":
      return 3;
    case "S":
      return 4;
  }
}

// 슬롯들에서 특정 효과 종류의 multiplier/bonus 를 추출.
// 곱셈 효과(exp/gold/drop/fame_mult): 활성 슬롯 effect.value, 없으면 1.0.
// 가산 효과(boss_cooldown_reduction_pct): value(%), 없으면 0.
// 같은 종류 슬롯은 1개만 유효 (install 검증으로 enforce).
export function resolveBuffMultiplier(
  buffs: GuildBuffSlot[],
  kind: GuildBuffEffect["kind"],
): number {
  for (const slot of buffs) {
    const tier = getBuffTier(slot);
    if (!tier) continue;
    if (tier.effect.kind === kind) return tier.effect.value;
  }
  return kind === "boss_cooldown_reduction_pct" ? 0 : 1;
}

// 슬롯 배열의 누적 투자 비용(특정 buffId) — 다운그레이드 환급 계산용.
export function slotInvestedFor(
  buffs: GuildBuffSlot[],
  buffId: GuildBuffId,
): number {
  const slot = buffs.find((s) => s.buffId === buffId);
  if (!slot) return 0;
  return getBuffTier(slot)?.cumulativeCost ?? 0;
}
