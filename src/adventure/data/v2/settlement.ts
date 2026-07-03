// v2 정착지 시스템 — 빈 공터를 길드가 점령해 마을 건설·생산·업그레이드(마을→도시→대도시→국가).
// 설계 SSOT = 작업 메모리 project-v2-settlement-redesign. 옛 분쟁지대 쟁탈 아레나 단순화 대체.
//
// PR-1 = 데이터 모델 + 순수 생산 엔진(미배선·inert). 아직 어디서도 import 안 함 → 런타임 무영향.
//   후속: DB(생산상태·길드재화)·라우트(생산 시작/수확/업그레이드)·UI(길드 마을 페이지)·
//   건설/명명·지형특성 맵 리매핑·국가 선포.
//
// 🔑 설계 가드(메모리): 재화→업그레이드 자기완결 sink 루프가 옛 stone 경제(sink 0으로 삭제)와의
//   결정적 차이. 생명 = 업그레이드 깊이/지속성. 수치는 전부 다이얼(라이브 실측 후 조정).

// ── 정착지 단계 ──────────────────────────────────────────────────────────
export type VillageTier = "village" | "city" | "metropolis";
export const VILLAGE_TIERS: VillageTier[] = ["village", "city", "metropolis"];
export const VILLAGE_TIER_NAME: Record<VillageTier, string> = {
  village: "마을",
  city: "도시",
  metropolis: "대도시",
};

// 다음 단계(없으면 null = 최종. 국가 선포는 별도 게이트). 단계 인덱스.
export function nextTier(tier: VillageTier): VillageTier | null {
  const i = VILLAGE_TIERS.indexOf(tier);
  return i >= 0 && i < VILLAGE_TIERS.length - 1 ? VILLAGE_TIERS[i + 1] : null;
}

// 이전 단계(없으면 null = 최하). 정복 함락 시 마을 1단계 강등에 사용(대도시→도시→마을, 마을=null).
export function prevTier(tier: VillageTier): VillageTier | null {
  const i = VILLAGE_TIERS.indexOf(tier);
  return i > 0 ? VILLAGE_TIERS[i - 1] : null;
}

// 국가 선포 게이트 — 이 등급 이상의 마을(=대도시) 하나를 보유하면 선포 가능.
//   하드 "땅 N개" 게이트는 두지 않음(메모리 설계 8번): 땅이 많을수록 재화가 빨라 자연히
//   확장이 유도되도록(emergent). 보유 마을 중 하나라도 이 단계면 충족.
export const NATION_REQUIRED_TIER: VillageTier = "metropolis";

export function tierMeetsNation(tier: VillageTier): boolean {
  return VILLAGE_TIERS.indexOf(tier) >= VILLAGE_TIERS.indexOf(NATION_REQUIRED_TIER);
}

// ── 지형 특성 ── 거점마다 1개(static outposts.ts 에서 부여). 해당 생산에 +보너스. ──────
//   키는 영구 유지(farmland/mine/lake), 표시명은 생산물 테마에 맞춤: 숲→통나무·광맥→철광석·어장(식량폐기).
export type TerrainTrait = "plain" | "farmland" | "mine" | "lake";
export const TERRAIN_TRAIT_NAME: Record<TerrainTrait, string> = {
  plain: "평지",
  farmland: "숲", // 통나무(crop) 보너스
  mine: "광맥", // 철광석(ore) 보너스
  lake: "어장", // (식량 폐기 — 보너스 없음)
};

// ── 생산 종류 ── 내부 키(crop/ore) 영구 유지, 표시명만 재테마. 식량(fish) 폐기(2026-06-25).
//   crop=통나무 / ore=철광석 — 둘 다 사냥 드랍 재료로 전환 중(슬롯 생산은 과도기 잔존).
export type ProductionKind = "crop" | "ore";
export const PRODUCTION_KIND_NAME: Record<ProductionKind, string> = {
  crop: "통나무",
  ore: "철광석",
};
// 종류별 간단 아이콘(이모지) — 슬롯/재화 표시용.
export const PRODUCTION_KIND_ICON: Record<ProductionKind, string> = {
  crop: "🪵",
  ore: "🪨",
};
export const PRODUCTION_KINDS: ProductionKind[] = ["crop", "ore"];

