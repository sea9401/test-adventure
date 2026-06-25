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
//   (settlementMaterials). 슬롯은 칸 해금(골드 sink)만 남고 "미래 영지 건물" 자리표시.
//   생산 소요시간/수확량/수확 다이얼·헬퍼 삭제. crop/ore 풀은 기부(donate)+업글 소비로만 변동.
// ── 슬롯 판(grid) ── 단계별 판 크기 + 칸 단위 해금. ──────────────────────────
// 2×2 고정 판(최대 4칸). 마을=골드로 2칸 해금(5천만/1억), 도시/대도시 달성 시 +1칸씩 무료 부여
//   → 총 4칸. 건설 직후엔 빈 판(0칸)이고 칸을 골드로 한 칸씩 해금(unlockedSlots). [PR-3] 슬롯은
//   생산 없는 "건물 예정" 자리표시(종류 선택 없음).
export const MAX_SLOTS_BY_TIER: Record<VillageTier, number> = {
  village: 2, // 2×2 판·골드 해금(5천만/1억)
  city: 3, // 도시 달성 시 +1칸(무료)
  metropolis: 4, // 대도시 달성 시 +1칸 → 총 4
};
export const GRID_COLS_BY_TIER: Record<VillageTier, number> = {
  village: 2,
  city: 2,
  metropolis: 2,
};
// 화면에 항상 보여주는 판 크기 = 가장 큰 단계(대도시) 기준 2×2(4칸). 단계가 낮아도 그 단계 최대
//   (MAX_SLOTS_BY_TIER) 너머의 칸을 흐리게(상위 단계 필요) 함께 보여줘 잠재 판을 미리 보게 한다.
export const GRID_DISPLAY_COLS = GRID_COLS_BY_TIER.metropolis; // 2
export const GRID_DISPLAY_SLOTS = MAX_SLOTS_BY_TIER.metropolis; // 4 (2×2)
// 건설 직후 열려 있는 칸 수 — 0(첫 칸도 골드로 해금하며 종류를 고른다).
export const INITIAL_UNLOCKED_SLOTS = 0;

// 해금 수를 단계 판 범위로 보정 — [0, 최대]. 손상/과거 데이터 방어.
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

// 업그레이드 가능?(다음 단계 존재 + 현 판 모두 해금 + 재화 충분). 부족 종류 목록도 함께.
//   needSlots = 현 단계 판을 다 안 채움(칸 해금 → 단계 확장 순서 강제: 마을 4칸 다 열어야 도시).
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

// ── 칸 해금 ── 판 안의 다음 칸을 길드 골드로 열고, 그때 키울 종류를 고른다(단계 업그레이드와 별개).
// 비용 = 길드 금고 골드(거점 세금/입금 풀). 첫 칸 5천만 / 칸마다 +5천만 → 5천만·1억(마을 판 2칸).
//   도시/대도시 달성 칸은 upgrade 가 무료로 부여(여기 골드 해금은 마을 2칸에만). 큰 골드 sink.
export const SLOT_UNLOCK_GOLD_BASE = 50_000_000; // 첫 칸 5천만
export const SLOT_UNLOCK_GOLD_STEP = 50_000_000; // 칸마다 +5천만 → 5천만·1억
export function slotUnlockGoldCost(currentUnlocked: number): number {
  if (currentUnlocked < 0) return 0;
  return SLOT_UNLOCK_GOLD_BASE + SLOT_UNLOCK_GOLD_STEP * currentUnlocked;
}

// 칸 해금 가능?(판에 여유 + 길드 골드 충분). atMax = 현 단계 판을 다 채움(다음은 단계 업그레이드).
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
