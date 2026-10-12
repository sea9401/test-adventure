// 일일 낚시 도전과제 — 낚시코인 소량 보상. 순수 엔진.
//
// 왜: 코인은 주간 종별 대회 정산으로만 들어와, 순위에 못 드는 캐주얼은 코인을 못 번다.
//   이 일일 도전이 비경쟁 코인 수급 경로 + 매일 들어올 리듬을 준다. 골드 보상 반복 퀘
//   (d_fish/w_fish, 제네릭 "N마리")와 겹치지 않게 "낚시다운" 조건(희귀↑·서로 다른 종)을 다룬다.
//
// 이벤트 구동 카운터: reel 성공마다 그날 카운트를 올린다(희귀/종류 술어는 누적치 차분으로
//   표현 불가). 일 경계(KST)가 바뀌면 lazy 롤오버로 카운트·수령을 리셋한다(반복 퀘와 같은 결).

import {
  FARM_FISHING_CONTRACT_SEED_REWARD,
  FARM_FISHING_SEED_POUCH_NAME,
  type FarmSeedInventory,
} from "@/adventure/v2/farm";
import { FISH, isFishId, type FishId, type FishTier } from "./fish";
import { FISHING_SPOTS } from "./fishingSpots";

export const FISHING_DAILY_KEY = "fishing-daily-challenges.v1";

const RARE_PLUS: ReadonlySet<FishTier> = new Set<FishTier>([
  "rare",
  "epic",
  "legendary",
]);

export type FishingDailyState = {
  /** 이 카운트가 속한 KST 날짜 키("YYYY-MM-DD"). 바뀌면 롤오버. */
  key: string;
  /** 그날 총 낚은 수. */
  caught: number;
  /** 그날 희귀 이상 낚은 수. */
  rarePlus: number;
  /** 그날 80cm 이상 낚은 수. */
  big80: number;
  /** 그날 물때 한정 특별 손님을 낚은 수. */
  specialGuests: number;
  /** 그날 어종별 어획 수. */
  fishCounts: Partial<Record<FishId, number>>;
  /** 그날 낚은 서로 다른 종. */
  species: FishId[];
  /** 그날 수령한 도전 id. */
  claimed: string[];
  /** 그날 수령한 의뢰 id. */
  claimedContracts: string[];
};

export type FishingDailyChallengeDef = {
  id: string;
  title: string;
  desc: string;
  goal: number;
  rewardCoins: number;
  rewardSeeds?: FarmSeedInventory;
  /** 그날 상태에서 이 도전의 진행 수치. */
  progress: (s: FishingDailyState) => number;
};

// 3종(다이얼). 보상은 셋 다 50코인(일일 과제 — 꾸준히 들어오면 샵 칭호까지 모이는 규모).
export const FISHING_DAILY_CHALLENGES: readonly FishingDailyChallengeDef[] = [
  {
    id: "d_catch8",
    title: "부지런한 손맛",
    desc: "오늘 물고기 8마리를 낚으세요.",
    goal: 8,
    rewardCoins: 50,
    progress: (s) => s.caught,
  },
  {
    id: "d_rare3",
    title: "월척을 노려",
    desc: "오늘 희귀 이상 3마리를 낚으세요.",
    goal: 3,
    rewardCoins: 50,
    progress: (s) => s.rarePlus,
  },
  {
    id: "d_variety6",
    title: "다채로운 어획",
    desc: "오늘 서로 다른 6종을 낚으세요.",
    goal: 6,
    rewardCoins: 50,
    progress: (s) => s.species.length,
  },
];

export function fishingDailyById(
  id: string,
): FishingDailyChallengeDef | undefined {
  return FISHING_DAILY_CHALLENGES.find((d) => d.id === id);
}

export function emptyFishingDaily(key: string): FishingDailyState {
  return {
    key,
    caught: 0,
    rarePlus: 0,
    big80: 0,
    specialGuests: 0,
    fishCounts: {},
    species: [],
    claimed: [],
    claimedContracts: [],
  };
}

function parseFishCounts(raw: unknown): Partial<Record<FishId, number>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<FishId, number>> = {};
  for (const [id, count] of Object.entries(raw as Record<string, unknown>)) {
    if (isFishId(id) && typeof count === "number" && Number.isFinite(count)) {
      const n = Math.max(0, Math.floor(count));
      if (n > 0) out[id] = n;
    }
  }
  return out;
}