// ── 영지 건축물 ───────────────────────────────────────────────────────────
// 현재는 "마을별 1슬롯에 무엇을 둘지"를 저장/표시하는 골격만 둔다. 실제 제작/연구 효과는 후속 PR.
export type SettlementBuildingId =
  | "guild_smithy"
  | "training_ground"
  | "map_workshop"
  | "alchemy_workshop"
  | "woodworks";

export type SettlementBuildingDef = {
  id: SettlementBuildingId;
  name: string;
  icon: string;
  desc: string;
};

export type SettlementBuildingSlot = {
  id: SettlementBuildingId;
  level: number;
};

export type SettlementBuildings = Record<number, SettlementBuildingSlot>;

export const SETTLEMENT_BUILDINGS: Record<
  SettlementBuildingId,
  SettlementBuildingDef
> = {
  guild_smithy: {
    id: "guild_smithy",
    name: "길드 대장간",
    icon: "⚒️",
    desc: "장비 제작과 대장장이 성장을 위한 영지 시설입니다.",
  },
  training_ground: {
    id: "training_ground",
    name: "훈련장",
    icon: "🎯",
    desc: "길드원이 매일 현재 직업 숙련도 훈련을 받을 수 있는 영지 시설입니다.",
  },
  map_workshop: {
    id: "map_workshop",
    name: "지도 제작소",
    icon: "🗺️",
    desc: "발굴 지점을 여는 데 필요한 지도 조각을 줄여주는 영지 시설입니다.",
  },
  alchemy_workshop: {
    id: "alchemy_workshop",
    name: "연금 공방",
    icon: "⚗️",
    desc: "포션과 특수 소모품 제작을 위한 영지 시설입니다. 아직 배치할 수 없습니다.",
  },
  woodworks: {
    id: "woodworks",
    name: "목공소",
    icon: "🪚",
    desc: "건축과 슬롯 확장을 위한 영지 시설입니다. 아직 배치할 수 없습니다.",
  },
};
export const SETTLEMENT_BUILDING_IDS = Object.keys(
  SETTLEMENT_BUILDINGS,
) as SettlementBuildingId[];
export const PLACEABLE_SETTLEMENT_BUILDING_IDS: SettlementBuildingId[] = [
  "guild_smithy",
  "training_ground",
  "map_workshop",
];

export const MAX_SETTLEMENT_BUILDING_LEVEL = 5;

export type SettlementBuildingUpgradeDef = {
  level: number;
  cost: Partial<Record<ProductionKind, number>>;
  qualityChanceBonusPct: number;
  weeklyProgressBonusPct: number;
  label: string;
};

export const GUILD_SMITHY_UPGRADES: readonly SettlementBuildingUpgradeDef[] = [
  {
    level: 1,
    cost: {},
    qualityChanceBonusPct: 0,
    weeklyProgressBonusPct: 0,
    label: "기본 제작",
  },
  {
    level: 2,
    cost: { crop: 600, ore: 900 },
    qualityChanceBonusPct: 1,
    weeklyProgressBonusPct: 10,
    label: "담금질 설비",
  },
  {
    level: 3,
    cost: { crop: 1600, ore: 2400 },
    qualityChanceBonusPct: 2,
    weeklyProgressBonusPct: 20,
    label: "명장 화로",
  },
  {
    level: 4,
    cost: { crop: 3600, ore: 5200 },
    qualityChanceBonusPct: 4,
    weeklyProgressBonusPct: 30,
    label: "장인 조합 설비",
  },
  {
    level: 5,
    cost: { crop: 7200, ore: 9800 },
    qualityChanceBonusPct: 6,
    weeklyProgressBonusPct: 40,
    label: "대장장이 전당",
  },
];

