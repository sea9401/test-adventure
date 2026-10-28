import { kstDayKey } from "@/lib/kst";
import {
  EMBLEM_BOX_ITEM_ID,
  ENCHANT_SCROLL_ITEM_ID,
  MUSEUN_CASH_ITEMS,
  type MuseunCosmeticBoxItemId,
} from "./museunCashItems";

export const MONTHLY_ATTENDANCE_SAVE_KEY = "monthly-attendance.v1";
export const MONTHLY_ATTENDANCE_FIRST_DAY_SUPPORT_DAYS = 15;
export const MONTHLY_ATTENDANCE_BONUS_SUPPORT_DAYS = 7;

type MonthlyAttendanceBaseReward =
  | { kind: "adventure_support"; days: number }
  | { kind: "stamina_potion"; count: number }
  | { kind: "boss_summon_scroll"; count: number }
  | { kind: "mastery_certificate"; count: number }
  | { kind: "torn_map_fragment"; count: number }
  | { kind: "coop_coin"; count: number }
  | { kind: "enchant_scroll"; count: number };

export type MonthlyAttendanceReward = MonthlyAttendanceBaseReward & {
  cosmeticBox?: MuseunCosmeticBoxItemId;
  adventureSupportDays?: number;
  enchantScrolls?: number;
  emblemBoxes?: number;
};

/** 2026년 10월까지 쓰던 출석판. 월간 모험 지원권과 꾸미기 상자가 들어 있다. */
export const LEGACY_MONTHLY_ATTENDANCE_REWARDS = [
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
    days: MONTHLY_ATTENDANCE_BONUS_SUPPORT_DAYS,
    cosmeticBox: "chat_badge_box",
  },
  { kind: "coop_coin", count: 25 },
  { kind: "stamina_potion", count: 2 },
  { kind: "boss_summon_scroll", count: 2 },
  { kind: "stamina_potion", count: 2 },
  { kind: "torn_map_fragment", count: 5 },
  { kind: "stamina_potion", count: 2 },
  {
    kind: "mastery_certificate",
    count: 300,
    adventureSupportDays: MONTHLY_ATTENDANCE_BONUS_SUPPORT_DAYS,
  },
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

/** 2026년 11월부터의 출석판. 지원권·꾸미기 상자 대신 마법부여서와 문장 상자를 준다. */
export const MONTHLY_ATTENDANCE_REWARDS: readonly MonthlyAttendanceReward[] =
  LEGACY_MONTHLY_ATTENDANCE_REWARDS.map((reward, index) => {
    switch (index + 1) {
      case 1:
      case 14:
        return { kind: "enchant_scroll", count: 1 };
      case 7:
        return { kind: "stamina_potion", count: 2, emblemBoxes: 1 };
      case 21:
        return { kind: "mastery_certificate", count: 300 };
      case 28:
        return {
          kind: "mastery_certificate",
          count: 500,
          enchantScrolls: 1,
          emblemBoxes: 1,
        };
      default:
        return reward;
    }
  });

const MONTHLY_ATTENDANCE_REWARDS_START_MONTH = "2026-11";

export const SEPTEMBER_2026_ATTENDANCE_REWARDS: readonly MonthlyAttendanceReward[] =
  LEGACY_MONTHLY_ATTENDANCE_REWARDS.map((reward, index) => {
    switch (index + 1) {
      case 1:
        return { kind: "adventure_support", days: 7 };
      case 7:
        return { kind: "stamina_potion", count: 2 };
      case 8:
        return { kind: "boss_summon_scroll", count: 10 };
      case 11:
        return { kind: "torn_map_fragment", count: 5 };
      case 14:
        return { kind: "stamina_potion", count: 3 };
      case 17:
        return { kind: "boss_summon_scroll", count: 15 };
      case 19:
        return { kind: "torn_map_fragment", count: 10 };
      case 21:
        return { kind: "mastery_certificate", count: 500 };
      case 24:
        return { kind: "boss_summon_scroll", count: 20 };
      case 28:
        return { kind: "mastery_certificate", count: 1_500 };
      default:
        return reward;
    }
  });

export function monthlyAttendanceRewardsForMonth(
  monthKey: string,
): readonly MonthlyAttendanceReward[] {
  if (monthKey === "2026-09") return SEPTEMBER_2026_ATTENDANCE_REWARDS;
  return monthKey < MONTHLY_ATTENDANCE_REWARDS_START_MONTH
    ? LEGACY_MONTHLY_ATTENDANCE_REWARDS
    : MONTHLY_ATTENDANCE_REWARDS;
}

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
    .slice(0, monthlyAttendanceRewardsForMonth(monthKey).length);
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
  const complete =
    claimedCount >= monthlyAttendanceRewardsForMonth(state.monthKey).length;
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
  const extras: string[] = [];
  if (reward.kind !== "adventure_support" && reward.adventureSupportDays) {
    extras.push(`월간 모험 지원권 ${reward.adventureSupportDays}일`);
  }
  if (reward.cosmeticBox) {
    extras.push(MUSEUN_CASH_ITEMS[reward.cosmeticBox].name);
  }
  if (reward.enchantScrolls) {
    extras.push(enchantScrollLabel(reward.enchantScrolls));
  }
  if (reward.emblemBoxes) {
    extras.push(`${MUSEUN_CASH_ITEMS[EMBLEM_BOX_ITEM_ID].name} ${reward.emblemBoxes}개`);
  }
  return [baseLabel, ...extras].join(" · ");
}

function enchantScrollLabel(count: number): string {
  return `${MUSEUN_CASH_ITEMS[ENCHANT_SCROLL_ITEM_ID].name} ${count}장`;
}

/** 출석 보상 중 가방(cashItems)으로 들어가는 마법부여서·문장 상자 수량. */
export function monthlyAttendanceCashItemGrants(
  reward: MonthlyAttendanceReward,
): Partial<Record<typeof ENCHANT_SCROLL_ITEM_ID | typeof EMBLEM_BOX_ITEM_ID, number>> {
  const enchantScrolls =
    (reward.kind === "enchant_scroll" ? reward.count : 0) +
    (reward.enchantScrolls ?? 0);
  const emblemBoxes = reward.emblemBoxes ?? 0;
  return {
    ...(enchantScrolls > 0 ? { [ENCHANT_SCROLL_ITEM_ID]: enchantScrolls } : {}),
    ...(emblemBoxes > 0 ? { [EMBLEM_BOX_ITEM_ID]: emblemBoxes } : {}),
  };
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
    case "enchant_scroll":
      return enchantScrollLabel(reward.count);
  }
}
