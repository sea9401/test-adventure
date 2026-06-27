// 낚시 컨텐츠 — 어종 카탈로그 + 사이즈 분포 + 종 추첨 + 종별 기록 보상.
//
// 설계: docs/fishing-content-plan.md
// 순수 데이터/순수 함수 모듈. 클라(도감 UI)·서버(캐스팅 권위 판정, PR-2) 공용.
//
// 핵심 원칙:
// - 사이즈·희귀도는 순수 운. 반응 속도·캐릭터 스탯과 무관(서버에서만 굴린다).
// - 사이즈는 heavy-tail(p^k) — 던진 횟수가 늘어도 기록치가 천천히 포화 → 노가다 우위 억제,
//   운 좋은 한 캐스팅이 캐주얼에게 종별 1등 기회를 남긴다.

import type { MulttaeConditionId } from "./multtae";

export type FishTier = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type FishId =
  // 흔함 (6)
  | "crucian_carp"
  | "minnow"
  | "killifish"
  | "loach"
  | "goby"
  | "river_shrimp"
  // 보통 (7)
  | "carp"
  | "catfish"
  | "sea_bass"
  | "mullet"
  | "dodari"
  | "flatfish"
  | "gizzard_shad"
  // 희귀 (7)
  | "trout"
  | "pike"
  | "red_seabream"
  | "hairtail"
  | "halibut"
  | "rockfish"
  | "rainbow_trout"
  // 영웅 (6)
  | "marlin"
  | "bluefin_tuna"
  | "mahimahi"
  | "sturgeon"
  | "giant_octopus"
  | "anglerfish"
  // 전설 (4)
  | "platinum_carp"
  | "starlit_ray"
  | "abyssal_leviathan"
  | "dragonscale_fish"
  // 물때 한정 특별 손님 (4) — 해당 물때 창에만 입질(multtae.ts). 항상풀(위 30종)엔 안 섞임.
  | "goldeye"
  | "moonshadow_eel"
  | "mist_koi"
  | "stormrider";

export type Fish = {
  id: FishId;
  name: string;
  tier: FishTier;
  /** 사이즈(길이) 굴림 하한·상한, cm. 종마다 고유 스케일 — 리더보드는 종 안에서만 비교. */
  minSize: number;
  maxSize: number;
  description: string;
  /** 물때 한정 손님이면 해당 물때 id. 있으면 그 물때 창에만 추첨 풀에 합류(multtae.ts). */
  condition?: MulttaeConditionId;
};

export type FishTierMeta = {
  label: string;
  /** 캐스팅 시 이 티어가 걸릴 추첨 가중치(전 티어 합 대비). 티어 안에서는 종 균등. */
  encounterWeight: number;
  /** heavy-tail 지수 k. 클수록 대물이 희박 → 기록치 포화가 느림. */
  sizeExponent: number;
  /** 종별 주간 기록 보상 코인(순위별). 4~10등은 동일. 2026-06-27 사용자 결정 — 주간 코인 획득량 ×2. */
  recordCoins: { rank1: number; rank2: number; rank3: number; rank4to10: number };
};

