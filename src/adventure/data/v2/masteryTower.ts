import type { Monster } from "@/adventure/data/monsters/types";
import type { V2SkillId } from "./v2Skills";

export const MASTERY_TOWER_SAVE_KEY = "mastery-tower.v1";
export const MASTERY_CERTIFICATE_KEY = "masteryCertificates";

export const MASTERY_TOWER_MAX_FLOOR = 30;

export const MASTERY_TOWER_MILESTONES = [
  { floor: 10, bonus: 100 },
  { floor: 20, bonus: 200 },
  { floor: 30, bonus: 300 },
] as const;

export type MasteryTowerState = {
  date: string;
  todayBestFloor: number;
  claimed: boolean;
  lifetimeBestFloor: number;
  firstClearRewardsClaimed: number[];
};

export type MasteryTowerLogEntry = {
  kind: "info" | "player" | "enemy" | "success" | "fail" | "reward";
  text: string;
};

export function kstDateKey(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function masteryTowerFloorReward(floor: number): number {
  const f = clampFloor(floor);
  if (f <= 10) return f * 30;
  if (f <= 20) return 300 + (f - 10) * 45;
  return 750 + (f - 20) * 60;
}

export function masteryTowerRequiredPower(floor: number): number {
  const f = clampFloor(floor);
  if (f <= 0) return 0;
  if (f <= 10) return 45 + f * 10;
  if (f <= 20) return 145 + (f - 10) * 24;
  return 385 + (f - 20) * 55;
}

export type MasteryTowerGuardianPreview = {
  name: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  accuracy: number;
  evasionPct: number;
  atkType: "physical" | "magic";
  critPct: number;
  bonusAttackChancePct: number;
  skills: string[];
};

export function masteryTowerGuardianForFloor(floor: number): Monster {
  const f = clampFloor(floor);
  const power = masteryTowerRequiredPower(f);
  const phase =
    f >= 25 ? "심층" : f >= 17 ? "상층" : f >= 9 ? "중층" : "하층";
  const magicFloor = f >= 10 && f % 3 === 1;
  const skills = towerGuardianSkills(f);
  return {
    name: `${phase} 수호자`,
    tags: ["golem", "spirit"],
    hp: Math.round(260 + power * 7.5 + f * f * 6),
    atk: Math.round(18 + power * 0.72 + f * 2),
    def: Math.round(8 + power * 0.42 + f * 1.4),
    spd: Math.round(55 + f * 7),
    accuracy: Math.min(85, Math.round(f * 2 + (f >= 16 ? 15 : 0))),
    evasionPct: f >= 12 ? Math.min(28, Math.round((f - 10) * 1.4)) : 0,
    element: "neutral",
    atkType: magicFloor ? "magic" : "physical",
    critPct: f >= 8 ? Math.min(35, Math.round(f + 2)) : 0,
    critMult: f >= 8 ? 1.5 + Math.min(0.45, f / 100) : undefined,
    exp: 0,
    drops: [],
    armorVulnerable: f >= 20 ? 0.22 : f >= 10 ? 0.12 : 0,
    playerDefVulnerable: f >= 15 ? Math.min(0.32, 0.08 + (f - 15) * 0.012) : 0,
    bonusAttackChancePct:
      f >= 18 ? Math.min(100, Math.round((f - 17) * 7)) : 0,
    ...(skills.length
      ? {
          v2Skills: {
            learned: skills,
            equipped: skills,
          },
          v2MaxMp: f >= 24 ? 140 : f >= 16 ? 100 : 60,
        }
      : {}),
  };
}

export function masteryTowerGuardianPreview(
  floor: number,
): MasteryTowerGuardianPreview {
  const guardian = masteryTowerGuardianForFloor(floor);
  return {
    name: guardian.name,
    hp: guardian.hp,
    atk: guardian.atk,
    def: guardian.def,
    spd: guardian.spd,
    accuracy: guardian.accuracy ?? 0,
    evasionPct: guardian.evasionPct ?? 0,
    atkType: guardian.atkType ?? "physical",
    critPct: guardian.critPct ?? 0,
    bonusAttackChancePct: guardian.bonusAttackChancePct ?? 0,
    skills: guardian.v2Skills?.equipped ?? [],
  };
}

function towerGuardianSkills(floor: number): V2SkillId[] {
  const f = clampFloor(floor);
  if (f < 8) return [];
  if (f < 15) {
    return [statusSkillForFloor(f)];
  }
  if (f < 23) {
    return [
      f % 2 === 0 ? "mob_crushing_blow" : "mob_arcane_bolt",
      statusSkillForFloor(f),
    ];
  }
  return [
    f % 3 === 0 ? "mob_arcane_nova" : "mob_arcane_burst",
    f % 2 === 0 ? "mob_savage_roar" : "mob_crushing_blow",
    statusSkillForFloor(f),
  ];
}

function statusSkillForFloor(floor: number): V2SkillId {
  const cycle = floor % 3;
  if (cycle === 0) return "mob_rending_claw";
  if (cycle === 1) return "mob_chilling_touch";
  return "mob_venom_bite";
}

export function parseMasteryTowerState(
  raw: unknown,
  date: string = kstDateKey(),
): MasteryTowerState {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const savedDate = typeof obj.date === "string" ? obj.date : date;
  const claimedFloors = Array.isArray(obj.firstClearRewardsClaimed)
    ? obj.firstClearRewardsClaimed
        .map((v) => Math.floor(Number(v)))
        .filter((v) =>
          MASTERY_TOWER_MILESTONES.some((milestone) => milestone.floor === v),
        )
    : [];
  const base: MasteryTowerState = {
    date: savedDate,
    todayBestFloor: clampFloor(obj.todayBestFloor),
    claimed: obj.claimed === true,
    lifetimeBestFloor: clampFloor(obj.lifetimeBestFloor),
    firstClearRewardsClaimed: [...new Set(claimedFloors)].sort((a, b) => a - b),
  };
  if (base.date !== date) {
    return {
      ...base,
      date,
      todayBestFloor: 0,
      claimed: false,
    };
  }
  return base;
}

export function masteryTowerClaimPreview(
  state: MasteryTowerState,
): {
  base: number;
  firstClearBonus: number;
  total: number;
  newlyClaimedMilestones: number[];
} {
  if (state.claimed || state.todayBestFloor <= 0) {
    return { base: 0, firstClearBonus: 0, total: 0, newlyClaimedMilestones: [] };
  }
  const claimed = new Set(state.firstClearRewardsClaimed);
  const newlyClaimedMilestones = MASTERY_TOWER_MILESTONES.filter(
    (m) => state.todayBestFloor >= m.floor && !claimed.has(m.floor),
  );
  const base = masteryTowerFloorReward(state.todayBestFloor);
  const firstClearBonus = newlyClaimedMilestones.reduce(
    (sum, m) => sum + m.bonus,
    0,
  );
  return {
    base,
    firstClearBonus,
    total: base + firstClearBonus,
    newlyClaimedMilestones: newlyClaimedMilestones.map((m) => m.floor),
  };
}

export function clearMasteryTowerFloor(
  state: MasteryTowerState,
  floor: number,
): MasteryTowerState {
  const cleared = clampFloor(floor);
  return {
    ...state,
    todayBestFloor: Math.max(state.todayBestFloor, cleared),
    lifetimeBestFloor: Math.max(state.lifetimeBestFloor, cleared),
  };
}

export function masteryTowerAttemptLog({
  floor,
  success,
  tower,
  claimPreview,
  turns,
  playerHp,
  playerMaxHp,
  enemyHp,
  enemyMaxHp,
}: {
  floor: number | null;
  success: boolean;
  tower: MasteryTowerState;
  claimPreview: ReturnType<typeof masteryTowerClaimPreview>;
  turns?: number;
  playerHp?: number;
  playerMaxHp?: number;
  enemyHp?: number;
  enemyMaxHp?: number;
}): MasteryTowerLogEntry[] {
  if (floor == null) {
    return [
      {
        kind: "success",
        text: `오늘 가능한 최고층(${MASTERY_TOWER_MAX_FLOOR}층)에 도달했습니다.`,
      },
    ];
  }

  const playerHpText =
    playerHp != null && playerMaxHp != null
      ? `${fmt(playerHp)} / ${fmt(playerMaxHp)}`
      : "-";
  const enemyHpText =
    enemyHp != null && enemyMaxHp != null
      ? `${fmt(enemyHp)} / ${fmt(enemyMaxHp)}`
      : "-";
  const lines: MasteryTowerLogEntry[] = [
    { kind: "info", text: `숙련의 탑 ${floor}층 수호자와 전투` },
    {
      kind: "player",
      text: `전투 종료: ${fmt(turns ?? 0)}턴 · 내 HP ${playerHpText}`,
    },
  ];

  if (success) {
    lines.push(
      {
        kind: "enemy",
        text: `수호자 HP ${enemyHpText}`,
      },
      {
        kind: "success",
        text: `${floor}층 돌파 · 오늘 최고층 ${tower.todayBestFloor}층`,
      },
    );
    if (claimPreview.total > 0) {
      lines.push({
        kind: "reward",
        text: `[보상] 현재 수령 가능 숙련 증서 ${fmt(claimPreview.total)}`,
      });
    }
  } else {
    lines.push(
      {
        kind: "enemy",
        text: `수호자 잔여 HP ${enemyHpText}`,
      },
      { kind: "fail", text: `${floor}층 실패` },
    );
  }

  return lines;
}

function clampFloor(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MASTERY_TOWER_MAX_FLOOR, n));
}

function fmt(value: number): string {
  return Math.floor(value).toLocaleString("ko-KR");
}
