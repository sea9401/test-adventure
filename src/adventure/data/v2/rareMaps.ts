// 레어맵 — 사냥 승리 시 극히 낮은 확률로 드랍되는 소모품 지도(2026-06-12).
// hunt 계열은 "발견된 깊이" 기준의 농축 사냥을 제한 판수만큼, utility 계열은 숨겨진
// 장소(비밀 상점/개명의 신전/화공의 공방) 기능을 제한 횟수만큼 쓸 수 있다.
// 거래소 판매 가능(consumable kind), 인벤토리 소모품 탭에 보관.
//
// 카탈로그 확정(2026-06-12 사용자 승인): 성장맵 5종(판수 30·보물 10) + 유틸맵 3종.
// 수치(드랍률·배수)는 다이얼 — 라이브 실측 후 조정 여지.

export type RareMapKindId =
  | "worn_map"
  | "gilded_map"
  | "sage_map"
  | "hunter_map"
  | "relic_map"
  | "secret_shop_map"
  | "rename_map"
  | "portrait_map";

export type RareMapKind = {
  id: RareMapKindId;
  name: string;
  desc: string;
  /** hunt = 농축 사냥 입장(판수 소모) / utility = 기능 사용(사용 횟수 소모, 사냥 입장 불가). */
  category: "hunt" | "utility";
  /** hunt: 사냥 가능 판수(승패 무관 소모) / utility: 사용 가능 횟수. */
  runs: number;
  /** 획득 후 만료까지 ms. */
  ttlMs: number;
  /** 사냥 승리당 드랍 확률(%). */
  dropPct: number;
  // === hunt 계열 보상 배수 (utility 는 전부 1) ===
  expMult: number;
  goldMult: number;
  /** 정규/밴드 흔한 장비 + 재료 드랍 확률 배수. */
  equipDropMult: number;
  /** 유니크 드랍 확률 배수 — 보물 지도 전용 축(희소성 보존: 기본 1). */
  uniqueDropMult: number;
  /** 강화석 드랍 확률 배수 — 사냥꾼의 지도 전용 축. */
  enhanceStoneMult: number;
};

const TTL_48H = 48 * 3_600_000;

function huntKind(
  id: RareMapKindId,
  name: string,
  desc: string,
  o: {
    runs: number;
    dropPct: number;
    expMult?: number;
    goldMult?: number;
    equipDropMult?: number;
    uniqueDropMult?: number;
    enhanceStoneMult?: number;
  },
): RareMapKind {
  return {
    id,
    name,
    desc,
    category: "hunt",
    runs: o.runs,
    ttlMs: TTL_48H,
    dropPct: o.dropPct,
    expMult: o.expMult ?? 1,
    goldMult: o.goldMult ?? 1,
    equipDropMult: o.equipDropMult ?? 1,
    uniqueDropMult: o.uniqueDropMult ?? 1,
    enhanceStoneMult: o.enhanceStoneMult ?? 1,
  };
}

function utilityKind(
  id: RareMapKindId,
  name: string,
  desc: string,
  o: { uses: number; dropPct: number },
): RareMapKind {
  return {
    id,
    name,
    desc,
    category: "utility",
    runs: o.uses,
    ttlMs: TTL_48H,
    dropPct: o.dropPct,
    expMult: 1,
    goldMult: 1,
    equipDropMult: 1,
    uniqueDropMult: 1,
    enhanceStoneMult: 1,
  };
}

export const RARE_MAP_KINDS: Record<RareMapKindId, RareMapKind> = {
  // === 성장맵 — 발견 깊이로 농축 사냥 ===
  worn_map: huntKind(
    "worn_map",
    "낡은 지도",
    "어느 사냥꾼이 흘린 지도. 발견된 깊이의 풍요로운 사냥터로 안내한다.",
    { runs: 30, dropPct: 0.1, expMult: 2, goldMult: 2, equipDropMult: 2 },
  ),
  gilded_map: huntKind(
    "gilded_map",
    "금빛 지도",
    "금가루가 묻어나는 지도. 부유한 사냥감이 모이는 길목을 알고 있다.",
    { runs: 30, dropPct: 0.04, goldMult: 5 },
  ),
  sage_map: huntKind(
    "sage_map",
    "현자의 지도",
    "여백마다 깨달음이 적혀 있다. 싸움 하나하나가 수련이 되는 곳으로 이끈다.",
    { runs: 30, dropPct: 0.04, expMult: 5 },
  ),
  hunter_map: huntKind(
    "hunter_map",
    "사냥꾼의 지도",
    "노련한 사냥꾼의 표식이 가득하다. 좋은 물건을 품은 사냥감의 굴로 안내한다.",
    { runs: 30, dropPct: 0.04, equipDropMult: 5, enhanceStoneMult: 3 },
  ),
  relic_map: huntKind(
    "relic_map",
    "빛바랜 보물 지도",
    "거의 지워진 옛 지도. 전설이 잠든 자리를 가리키고 있다.",
    { runs: 10, dropPct: 0.01, equipDropMult: 2, uniqueDropMult: 3 },
  ),
  // === 유틸맵 — 숨겨진 장소로 이동(사냥 입장 불가) ===
  secret_shop_map: utilityKind(
    "secret_shop_map",
    "비밀 상점의 지도",
    "뒷골목 상인의 약도. 아무에게나 팔지 않는 물건을 살 수 있다 (품목당 1회 구매).",
    { uses: 5, dropPct: 0.02 },
  ),
  rename_map: utilityKind(
    "rename_map",
    "개명의 신전 지도",
    "이름을 갈아입는 옛 신전으로 가는 길. 새 이름으로 다시 태어난다 (1회).",
    { uses: 1, dropPct: 0.005 },
  ),
  portrait_map: utilityKind(
    "portrait_map",
    "화공의 공방 지도",
    "은둔한 화공의 공방으로 가는 길. 초상화를 새로 그려준다 (1회).",
    { uses: 1, dropPct: 0.005 },
  ),
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
  /** 발견된 깊이 — hunt 계열 입장 시 이 깊이로만 사냥 가능(utility 는 무관·기록용). */
  depth: number;
  runsLeft: number;
  foundAt: number;
  expiresAt: number;
  /** 비밀 상점 — 이 지도로 이미 구매한 품목 id(품목당 1회 제한). hunt 계열은 미사용. */
  bought?: string[];
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
    const bought = Array.isArray(m.bought)
      ? m.bought.filter((b): b is string => typeof b === "string")
      : undefined;
    out.push({
      iid: m.iid,
      kind: m.kind as RareMapKindId,
      depth: m.depth,
      runsLeft: Math.floor(m.runsLeft),
      foundAt: m.foundAt,
      expiresAt: m.expiresAt,
      ...(bought && bought.length > 0 ? { bought } : {}),
    });
  }
  return out;
}

// 사냥 승리당 드랍 롤 — 종류별 독립 확률(다종). 둘 이상 동시 당첨이면 앞 종류 우선
// (카탈로그 순서 = 흔한 것 먼저라 희귀맵이 묻힐 확률은 무시 가능 수준).
export function rollRareMapDrop(
  rand: () => number = Math.random,
): RareMapKindId | null {
  for (const id of RARE_MAP_KIND_IDS) {
    if (rand() * 100 < RARE_MAP_KINDS[id].dropPct) return id;
  }
  return null;
}
