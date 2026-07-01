// 일일 낚시 도전과제 — 낚시코인 소량 보상. 순수 엔진.
//
// 왜: 코인은 주간 종별 대회 정산으로만 들어와, 순위에 못 드는 캐주얼은 코인을 못 번다.
//   이 일일 도전이 비경쟁 코인 수급 경로 + 매일 들어올 리듬을 준다. 골드 보상 반복 퀘
//   (d_fish/w_fish, 제네릭 "N마리")와 겹치지 않게 "낚시다운" 조건(희귀↑·서로 다른 종)을 다룬다.
//
// 이벤트 구동 카운터: reel 성공마다 그날 카운트를 올린다(희귀/종류 술어는 누적치 차분으로
//   표현 불가). 일 경계(KST)가 바뀌면 lazy 롤오버로 카운트·수령을 리셋한다(반복 퀘와 같은 결).

import { FISH, isFishId, type FishId, type FishTier } from "./fish";

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
  progress: (s: FishingDailyState) => number;
};

export type FishingContractView = FishingDailyView;

export const FISHING_CONTRACTS: readonly FishingContractDef[] = [
  {
    id: "c_carp5",
    title: "주막의 잉어 주문",
    desc: "오늘 잉어 5마리를 낚아 납품하세요.",
    goal: 5,
    rewardCoins: 90,
    progress: (s) => s.fishCounts.carp ?? 0,
  },
  {
    id: "c_big80",
    title: "큼직한 식재료",
    desc: "오늘 80cm 이상 물고기 1마리를 낚으세요.",
    goal: 1,
    rewardCoins: 120,
    progress: (s) => s.big80,
  },
  {
    id: "c_special1",
    title: "물때 연구 표본",
    desc: "오늘 물때 특별 손님 1마리를 낚으세요.",
    goal: 1,
    rewardCoins: 140,
    progress: (s) => s.specialGuests,
  },
];

export function fishingContractById(
  id: string,
): FishingContractDef | undefined {
  return FISHING_CONTRACTS.find((c) => c.id === id);
}

export function deriveFishingContractViews(
  s: FishingDailyState,
): FishingContractView[] {
  return FISHING_CONTRACTS.map((c) => {
    const raw = c.progress(s);
    const complete = raw >= c.goal;
    const claimed = s.claimedContracts.includes(c.id);
    return {
      id: c.id,
      title: c.title,
      desc: c.desc,
      goal: c.goal,
      rewardCoins: c.rewardCoins,
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
      progress: Math.min(d.goal, raw),
      complete,
      claimed,
      claimable: complete && !claimed,
    };
  });
}
