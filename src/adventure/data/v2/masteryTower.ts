import type { Monster } from "@/adventure/data/monsters/types";
import { kstWeekMondayKey } from "@/lib/kst";
import type { V2SkillId } from "./v2Skills";

export const MASTERY_TOWER_SAVE_KEY = "mastery-tower.v1";
export const MASTERY_CERTIFICATE_KEY = "masteryCertificates";

export const MASTERY_TOWER_MAX_FLOOR = 100;
export const MASTERY_TOWER_REWARD_MAX_FLOOR = 50;
export const MASTERY_TOWER_REENTRY_COOLDOWN_MS = 30_000;
export const MASTERY_TOWER_DAILY_ENTRY_STAMINA_COST = 200;

export const MASTERY_TOWER_MILESTONES = [
  { floor: 10, bonus: 100 },
  { floor: 20, bonus: 200 },
  { floor: 30, bonus: 300 },
  { floor: 40, bonus: 400 },
  { floor: 50, bonus: 500 },
] as const;

export type MasteryTowerState = {
  date: string;
  todayBestFloor: number;
  runFloor: number;
  claimed: boolean;
  lifetimeBestFloor: number;
  firstClearRewardsClaimed: number[];
  weekStartedAt?: string;
  weekBestFloor?: number;
  /** 오늘 첫 실제 전투에서 입장 스태미나를 이미 지불했는지 여부. */
  entryStaminaPaid?: boolean;
  cooldownUntil?: number;
};

export type MasteryTowerClaimPreview = {
  base: number;
  firstClearBonus: number;
  total: number;
  newlyClaimedMilestones: number[];
};

export type MasteryTowerRolloverReward = MasteryTowerClaimPreview & {
  previousDate: string;
  previousBestFloor: number;
};

export type MasteryTowerLogEntry = {
  kind: "info" | "player" | "enemy" | "success" | "fail" | "reward";
  text: string;
};