export type TrainingGroundUpgradeDef = {
  level: number;
  cost: Partial<Record<ProductionKind, number>>;
  trainingRewardBonusPct: number;
  unlockedDrillCount: number;
  label: string;
};

export const TRAINING_GROUND_UPGRADES: readonly TrainingGroundUpgradeDef[] = [
  {
    level: 1,
    cost: {},
    trainingRewardBonusPct: 0,
    unlockedDrillCount: 1,
    label: "기초 훈련장",
  },
  {
    level: 2,
    cost: { crop: 700, ore: 700 },
    trainingRewardBonusPct: 10,
    unlockedDrillCount: 1,
    label: "장비 훈련 구역",
  },
  {
    level: 3,
    cost: { crop: 1800, ore: 1800 },
    trainingRewardBonusPct: 20,
    unlockedDrillCount: 2,
    label: "실전 교관 배치",
  },
  {
    level: 4,
    cost: { crop: 4200, ore: 4200 },
    trainingRewardBonusPct: 35,
    unlockedDrillCount: 2,
    label: "전술 훈련장",
  },
  {
    level: 5,
    cost: { crop: 8200, ore: 8200 },
    trainingRewardBonusPct: 50,
    unlockedDrillCount: 3,
    label: "정예 훈련소",
  },
];

export type MapWorkshopUpgradeDef = {
  level: number;
  cost: Partial<Record<ProductionKind, number>>;
  fragmentDiscountPct: number;
  label: string;
};

export const MAP_WORKSHOP_UPGRADES: readonly MapWorkshopUpgradeDef[] = [
  {
    level: 1,
    cost: {},
    fragmentDiscountPct: 5,
    label: "낡은 제도대",
  },
  {
    level: 2,
    cost: { crop: 500, ore: 400 },
    fragmentDiscountPct: 10,
    label: "측량 도구",
  },
  {
    level: 3,
    cost: { crop: 1400, ore: 1100 },
    fragmentDiscountPct: 15,
    label: "정밀 나침반",
  },
  {
    level: 4,
    cost: { crop: 3200, ore: 2600 },
    fragmentDiscountPct: 20,
    label: "항로 기록실",
  },
  {
    level: 5,
    cost: { crop: 6800, ore: 5400 },
    fragmentDiscountPct: 25,
    label: "왕립 지도 보관소",
  },
];

export type AnySettlementBuildingUpgradeDef =
  | SettlementBuildingUpgradeDef
  | TrainingGroundUpgradeDef
  | MapWorkshopUpgradeDef;

export function clampSettlementBuildingLevel(level: unknown): number {
  const n = Math.floor(Number(level) || 1);
  return Math.min(MAX_SETTLEMENT_BUILDING_LEVEL, Math.max(1, n));
}

export function settlementBuildingSlot(
  id: SettlementBuildingId,
  level: unknown = 1,
): SettlementBuildingSlot {
  return { id, level: clampSettlementBuildingLevel(level) };
}

export function settlementBuildingIdOf(
  raw: unknown,
): SettlementBuildingId | null {
  if (isSettlementBuildingId(raw)) return raw;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const id = (raw as Record<string, unknown>).id;
  return isSettlementBuildingId(id) ? id : null;
}

export function settlementBuildingLevelOf(raw: unknown): number {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return 1;
  return clampSettlementBuildingLevel((raw as Record<string, unknown>).level);
}

export function guildSmithyUpgradeForLevel(
  level: number,
): SettlementBuildingUpgradeDef {
  const safe = clampSettlementBuildingLevel(level);
  return (
    GUILD_SMITHY_UPGRADES.find((upgrade) => upgrade.level === safe) ??
    GUILD_SMITHY_UPGRADES[0]
  );
}

