export const MASTERY_TOWER_SAVE_KEY = "mastery-tower.v1";
export const MASTERY_CERTIFICATE_KEY = "masteryCertificates";

export const MASTERY_TOWER_MAX_FLOOR = 50;
export const MASTERY_TOWER_REENTRY_COOLDOWN_MS = 30_000;

export const MASTERY_TOWER_MILESTONES = [
  { floor: 10, bonus: 100 },
  { floor: 20, bonus: 200 },
  { floor: 30, bonus: 300 },
  { floor: 40, bonus: 400 },
  { floor: 50, bonus: 500 },
] as const;

export type MasteryTowerBoss = {
  readonly floor: number;
  readonly name: string;
  readonly description: string;
  readonly powerBonusPercent: number;
  readonly gimmick?: {
    readonly name: string;
    readonly description: string;
  };
};

export type MasteryTowerCombatProfile = {
  power: number;
  atk: number;
  magicAtk: number;
  def: number;
  magicDef: number;
  spd: number;
  maxHp: number;
  critResistPct: number;
  evaRating: number;
  accRating: number;
  extraAttackChancePct: number;
};

export type MasteryTowerGimmickCheck = {
  id: string;
  label: string;
  value: number;
  target: number;
  passed: boolean;
};

export type MasteryTowerGimmickResult = {
  name: string;
  description: string;
  checks: MasteryTowerGimmickCheck[];
  penaltyPercent: number;
  hint: string;
};

export const MASTERY_TOWER_BOSSES = [
  {
    floor: 10,
    name: "수련장의 문지기",
    description: "첫 관문을 지키는 경량 보스",
    powerBonusPercent: 8,
  },
  {
    floor: 20,
    name: "비전의 감시자",
    description: "중층 진입을 시험하는 경량 보스",
    powerBonusPercent: 8,
  },
  {
    floor: 30,
    name: "탑의 숙련자",
    description: "상층 진입을 가르는 경량 보스",
    powerBonusPercent: 8,
    gimmick: {
      name: "집중 방패",
      description: "주 공격축이 약하면 방패를 깨지 못해 요구 전투력이 증가합니다.",
    },
  },
  {
    floor: 40,
    name: "침묵의 교관",
    description: "고층 등반자를 걸러내는 경량 보스",
    powerBonusPercent: 8,
    gimmick: {
      name: "침묵 압박",
      description: "방어와 생존 기반이 부족하면 긴 교전을 버티기 어렵습니다.",
    },
  },
  {
    floor: 50,
    name: "정점의 대련자",
    description: "일일 등반의 마지막 관문",
    powerBonusPercent: 8,
    gimmick: {
      name: "삼중 시험",
      description: "화력, 생존, 템포 중 부족한 축마다 요구 전투력이 증가합니다.",
    },
  },
] as const satisfies readonly MasteryTowerBoss[];

export type MasteryTowerFloorInfo = {
  floor: number;
  reward: number;
  baseRequiredPower: number;
  requiredPower: number;
  boss: MasteryTowerBoss | null;
  gimmick: MasteryTowerGimmickResult | null;
};

export type MasteryTowerState = {
  date: string;
  todayBestFloor: number;
  runFloor: number;
  claimed: boolean;
  lifetimeBestFloor: number;
  firstClearRewardsClaimed: number[];
  cooldownUntil?: number;
};

