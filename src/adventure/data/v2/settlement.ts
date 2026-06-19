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

// 국가 선포 게이트 — 이 등급 이상의 마을(=대도시) 하나를 보유하면 선포 가능.
//   하드 "땅 N개" 게이트는 두지 않음(메모리 설계 8번): 땅이 많을수록 재화가 빨라 자연히
//   확장이 유도되도록(emergent). 보유 마을 중 하나라도 이 단계면 충족.
export const NATION_REQUIRED_TIER: VillageTier = "metropolis";

export function tierMeetsNation(tier: VillageTier): boolean {
  return VILLAGE_TIERS.indexOf(tier) >= VILLAGE_TIERS.indexOf(NATION_REQUIRED_TIER);
}

// ── 지형 특성 ── 거점마다 1개(static outposts.ts 에서 부여). 해당 생산에 +보너스. ──────
export type TerrainTrait = "plain" | "farmland" | "mine" | "lake";
export const TERRAIN_TRAIT_NAME: Record<TerrainTrait, string> = {
  plain: "평지",
  farmland: "농지",
  mine: "광맥",
  lake: "호수",
};

// ── 생산 종류 ── 슬롯에서 고르는 작업(말이 농사지 광물·어획도). ───────────────────────
export type ProductionKind = "crop" | "ore" | "fish";
export const PRODUCTION_KIND_NAME: Record<ProductionKind, string> = {
  crop: "작물",
  ore: "광물",
  fish: "물고기",
};
export const PRODUCTION_KINDS: ProductionKind[] = ["crop", "ore", "fish"];

// 특성 → 보너스 받는 생산 종류(없으면 null). farmland=작물 / mine=광물 / lake=물고기.
export const TRAIT_BONUS_KIND: Record<TerrainTrait, ProductionKind | null> = {
  plain: null,
  farmland: "crop",
  mine: "ore",
  lake: "fish",
};
export const TRAIT_BONUS_PCT = 30; // 일치 특성 +30% 수확량 (다이얼)

// 지형 특성 설명(툴팁용) — 보너스 다이얼에서 자동 파생(드리프트 방지).
export function terrainTraitDesc(trait: TerrainTrait): string {
  const bonusKind = TRAIT_BONUS_KIND[trait];
  if (bonusKind == null) {
    return "생산 보너스가 없는 중립 지형이에요. 어떤 종류를 키워도 기본 수확량입니다.";
  }
  return `${PRODUCTION_KIND_NAME[bonusKind]} 마을의 수확량이 +${TRAIT_BONUS_PCT}% 늘어나는 땅이에요.`;
}

// ── 생산 다이얼 ──────────────────────────────────────────────────────────
// 1회 소요 시간(ms) — 종류별. (수확창 = 이 시간 지나면 수확 가능)
export const PRODUCTION_DURATION_MS: Record<ProductionKind, number> = {
  crop: 2 * 3_600_000, // 2시간
  ore: 3 * 3_600_000, // 3시간
  fish: 1 * 3_600_000, // 1시간
};
// 1슬롯 1회 기본 수확량.
export const PRODUCTION_BASE_YIELD: Record<ProductionKind, number> = {
  crop: 10,
  ore: 6,
  fish: 12,
};
// 단계별 동시 작업 슬롯 수(업그레이드 핵심 보상).
export const SLOTS_BY_TIER: Record<VillageTier, number> = {
  village: 1,
  city: 2,
  metropolis: 4,
};
// 업그레이드 비용(현 단계 → 다음). metropolis 는 최종(국가는 별도 게이트).
export const UPGRADE_COST: Partial<
  Record<VillageTier, Partial<Record<ProductionKind, number>>>
> = {
  village: { crop: 100, ore: 60 }, // 마을 → 도시
  city: { crop: 400, ore: 300, fish: 200 }, // 도시 → 대도시
};

// ── 생산 작업(개체) ── 슬롯 하나에 도는 작업. ──────────────────────────────
export type ProductionJob = {
  kind: ProductionKind;
  /** 시작 시각(ms epoch). 수확 준비 = startedAt + duration ≤ now. */
  startedAt: number;
};

// 수확 준비됐나(완료됐나).
export function isHarvestReady(job: ProductionJob, now: number): boolean {
  return now - job.startedAt >= PRODUCTION_DURATION_MS[job.kind];
}

