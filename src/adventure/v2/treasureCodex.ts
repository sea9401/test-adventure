// 유물 도감 저장 모델 — 종별 발견 + 개인 최고 보존상태 영구 박제.
//
// 설계: docs/treasure-hunt-plan.md §6
// 저장 키 treasure-codex.v1 (savesKv). 서버 권위로 발굴 성공 시 갱신(PR-3).
// 순수 모듈 — 클라(도감 UI)·서버 공용. fishingCodex(어보) 패턴을 따른다.

import {
  ANTIQUES,
  ANTIQUE_IDS,
  ANTIQUE_TIERS,
  ANTIQUE_TIER_ORDER,
  isAntiqueId,
  MIN_CONDITION,
  type AntiqueId,
  type AntiqueTier,
} from "@/adventure/data/v2/antique";

export const TREASURE_CODEX_KEY = "treasure-codex.v1";

export type TreasureCodexEntry = {
  /** 한 번이라도 발굴함. */
  discovered: boolean;
  /** 개인 역대 최고 보존상태(5~100) — 영구 박제. */
  bestCondition: number;
  /** 누적 발굴 점수. */
  totalFound: number;
  firstFoundAt: number;
  /** 최고 보존상태를 발굴한 시각. */
  bestFoundAt: number;
};

export type TreasureCodex = {
  antiques: Record<string, TreasureCodexEntry>;
};

export const emptyTreasureCodex = (): TreasureCodex => ({ antiques: {} });

function parseEntry(raw: unknown): TreasureCodexEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // 보존상태는 [MIN_CONDITION,100] 정수만 유효. 오염 값(-1/999/3.14)은 0 으로 떨궈
  // 999% 같은 이상치가 UI 로 새지 않게 한다(발견 여부는 totalFound 로도 복원됨).
  const bestCondition =
    typeof r.bestCondition === "number" &&
    Number.isInteger(r.bestCondition) &&
    r.bestCondition >= MIN_CONDITION &&
    r.bestCondition <= 100
      ? r.bestCondition
      : 0;
  const totalFound =
    typeof r.totalFound === "number" && Number.isFinite(r.totalFound)
      ? Math.max(0, Math.floor(r.totalFound))
      : 0;
  // discovered 누락된 옛 데이터는 기록이 있으면(>0) 발견으로 간주.
  const discovered = r.discovered === true || bestCondition > 0 || totalFound > 0;
  if (!discovered) return null;
  const firstFoundAt =
    typeof r.firstFoundAt === "number" && Number.isFinite(r.firstFoundAt)
      ? r.firstFoundAt
      : 0;
  const bestFoundAt =
    typeof r.bestFoundAt === "number" && Number.isFinite(r.bestFoundAt)
      ? r.bestFoundAt
      : firstFoundAt;
  return { discovered: true, bestCondition, totalFound, firstFoundAt, bestFoundAt };
}

// 손상된 입력은 빈 도감. 알 수 없는 종류 id 항목은 버린다(카탈로그가 권위).
export function parseTreasureCodex(raw: unknown): TreasureCodex {
  if (!raw || typeof raw !== "object") return emptyTreasureCodex();
  const src = raw as Record<string, unknown>;
  // { antiques: {...} } 형태 또는 { id: entry } 평면 형태 모두 수용.
  const map =
    src.antiques && typeof src.antiques === "object"
      ? (src.antiques as Record<string, unknown>)
      : src;
  const out: Record<string, TreasureCodexEntry> = {};
  for (const [id, entryRaw] of Object.entries(map)) {
    if (!isAntiqueId(id)) continue;
    const entry = parseEntry(entryRaw);
    if (entry) out[id] = entry;
  }
  return { antiques: out };
}

// 발굴했을 때 도감 갱신(순수). 새 보존상태가 더 높으면 bestCondition·bestFoundAt 갱신.
export function recordFind(
  codex: TreasureCodex,
  antiqueId: AntiqueId,
  condition: number,
  now: number,
): TreasureCodex {
  const prev = codex.antiques[antiqueId];
  const next: TreasureCodexEntry = prev
    ? {
        discovered: true,
        bestCondition: Math.max(prev.bestCondition, condition),
        totalFound: prev.totalFound + 1,
        firstFoundAt: prev.firstFoundAt || now,
        bestFoundAt: condition > prev.bestCondition ? now : prev.bestFoundAt,
      }
    : {
        discovered: true,
        bestCondition: condition,
        totalFound: 1,
        firstFoundAt: now,
        bestFoundAt: now,
      };
  return { antiques: { ...codex.antiques, [antiqueId]: next } };
}

// 발견한(알려진) 종류 id 들 — 카탈로그에 존재하고 discovered 인 것만.
export function discoveredAntiqueIds(codex: TreasureCodex): AntiqueId[] {
  return ANTIQUE_IDS.filter((id) => codex.antiques[id]?.discovered === true);
}

export function countDiscoveredAntiques(codex: TreasureCodex): number {
  return discoveredAntiqueIds(codex).length;
}

export type AntiqueTierCompletion = {
  tier: AntiqueTier;
  label: string;
  discovered: number;
  total: number;
  complete: boolean;
  /** 유물 도감은 더 이상 SP 를 지급하지 않는다. */
  sp: number;
};

export function antiqueTierCompletions(
  codex: TreasureCodex,
): AntiqueTierCompletion[] {
  const discovered = new Set(discoveredAntiqueIds(codex));
  return ANTIQUE_TIER_ORDER.map((tier) => {
    const ids = ANTIQUE_IDS.filter((id) => ANTIQUES[id].tier === tier);
    const count = ids.filter((id) => discovered.has(id)).length;
    const complete = ids.length > 0 && count === ids.length;
    return {
      tier,
      label: ANTIQUE_TIERS[tier].label,
      discovered: count,
      total: ids.length,
      complete,
      sp: 0,
    };
  });
}

export function treasureCodexSpBonus(_codex: TreasureCodex): number {
  return 0;
}