// 손상/구버전 방어 파싱. 알 수 없으면 key="" 빈 상태(롤오버가 그날로 초기화).
export function parseFishingDaily(raw: unknown): FishingDailyState {
  if (!raw || typeof raw !== "object") return emptyFishingDaily("");
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  const species = Array.isArray(r.species)
    ? (r.species.filter(
        (x): x is FishId => typeof x === "string" && isFishId(x),
      ) as FishId[])
    : [];
  const claimed = Array.isArray(r.claimed)
    ? r.claimed.filter((x): x is string => typeof x === "string")
    : [];
  const claimedContracts = Array.isArray(r.claimedContracts)
    ? r.claimedContracts.filter((x): x is string => typeof x === "string")
    : [];
  return {
    key: typeof r.key === "string" ? r.key : "",
    caught: num(r.caught),
    rarePlus: num(r.rarePlus),
    big80: num(r.big80),
    specialGuests: num(r.specialGuests),
    fishCounts: parseFishCounts(r.fishCounts),
    species: [...new Set(species)],
    claimed: [...new Set(claimed)],
    claimedContracts: [...new Set(claimedContracts)],
  };
}

// 일 경계 롤오버 — 키가 다르면 그날 빈 상태로(카운트·수령 리셋). 순수.
export function rolloverFishingDaily(
  s: FishingDailyState,
  dayKey: string,
): FishingDailyState {
  return s.key === dayKey ? s : emptyFishingDaily(dayKey);
}

// 한 마리 낚음 반영(롤오버 먼저). 순수 — 입력 불변. 티어는 카탈로그에서 파생.
export function applyCatch(
  s: FishingDailyState,
  fishId: FishId,
  dayKey: string,
  size = 0,
): FishingDailyState {
  const rolled = rolloverFishingDaily(s, dayKey);
  const isRarePlus = RARE_PLUS.has(FISH[fishId].tier);
  const species = rolled.species.includes(fishId)
    ? rolled.species
    : [...rolled.species, fishId];
  const fishCounts = {
    ...rolled.fishCounts,
    [fishId]: (rolled.fishCounts[fishId] ?? 0) + 1,
  };
  return {
    ...rolled,
    caught: rolled.caught + 1,
    rarePlus: rolled.rarePlus + (isRarePlus ? 1 : 0),
    big80: rolled.big80 + (size >= 80 ? 1 : 0),
    specialGuests: rolled.specialGuests + (FISH[fishId].condition ? 1 : 0),
    fishCounts,
    species,
  };
}

export type FishingDailyView = {
  id: string;
  title: string;
  desc: string;
  goal: number;
  rewardCoins: number;
  rewardSeeds?: FarmSeedInventory;
  rewardSeedPouchName?: string;
  progress: number;
  complete: boolean;
  claimed: boolean;
  claimable: boolean;
};

export type FishingContractDef = {
  id: string;
  title: string;
  desc: string;
  goal: number;
  rewardCoins: number;
  rewardSeeds?: FarmSeedInventory;
  progress: (s: FishingDailyState) => number;
};

export type FishingContractView = FishingDailyView;

// 어종 납품 의뢰 — 하루에 하나만 나온다. 잉어만 고정으로 내면 도감을 채운 뒤에는 잉어가
//   나오는 낚시터만 다니게 돼, 낚시터 6곳에 고루 퍼진 어종을 날마다 돌려 목적지를 바꾼다.
//   순서는 이웃한 날끼리 낚시터가 겹치지 않게 짰다. 민물장어와 안 겹치는 어종이 농어뿐이라
//   한 주에 한 번(민물장어 다음 잉어, 마을 선착장)만 겹친다. 7일에 한 번씩 모두 나온다.
const FISH_ORDER_GOAL = 5;

function fishOrderContract(
  id: string,
  title: string,
  fishId: FishId,
): FishingContractDef {
  const spots = Object.values(FISHING_SPOTS)
    .filter((spot) => spot.fishIds.includes(fishId))
    .map((spot) => spot.name);
  return {
    id,
    title,
    desc: `오늘 ${FISH[fishId].name} ${FISH_ORDER_GOAL}마리를 낚아 납품하세요. ${spots.join(", ")}에서 잡힙니다.`,
    goal: FISH_ORDER_GOAL,
    rewardCoins: 90,
    rewardSeeds: { wheat: 3 },
    progress: (s) => s.fishCounts[fishId] ?? 0,
  };
}