// 티어 순서 = 흔함 → 전설. 도감 정렬·추첨 순회에 그대로 쓴다.
export const FISH_TIER_ORDER: readonly FishTier[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;

export const FISH_TIERS: Record<FishTier, FishTierMeta> = {
  common: {
    label: "흔함",
    encounterWeight: 40,
    sizeExponent: 3.0,
    recordCoins: { rank1: 36, rank2: 22, rank3: 14, rank4to10: 8 },
  },
  uncommon: {
    label: "보통",
    encounterWeight: 28,
    sizeExponent: 3.5,
    recordCoins: { rank1: 60, rank2: 38, rank3: 26, rank4to10: 14 },
  },
  rare: {
    label: "희귀",
    encounterWeight: 20,
    sizeExponent: 4.0,
    recordCoins: { rank1: 110, rank2: 70, rank3: 48, rank4to10: 26 },
  },
  epic: {
    label: "영웅",
    encounterWeight: 9,
    sizeExponent: 5.0,
    recordCoins: { rank1: 210, rank2: 136, rank3: 92, rank4to10: 48 },
  },
  legendary: {
    label: "전설",
    encounterWeight: 3,
    sizeExponent: 6.0,
    recordCoins: { rank1: 420, rank2: 270, rank3: 184, rank4to10: 96 },
  },
};

export const FISH: Record<FishId, Fish> = {
  // === 흔함 (6) ===
  crucian_carp: {
    id: "crucian_carp",
    name: "붕어",
    tier: "common",
    minSize: 10,
    maxSize: 45,
    description: "어느 저수지에나 사는 친근한 물고기. 첫 낚시의 단골손님이다.",
  },
  minnow: {
    id: "minnow",
    name: "피라미",
    tier: "common",
    minSize: 6,
    maxSize: 20,
    description: "여울에서 반짝이며 떼 지어 헤엄친다. 작지만 입질이 잦다.",
  },
  killifish: {
    id: "killifish",
    name: "송사리",
    tier: "common",
    minSize: 3,
    maxSize: 12,
    description: "손톱만 한 작은 물고기. 큰 놈을 만나면 그날은 운이 좋은 날이다.",
  },
  loach: {
    id: "loach",
    name: "미꾸라지",
    tier: "common",
    minSize: 8,
    maxSize: 30,
    description: "진흙 바닥을 미끄러지듯 다닌다. 손에 쥐기가 영 까다롭다.",
  },
  goby: {
    id: "goby",
    name: "망둑어",
    tier: "common",
    minSize: 6,
    maxSize: 25,
    description: "갯벌과 강어귀를 오가는 억센 물고기. 머리가 유난히 크다.",
  },
  river_shrimp: {
    id: "river_shrimp",
    name: "줄새우",
    tier: "common",
    minSize: 2,
    maxSize: 11,
    description: "투명한 몸에 줄무늬가 비친다. 큰 놈은 제법 씨알이 굵다.",
  },

  // === 보통 (7) ===
  carp: {
    id: "carp",
    name: "잉어",
    tier: "uncommon",
    minSize: 30,
    maxSize: 110,
    description: "묵직하게 버티는 힘이 일품이다. 노련한 손맛을 안겨 준다.",
  },
  catfish: {
    id: "catfish",
    name: "메기",
    tier: "uncommon",
    minSize: 30,
    maxSize: 120,
    description: "긴 수염으로 어둠 속을 더듬는 야행성. 입이 큼지막하다.",
  },
  sea_bass: {
    id: "sea_bass",
    name: "농어",
    tier: "uncommon",
    minSize: 30,
    maxSize: 100,
    description: "강어귀를 누비는 은빛 사냥꾼. 챔질 순간이 짜릿하다.",
  },
  mullet: {
    id: "mullet",
    name: "숭어",
    tier: "uncommon",
    minSize: 25,
    maxSize: 80,
    description: "수면 위로 힘차게 뛰어오르곤 한다. 살이 단단하다.",
  },
  dodari: {
    id: "dodari",
    name: "도다리",
    tier: "uncommon",
    minSize: 18,
    maxSize: 55,
    description: "바닥에 납작 붙어 모래색으로 몸을 숨긴다.",
  },
  flatfish: {
    id: "flatfish",
    name: "가자미",
    tier: "uncommon",
    minSize: 20,
    maxSize: 60,
    description: "두 눈이 한쪽으로 쏠린 납작한 물고기. 모래밭의 주인이다.",
  },
  gizzard_shad: {
    id: "gizzard_shad",
    name: "전어",
    tier: "uncommon",
    minSize: 14,
    maxSize: 35,
    description: "가을이면 기름이 차올라 고소한 향을 풍긴다.",
  },

  // === 희귀 (7) ===
  trout: {
    id: "trout",
    name: "송어",
    tier: "rare",
    minSize: 25,
    maxSize: 80,
    description: "맑고 차가운 물에서만 산다. 알록달록한 옆줄이 곱다.",
  },
  pike: {
    id: "pike",
    name: "강꼬치고기",
    tier: "rare",
    minSize: 40,
    maxSize: 140,
    description: "날카로운 이빨을 가진 민물의 포식자. 단숨에 미끼를 채간다.",
  },
  red_seabream: {
    id: "red_seabream",
    name: "참돔",
    tier: "rare",
    minSize: 30,
    maxSize: 100,
    description: "붉은 비늘에 푸른 점이 흩뿌려진 귀한 물고기.",
  },
  hairtail: {
    id: "hairtail",
    name: "갈치",
    tier: "rare",
    minSize: 50,
    maxSize: 160,
    description: "은빛 칼날처럼 길게 뻗은 몸. 깊은 바다에서 곧추선 채 헤엄친다.",
  },
  halibut: {
    id: "halibut",
    name: "광어",
    tier: "rare",
    minSize: 35,
    maxSize: 120,
    description: "넓적한 몸으로 바닥을 덮는 큰 가자미류. 대물일수록 듬직하다.",
  },
  rockfish: {
    id: "rockfish",
    name: "우럭",
    tier: "rare",
    minSize: 22,
    maxSize: 65,
    description: "갯바위 틈에 숨어 사는 단단한 물고기. 가시가 매섭다.",
  },
  rainbow_trout: {
    id: "rainbow_trout",
    name: "무지개송어",
    tier: "rare",
    minSize: 28,
    maxSize: 90,
    description: "옆구리에 무지개빛 띠가 흐른다. 차가운 물살을 거슬러 오른다.",
  },

  // === 영웅 (6) ===
  marlin: {
    id: "marlin",
    name: "청새치",
    tier: "epic",
    minSize: 150,
    maxSize: 450,
    description: "창처럼 뻗은 주둥이로 물살을 가른다. 한번 걸리면 사투가 시작된다.",
  },
  bluefin_tuna: {
    id: "bluefin_tuna",
    name: "참다랑어",
    tier: "epic",
    minSize: 100,
    maxSize: 300,
    description: "대양을 가로지르는 근육질의 거구. 끌어올리려면 온 힘을 쏟아야 한다.",
  },
  mahimahi: {
    id: "mahimahi",
    name: "만새기",
    tier: "epic",
    minSize: 80,
    maxSize: 210,
    description: "물 밖으로 나오면 황금빛에서 푸른빛으로 색이 변한다.",
  },
  sturgeon: {
    id: "sturgeon",
    name: "철갑상어",
    tier: "epic",
    minSize: 120,
    maxSize: 360,
    description: "갑옷 같은 비늘판을 두른 고대의 물고기. 수백 년을 산다고 한다.",
  },
  giant_octopus: {
    id: "giant_octopus",
    name: "대왕문어",
    tier: "epic",
    minSize: 90,
    maxSize: 300,
    description: "여덟 다리로 미끼를 휘감는 심해의 거인. 다리 폭으로 크기를 잰다.",
  },
  anglerfish: {
    id: "anglerfish",
    name: "심해아귀",
    tier: "epic",
    minSize: 45,
    maxSize: 150,
    description: "이마의 발광 미끼로 먹이를 꾄다. 깊은 어둠에서만 끌려 나온다.",
  },

  // === 전설 (4) ===
  platinum_carp: {
    id: "platinum_carp",
    name: "백금 잉어",
    tier: "legendary",
    minSize: 100,
    maxSize: 320,
    description: "백금빛으로 빛나는 전설의 잉어. 보는 것만으로 복이 든다고 한다.",
  },
  starlit_ray: {
    id: "starlit_ray",
    name: "별빛 가오리",
    tier: "legendary",
    minSize: 200,
    maxSize: 800,
    description: "밤하늘을 닮은 등에 별무리가 반짝인다. 날개를 펼쳐 헤엄친다.",
  },
  abyssal_leviathan: {
    id: "abyssal_leviathan",
    name: "심연의 리바이어던",
    tier: "legendary",
    minSize: 400,
    maxSize: 1500,
    description: "심해 가장 깊은 곳에 잠든 거수. 낚싯대에 걸렸다는 기록조차 드물다.",
  },
  dragonscale_fish: {
    id: "dragonscale_fish",
    name: "무지개 비늘 용어",
    tier: "legendary",
    minSize: 300,
    maxSize: 1000,
    description: "용의 비늘을 닮은 일곱 빛깔 물고기. 잡은 자에게 행운이 따른다는 이야기.",
  },

  // === 물때 한정 특별 손님 (4) ===
  // 각자 자기 물때 창에만 입질한다(condition). 항상풀 30종과 섞이지 않아 공정성 청정 —
  // 사이즈는 일반 heavy-tail, 종별 리더보드 칸만 하나씩 더 생긴다.
  goldeye: {
    id: "goldeye",
    name: "여명 금눈돔",
    tier: "rare",
    minSize: 25,
    maxSize: 95,
    description: "동틀 녘에만 수면 가까이 올라오는 붉은 눈의 물고기. 아침 햇살에 눈이 금빛으로 빛난다.",
    condition: "dawn",
  },
  moonshadow_eel: {
    id: "moonshadow_eel",
    name: "달그림자 장어",
    tier: "uncommon",
    minSize: 40,
    maxSize: 130,
    description: "깊은 밤에만 움직이는 검은 장어. 달그림자를 따라 미끄러지듯 헤엄친다.",
    condition: "starlit",
  },
  mist_koi: {
    id: "mist_koi",
    name: "물안개 비단잉어",
    tier: "rare",
    minSize: 30,
    maxSize: 110,
    description: "물안개가 낄 때만 비치는 비단결 잉어. 안개가 걷히면 자취를 감춘다.",
    condition: "mist",
  },
  stormrider: {
    id: "stormrider",
    name: "폭풍 날치",
    tier: "uncommon",
    minSize: 20,
    maxSize: 70,
    description: "거센 물살이 일 때 파도를 가르며 날아오르는 날치. 폭풍을 두려워하지 않는다.",
    condition: "tempest",
  },
};

export const FISH_IDS = Object.keys(FISH) as FishId[];
export const FISH_TOTAL = FISH_IDS.length;

export function isFishId(id: string): id is FishId {
  return Object.prototype.hasOwnProperty.call(FISH, id);
}

// 사이즈(cm) 굴림 — heavy-tail. rng() ∈ [0, 1). 소수 첫째 자리까지.
export function rollFishSize(fishId: FishId, rng: () => number): number {
  const f = FISH[fishId];
  const k = FISH_TIERS[f.tier].sizeExponent;
  const p = Math.pow(rng(), k);
  const size = f.minSize + (f.maxSize - f.minSize) * p;
  return Math.round(size * 10) / 10;
}

// 어떤 종이 걸리나 — 티어 가중치로 티어를 뽑고, 티어 안에서 종을 균등 추첨.
// rng() ∈ [0, 1).
// activeCondition 을 주면 그 물때 한정 특별 손님이 자기 티어 풀에 합류한다. 안 주면(undefined)
//   물때 종은 전부 제외 → 항상풀 30종만(기존과 바이트 동일). 특별 손님은 자기 창에서만 등장.
export function pickFishId(
  rng: () => number,
  activeCondition?: MulttaeConditionId,
): FishId {
  const totalWeight = FISH_TIER_ORDER.reduce(
    (sum, t) => sum + FISH_TIERS[t].encounterWeight,
    0,
  );
  let roll = rng() * totalWeight;
  let tier: FishTier = FISH_TIER_ORDER[FISH_TIER_ORDER.length - 1];
  for (const t of FISH_TIER_ORDER) {
    if (roll < FISH_TIERS[t].encounterWeight) {
      tier = t;
      break;
    }
    roll -= FISH_TIERS[t].encounterWeight;
  }
  const species = FISH_IDS.filter(
    (id) =>
      FISH[id].tier === tier &&
      (FISH[id].condition === undefined ||
        FISH[id].condition === activeCondition),
  );
  const idx = Math.min(species.length - 1, Math.floor(rng() * species.length));
  return species[idx];
}

// 종별 주간 기록 보상 코인 — 순위는 1-based. 10등 밖이면 0.
export function recordCoinForRank(fishId: FishId, rank: number): number {
  const coins = FISH_TIERS[FISH[fishId].tier].recordCoins;
  if (rank <= 0) return 0;
  if (rank === 1) return coins.rank1;
  if (rank === 2) return coins.rank2;
  if (rank === 3) return coins.rank3;
  if (rank <= 10) return coins.rank4to10;
  return 0;
}

// 사이즈 표기 — 1m 이상이면 m 병기. UI/연출 공용.
export function formatFishSize(cm: number): string {
  if (cm >= 100) {
    const m = Math.round((cm / 100) * 100) / 100;
    return `${cm}cm (${m}m)`;
  }
  return `${cm}cm`;
}