export function kstDateKey(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function masteryTowerFloorReward(floor: number): number {
  const f = clampFloor(floor);
  if (f <= 10) return f * 20;
  if (f <= 20) return 200 + (f - 10) * 30;
  if (f <= 30) return 500 + (f - 20) * 45;
  if (f <= 40) return 950 + (f - 30) * 60;
  return 1550 + (f - 40) * 85;
}

export function masteryTowerRequiredPower(
  floor: number,
  profile?: MasteryTowerCombatProfile,
): number {
  const f = clampFloor(floor);
  if (f <= 0) return 0;
  const base = masteryTowerBaseRequiredPower(f);
  const boss = masteryTowerBossForFloor(f);
  if (!boss) return base;
  const bossRequired = base + Math.round((base * boss.powerBonusPercent) / 100);
  const gimmick = masteryTowerGimmickResult(f, profile);
  if (!gimmick) return bossRequired;
  return bossRequired + Math.round((bossRequired * gimmick.penaltyPercent) / 100);
}

function masteryTowerBaseRequiredPower(floor: number): number {
  const f = clampFloor(floor);
  if (f <= 0) return 0;
  if (f <= 10) return 90 + f * 30;
  if (f <= 20) return 390 + (f - 10) * 81;
  return 1200 + (f - 20) * 130;
}

export function masteryTowerBossForFloor(
  floor: number,
): MasteryTowerBoss | null {
  const f = clampFloor(floor);
  return MASTERY_TOWER_BOSSES.find((boss) => boss.floor === f) ?? null;
}

export function masteryTowerFloorInfo(
  floor: number,
  profile?: MasteryTowerCombatProfile,
): MasteryTowerFloorInfo {
  const f = clampFloor(floor);
  const baseRequiredPower = masteryTowerBaseRequiredPower(f);
  return {
    floor: f,
    reward: masteryTowerFloorReward(f),
    baseRequiredPower,
    requiredPower: masteryTowerRequiredPower(f, profile),
    boss: masteryTowerBossForFloor(f),
    gimmick: masteryTowerGimmickResult(f, profile),
  };
}

function masteryTowerGimmickResult(
  floor: number,
  profile?: MasteryTowerCombatProfile,
): MasteryTowerGimmickResult | null {
  const boss = masteryTowerBossForFloor(floor);
  if (!boss?.gimmick || !profile) return null;

  const offense = Math.max(profile.atk, profile.magicAtk);
  const endurance = Math.round(
    profile.def +
      profile.magicDef +
      profile.maxHp * 0.08 +
      profile.critResistPct * 10,
  );
  const tempo = Math.round(
    profile.spd +
      profile.accRating +
      profile.evaRating * 0.5 +
      profile.extraAttackChancePct * 1.5,
  );

  if (floor === 30) {
    const checks = [gimmickCheck("offense", "주 공격축", offense, 360)];
    return {
      name: boss.gimmick.name,
      description: boss.gimmick.description,
      checks,
      penaltyPercent: checks[0].passed ? 0 : 12,
      hint: checks[0].passed
        ? "방패 파훼 조건 충족"
        : "공격력 또는 마법공격력을 올리면 방패 보정을 줄일 수 있습니다.",
    };
  }

  if (floor === 40) {
    const checks = [gimmickCheck("endurance", "생존 기반", endurance, 850)];
    return {
      name: boss.gimmick.name,
      description: boss.gimmick.description,
      checks,
      penaltyPercent: checks[0].passed ? 0 : 15,
      hint: checks[0].passed
        ? "침묵 압박을 버틸 조건 충족"
        : "방어, 마법방어, 최대 HP, 치명저항을 보강하면 압박 보정을 줄일 수 있습니다.",
    };
  }

  if (floor === 50) {
    const checks = [
      gimmickCheck("offense", "화력", offense, 900),
      gimmickCheck("endurance", "생존", endurance, 1250),
      gimmickCheck("tempo", "템포", tempo, 260),
    ];
    const failed = checks.filter((check) => !check.passed).length;
    return {
      name: boss.gimmick.name,
      description: boss.gimmick.description,
      checks,
      penaltyPercent: failed * 8,
      hint:
        failed === 0
          ? "삼중 시험 조건 모두 충족"
          : "부족한 축을 보강하면 최종층 요구 전투력이 단계적으로 낮아집니다.",
    };
  }

  return null;
}

function gimmickCheck(
  id: string,
  label: string,
  value: number,
  target: number,
): MasteryTowerGimmickCheck {
  const v = Math.max(0, Math.floor(value));
  return {
    id,
    label,
    value: v,
    target,
    passed: v >= target,
  };
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
    runFloor: clampFloor(obj.runFloor ?? obj.todayBestFloor),
    claimed: obj.claimed === true,
    lifetimeBestFloor: clampFloor(obj.lifetimeBestFloor),
    firstClearRewardsClaimed: [...new Set(claimedFloors)].sort((a, b) => a - b),
    ...(typeof obj.cooldownUntil === "number" && Number.isFinite(obj.cooldownUntil)
      ? { cooldownUntil: Math.max(0, Math.floor(obj.cooldownUntil)) }
      : {}),
  };
  if (base.date !== date) {
    return {
      ...base,
      date,
      todayBestFloor: 0,
      runFloor: 0,
      claimed: false,
      cooldownUntil: undefined,
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
    runFloor: Math.max(state.runFloor, cleared),
    todayBestFloor: Math.max(state.todayBestFloor, cleared),
    lifetimeBestFloor: Math.max(state.lifetimeBestFloor, cleared),
    cooldownUntil: undefined,
  };
}

export function failMasteryTowerRun(
  state: MasteryTowerState,
  now: number = Date.now(),
): MasteryTowerState {
  return {
    ...state,
    runFloor: 0,
    cooldownUntil: now + MASTERY_TOWER_REENTRY_COOLDOWN_MS,
  };
}

function clampFloor(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MASTERY_TOWER_MAX_FLOOR, n));
}