const FISH_ORDER_CONTRACTS: readonly FishingContractDef[] = [
  fishOrderContract("c_carp5", "주막의 잉어 주문", "carp"),
  fishOrderContract("c_catfish5", "국밥집의 메기 주문", "catfish"),
  fishOrderContract("c_chub5", "여관의 갈겨니 주문", "chub"),
  fishOrderContract("c_mullet5", "어시장의 숭어 주문", "mullet"),
  fishOrderContract("c_sweetfish5", "찻집의 은어 주문", "sweetfish"),
  fishOrderContract("c_sea_bass5", "횟집의 농어 주문", "sea_bass"),
  fishOrderContract("c_eel5", "장어집의 민물장어 주문", "freshwater_eel"),
];

const DAILY_FIXED_CONTRACTS: readonly FishingContractDef[] = [
  {
    id: "c_big80",
    title: "큼직한 식재료",
    desc: "오늘 80cm 이상 물고기 1마리를 낚으세요.",
    goal: 1,
    rewardCoins: 120,
    rewardSeeds: FARM_FISHING_CONTRACT_SEED_REWARD,
    progress: (s) => s.big80,
  },
  {
    id: "c_special1",
    title: "물때 연구 표본",
    desc: "오늘 물때 특별 손님 1마리를 낚으세요.",
    goal: 1,
    rewardCoins: 140,
    rewardSeeds: { herb: 1, corn: 1 },
    progress: (s) => s.specialGuests,
  },
];

// 의뢰 정의 전체(수령 요청의 id 확인용). 오늘 낼 의뢰는 fishingContractsForDay 로 고른다.
export const FISHING_CONTRACTS: readonly FishingContractDef[] = [
  ...FISH_ORDER_CONTRACTS,
  ...DAILY_FIXED_CONTRACTS,
];

// 하루에 나오는 의뢰 수 — 어종 납품 1 + 대물·물때 손님.
export const FISHING_CONTRACTS_PER_DAY = 1 + DAILY_FIXED_CONTRACTS.length;

function dayIndex(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : 0;
}

// 그날(KST 날짜 키) 낼 의뢰. 같은 날이면 모든 플레이어에게 같은 의뢰가 나온다.
export function fishingContractsForDay(
  dayKey: string,
): readonly FishingContractDef[] {
  const n = FISH_ORDER_CONTRACTS.length;
  const order = FISH_ORDER_CONTRACTS[((dayIndex(dayKey) % n) + n) % n];
  return [order, ...DAILY_FIXED_CONTRACTS];
}

export function fishingContractById(
  id: string,
): FishingContractDef | undefined {
  return FISHING_CONTRACTS.find((c) => c.id === id);
}

export function deriveFishingContractViews(
  s: FishingDailyState,
): FishingContractView[] {
  return fishingContractsForDay(s.key).map((c) => {
    const raw = c.progress(s);
    const complete = raw >= c.goal;
    const claimed = s.claimedContracts.includes(c.id);
    return {
      id: c.id,
      title: c.title,
      desc: c.desc,
      goal: c.goal,
      rewardCoins: c.rewardCoins,
      rewardSeeds: c.rewardSeeds,
      rewardSeedPouchName: c.rewardSeeds
        ? FARM_FISHING_SEED_POUCH_NAME
        : undefined,
      progress: Math.min(c.goal, raw),
      complete,
      claimed,
      claimable: complete && !claimed,
    };
  });
}

export function deriveFishingDailyViews(
  s: FishingDailyState,
): FishingDailyView[] {
  return FISHING_DAILY_CHALLENGES.map((d) => {
    const raw = d.progress(s);
    const complete = raw >= d.goal;
    const claimed = s.claimed.includes(d.id);
    return {
      id: d.id,
      title: d.title,
      desc: d.desc,
      goal: d.goal,
      rewardCoins: d.rewardCoins,
      rewardSeeds: d.rewardSeeds,
      rewardSeedPouchName: d.rewardSeeds
        ? FARM_FISHING_SEED_POUCH_NAME
        : undefined,
      progress: Math.min(d.goal, raw),
      complete,
      claimed,
      claimable: complete && !claimed,
    };
  });
}