export function kstDateKey(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function masteryTowerFloorReward(floor: number): number {
  const f = Math.min(clampFloor(floor), MASTERY_TOWER_REWARD_MAX_FLOOR);
  if (f <= 10) return f * 20;
  if (f <= 20) return 200 + (f - 10) * 30;
  if (f <= 30) return 500 + (f - 20) * 45;
  if (f <= 40) return 950 + (f - 30) * 60;
  return 1550 + (f - 40) * 85;
}

export function masteryTowerRequiredPower(floor: number): number {
  const f = clampFloor(floor);
  if (f <= 0) return 0;
  if (f <= 10) return 90 + f * 30;
  if (f <= 20) return 390 + (f - 10) * 81;
  if (f <= 50) return 1200 + (f - 20) * 130;
  return (
    Math.round(
      (5_100 * Math.pow(105_000 / 5_100, (f - 50) / 50)) / 10,
    ) * 10
  );
}

export type MasteryTowerGuardianPreview = {
  name: string;
  gimmickName: string | null;
  gimmickDescription: string | null;
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
    f >= 40 ? "최심층" : f >= 25 ? "심층" : f >= 17 ? "상층" : f >= 9 ? "중층" : "하층";
  const boss = towerGuardianBossGimmick(f);
  const magicFloor = f >= 10 && (f % 3 === 1 || f === 40 || f === 50);
  const skills = towerGuardianSkills(f);
  return {
    name: boss?.name ?? `${phase} 수호자`,
    tags: ["golem", "spirit"],
    hp: Math.round((260 + power * 7.5 + f * f * 6) * (boss?.hpMult ?? 1)),
    atk: Math.round((18 + power * 0.72 + f * 2) * (boss?.atkMult ?? 1)),
    def: Math.round((8 + power * 0.42 + f * 1.4) * (boss?.defMult ?? 1)),
    spd: Math.round((55 + f * 7) * (boss?.spdMult ?? 1)),
    directActionSpd: true,
    accuracy: Math.min(
      92,
      Math.round(f * 2 + (f >= 16 ? 15 : 0) + (boss?.accuracyBonus ?? 0)),
    ),
    evasionPct: f >= 12 ? Math.min(28, Math.round((f - 10) * 1.4)) : 0,
    element: "neutral",
    atkType: magicFloor ? "magic" : "physical",
    critPct:
      f >= 8 ? Math.min(55, Math.round(f + 2 + (boss?.critBonus ?? 0))) : 0,
    critMult: f >= 8 ? 1.5 + Math.min(0.6, f / 100) : undefined,
    exp: 0,
    drops: [],
    armorVulnerable:
      boss?.armorVulnerable ?? (f >= 20 ? 0.22 : f >= 10 ? 0.12 : 0),
    playerDefVulnerable:
      boss?.playerDefVulnerable ??
      (f >= 15 ? Math.min(0.32, 0.08 + (f - 15) * 0.012) : 0),
    bonusAttackChancePct:
      boss?.bonusAttackChancePct ??
      (f >= 18 ? Math.min(100, Math.round((f - 17) * 7)) : 0),
    ...(skills.length
      ? {
          v2Skills: {
            learned: skills,
            equipped: skills,
          },
          v2MaxMp:
            boss?.v2MaxMp ?? (f >= 40 ? 220 : f >= 24 ? 140 : f >= 16 ? 100 : 60),
        }
      : {}),
  };
}

export function masteryTowerGuardianPreview(
  floor: number,
): MasteryTowerGuardianPreview {
  const guardian = masteryTowerGuardianForFloor(floor);
  const boss = towerGuardianBossGimmick(floor);
  return {
    name: guardian.name,
    gimmickName: boss?.gimmickName ?? null,
    gimmickDescription: boss?.gimmickDescription ?? null,
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
  if (f === 50 || f === 100) {
    return [
      "mob_arcane_nova",
      "mob_savage_roar",
      "mob_crushing_blow",
      "mob_chilling_touch",
    ];
  }
  if (f === 90) {
    return ["mob_crushing_blow", "mob_rending_claw", "mob_savage_roar"];
  }
  if (f === 80) {
    return ["mob_savage_roar", "mob_crushing_blow", "mob_chilling_touch"];
  }
  if (f === 70) {
    return ["mob_arcane_nova", "mob_chilling_touch", "mob_venom_bite"];
  }
  if (f === 60) {
    return ["mob_crushing_blow", "mob_savage_roar", "mob_rending_claw"];
  }
  if (f === 40) {
    return ["mob_arcane_burst", "mob_chilling_touch", "mob_venom_bite"];
  }
  if (f === 30) {
    return ["mob_crushing_blow", "mob_savage_roar", "mob_rending_claw"];
  }
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

function towerGuardianBossGimmick(floor: number):
  | {
      name: string;
      gimmickName: string;
      gimmickDescription: string;
      hpMult?: number;
      atkMult?: number;
      defMult?: number;
      spdMult?: number;
      accuracyBonus?: number;
      critBonus?: number;
      armorVulnerable?: number;
      playerDefVulnerable?: number;
      bonusAttackChancePct?: number;
      v2MaxMp?: number;
    }
  | null {
  const f = clampFloor(floor);
  if (f === 100) {
    return {
      name: "탑의 초월자",
      gimmickName: "초월의 시험",
      gimmickDescription:
        "물리와 마법, 상태 이상과 연속 공격을 모두 견뎌야 하는 탑의 최종 시험입니다.",
      hpMult: 1.8,
      atkMult: 1.55,
      defMult: 1.35,
      spdMult: 1.4,
      accuracyBonus: 30,
      critBonus: 22,
      bonusAttackChancePct: 500,
      v2MaxMp: 600,
    };
  }
  if (f === 90) {
    return {
      name: "불멸의 문지기",
      gimmickName: "불멸의 성벽",
      gimmickDescription:
        "압도적인 체력과 방어를 80턴 안에 돌파해야 하는 지속 화력 시험입니다.",
      hpMult: 1.75,
      atkMult: 1.15,
      defMult: 1.65,
      accuracyBonus: 15,
      critBonus: 8,
      bonusAttackChancePct: 180,
    };
  }
  if (f === 80) {
    return {
      name: "추격의 환영",
      gimmickName: "끝없는 추격",
      gimmickDescription:
        "높은 속도와 명중, 반복 행동으로 느리거나 명중이 낮은 도전자를 압박합니다.",
      hpMult: 1.3,
      atkMult: 1.3,
      defMult: 1.1,
      spdMult: 1.35,
      accuracyBonus: 22,
      critBonus: 15,
      bonusAttackChancePct: 320,
    };
  }
  if (f === 70) {
    return {
      name: "비전 재판관",
      gimmickName: "비전 판결",
      gimmickDescription:
        "비전 폭발과 한기, 독으로 장기전의 마법 방어와 상태 대응을 시험합니다.",
      hpMult: 1.25,
      atkMult: 1.25,
      defMult: 1.1,
      spdMult: 1.15,
      accuracyBonus: 14,
      critBonus: 10,
      bonusAttackChancePct: 240,
    };
  }
  if (f === 60) {
    return {
      name: "심연의 처형자",
      gimmickName: "처형 연격",
      gimmickDescription:
        "강한 물리 공격과 치명타, 출혈 연격으로 단기 생존력을 시험합니다.",
      hpMult: 1.2,
      atkMult: 1.3,
      defMult: 1.05,
      spdMult: 1.1,
      accuracyBonus: 10,
      critBonus: 12,
      bonusAttackChancePct: 200,
    };
  }
  if (f === 30) {
    return {
      name: "탑의 숙련자",
      gimmickName: "집중 방패",
      gimmickDescription:
        "높은 방어와 분쇄 일격으로 정면 화력을 시험합니다. 관통과 강한 단일 화력이 유리합니다.",
      defMult: 1.25,
      armorVulnerable: 0.3,
      playerDefVulnerable: 0.34,
      bonusAttackChancePct: 120,
    };
  }
  if (f === 40) {
    return {
      name: "침묵의 교관",
      gimmickName: "침묵 압박",
      gimmickDescription:
        "마법 공격, 한기, 독으로 긴 교전을 압박합니다. 마법방어와 생존력이 중요합니다.",
      hpMult: 1.08,
      atkMult: 1.08,
      accuracyBonus: 8,
      critBonus: 4,
      playerDefVulnerable: 0.22,
      bonusAttackChancePct: 180,
      v2MaxMp: 220,
    };
  }
  if (f === 50) {
    return {
      name: "정점의 대련자",
      gimmickName: "삼중 시험",
      gimmickDescription:
        "비전 폭발, 포효, 분쇄, 한기를 모두 사용합니다. 화력, 생존, 템포 중 하나라도 약하면 전투가 길어집니다.",
      hpMult: 1.12,
      atkMult: 1.12,
      defMult: 1.08,
      spdMult: 1.1,
      accuracyBonus: 12,
      critBonus: 8,
      armorVulnerable: 0.28,
      playerDefVulnerable: 0.28,
      bonusAttackChancePct: 260,
      v2MaxMp: 300,
    };
  }
  return null;
}

export function parseMasteryTowerState(
  raw: unknown,
  date: string = kstDateKey(),
  weekStartedAt: string = masteryTowerWeekStartKey(date),
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
    runFloor: clampFloor(obj.runFloor ?? obj.todayBestFloor),
    claimed: obj.claimed === true,
    lifetimeBestFloor: clampFloor(obj.lifetimeBestFloor),
    firstClearRewardsClaimed: [...new Set(claimedFloors)].sort((a, b) => a - b),
    weekStartedAt,
    weekBestFloor:
      obj.weekStartedAt === weekStartedAt ? clampFloor(obj.weekBestFloor) : 0,
    entryStaminaPaid: obj.entryStaminaPaid === true,
    ...(typeof obj.cooldownUntil === "number" && Number.isFinite(obj.cooldownUntil)
      ? { cooldownUntil: Math.max(0, Math.floor(obj.cooldownUntil)) }
      : {}),
  };
  if (base.date !== date) {
    return {
      date,
      todayBestFloor: 0,
      runFloor: 0,
      claimed: false,
      lifetimeBestFloor: base.lifetimeBestFloor,
      firstClearRewardsClaimed: base.firstClearRewardsClaimed,
      weekStartedAt: base.weekStartedAt,
      weekBestFloor: base.weekBestFloor,
      entryStaminaPaid: false,
    };
  }
  return base;
}

export function masteryTowerEntryStaminaCost(state: MasteryTowerState): number {
  return state.entryStaminaPaid === true
    ? 0
    : MASTERY_TOWER_DAILY_ENTRY_STAMINA_COST;
}

export function markMasteryTowerEntryStaminaPaid(
  state: MasteryTowerState,
): MasteryTowerState {
  return { ...state, entryStaminaPaid: true };
}

export function masteryTowerClaimPreview(
  state: MasteryTowerState,
): MasteryTowerClaimPreview {
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

/**
 * KST 날짜가 바뀐 저장 상태를 오늘 상태로 넘기면서 전날 미수령 보상을 분리한다.
 * 실제 인벤토리 지급은 서버 트랜잭션 헬퍼가 이 결과를 사용해 처리한다.
 */
export function rolloverMasteryTowerState(
  raw: unknown,
  date: string = kstDateKey(),
  weekStartedAt: string = masteryTowerWeekStartKey(date),
): {
  tower: MasteryTowerState;
  rolledOver: boolean;
  reward: MasteryTowerRolloverReward | null;
} {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const savedDate = typeof obj.date === "string" ? obj.date : date;
  const dateChanged = savedDate !== date;
  const weekChanged = obj.weekStartedAt !== weekStartedAt;
  const previous = parseMasteryTowerState(raw, savedDate, weekStartedAt);
  if (!dateChanged && !weekChanged) {
    return { tower: previous, rolledOver: false, reward: null };
  }

  const preview = dateChanged
    ? masteryTowerClaimPreview(previous)
    : { base: 0, firstClearBonus: 0, total: 0, newlyClaimedMilestones: [] };
  const reward =
    preview.total > 0
      ? {
          ...preview,
          previousDate: previous.date,
          previousBestFloor: previous.todayBestFloor,
        }
      : null;
  const firstClearRewardsClaimed = reward
    ? [
        ...new Set([
          ...previous.firstClearRewardsClaimed,
          ...reward.newlyClaimedMilestones,
        ]),
      ].sort((a, b) => a - b)
    : previous.firstClearRewardsClaimed;

  return {
    tower: dateChanged
      ? resetMasteryTowerDailyProgress(
          { ...previous, firstClearRewardsClaimed },
          date,
        )
      : { ...previous, firstClearRewardsClaimed },
    rolledOver: true,
    reward,
  };
}

export function clearMasteryTowerFloor(
  state: MasteryTowerState,
  floor: number,
): MasteryTowerState {
  const cleared = clampFloor(floor);
  return {
    ...withoutMasteryTowerCooldown(state),
    runFloor: Math.max(state.runFloor, cleared),
    todayBestFloor: Math.max(state.todayBestFloor, cleared),
    lifetimeBestFloor: Math.max(state.lifetimeBestFloor, cleared),
    weekBestFloor: Math.max(state.weekBestFloor ?? 0, cleared),
  };
}

export function masteryTowerCheckpointStartFloor(
  state: MasteryTowerState,
): number | null {
  const checkpointFloor = Math.min(
    Math.floor(clampFloor(state.weekBestFloor ?? 0) / 10) * 10,
    MASTERY_TOWER_MAX_FLOOR - 10,
  );
  return checkpointFloor >= 10 ? checkpointFloor + 1 : null;
}

export function masteryTowerStartFloors(state: MasteryTowerState): number[] {
  if (state.runFloor > 0) return [];
  const checkpointStartFloor = masteryTowerCheckpointStartFloor(state);
  return checkpointStartFloor === null ? [1] : [1, checkpointStartFloor];
}

export function masteryTowerNextFloor(state: MasteryTowerState): number {
  return Math.min(state.runFloor + 1, MASTERY_TOWER_MAX_FLOOR);
}

export function resolveMasteryTowerAttemptFloor(
  state: MasteryTowerState,
  requestedStartFloor?: number,
):
  | { ok: true; floor: number }
  | { ok: false; error: "invalid_start_floor" } {
  if (state.runFloor > 0) {
    return requestedStartFloor === undefined
      ? {
          ok: true,
          floor: masteryTowerNextFloor(state),
        }
      : { ok: false, error: "invalid_start_floor" };
  }
  const floor = requestedStartFloor ?? 1;
  return Number.isInteger(floor) && masteryTowerStartFloors(state).includes(floor)
    ? { ok: true, floor }
    : { ok: false, error: "invalid_start_floor" };
}

export function resetMasteryTowerDailyProgress(
  state: MasteryTowerState,
  date: string = state.date,
): MasteryTowerState {
  return {
    ...withoutMasteryTowerCooldown(state),
    date,
    todayBestFloor: 0,
    runFloor: 0,
    claimed: false,
    entryStaminaPaid: false,
  };
}

export function failMasteryTowerRun(
  state: MasteryTowerState,
  now: number = Date.now(),
): MasteryTowerState {
  return {
    ...state,
    runFloor:
      state.runFloor >= MASTERY_TOWER_MAX_FLOOR
        ? MASTERY_TOWER_MAX_FLOOR
        : 0,
    cooldownUntil: now + MASTERY_TOWER_REENTRY_COOLDOWN_MS,
  };
}

export function masteryTowerAttemptLog({
  floor,
  success,
  practice = false,
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
  practice?: boolean;
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
        text: practice
          ? `${floor}층 연습 승리 · 최고층 기록 및 보상 변동 없음`
          : `${floor}층 돌파 · 오늘 최고층 ${tower.todayBestFloor}층`,
      },
    );
    if (!practice && claimPreview.total > 0) {
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
      {
        kind: "fail",
        text: practice
          ? `${floor}층 연습 실패 · 최고층 기록 유지`
          : `${floor}층 실패`,
      },
    );
  }

  return lines;
}

function clampFloor(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MASTERY_TOWER_MAX_FLOOR, n));
}

function masteryTowerWeekStartKey(date: string): string {
  const atKstMidnight = new Date(`${date}T00:00:00+09:00`);
  return Number.isNaN(atKstMidnight.getTime())
    ? kstWeekMondayKey()
    : kstWeekMondayKey(atKstMidnight);
}

function withoutMasteryTowerCooldown(
  state: MasteryTowerState,
): MasteryTowerState {
  const next = { ...state };
  delete next.cooldownUntil;
  return next;
}

function fmt(value: number): string {
  return Math.floor(value).toLocaleString("ko-KR");
}
