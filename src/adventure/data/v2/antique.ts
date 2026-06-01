// 보물 탐사 — 골동품 카탈로그 + 보존상태 분포 + 발굴 추첨 + 감정가.
//
// 설계: docs/treasure-hunt-plan.md
// 순수 데이터/순수 함수 모듈. 클라(도감 UI)·서버(발굴 권위 판정, PR-3) 공용.
//
// 핵심 원칙:
// - 희귀도·보존상태는 순수 운. 반응 속도·캐릭터 스탯과 무관(서버에서만 굴린다).
// - 보존상태는 heavy-tail(rng^k) — 온전한 골동품이 희박 → 노가다 우위 억제, 운 좋은
//   한 번의 발굴이 잭팟을 남긴다.
// - 골동품은 전투 스탯 0. 가치는 감정가(거래)·도감·칭호로만.

export type AntiqueTier = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type AntiqueTheme = "ceramic" | "coin" | "ornament" | "relic";

export type AntiqueId =
  // 흔함 (6)
  | "clay_shard"
  | "copper_coin"
  | "bone_button"
  | "iron_buckle"
  | "glass_bead"
  | "clay_whistle"
  // 보통 (6)
  | "bronze_mirror"
  | "jade_pendant"
  | "silver_coin"
  | "ink_stone"
  | "ceramic_bowl"
  | "brass_bell"
  // 희귀 (5)
  | "gilt_hairpin"
  | "celadon_vase"
  | "bronze_seal"
  | "gold_coin"
  | "lacquer_box"
  // 영웅 (4)
  | "jade_burial_mask"
  | "royal_seal"
  | "phoenix_crown"
  | "celestial_globe"
  // 전설 (3)
  | "dragon_jade_seal"
  | "starfall_diadem"
  | "eternal_lantern";

export type Antique = {
  id: AntiqueId;
  name: string;
  tier: AntiqueTier;
  theme: AntiqueTheme;
  /** 보존상태 100 기준 감정가(골드). 실제 감정가는 보존상태로 깎인다(appraiseValue). */
  baseValue: number;
  description: string;
};

export type AntiqueTierMeta = {
  label: string;
  /** 발굴 지점에서 이 티어가 묻혀 있을 추첨 가중치(전 티어 합 대비). 티어 안에서는 균등. */
  digRarityWeight: number;
  /** 보존상태 heavy-tail 지수 k. 클수록 온전한 상태가 희박. */
  conditionExponent: number;
  /** 감정사 분해 시 주는 발굴 코인(PR-6). */
  dismantleCoins: number;
};

export const ANTIQUE_THEME_LABEL: Record<AntiqueTheme, string> = {
  ceramic: "도자기",
  coin: "주화",
  ornament: "장신구",
  relic: "유물장식",
};

