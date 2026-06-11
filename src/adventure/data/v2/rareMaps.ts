// 레어맵 — 사냥 승리 시 극히 낮은 확률로 드랍되는 소모품 지도(2026-06-12 시스템 골격).
// 사용(입장)하면 "발견된 깊이" 기준의 농축 사냥을 제한 판수만큼 돌 수 있다.
// 거래소 판매 가능(소모품 kind — 후속 PR), 인벤토리 소모품 탭에 보관.
//
// ⚠️ 종류 구성·드랍률·보상 배수는 전부 임시 다이얼 — 사용자가 추후 확정(다종 확장 예정).
//    구조는 다종 전제: 종류별 독립 드랍 롤 + 종류별 판수/만료/배수.

export type RareMapKindId = "worn_map";

export type RareMapKind = {
  id: RareMapKindId;
  name: string;
  desc: string;
  /** 입장 후 사냥 가능 판수(승패 무관 소모). */
  runs: number;
  /** 획득 후 만료까지 ms. */
  ttlMs: number;
  /** 사냥 승리당 드랍 확률(%). ⚠️ 임시 — "매우 낮음" 방침. */
  dropPct: number;
  // === 보상 배수 — ⚠️ 전부 임시 다이얼(보상 설계는 추후 확정) ===
  expMult: number;
  goldMult: number;
  /** 장비(정규·밴드 흔한)·재료 드랍 확률 배수. 유니크는 ×1 유지(보상 확정 시 결정). */
  equipDropMult: number;
};

export const RARE_MAP_KINDS: Record<RareMapKindId, RareMapKind> = {
  worn_map: {
    id: "worn_map",
    name: "낡은 지도",
    desc: "어느 사냥꾼이 흘린 지도. 발견된 깊이의 풍요로운 사냥터로 안내한다.",
    runs: 10,
    ttlMs: 48 * 3_600_000,
    dropPct: 0.1,
    expMult: 2,
    goldMult: 2,
    equipDropMult: 2,
  },
};

export const RARE_MAP_KIND_IDS = Object.keys(
  RARE_MAP_KINDS,
) as RareMapKindId[];

// 보유 캡 — 가득이면 추가 드랍 롤 자체를 건너뛴다(유실 아님 — 롤 미발생).
export const RARE_MAP_CAP = 5;

// 보유 개체 — character.v2.rareMaps 배열의 한 항목. 장비 개체(iid)와 같은 모델.
export type RareMapInstance = {
  iid: string;
  kind: RareMapKindId;
  /** 발견된 깊이 — 입장 시 이 깊이로만 사냥 가능. */
  depth: number;
  runsLeft: number;
  foundAt: number;
  expiresAt: number;
};

export function genRareMapIid(rand: () => number = Math.random): string {
  return `rm_${Date.now().toString(36)}_${Math.floor(rand() * 36 ** 6)
    .toString(36)
    .padStart(6, "0")}`;
}

export function newRareMapInstance(
  kind: RareMapKindId,
  depth: number,
  now: number,
  iid: string = genRareMapIid(),
): RareMapInstance {
  const def = RARE_MAP_KINDS[kind];
  return {
    iid,
    kind,
    depth,
    runsLeft: def.runs,
    foundAt: now,
    expiresAt: now + def.ttlMs,
  };
}

// save 값 파싱 — 형식 불량/만료/소진 항목을 비파괴로 걸러낸 새 배열.
// (purge 는 read 시 lazy — hunt 가 매번 파싱 결과를 다시 저장하므로 자연 정리.)
export function parseRareMaps(v: unknown, now: number): RareMapInstance[] {
  if (!Array.isArray(v)) return [];
  const out: RareMapInstance[] = [];
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null) continue;
    const m = raw as Partial<RareMapInstance>;
    if (
      typeof m.iid !== "string" ||
      typeof m.kind !== "string" ||
      !(m.kind in RARE_MAP_KINDS) ||
      typeof m.depth !== "number" ||
      !Number.isInteger(m.depth) ||
      m.depth < 1 ||
      typeof m.runsLeft !== "number" ||
      typeof m.foundAt !== "number" ||
      typeof m.expiresAt !== "number"
    ) {
      continue;
    }
    if (m.runsLeft <= 0) continue; // 소진
    if (m.expiresAt <= now) continue; // 만료
    out.push({
      iid: m.iid,
      kind: m.kind as RareMapKindId,
      depth: m.depth,
      runsLeft: Math.floor(m.runsLeft),
      foundAt: m.foundAt,
      expiresAt: m.expiresAt,
    });
  }
  return out;
}

// 사냥 승리당 드랍 롤 — 종류별 독립 확률(다종 전제). 둘 이상 동시 당첨이면 앞 종류 우선
// (현재 1종이라 무의미하지만 결정론 유지).
export function rollRareMapDrop(
  rand: () => number = Math.random,
): RareMapKindId | null {
  for (const id of RARE_MAP_KIND_IDS) {
    if (rand() * 100 < RARE_MAP_KINDS[id].dropPct) return id;
  }
  return null;
}
