// 레어 탐사 — 사냥 승리 시 극히 낮은 확률로 열리는 희귀 콘텐츠(2026-06-12).
// hunt 계열은 "발견된 깊이" 기준의 농축 사냥을 제한 판수만큼, utility 계열은 숨겨진
// 장소(비밀 상점/개명의 신전/화공의 공방) 기능을 제한 횟수만큼 쓸 수 있다.
// 거래소 판매 가능(consumable kind). hunt 계열은 사냥터 목록에, utility 계열은 인벤토리에 표시.
//
// 카탈로그 확정(2026-06-12 사용자 승인): 희귀 탐사 5종(판수 30·유적 10) + 입장권 3종.
// 수치(드랍률·배수)는 다이얼 — 라이브 실측 후 조정 여지.

export type RareMapKindId =
  | "worn_map"
  | "gilded_map"
  | "sage_map"
  | "hunter_map"
  | "relic_map"
  | "secret_shop_map"
  | "rename_map"
  | "portrait_map"
  | "exp_tome";

export type RareMapKind = {
  id: RareMapKindId;
  name: string;
  desc: string;
  /** hunt = 농축 사냥 입장(판수 소모) / utility = 기능 사용(사용 횟수 소모, 사냥 입장 불가). */
  category: "hunt" | "utility";
  /** hunt: 사냥 가능 판수(승패 무관 소모) / utility: 사용 가능 횟수. */
  runs: number;
  /** 사냥 승리당 드랍 확률(%). */
  dropPct: number;
  // === hunt 계열 보상 배수 (utility 는 전부 1) ===
  expMult: number;
  goldMult: number;
  /** 정규/밴드 흔한 장비 + 재료 드랍 확률 배수. */
  equipDropMult: number;
  /** 유니크 드랍 확률 배수 — 보물 지도 전용 축(희소성 보존: 기본 1). */
  uniqueDropMult: number;
  /** 강화석 드랍 확률 배수 — 사냥꾼의 탐사로 전용 축. */
  enhanceStoneMult: number;
};

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
    dropPct: o.dropPct,
    expMult: 1,
    goldMult: 1,
    equipDropMult: 1,
    uniqueDropMult: 1,
    enhanceStoneMult: 1,
  };
}

export const RARE_MAP_KINDS: Record<RareMapKindId, RareMapKind> = {
  // === 희귀 탐사 — 발견 깊이로 농축 사냥 ===
  worn_map: huntKind(
    "worn_map",
    "낡은 탐사로",
    "낡은 표식이 이어진 탐사로. 발견된 깊이의 풍요로운 사냥터로 이어진다.",
    { runs: 30, dropPct: 0.06, expMult: 3, goldMult: 3, equipDropMult: 3 },
  ),
  gilded_map: huntKind(
    "gilded_map",
    "금빛 탐사로",
    "금가루가 묻어나는 탐사로. 부유한 사냥감이 모이는 길목으로 이어진다.",
    { runs: 30, dropPct: 0.025, goldMult: 7 },
  ),
  sage_map: huntKind(
    "sage_map",
    "현자의 탐사로",
    "여백마다 깨달음이 적힌 탐사 기록. 싸움 하나하나가 수련이 되는 곳으로 이끈다.",
    { runs: 30, dropPct: 0.025, expMult: 7 },
  ),
  hunter_map: huntKind(
    "hunter_map",
    "사냥꾼의 탐사로",
    "노련한 사냥꾼의 표식이 가득한 탐사로. 좋은 물건을 품은 사냥감의 굴로 안내한다.",
    { runs: 30, dropPct: 0.025, equipDropMult: 7, enhanceStoneMult: 4 },
  ),
  relic_map: huntKind(
    "relic_map",
    "빛바랜 유적 탐사",
    "거의 지워진 옛 유적 단서. 전설이 잠든 자리를 가리킨다.",
    { runs: 10, dropPct: 0.006, equipDropMult: 3, uniqueDropMult: 5 },
  ),
  // === 입장권 — 숨겨진 장소로 이동(사냥 입장 불가) ===
  secret_shop_map: utilityKind(
    "secret_shop_map",
    "비밀 상점 초대장",
    "뒷골목 상인의 초대장. 아무에게나 팔지 않는 물건을 살 수 있다 (품목당 1회 구매).",
    { uses: 6, dropPct: 0.006 },
  ),
  rename_map: utilityKind(
    "rename_map",
    "개명 신전 입장권",
    "이름을 갈아입는 옛 신전의 입장권. 새 이름으로 다시 태어난다 (1회).",
    { uses: 1, dropPct: 0.003 },
  ),
  portrait_map: utilityKind(
    "portrait_map",
    "화공 공방 입장권",
    "은둔한 화공 공방의 입장권. 초상화를 새로 그려준다 (1회).",
    { uses: 1, dropPct: 0.003 },
  ),
  // 테스트 전용 — 사냥 드랍 안 됨(dropPct 0 → 관리자 지급 전용). 사용 시 EXP 100만을
  //   EXP 레벨업과 스탯 성장을 적용한다. 직업 숙련도는 사냥 승리 보상이라 오르지 않는다.
  exp_tome: utilityKind(
    "exp_tome",
    "경험치의 비약 (테스트)",
    "마시면 막대한 깨달음이 쏟아진다. 1회당 경험치 100만. (테스트 전용 아이템)",
    { uses: 99, dropPct: 0 },
  ),
};

export const RARE_MAP_KIND_IDS = Object.keys(
  RARE_MAP_KINDS,
) as RareMapKindId[];

// 보유 캡 — 가득이면 추가 드랍 롤 자체를 건너뛴다(유실 아님 — 롤 미발생).
export const RARE_MAP_CAP = 5;
export const RARE_MAP_TTL_MS = 30 * 60 * 1000;

// 보유 개체 — character.v2.rareMaps 배열의 한 항목. 장비 개체(iid)와 같은 모델.
export type RareMapInstance = {
  iid: string;
  kind: RareMapKindId;
  /** 발견된 깊이 — hunt 계열 입장 시 이 깊이로만 사냥 가능(utility 는 무관·기록용). */
  depth: number;
  runsLeft: number;
  foundAt: number;
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
  };
}

// save 값 파싱 — 형식 불량/소진/만료 항목을 비파괴로 걸러낸 새 배열.
// (소진/만료 purge 는 read 시 lazy — hunt/secret-shop 이 파싱 결과를 다시 저장하면 자연 정리.)
// 희귀 탐사와 입장권은 발견 후 30분 동안 유효하다.
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
      typeof m.foundAt !== "number"
    ) {
      continue;
    }
    if (m.runsLeft <= 0) continue; // 소진
    if (m.foundAt + RARE_MAP_TTL_MS <= now) {
      continue;
    }
    const bought = Array.isArray(m.bought)
      ? m.bought.filter((b): b is string => typeof b === "string")
      : undefined;
    out.push({
      iid: m.iid,
      kind: m.kind as RareMapKindId,
      depth: m.depth,
      runsLeft: Math.floor(m.runsLeft),
      foundAt: m.foundAt,
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
