import { kstDayKey } from "@/lib/kst";
import type { Monster } from "@/adventure/data/monsters/types";
import type { ReplayPayload } from "./replayPayload";

export const CHUSEOK_EVENT_ID = "chuseok-2026";
export const CHUSEOK_ATTENDANCE_REWARDS = [5, 5, 10, 10, 15, 15, 20] as const;
export const CHUSEOK_DAILY_ATTACKS = 3;
export const CHUSEOK_CLEAR_REWARD = 15;
export const CHUSEOK_LUCKY_BAG_IMAGE = "/images/monster/v2/chuseok-lucky-bag.webp";
export type ChuseokWindow = { startsAt: number; endsAt: number };

export function chuseokWindow(start: string | undefined): ChuseokWindow | null {
  if (!start || !/(Z|[+-]\d{2}:\d{2})$/.test(start)) return null;
  const startsAt = Date.parse(start);
  if (!Number.isFinite(startsAt)) return null;
  return { startsAt, endsAt: startsAt + 10 * 24 * 60 * 60 * 1000 };
}

export function chuseokPhase(window: ChuseokWindow | null, now: number) {
  if (!window || now < window.startsAt) return "pending" as const;
  return now < window.endsAt ? "active" as const : "ended" as const;
}

export function chuseokAttendance(days: readonly string[], window: ChuseokWindow | null, now: number) {
  const todayKey = kstDayKey(new Date(now));
  const claimedCount = days.length;
  const claimedToday = days.includes(todayKey);
  const complete = claimedCount >= CHUSEOK_ATTENDANCE_REWARDS.length;
  return {
    todayKey, claimedCount, claimedToday, complete,
    canClaim: chuseokPhase(window, now) === "active" && !claimedToday && !complete,
    nextReward: CHUSEOK_ATTENDANCE_REWARDS[claimedCount] ?? null,
  };
}

export function chuseokMaxHp(stage: number) {
  return stage <= 1 ? 100_000_000 : (stage - 1) * 500_000_000;
}

export const CHUSEOK_LUCKY_BAG: Monster = {
  name: "추석 복주머니", tags: [], hp: 100_000_000,
  image: CHUSEOK_LUCKY_BAG_IMAGE,
  atk: 1, def: 10, magicDef: 10, spd: 1, exp: 0,
};

export type ChuseokState = {
  ok: true;
  window: ChuseokWindow | null;
  phase: ReturnType<typeof chuseokPhase>;
  attendance: ReturnType<typeof chuseokAttendance>;
  raid: { stage: number; hp: number; maxHp: number; myDamage: number; attacksRemaining: number; participantCount: number };
};

export type ChuseokAttackResult = {
  ok: true;
  damageDealt: number;
  stagesCleared: number;
  stage: number;
  hp: number;
  maxHp: number;
  replay: ReplayPayload;
};