// 수확까지 남은 ms(0=완료). 미래 startedAt(클락스큐)은 duration 으로 클램프.
export function harvestRemainingMs(job: ProductionJob, now: number): number {
  const remaining = job.startedAt + PRODUCTION_DURATION_MS[job.kind] - now;
  const dur = PRODUCTION_DURATION_MS[job.kind];
  return Math.max(0, Math.min(dur, remaining));
}

// 수확량 — 거점 특성 보너스 적용. 완료 전이면 0.
// 🔑 "손해" 약한 버전(메모리 결정): 늦게 수확해도 수확량 동일. 손해 = 완료된 슬롯이 재큐 전까지
//   놀아서 생산시간 손실(기회비용) — 다음 작업은 수동 큐라 안 챙기면 그만큼 못 번다. 창고넘침/
//   감쇠(강한 버전)는 후속 다이얼.
export function harvestYield(
  job: ProductionJob,
  trait: TerrainTrait,
  now: number,
): number {
  if (!isHarvestReady(job, now)) return 0;
  const base = PRODUCTION_BASE_YIELD[job.kind];
  const bonusPct = TRAIT_BONUS_KIND[trait] === job.kind ? TRAIT_BONUS_PCT : 0;
  return Math.round(base * (1 + bonusPct / 100));
}

// 길드 재화 풀(정착지 생산 산출·업그레이드 소비). 종류별 정수 누적.
export type SettlementResources = Partial<Record<ProductionKind, number>>;

// 업그레이드 가능?(다음 단계 존재 + 재화 충분). 부족 종류 목록도 함께.
export function canUpgrade(
  tier: VillageTier,
  resources: SettlementResources,
): { ok: boolean; next: VillageTier | null; missing: ProductionKind[] } {
  const next = nextTier(tier);
  if (!next) return { ok: false, next: null, missing: [] };
  const cost = UPGRADE_COST[tier] ?? {};
  const missing: ProductionKind[] = [];
  for (const k of PRODUCTION_KINDS) {
    const need = cost[k] ?? 0;
    if ((resources[k] ?? 0) < need) missing.push(k);
  }
  return { ok: missing.length === 0, next, missing };
}

// 업그레이드 비용 차감(순수) — canUpgrade 통과 가정. 차감된 새 재화(비파괴).
export function applyUpgradeCost(
  tier: VillageTier,
  resources: SettlementResources,
): SettlementResources {
  const cost = UPGRADE_COST[tier] ?? {};
  const next: SettlementResources = { ...resources };
  for (const k of PRODUCTION_KINDS) {
    const need = cost[k] ?? 0;
    if (need > 0) next[k] = Math.max(0, (next[k] ?? 0) - need);
  }
  return next;
}

// 생산 시작 판정(순수) — 빈 슬롯 검증 후 새 jobs 반환(비파괴). 슬롯 범위는 단계별 SLOTS_BY_TIER.
export function tryStartProduction(
  jobs: Record<string, ProductionJob>,
  tier: VillageTier,
  slot: number,
  kind: ProductionKind,
  now: number,
):
  | { ok: true; jobs: Record<string, ProductionJob> }
  | { ok: false; error: "slot_out_of_range" | "slot_busy" } {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS_BY_TIER[tier]) {
    return { ok: false, error: "slot_out_of_range" };
  }
  if (jobs[String(slot)]) return { ok: false, error: "slot_busy" };
  return { ok: true, jobs: { ...jobs, [String(slot)]: { kind, startedAt: now } } };
}

// ── 건설/명명 ── 빈 공터(점령지)에 마을을 세우고 길드가 이름을 짓는다. ─────────────
// 닉네임 규약과 동일(1~16자). 건설(name != null)된 마을만 생산 가능(produce 게이트).
export const VILLAGE_NAME_MAX = 16;
export function isValidVillageName(name: string): boolean {
  const t = name.trim();
  return t.length >= 1 && t.length <= VILLAGE_NAME_MAX;
}

// 마을 특화 생산 종류 검증 — 건설 시 선택(crop|ore|fish). 영구.
export function isValidProductionKind(k: unknown): k is ProductionKind {
  return typeof k === "string" && (PRODUCTION_KINDS as string[]).includes(k);
}
