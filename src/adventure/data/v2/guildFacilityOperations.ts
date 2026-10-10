import type { GuildFacilityExpandedId } from "./settlement";

// 길드 시설 운영 실적 — Lv.6~10 업그레이드의 진행 속도를 묶는 조건.
// 길드원이 시설을 실제로 이용할 때만 쌓이고 미리 비축할 수 없다(설계 2026-10-10).
export const GUILD_FACILITY_OPERATIONS_WEEKLY_CAP = 100;
export const GUILD_FACILITY_OPERATIONS_MIN_LEVEL = 5;

const REQUIRED_BY_TARGET_LEVEL: Record<number, number> = {
  6: 200,
  7: 250,
  8: 300,
  9: 350,
  10: 400,
};

export function guildFacilityOperationsRequired(targetLevel: number): number {
  return REQUIRED_BY_TARGET_LEVEL[targetLevel] ?? 0;
}

export type GuildFacilityOperationsState = {
  targetLevel: number;
  points: number;
  weekKey: string;
  weekPoints: number;
};

export type GuildFacilityOperationsView = {
  targetLevel: number;
  points: number;
  required: number;
  weekPoints: number;
  weeklyCap: number;
};

function nonNegativeInt(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

// 저장값을 현재 시설 레벨과 주차에 맞춘다. 목표 레벨이 바뀌면 점수는 0부터 다시
// 쌓고, 같은 주의 적립량은 유지해 업그레이드 직후에도 주간 상한을 넘지 않는다.
export function normalizeGuildFacilityOperationsState(
  raw: Partial<GuildFacilityOperationsState> | null,
  args: { currentLevel: number; weekKey: string },
): GuildFacilityOperationsState {
  const targetLevel = Math.max(1, Math.floor(args.currentLevel)) + 1;
  const sameTarget = raw?.targetLevel === targetLevel;
  const sameWeek = raw?.weekKey === args.weekKey;
  return {
    targetLevel,
    points: sameTarget ? nonNegativeInt(raw?.points) : 0,
    weekKey: args.weekKey,
    weekPoints: sameWeek ? nonNegativeInt(raw?.weekPoints) : 0,
  };
}

export function accrueGuildFacilityOperationsState(
  state: GuildFacilityOperationsState,
  amount: number,
  args: { currentLevel: number; maxLevel: number },
): { state: GuildFacilityOperationsState; accrued: number } {
  const required = guildFacilityOperationsRequired(state.targetLevel);
  if (
    args.currentLevel < GUILD_FACILITY_OPERATIONS_MIN_LEVEL ||
    args.currentLevel >= args.maxLevel ||
    required <= 0
  ) {
    return { state, accrued: 0 };
  }
  const accrued = Math.max(
    0,
    Math.min(
      nonNegativeInt(amount),
      GUILD_FACILITY_OPERATIONS_WEEKLY_CAP - state.weekPoints,
      required - state.points,
    ),
  );
  if (accrued === 0) return { state, accrued };
  return {
    state: {
      ...state,
      points: state.points + accrued,
      weekPoints: state.weekPoints + accrued,
    },
    accrued,
  };
}

export function guildFacilityOperationsComplete(
  state: GuildFacilityOperationsState,
): boolean {
  const required = guildFacilityOperationsRequired(state.targetLevel);
  return required > 0 && state.points >= required;
}

export function guildFacilityOperationsView(
  state: GuildFacilityOperationsState,
): GuildFacilityOperationsView {
  return {
    targetLevel: state.targetLevel,
    points: state.points,
    required: guildFacilityOperationsRequired(state.targetLevel),
    weekPoints: state.weekPoints,
    weeklyCap: GUILD_FACILITY_OPERATIONS_WEEKLY_CAP,
  };
}

const FIXED_POINTS: Record<
  string,
  { buildingId: GuildFacilityExpandedId; points: number }
> = {
  training_drill_claim: { buildingId: "training_ground", points: 1 },
  exploration_expedition_claim: { buildingId: "exploration_hq", points: 8 },
  exploration_weekly_claim: { buildingId: "exploration_hq", points: 3 },
  exploration_event_resolve: { buildingId: "exploration_hq", points: 2 },
  dining_meal: { buildingId: "dining_hall", points: 2 },
  trade_contract_complete: { buildingId: "trade_post", points: 10 },
};

// amount: 식재료 기부 = 공동 준비 점수, 연성 = 사용한 연성력, 납품 = 납품 점수.
const SCALED_POINTS: Record<
  string,
  { buildingId: GuildFacilityExpandedId; divisor: number }
> = {
  dining_ingredient_donation: { buildingId: "dining_hall", divisor: 10 },
  alchemy_craft: { buildingId: "alchemy_workshop", divisor: 1 },
  trade_delivery: { buildingId: "trade_post", divisor: 10 },
};

export function guildFacilityOperationAccrual(
  type: string,
  amount?: number,
): { buildingId: GuildFacilityExpandedId; points: number } | null {
  const fixed = FIXED_POINTS[type];
  if (fixed) return { ...fixed };
  const scaled = SCALED_POINTS[type];
  if (!scaled) return null;
  const points = Math.floor(nonNegativeInt(amount) / scaled.divisor);
  return points > 0 ? { buildingId: scaled.buildingId, points } : null;
}
