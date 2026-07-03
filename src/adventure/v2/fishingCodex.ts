// 낚시 도감(어보) 저장 모델 — 종별 발견 + 개인 최대어 영구 박제.
//
// 설계: docs/fishing-content-plan.md §4
// 저장 키 fishing-codex.v1 (savesKv). 서버 권위로 캐스팅 성공 시 갱신(PR-2).
// 순수 모듈 — 클라(도감 UI)·서버 공용. AdventureLog(log/storage.ts) 패턴을 따른다.

import {
  FISH,
  FISH_IDS,
  FISH_TIERS,
  FISH_TIER_ORDER,
  isFishId,
  type FishId,
  type FishTier,
} from "@/adventure/data/v2/fish";

export const FISHING_CODEX_KEY = "fishing-codex.v1";

// 신규 어종이 추가되면 여기에 다음 단계만 이어 붙인다. 기존 보상은 회수하지 않는다.
export const FISHING_CODEX_SP_MILESTONES = [10, 20, 30, 40, 46] as const;

export type FishCodexEntry = {
  /** 한 번이라도 잡음. */
  discovered: boolean;
  /** 개인 역대 최대어(cm) — 영구 박제. */
  bestSize: number;
  /** 누적 낚은 마리 수. */
  totalCaught: number;
  firstCaughtAt: number;
  /** 최대어를 잡은 시각. */
  bestCaughtAt: number;
};

export type FishCodex = {
  fish: Record<string, FishCodexEntry>;
};

export const emptyFishCodex = (): FishCodex => ({ fish: {} });

// 광장 랭킹용 누적 어획 점수. 마릿수만 세면 흔한 어종 반복이 과하게 유리해져
// 티어별 어획 점수에 개인 최대어 보너스를 조금 더한다.
export const FISHING_SCORE_BY_TIER: Record<FishTier, number> = {
  common: 1,
  uncommon: 2,
  rare: 4,
  epic: 8,
  legendary: 16,
};

function parseEntry(raw: unknown): FishCodexEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const bestSize = typeof r.bestSize === "number" && Number.isFinite(r.bestSize) ? r.bestSize : 0;
  const totalCaught =
    typeof r.totalCaught === "number" && Number.isFinite(r.totalCaught)
      ? Math.max(0, Math.floor(r.totalCaught))
      : 0;
  // discovered 가 누락된 옛 데이터는 기록이 있으면(>0) 발견으로 간주.
  const discovered = r.discovered === true || bestSize > 0 || totalCaught > 0;
  if (!discovered) return null;
  const firstCaughtAt =
    typeof r.firstCaughtAt === "number" && Number.isFinite(r.firstCaughtAt) ? r.firstCaughtAt : 0;
  const bestCaughtAt =
    typeof r.bestCaughtAt === "number" && Number.isFinite(r.bestCaughtAt)
      ? r.bestCaughtAt
      : firstCaughtAt;
  return { discovered: true, bestSize, totalCaught, firstCaughtAt, bestCaughtAt };
}

// 손상된 입력(객체 아님 등)은 빈 도감. 알 수 없는 어종 id 항목은 버린다(어종은 카탈로그가 권위).
export function parseFishCodex(raw: unknown): FishCodex {
  if (!raw || typeof raw !== "object") return emptyFishCodex();
  const src = raw as Record<string, unknown>;
  // { fish: {...} } 형태 또는 { id: entry } 평면 형태 모두 수용.
  const fishMap =
    src.fish && typeof src.fish === "object"
      ? (src.fish as Record<string, unknown>)
      : src;
  const out: Record<string, FishCodexEntry> = {};
  for (const [id, entryRaw] of Object.entries(fishMap)) {
    if (!isFishId(id)) continue;
    const entry = parseEntry(entryRaw);
    if (entry) out[id] = entry;
  }
  return { fish: out };
}

// 낚았을 때 도감 갱신(순수). 새 사이즈가 더 크면 bestSize·bestCaughtAt 갱신.
export function recordCatch(
  codex: FishCodex,
  fishId: FishId,
  size: number,
  now: number,
): FishCodex {
  const prev = codex.fish[fishId];
  const next: FishCodexEntry = prev
    ? {
        discovered: true,
        bestSize: Math.max(prev.bestSize, size),
        totalCaught: prev.totalCaught + 1,
        firstCaughtAt: prev.firstCaughtAt || now,
        bestCaughtAt: size > prev.bestSize ? now : prev.bestCaughtAt,
      }
    : {
        discovered: true,
        bestSize: size,
        totalCaught: 1,
        firstCaughtAt: now,
        bestCaughtAt: now,
      };
  return { fish: { ...codex.fish, [fishId]: next } };
}

// 발견한(알려진) 어종 id 들 — 카탈로그에 존재하고 discovered 인 것만.
export function discoveredFishIds(codex: FishCodex): FishId[] {
  return FISH_IDS.filter((id) => codex.fish[id]?.discovered === true);
}

export function countDiscoveredFish(codex: FishCodex): number {
  return discoveredFishIds(codex).length;
}

export function fishCodexTotalCaught(codex: FishCodex): number {
  return FISH_IDS.reduce((sum, id) => {
    const entry = codex.fish[id];
    if (!entry?.discovered) return sum;
    return sum + Math.max(1, Math.floor(entry.totalCaught));
  }, 0);
}

export function fishBestSizeScoreBonus(fishId: FishId, bestSize: number): number {
  const fish = FISH[fishId];
  const span = Math.max(1, fish.maxSize - fish.minSize);
  const normalized = Math.max(0, Math.min(1, (bestSize - fish.minSize) / span));
  return Math.round(normalized * FISHING_SCORE_BY_TIER[fish.tier] * 10);
}

export function fishCodexScore(codex: FishCodex): number {
  return FISH_IDS.reduce((sum, id) => {
    const entry = codex.fish[id];
    if (!entry?.discovered) return sum;
    const catchCount = Math.max(1, Math.floor(entry.totalCaught));
    const catchScore = catchCount * FISHING_SCORE_BY_TIER[FISH[id].tier];
    return sum + catchScore + fishBestSizeScoreBonus(id, entry.bestSize);
  }, 0);
}

export type FishTierCompletion = {
  tier: FishTier;
  label: string;
  discovered: number;
  total: number;
  complete: boolean;
  /** Legacy field. 낚시 도감 SP 는 이제 발견 수 마일스톤 기준이다. */
  sp: number;
};

export function fishTierCompletions(codex: FishCodex): FishTierCompletion[] {
  const discovered = new Set(discoveredFishIds(codex));
  return FISH_TIER_ORDER.map((tier) => {
    const ids = FISH_IDS.filter((id) => FISH[id].tier === tier);
    const count = ids.filter((id) => discovered.has(id)).length;
    const complete = ids.length > 0 && count === ids.length;
    return {
      tier,
      label: FISH_TIERS[tier].label,
      discovered: count,
      total: ids.length,
      complete,
      sp: 0,
    };
  });
}

export function fishCodexSpBonusForCount(count: number): number {
  return FISHING_CODEX_SP_MILESTONES.filter((need) => count >= need).length;
}

export function nextFishCodexMilestone(count: number): number | null {
  return FISHING_CODEX_SP_MILESTONES.find((need) => count < need) ?? null;
}

export function fishCodexSpBonus(codex: FishCodex): number {
  return fishCodexSpBonusForCount(countDiscoveredFish(codex));
}
