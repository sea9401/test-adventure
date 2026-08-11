import { kstDayKey } from "@/lib/kst";
import {
  MUSEUN_CASH_ITEMS,
  type MuseunCosmeticBoxItemId,
} from "./museunCashItems";

export const MONTHLY_ATTENDANCE_SAVE_KEY = "monthly-attendance.v1";
export const MONTHLY_ATTENDANCE_FIRST_DAY_SUPPORT_DAYS = 15;

type MonthlyAttendanceBaseReward =
  | { kind: "adventure_support"; days: number }
  | { kind: "stamina_potion"; count: number }
  | { kind: "boss_summon_scroll"; count: number }
  | { kind: "mastery_certificate"; count: number }
  | { kind: "torn_map_fragment"; count: number }
  | { kind: "coop_coin"; count: number };

export type MonthlyAttendanceReward = MonthlyAttendanceBaseReward & {
  cosmeticBox?: MuseunCosmeticBoxItemId;
};

export const MONTHLY_ATTENDANCE_REWARDS = [
  {
    kind: "adventure_support",
    days: MONTHLY_ATTENDANCE_FIRST_DAY_SUPPORT_DAYS,
  },
  { kind: "torn_map_fragment", count: 2 },
  { kind: "stamina_potion", count: 2 },
  { kind: "stamina_potion", count: 2 },
  { kind: "stamina_potion", count: 2 },
  { kind: "coop_coin", count: 20 },
  {
    kind: "stamina_potion",
    count: 2,
    cosmeticBox: "chroma_name_box",
  },
  { kind: "boss_summon_scroll", count: 2 },
  { kind: "stamina_potion", count: 2 },
  { kind: "stamina_potion", count: 2 },
  { kind: "torn_map_fragment", count: 3 },
  { kind: "stamina_potion", count: 2 },
  { kind: "stamina_potion", count: 2 },
  {
    kind: "adventure_support",
    days: 7,
    cosmeticBox: "chat_badge_box",
  },
  { kind: "coop_coin", count: 25 },
  { kind: "stamina_potion", count: 2 },
  { kind: "boss_summon_scroll", count: 2 },
  { kind: "stamina_potion", count: 2 },
  { kind: "torn_map_fragment", count: 5 },
  { kind: "stamina_potion", count: 2 },
  { kind: "mastery_certificate", count: 300 },
  { kind: "coop_coin", count: 35 },
  { kind: "stamina_potion", count: 2 },
  { kind: "boss_summon_scroll", count: 3 },
  { kind: "stamina_potion", count: 2 },
  { kind: "coop_coin", count: 40 },
  { kind: "stamina_potion", count: 3 },
  {
    kind: "mastery_certificate",
    count: 500,
    cosmeticBox: "profile_border_box",
  },
] as const satisfies readonly MonthlyAttendanceReward[];

export type MonthlyAttendanceState = {
  monthKey: string;
  claimedDayKeys: string[];
};

export type MonthlyAttendanceStatus = MonthlyAttendanceState & {
  todayKey: string;
  claimedCount: number;
  claimedToday: boolean;
  complete: boolean;
  canClaim: boolean;
  nextDay: number | null;
};

export function monthlyAttendanceMonthKey(now: Date = new Date()): string {
  return kstDayKey(now).slice(0, 7);
}

export function monthlyAttendanceState(
  raw: unknown,
  now: Date = new Date(),
): MonthlyAttendanceState {
  const monthKey = monthlyAttendanceMonthKey(now);
  if (!raw || typeof raw !== "object") {
    return { monthKey, claimedDayKeys: [] };
  }
  const value = raw as Record<string, unknown>;
  if (value.monthKey !== monthKey || !Array.isArray(value.claimedDayKeys)) {
    return { monthKey, claimedDayKeys: [] };
  }
  const claimedDayKeys = Array.from(
    new Set(
      value.claimedDayKeys.filter(
        (key): key is string =>
          typeof key === "string" &&
          key.startsWith(`${monthKey}-`) &&
          /^\d{4}-\d{2}-\d{2}$/.test(key),
      ),
    ),
  )
    .sort()
    .slice(0, MONTHLY_ATTENDANCE_REWARDS.length);
  return { monthKey, claimedDayKeys };
}

export function monthlyAttendanceStatus(
  raw: unknown,
  now: Date = new Date(),
): MonthlyAttendanceStatus {
  const state = monthlyAttendanceState(raw, now);
  const todayKey = kstDayKey(now);
  const claimedCount = state.claimedDayKeys.length;
  const claimedToday = state.claimedDayKeys.includes(todayKey);
  const complete = claimedCount >= MONTHLY_ATTENDANCE_REWARDS.length;
  return {
    ...state,
    todayKey,
    claimedCount,
    claimedToday,
    complete,
    canClaim: !claimedToday && !complete,
    nextDay: complete ? null : claimedCount + 1,
  };
}

export function monthlyAttendanceRewardLabel(
  reward: MonthlyAttendanceReward,
): string {
  const baseLabel = monthlyAttendanceBaseRewardLabel(reward);
  return reward.cosmeticBox
    ? `${baseLabel} · ${MUSEUN_CASH_ITEMS[reward.cosmeticBox].name}`
    : baseLabel;
}

function monthlyAttendanceBaseRewardLabel(
  reward: MonthlyAttendanceReward,
): string {
  switch (reward.kind) {
    case "adventure_support":
      return `월간 모험 지원권 ${reward.days}일`;
    case "stamina_potion":
      return `스태미나 회복약 ${reward.count}개`;
    case "boss_summon_scroll":
      return `보스 소환서 ${reward.count}장`;
    case "mastery_certificate":
      return `숙련의 증표 ${reward.count.toLocaleString("ko-KR")}개`;
    case "torn_map_fragment":
      return `찢어진 지도 조각 ${reward.count}개`;
    case "coop_coin":
      return `협동 주화 ${reward.count}개`;
  }
}