export function nextGuildSmithyUpgrade(
  level: number,
): SettlementBuildingUpgradeDef | null {
  const safe = clampSettlementBuildingLevel(level);
  return (
    GUILD_SMITHY_UPGRADES.find((upgrade) => upgrade.level === safe + 1) ?? null
  );
}

export function trainingGroundUpgradeForLevel(
  level: number,
): TrainingGroundUpgradeDef {
  const safe = clampSettlementBuildingLevel(level);
  return (
    TRAINING_GROUND_UPGRADES.find((upgrade) => upgrade.level === safe) ??
    TRAINING_GROUND_UPGRADES[0]
  );
}

export function nextTrainingGroundUpgrade(
  level: number,
): TrainingGroundUpgradeDef | null {
  const safe = clampSettlementBuildingLevel(level);
  return (
    TRAINING_GROUND_UPGRADES.find((upgrade) => upgrade.level === safe + 1) ??
    null
  );
}

export function mapWorkshopUpgradeForLevel(level: number): MapWorkshopUpgradeDef {
  const safe = clampSettlementBuildingLevel(level);
  return (
    MAP_WORKSHOP_UPGRADES.find((upgrade) => upgrade.level === safe) ??
    MAP_WORKSHOP_UPGRADES[0]
  );
}

export function nextMapWorkshopUpgrade(
  level: number,
): MapWorkshopUpgradeDef | null {
  const safe = clampSettlementBuildingLevel(level);
  return (
    MAP_WORKSHOP_UPGRADES.find((upgrade) => upgrade.level === safe + 1) ?? null
  );
}

export function nextSettlementBuildingUpgrade(
  buildingId: SettlementBuildingId,
  level: number,
): AnySettlementBuildingUpgradeDef | null {
  if (buildingId === "training_ground") {
    return nextTrainingGroundUpgrade(level);
  }
  if (buildingId === "map_workshop") {
    return nextMapWorkshopUpgrade(level);
  }
  if (buildingId === "guild_smithy") {
    return nextGuildSmithyUpgrade(level);
  }
  return null;
}

export function settlementBuildingUpgradeSummary(
  buildingId: SettlementBuildingId,
  upgrade: AnySettlementBuildingUpgradeDef,
): string {
  if (buildingId === "training_ground") {
    const training = upgrade as TrainingGroundUpgradeDef;
    return `훈련 보상 +${training.trainingRewardBonusPct}% · 일일 훈련 ${training.unlockedDrillCount}회`;
  }
  if (buildingId === "map_workshop") {
    const map = upgrade as MapWorkshopUpgradeDef;
    return `지도 조각 비용 -${map.fragmentDiscountPct}%`;
  }
  const smithy = upgrade as SettlementBuildingUpgradeDef;
  return `품질 +${smithy.qualityChanceBonusPct}%p`;
}

export function settlementBuildingUpgradeCostText(
  cost: Partial<Record<ProductionKind, number>>,
): string {
  const parts = PRODUCTION_KINDS.filter((kind) => (cost[kind] ?? 0) > 0).map(
    (kind) =>
      `${PRODUCTION_KIND_ICON[kind]} ${PRODUCTION_KIND_NAME[kind]} ${(
        cost[kind] ?? 0
      ).toLocaleString()}`,
  );
  return parts.length > 0 ? parts.join(" · ") : "무료";
}

export function isSettlementBuildingId(v: unknown): v is SettlementBuildingId {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(SETTLEMENT_BUILDINGS, v)
  );
}

export function canPlaceSettlementBuilding(
  buildingId: SettlementBuildingId,
): boolean {
  return PLACEABLE_SETTLEMENT_BUILDING_IDS.includes(buildingId);
}

// 특성 → 보너스 받는 생산 종류(없으면 null). farmland=통나무 / mine=철광석 / lake=보너스 없음.
export const TRAIT_BONUS_KIND: Record<TerrainTrait, ProductionKind | null> = {
  plain: null,
  farmland: "crop",
  mine: "ore",
  lake: null, // 어장 — 식량 폐기로 보너스 없음(특성 재배치는 후속)
};
export const TRAIT_BONUS_PCT = 30; // 일치 특성 +30% 수확량 (다이얼)