// 티어 순서 = 흔함 → 전설. 도감 정렬·추첨 순회에 그대로 쓴다.
export const ANTIQUE_TIER_ORDER: readonly AntiqueTier[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;

export const ANTIQUE_TIERS: Record<AntiqueTier, AntiqueTierMeta> = {
  common: {
    label: "흔함",
    digRarityWeight: 45,
    conditionExponent: 2.0,
    dismantleCoins: 1,
  },
  uncommon: {
    label: "보통",
    digRarityWeight: 30,
    conditionExponent: 2.5,
    dismantleCoins: 3,
  },
  rare: {
    label: "희귀",
    digRarityWeight: 16,
    conditionExponent: 3.0,
    dismantleCoins: 8,
  },
  epic: {
    label: "영웅",
    digRarityWeight: 7,
    conditionExponent: 4.0,
    dismantleCoins: 20,
  },
  legendary: {
    label: "전설",
    digRarityWeight: 2,
    conditionExponent: 5.0,
    dismantleCoins: 50,
  },
};

/** 보존상태 하한 — 가장 삭은 골동품도 이 값. */
export const MIN_CONDITION = 5;

/** 감정가 = baseValue × (FLOOR + (1-FLOOR) × condition/100). 온전품 프리미엄. */
export const APPRAISE_FLOOR_FACTOR = 0.3;

export const ANTIQUES: Record<AntiqueId, Antique> = {
  // === 흔함 (6) ===
  clay_shard: {
    id: "clay_shard",
    name: "깨진 토기 조각",
    tier: "common",
    theme: "ceramic",
    baseValue: 45,
    description: "어느 시대에나 굴러다니던 흔한 그릇의 파편. 수집가의 첫 발굴품으로 제격이다.",
  },
  copper_coin: {
    id: "copper_coin",
    name: "녹슨 동전",
    tier: "common",
    theme: "coin",
    baseValue: 60,
    description: "푸른 녹이 두껍게 앉은 옛 동전. 새겨진 글자는 알아보기 어렵다.",
  },
  bone_button: {
    id: "bone_button",
    name: "낡은 뼈 단추",
    tier: "common",
    theme: "ornament",
    baseValue: 50,
    description: "짐승 뼈를 깎아 만든 단추. 오래된 외투에서 떨어져 나온 듯하다.",
  },
  iron_buckle: {
    id: "iron_buckle",
    name: "쇠 허리띠 고리",
    tier: "common",
    theme: "relic",
    baseValue: 70,
    description: "투박하게 벼려낸 허리띠 고리. 흙 속에서 흔히 나온다.",
  },
  glass_bead: {
    id: "glass_bead",
    name: "흐린 유리구슬",
    tier: "common",
    theme: "ornament",
    baseValue: 55,
    description: "빛을 잃은 작은 유리구슬. 한때는 목걸이를 이루었을 것이다.",
  },
  clay_whistle: {
    id: "clay_whistle",
    name: "흙 피리",
    tier: "common",
    theme: "ceramic",
    baseValue: 90,
    description: "아이 손바닥만 한 흙 피리. 불면 둔탁한 소리가 난다.",
  },

  // === 보통 (6) ===
  bronze_mirror: {
    id: "bronze_mirror",
    name: "청동 거울",
    tier: "uncommon",
    theme: "relic",
    baseValue: 240,
    description: "뒷면에 덩굴무늬가 새겨진 청동 거울. 닦으면 어렴풋이 얼굴이 비친다.",
  },
  jade_pendant: {
    id: "jade_pendant",
    name: "옥 노리개",
    tier: "uncommon",
    theme: "ornament",
    baseValue: 300,
    description: "은은한 빛을 머금은 옥 장식. 끈은 삭아 사라졌다.",
  },
  silver_coin: {
    id: "silver_coin",
    name: "은화",
    tier: "uncommon",
    theme: "coin",
    baseValue: 200,
    description: "변색됐지만 무게가 묵직한 은화. 옛 상인들이 쓰던 것이다.",
  },
  ink_stone: {
    id: "ink_stone",
    name: "벼루",
    tier: "uncommon",
    theme: "relic",
    baseValue: 180,
    description: "한쪽이 닳도록 먹을 갈던 돌벼루. 글방의 흔적이 배어 있다.",
  },
  ceramic_bowl: {
    id: "ceramic_bowl",
    name: "청자 사발",
    tier: "uncommon",
    theme: "ceramic",
    baseValue: 360,
    description: "맑은 비취색이 감도는 사발. 굽에 장인의 손자국이 남았다.",
  },
  brass_bell: {
    id: "brass_bell",
    name: "놋쇠 방울",
    tier: "uncommon",
    theme: "relic",
    baseValue: 220,
    description: "흔들면 맑게 울리는 작은 방울. 말 안장이나 문에 달았던 듯하다.",
  },

  // === 희귀 (5) ===
  gilt_hairpin: {
    id: "gilt_hairpin",
    name: "도금 비녀",
    tier: "rare",
    theme: "ornament",
    baseValue: 850,
    description: "끝에 봉황을 새긴 도금 비녀. 귀한 집안의 여인이 꽂았을 것이다.",
  },
  celadon_vase: {
    id: "celadon_vase",
    name: "상감 청자 매병",
    tier: "rare",
    theme: "ceramic",
    baseValue: 1400,
    description: "학과 구름을 상감으로 박아 넣은 매병. 어깨선이 유려하다.",
  },
  bronze_seal: {
    id: "bronze_seal",
    name: "관인",
    tier: "rare",
    theme: "relic",
    baseValue: 900,
    description: "손잡이에 거북을 새긴 관청의 도장. 바닥의 글자가 권위를 말한다.",
  },
  gold_coin: {
    id: "gold_coin",
    name: "금화",
    tier: "rare",
    theme: "coin",
    baseValue: 700,
    description: "거의 닳지 않은 채 빛나는 금화. 한 닢으로도 살림이 넉넉했을 값이다.",
  },
  lacquer_box: {
    id: "lacquer_box",
    name: "나전 칠함",
    tier: "rare",
    theme: "relic",
    baseValue: 1100,
    description: "자개를 박아 꽃을 수놓은 옻칠 상자. 뚜껑을 열면 향이 남아 있다.",
  },

  // === 영웅 (4) ===
  jade_burial_mask: {
    id: "jade_burial_mask",
    name: "옥장 가면",
    tier: "epic",
    theme: "relic",
    baseValue: 4200,
    description: "수백 조각의 옥을 엮어 만든 장례 가면. 한 시대의 왕을 덮었던 것이다.",
  },
  royal_seal: {
    id: "royal_seal",
    name: "옥새",
    tier: "epic",
    theme: "relic",
    baseValue: 5500,
    description: "용을 틀어 올린 손잡이의 옥 도장. 왕의 이름으로 천하를 움직였다.",
  },
  phoenix_crown: {
    id: "phoenix_crown",
    name: "봉황 금관",
    tier: "epic",
    theme: "ornament",
    baseValue: 4800,
    description: "나뭇가지처럼 뻗은 금관에 봉황과 곡옥이 흔들린다. 쓴 자는 하늘의 뜻을 대신했다.",
  },
  celestial_globe: {
    id: "celestial_globe",
    name: "혼천의",
    tier: "epic",
    theme: "relic",
    baseValue: 3200,
    description: "별의 운행을 좇아 깎은 청동 천구의. 톱니가 아직도 맞물린다.",
  },

  // === 전설 (3) ===
  dragon_jade_seal: {
    id: "dragon_jade_seal",
    name: "구룡 옥새",
    tier: "legendary",
    theme: "relic",
    baseValue: 38000,
    description: "아홉 마리 용이 휘감은 전설의 옥새. 잃어버린 왕조와 함께 사라졌다 전한다.",
  },
  starfall_diadem: {
    id: "starfall_diadem",
    name: "별내림 보관",
    tier: "legendary",
    theme: "ornament",
    baseValue: 24000,
    description: "별빛을 굳혀 만들었다는 보관. 어둠 속에서도 스스로 희미하게 빛난다.",
  },
  eternal_lantern: {
    id: "eternal_lantern",
    name: "꺼지지 않는 등",
    tier: "legendary",
    theme: "relic",
    baseValue: 16000,
    description: "천 년을 밝혀 왔다는 옛 등. 심지가 없는데도 온기가 돈다.",
  },
};

export const ANTIQUE_IDS = Object.keys(ANTIQUES) as AntiqueId[];
export const ANTIQUE_TOTAL = ANTIQUE_IDS.length;

export function isAntiqueId(id: string): id is AntiqueId {
  return Object.prototype.hasOwnProperty.call(ANTIQUES, id);
}

// 보존상태(5~100) 굴림 — heavy-tail. rng() ∈ [0, 1). 정수.
export function rollCondition(antiqueId: AntiqueId, rng: () => number): number {
  const k = ANTIQUE_TIERS[ANTIQUES[antiqueId].tier].conditionExponent;
  const p = Math.pow(rng(), k);
  const cond = MIN_CONDITION + (100 - MIN_CONDITION) * p;
  return Math.max(MIN_CONDITION, Math.min(100, Math.round(cond)));
}

// 어떤 골동품이 묻혀 있나 — 티어 가중치로 티어를 뽑고, 티어 안에서 균등 추첨.
// rng() ∈ [0, 1). (발굴 지점 봉인은 서버에서 — PR-3.)
export function pickAntiqueId(rng: () => number): AntiqueId {
  const totalWeight = ANTIQUE_TIER_ORDER.reduce(
    (sum, t) => sum + ANTIQUE_TIERS[t].digRarityWeight,
    0,
  );
  let roll = rng() * totalWeight;
  let tier: AntiqueTier = ANTIQUE_TIER_ORDER[ANTIQUE_TIER_ORDER.length - 1];
  for (const t of ANTIQUE_TIER_ORDER) {
    if (roll < ANTIQUE_TIERS[t].digRarityWeight) {
      tier = t;
      break;
    }
    roll -= ANTIQUE_TIERS[t].digRarityWeight;
  }
  const kinds = ANTIQUE_IDS.filter((id) => ANTIQUES[id].tier === tier);
  const idx = Math.min(kinds.length - 1, Math.floor(rng() * kinds.length));
  return kinds[idx];
}

// 감정가(골드) — 보존상태로 깎인 결정적 가치. 시장가와 별개(랭킹·분해 기준).
export function appraiseValue(antiqueId: AntiqueId, condition: number): number {
  const base = ANTIQUES[antiqueId].baseValue;
  const c = Math.max(MIN_CONDITION, Math.min(100, condition));
  const factor = APPRAISE_FLOOR_FACTOR + (1 - APPRAISE_FLOOR_FACTOR) * (c / 100);
  return Math.round(base * factor);
}

// 보존상태 등급 라벨 — UI 연출 공용.
export function conditionGradeLabel(condition: number): string {
  if (condition >= 100) return "완벽";
  if (condition >= 85) return "온전";
  if (condition >= 60) return "양호";
  if (condition >= 30) return "보통";
  return "삭음";
}

// 보존상태 표기 — "82% (양호)".
export function formatCondition(condition: number): string {
  return `${condition}% (${conditionGradeLabel(condition)})`;
}