// 지형 특성 효과(툴팁용). [PR-3 중립화] 슬롯 생산 폐지로 수확 보너스 실효 0 — 중립 표시.
//   TRAIT_BONUS_KIND/TRAIT_BONUS_PCT 데이터는 미래 지형 작업용으로 보존(현재 미표시·미적용).
export function terrainTraitDesc(_trait: TerrainTrait): string {
  return "특별한 효과 없음";
}

// [폐지·PR-3] 슬롯 12h 생산(produce/harvest)은 제거됨 — 통나무/철광석은 사냥 드랍으로 수급
//   (settlementMaterials). 슬롯은 건축물 슬롯 해금(골드 sink)과 건물 배치만 담당.
//   생산 소요시간/수확량/수확 다이얼·헬퍼 삭제. crop/ore 풀은 기부(donate)+업글 소비로만 변동.
// ── 건축물 슬롯 ───────────────────────────────────────────────────────────
// 마을별 건물 슬롯은 1칸으로 압축한다. 장인/영지 건물 콘텐츠가 늘어나기 전까지 선택 압박을 유지하고,
//   슬롯 확장은 후속 건축가/연구/상위 영지 보상으로 다시 열 수 있게 상수 경계만 남긴다.
//   건설 직후엔 빈 상태(0슬롯)이고 골드로 건축물 슬롯을 해금한다.
export const MAX_SLOTS_BY_TIER: Record<VillageTier, number> = {
  village: 1,
  city: 1,
  metropolis: 1,
};
export const GRID_COLS_BY_TIER: Record<VillageTier, number> = {
  village: 1,
  city: 1,
  metropolis: 1,
};
// 화면에 항상 보여주는 슬롯 수 = 가장 큰 단계(대도시) 기준. 현재는 전 단계 1슬롯.
export const GRID_DISPLAY_COLS = GRID_COLS_BY_TIER.metropolis; // 1
export const GRID_DISPLAY_SLOTS = MAX_SLOTS_BY_TIER.metropolis; // 1
// 건설 직후 열려 있는 건축물 슬롯 수 — 0(첫 슬롯도 골드로 해금한다).
export const INITIAL_UNLOCKED_SLOTS = 0;

// 해금 수를 단계별 건축물 슬롯 범위로 보정 — [0, 최대]. 손상/과거 데이터 방어.
export function clampUnlockedSlots(tier: VillageTier, n: number): number {
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(MAX_SLOTS_BY_TIER[tier], n);
}

// 업그레이드 비용(현 단계 → 다음, 길드 정착지 재화). metropolis 는 최종(국가는 별도 게이트).
//   넉넉한 시간경과 생산을 요구하는 큰 비용 — 다이얼(라이브 실측 후 조정).
export const UPGRADE_COST: Partial<
  Record<VillageTier, Partial<Record<ProductionKind, number>>>
> = {
  village: { crop: 400, ore: 250 }, // 마을 → 도시
  city: { crop: 1500, ore: 1000 }, // 도시 → 대도시
};

// ── 생산 작업(개체) [폐지·PR-3 잔존] ── 옛 슬롯 생산 작업 타입. 슬롯 생산(produce/harvest)은
//   제거됐지만 레거시 jobs jsonb(outpost_villages.jobs·schema/v2Settlement 파싱)를 위해 타입만 보존.
export type ProductionJob = {
  kind: ProductionKind;
  /** 시작 시각(ms epoch). [폐지] 옛 수확 준비 판정용. */
  startedAt: number;
};

// 길드 재화 풀(기부 적립·업그레이드 소비). 종류별 정수 누적.
export type SettlementResources = Partial<Record<ProductionKind, number>>;

// 업그레이드 가능?(다음 단계 존재 + 현 건축물 슬롯 모두 해금 + 재화 충분). 부족 종류 목록도 함께.
//   needSlots = 현 단계 슬롯을 다 안 열었음.
//   costMultiplier = 자원 비용 배수(타일 정착지의 리베라 거리 스케일용·기본 1=옛 거점 경로 불변).
export function canUpgrade(
  tier: VillageTier,
  unlockedSlots: number,
  resources: SettlementResources,
  costMultiplier = 1,
): {
  ok: boolean;
  next: VillageTier | null;
  missing: ProductionKind[];
  needSlots: boolean;
} {
  const next = nextTier(tier);
  if (!next) return { ok: false, next: null, missing: [], needSlots: false };
  const needSlots = unlockedSlots < MAX_SLOTS_BY_TIER[tier];
  const cost = UPGRADE_COST[tier] ?? {};
  const missing: ProductionKind[] = [];
  for (const k of PRODUCTION_KINDS) {
    const need = Math.round((cost[k] ?? 0) * costMultiplier);
    if ((resources[k] ?? 0) < need) missing.push(k);
  }
  return { ok: !needSlots && missing.length === 0, next, missing, needSlots };
}

// 업그레이드 비용 차감(순수) — canUpgrade 통과 가정. 차감된 새 재화(비파괴).
//   costMultiplier = canUpgrade 와 동일 배수(차감과 검증 일치 필수).
export function applyUpgradeCost(
  tier: VillageTier,
  resources: SettlementResources,
  costMultiplier = 1,
): SettlementResources {
  const cost = UPGRADE_COST[tier] ?? {};
  const next: SettlementResources = { ...resources };
  for (const k of PRODUCTION_KINDS) {
    const need = Math.round((cost[k] ?? 0) * costMultiplier);
    if (need > 0) next[k] = Math.max(0, (next[k] ?? 0) - need);
  }
  return next;
}

// ── 마을 건설 비용 ── 빈 공터에 마을을 세울 때 드는 길드 금고 골드(1회). ──────────
export const VILLAGE_BUILD_GOLD_COST = 10_000_000; // 마을 건설 1천만

// ── 건축물 슬롯 해금 ── 다음 슬롯을 길드 골드로 연다(단계 업그레이드와 별개).
// 비용 = 길드 금고 골드(거점 세금/입금 풀). 현재 마을별 1슬롯이므로 첫 슬롯 5천만만 사용된다.
export const SLOT_UNLOCK_GOLD_BASE = 50_000_000; // 첫 칸 5천만
export const SLOT_UNLOCK_GOLD_STEP = 50_000_000; // 후속 슬롯 확장용 다이얼
export function slotUnlockGoldCost(currentUnlocked: number): number {
  if (currentUnlocked < 0) return 0;
  return SLOT_UNLOCK_GOLD_BASE + SLOT_UNLOCK_GOLD_STEP * currentUnlocked;
}

// 건축물 슬롯 해금 가능?(여유 + 길드 골드 충분). atMax = 현 단계 슬롯을 다 열었음.
export function canUnlockSlot(
  tier: VillageTier,
  unlockedSlots: number,
  gold: number,
): { ok: boolean; atMax: boolean; cost: number } {
  const cost = slotUnlockGoldCost(unlockedSlots);
  if (unlockedSlots >= MAX_SLOTS_BY_TIER[tier]) {
    return { ok: false, atMax: true, cost };
  }
  return { ok: gold >= cost, atMax: false, cost };
}

// ── 건설/명명 ── 빈 공터(점령지)에 마을을 세우고 길드가 이름을 짓는다. ─────────────
// 닉네임 규약과 동일(1~16자).
export const VILLAGE_NAME_MAX = 16;
export function isValidVillageName(name: string): boolean {
  const t = name.trim();
  return t.length >= 1 && t.length <= VILLAGE_NAME_MAX;
}
