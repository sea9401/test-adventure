import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_CASH_ITEM_IDS,
  type MuseunCashItemId,
} from "./museunCashItems";
import {
  bestArenaChampionshipBadge,
  type ArenaChampionshipBadge,
} from "./arenaChampionshipBadges";

export type MuseunCosmeticItemId = {
  [K in MuseunCashItemId]: (typeof MUSEUN_CASH_ITEMS)[K]["delivery"] extends "entitlement"
    ? K
    : never;
}[MuseunCashItemId];

export type MuseunCosmeticAccessId = MuseunCosmeticItemId | ChromaNameId;

export const MUSEUN_COSMETIC_ACCESS_DAYS = 30;
export const MUSEUN_COSMETIC_ACCESS_MS =
  MUSEUN_COSMETIC_ACCESS_DAYS * 24 * 60 * 60 * 1_000;
// 기간제 도입 전에 획득한 꾸미기는 전환일부터 30일의 유예 사용 기간을 갖는다.
// 저장값에 accessUntil 이 생기면 이후에는 각 항목의 실제 만료 시각만 사용한다.
export const LEGACY_MUSEUN_COSMETIC_ACCESS_UNTIL = Date.UTC(2026, 7, 20);

export type MuseunCosmeticsState = {
  owned: MuseunCosmeticItemId[];
  chromaNames: ChromaNameId[];
  accessUntil: Partial<Record<MuseunCosmeticAccessId, number>>;
  equippedChromaName: ChromaNameId | null;
  equippedProfileBorder: ProfileBorderItemId | null;
  equippedChatBadge: ChatBadgeItemId | null;
};

export const CHROMA_NAME_RARITIES = {
  common: { name: "일반", effect: "단색", weight: 72 },
  rare: { name: "희귀", effect: "투톤", weight: 20 },
  epic: { name: "영웅", effect: "흐르는 크로마", weight: 6 },
  legendary: { name: "전설", effect: "주변 특수 효과", weight: 2 },
} as const;

export type ChromaNameRarity = keyof typeof CHROMA_NAME_RARITIES;

export const CHROMA_NAME_VARIANTS = [
  { id: "crimson", name: "크림슨", theme: "선명한 진홍", rarity: "common" },
  { id: "coral", name: "코럴", theme: "따뜻한 산호", rarity: "common" },
  { id: "amber", name: "앰버", theme: "깊은 호박빛", rarity: "common" },
  { id: "lime", name: "라임", theme: "싱그러운 연두", rarity: "common" },
  { id: "emerald", name: "에메랄드", theme: "맑은 녹색", rarity: "common" },
  { id: "teal", name: "틸", theme: "차분한 청록", rarity: "common" },
  { id: "sky", name: "스카이", theme: "밝은 하늘색", rarity: "common" },
  { id: "cobalt", name: "코발트", theme: "짙은 푸른색", rarity: "common" },
  { id: "indigo", name: "인디고", theme: "깊은 남색", rarity: "common" },
  { id: "violet", name: "바이올렛", theme: "선명한 보라", rarity: "common" },
  { id: "magenta", name: "마젠타", theme: "강렬한 자홍", rarity: "common" },
  { id: "rose", name: "로즈", theme: "부드러운 장미색", rarity: "common" },
  { id: "ruby", name: "루비", theme: "맑은 보석빛 빨강", rarity: "common" },
  { id: "tangerine", name: "탠저린", theme: "산뜻한 귤빛", rarity: "common" },
  { id: "gold", name: "골드", theme: "찬란한 금빛", rarity: "common" },
  { id: "olive", name: "올리브", theme: "차분한 황록", rarity: "common" },
  { id: "jade", name: "비취", theme: "깊은 옥빛", rarity: "common" },
  { id: "aqua", name: "아쿠아", theme: "투명한 물빛", rarity: "common" },
  { id: "azure", name: "아주르", theme: "선명한 푸른빛", rarity: "common" },
  { id: "navy", name: "네이비", theme: "고요한 군청", rarity: "common" },
  { id: "lavender", name: "라벤더", theme: "연한 보랏빛", rarity: "common" },
  { id: "plum", name: "플럼", theme: "짙은 자두빛", rarity: "common" },
  { id: "abyss", name: "심해", theme: "청록·남색", rarity: "rare" },
  { id: "starlight", name: "별빛", theme: "남색·분홍", rarity: "rare" },
  { id: "blossom", name: "벚꽃", theme: "분홍·살구", rarity: "rare" },
  { id: "venom", name: "베놈", theme: "연두·초록", rarity: "rare" },
  { id: "ocean", name: "오션", theme: "하늘·바다", rarity: "rare" },
  { id: "sunset", name: "선셋", theme: "주황·자주", rarity: "rare" },
  { id: "glacier", name: "빙하", theme: "은빛·하늘", rarity: "rare" },
  { id: "mintrose", name: "민트 로즈", theme: "민트·장미", rarity: "rare" },
  { id: "ember", name: "잿불", theme: "적갈·주황", rarity: "rare" },
  { id: "forest", name: "숲", theme: "이끼·에메랄드", rarity: "rare" },
  { id: "frostfire", name: "서리불꽃", theme: "빙청·주홍", rarity: "rare" },
  { id: "candy", name: "캔디", theme: "하늘·분홍", rarity: "rare" },
  { id: "thunder", name: "뇌광", theme: "전광·보라", rarity: "rare" },
  { id: "dusk", name: "해거름", theme: "남색·적갈", rarity: "rare" },
  { id: "spectrum", name: "스펙트럼", theme: "무지개", rarity: "epic" },
  { id: "aurora", name: "오로라", theme: "청록·보라", rarity: "epic" },
  { id: "inferno", name: "인페르노", theme: "진홍·황금", rarity: "epic" },
  { id: "cyber", name: "사이버", theme: "시안·네온 핑크", rarity: "epic" },
  { id: "twilight", name: "황혼", theme: "보라·주황", rarity: "epic" },
  { id: "solar", name: "솔라", theme: "황금·주홍", rarity: "epic" },
  { id: "galaxy", name: "은하", theme: "성운·우주", rarity: "epic" },
  { id: "neon", name: "네온", theme: "전광·형광", rarity: "epic" },
  { id: "phantom", name: "환영", theme: "청록·유령빛", rarity: "epic" },
  { id: "royal", name: "로열", theme: "금빛·보라", rarity: "epic" },
  { id: "celestial", name: "천상", theme: "백금·성운", rarity: "epic" },
  { id: "hologram", name: "홀로그램", theme: "프리즘·오팔", rarity: "epic" },
  { id: "eclipse", name: "이클립스", theme: "암흑·태양", rarity: "epic" },
  { id: "genesis", name: "창세", theme: "태초의 빛·혼돈", rarity: "epic" },
  { id: "hellfire", name: "겁화", theme: "타오르는 불꽃", rarity: "legendary" },
  { id: "stormcall", name: "천뢰", theme: "쏟아지는 뇌전", rarity: "legendary" },
  { id: "permafrost", name: "빙결", theme: "서리와 눈꽃", rarity: "legendary" },
  { id: "constellation", name: "성좌", theme: "별빛과 성운", rarity: "legendary" },
  { id: "umbral", name: "암영", theme: "피어오르는 그림자", rarity: "legendary" },
  { id: "petalfall", name: "낙화", theme: "흩날리는 꽃잎", rarity: "legendary" },
] as const satisfies readonly {
  id: string;
  name: string;
  theme: string;
  rarity: ChromaNameRarity;
}[];

export type ChromaNameId = (typeof CHROMA_NAME_VARIANTS)[number]["id"];

export const CHROMA_NAME_IDS = CHROMA_NAME_VARIANTS.map(
  (variant) => variant.id,
) as ChromaNameId[];

const CHROMA_NAME_DRAW_VARIANTS = CHROMA_NAME_VARIANTS.map(
  ({ id, rarity }) => ({ itemId: id, rarity }),
);

export const PROFILE_BORDER_VARIANTS = [
  {
    id: "prismatic",
    itemId: "prismatic_profile_border",
    name: "프리즘",
    rarity: "epic",
    motion: "animated",
    interior: "animated",
    feature: "오팔빛 광휘",
  },
  {
    id: "infernal",
    itemId: "infernal_profile_border",
    name: "업화",
    rarity: "rare",
    motion: "animated",
    interior: "ambient",
    feature: "불씨와 화염광",
  },
  {
    id: "oceanic",
    itemId: "oceanic_profile_border",
    name: "심해",
    rarity: "rare",
    motion: "animated",
    interior: "ambient",
    feature: "물결광과 기포",
  },
  {
    id: "verdant",
    itemId: "verdant_profile_border",
    name: "세계수",
    rarity: "rare",
    motion: "animated",
    interior: "ambient",
    feature: "덩굴과 잎사귀",
  },
  {
    id: "celestial",
    itemId: "celestial_profile_border",
    name: "천상",
    rarity: "legendary",
    motion: "animated",
    interior: "animated",
    feature: "성운과 별자리",
  },
  {
    id: "obsidian",
    itemId: "obsidian_profile_border",
    name: "흑요석",
    rarity: "epic",
    motion: "animated",
    interior: "animated",
    feature: "용암 균열",
  },
  {
    id: "frozen",
    itemId: "frozen_profile_border",
    name: "빙결",
    rarity: "epic",
    motion: "animated",
    interior: "animated",
    feature: "서리와 눈 결정",
  },
  {
    id: "storm",
    itemId: "storm_profile_border",
    name: "폭풍",
    rarity: "epic",
    motion: "animated",
    interior: "animated",
    feature: "먹구름과 번개",
  },
  {
    id: "rose",
    itemId: "rose_profile_border",
    name: "장미",
    rarity: "rare",
    motion: "animated",
    interior: "ambient",
    feature: "흩날리는 꽃잎",
  },
  {
    id: "royal",
    itemId: "royal_profile_border",
    name: "황실",
    rarity: "epic",
    motion: "animated",
    interior: "animated",
    feature: "황금 문장",
  },
  {
    id: "iron",
    itemId: "iron_profile_border",
    name: "철제",
    rarity: "common",
    motion: "static",
    interior: "none",
    feature: "무광 철제 테두리",
  },
  {
    id: "bronze",
    itemId: "bronze_profile_border",
    name: "청동",
    rarity: "common",
    motion: "static",
    interior: "none",
    feature: "무광 청동 테두리",
  },
  {
    id: "sapphire",
    itemId: "sapphire_profile_border",
    name: "사파이어",
    rarity: "common",
    motion: "static",
    interior: "none",
    feature: "사파이어 단색 테두리",
  },
  {
    id: "amethyst",
    itemId: "amethyst_profile_border",
    name: "자수정",
    rarity: "common",
    motion: "static",
    interior: "none",
    feature: "자수정 단색 테두리",
  },
  {
    id: "jade",
    itemId: "jade_profile_border",
    name: "비취",
    rarity: "common",
    motion: "static",
    interior: "none",
    feature: "비취 단색 테두리",
  },
] as const;

export type ProfileBorderId = (typeof PROFILE_BORDER_VARIANTS)[number]["id"];
export type ProfileBorderItemId =
  (typeof PROFILE_BORDER_VARIANTS)[number]["itemId"];

export const CHAT_BADGE_VARIANTS = [
  { id: "starlight", itemId: "starlight_chat_badge", name: "별빛", rarity: "legendary" },
  { id: "crown", itemId: "crown_chat_badge", name: "왕관", rarity: "epic" },
  { id: "flame", itemId: "flame_chat_badge", name: "불꽃", rarity: "rare" },
  { id: "crystal", itemId: "crystal_chat_badge", name: "수정", rarity: "rare" },
  { id: "leaf", itemId: "leaf_chat_badge", name: "새싹", rarity: "common" },
  { id: "sword", itemId: "sword_chat_badge", name: "검", rarity: "common" },
  { id: "shield", itemId: "shield_chat_badge", name: "방패", rarity: "common" },
  { id: "trophy", itemId: "trophy_chat_badge", name: "트로피", rarity: "epic" },
  { id: "moon", itemId: "moon_chat_badge", name: "달빛", rarity: "rare" },
  { id: "sun", itemId: "sun_chat_badge", name: "태양", rarity: "rare" },
  { id: "heart", itemId: "heart_chat_badge", name: "하트", rarity: "common" },
  { id: "skull", itemId: "skull_chat_badge", name: "해골", rarity: "epic" },
  { id: "lightning", itemId: "lightning_chat_badge", name: "번개", rarity: "epic" },
  { id: "snowflake", itemId: "snowflake_chat_badge", name: "눈꽃", rarity: "rare" },
  { id: "paw", itemId: "paw_chat_badge", name: "발자국", rarity: "common" },
  { id: "feather", itemId: "feather_chat_badge", name: "깃털", rarity: "common" },
  { id: "anchor", itemId: "anchor_chat_badge", name: "닻", rarity: "common" },
  { id: "music", itemId: "music_chat_badge", name: "음표", rarity: "common" },
  { id: "clover", itemId: "clover_chat_badge", name: "네잎클로버", rarity: "common" },
  { id: "star", itemId: "star_chat_badge", name: "별", rarity: "common" },
  { id: "vein", itemId: "vein_chat_badge", name: "광맥", rarity: "common" },
  { id: "fish", itemId: "fish_chat_badge", name: "물고기", rarity: "common" },
  { id: "axe", itemId: "axe_chat_badge", name: "도끼", rarity: "common" },
  { id: "hammer", itemId: "hammer_chat_badge", name: "망치", rarity: "common" },
  { id: "alchemy", itemId: "alchemy_chat_badge", name: "연금술", rarity: "rare" },
  { id: "compass", itemId: "compass_chat_badge", name: "나침반", rarity: "rare" },
  { id: "dragon_eye", itemId: "dragon_eye_chat_badge", name: "용안", rarity: "epic" },
  { id: "five_elements", itemId: "five_elements_chat_badge", name: "오원소 문장", rarity: "legendary" },
] as const;

export type ChatBadgeId = (typeof CHAT_BADGE_VARIANTS)[number]["id"];
export type ChatBadgeItemId = (typeof CHAT_BADGE_VARIANTS)[number]["itemId"];

export const PROFILE_BORDER_RARITIES = {
  common: { name: "일반", effect: "테두리형", weight: 60 },
  rare: { name: "희귀", effect: "내부 배경 효과", weight: 27 },
  epic: { name: "영웅", effect: "움직이는 내부 특수 효과", weight: 10 },
  legendary: { name: "전설", effect: "전용 내부 연출", weight: 3 },
} as const;

export const CHAT_BADGE_RARITIES = {
  common: { name: "일반", effect: "일반 배지", weight: 70 },
  rare: { name: "희귀", effect: "희귀 배지", weight: 22 },
  epic: { name: "영웅", effect: "영웅 배지", weight: 7 },
  legendary: { name: "전설", effect: "전설 배지", weight: 1 },
} as const;

export type CosmeticItemRarity = keyof typeof PROFILE_BORDER_RARITIES;

export const COSMETIC_RARITY_DISPLAY_ORDER = [
  "legendary",
  "epic",
  "rare",
  "common",
] as const satisfies readonly CosmeticItemRarity[];

const COSMETIC_RARITY_DISPLAY_RANK = Object.fromEntries(
  COSMETIC_RARITY_DISPLAY_ORDER.map((rarity, index) => [rarity, index]),
) as Record<CosmeticItemRarity, number>;

/** 꾸미기 도감·미리보기 공용: 전설 → 영웅 → 희귀 → 일반, 동급은 카탈로그 순서 유지. */
export function sortCosmeticVariantsByRarity<
  T extends { rarity: CosmeticItemRarity },
>(variants: readonly T[]): T[] {
  return [...variants].sort(
    (left, right) =>
      COSMETIC_RARITY_DISPLAY_RANK[left.rarity] -
      COSMETIC_RARITY_DISPLAY_RANK[right.rarity],
  );
}

export type MuseunCosmeticAppearance = {
  profileBorder: ProfileBorderId | null;
  chatBadge: ChatBadgeId | null;
  chatNameEffect: ChromaNameId | null;
  championshipBadge: ArenaChampionshipBadge | null;
};

export const MUSEUN_COSMETIC_ITEM_IDS = MUSEUN_CASH_ITEM_IDS.filter(
  (id): id is MuseunCosmeticItemId =>
    MUSEUN_CASH_ITEMS[id].delivery === "entitlement",
);

export function isMuseunCosmeticItemId(
  value: unknown,
): value is MuseunCosmeticItemId {
  return (
    typeof value === "string" &&
    (MUSEUN_COSMETIC_ITEM_IDS as readonly string[]).includes(value)
  );
}

export function parseMuseunCosmetics(value: unknown): MuseunCosmeticsState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      owned: [],
      chromaNames: [],
      accessUntil: {},
      equippedChromaName: null,
      equippedProfileBorder: null,
      equippedChatBadge: null,
    };
  }
  const raw = value as {
    [key: string]: unknown;
    owned?: unknown;
    chromaNames?: unknown;
    accessUntil?: unknown;
    equippedChromaName?: unknown;
    equippedProfileBorder?: unknown;
    equippedChatBadge?: unknown;
  };
  const rawOwned = raw.owned;
  const owned: MuseunCosmeticItemId[] = [];
  if (Array.isArray(rawOwned)) {
    for (const itemId of rawOwned) {
      if (isMuseunCosmeticItemId(itemId) && !owned.includes(itemId)) {
        owned.push(itemId);
      }
    }
  }
  const chromaNames: ChromaNameId[] = [];
  if (Array.isArray(raw.chromaNames)) {
    for (const chromaId of raw.chromaNames) {
      if (isChromaNameId(chromaId) && !chromaNames.includes(chromaId)) {
        chromaNames.push(chromaId);
      }
    }
  }
  // 단일 크로마 상품 시절의 미배포/테스트 세이브도 스펙트럼 보유로 흡수한다.
  if (
    Array.isArray(rawOwned) &&
    rawOwned.includes("chroma_chat_name") &&
    !chromaNames.includes("spectrum")
  ) {
    chromaNames.push("spectrum");
  }
  const equippedChromaName = Object.prototype.hasOwnProperty.call(
    raw,
    "equippedChromaName",
  )
    ? raw.equippedChromaName === null
      ? null
      : isChromaNameId(raw.equippedChromaName) &&
          chromaNames.includes(raw.equippedChromaName)
        ? raw.equippedChromaName
        : (chromaNames[0] ?? null)
    : (chromaNames[0] ?? null);
  const ownedProfileBorders = PROFILE_BORDER_VARIANTS.filter((variant) =>
    owned.includes(variant.itemId),
  ).map((variant) => variant.itemId);
  const ownedChatBadges = CHAT_BADGE_VARIANTS.filter((variant) =>
    owned.includes(variant.itemId),
  ).map((variant) => variant.itemId);
  const equippedProfileBorder = parseEquippedOwnedItem(
    raw,
    "equippedProfileBorder",
    ownedProfileBorders,
  );
  const equippedChatBadge = parseEquippedOwnedItem(
    raw,
    "equippedChatBadge",
    ownedChatBadges,
  );
  const accessUntil: Partial<Record<MuseunCosmeticAccessId, number>> = {};
  const rawAccessUntil =
    raw.accessUntil &&
    typeof raw.accessUntil === "object" &&
    !Array.isArray(raw.accessUntil)
      ? (raw.accessUntil as Record<string, unknown>)
      : {};
  for (const itemId of [...owned, ...chromaNames]) {
    const expiration = Number(rawAccessUntil[itemId]);
    accessUntil[itemId] =
      Number.isFinite(expiration) && expiration > 0
        ? Math.floor(expiration)
        : LEGACY_MUSEUN_COSMETIC_ACCESS_UNTIL;
  }
  return {
    owned,
    chromaNames,
    accessUntil,
    equippedChromaName,
    equippedProfileBorder,
    equippedChatBadge,
  };
}

function parseEquippedOwnedItem<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  ownedItems: readonly T[],
): T | null {
  if (!Object.prototype.hasOwnProperty.call(raw, key)) {
    return ownedItems[0] ?? null;
  }
  const value = raw[key];
  if (value === null) return null;
  return typeof value === "string" && ownedItems.includes(value as T)
    ? (value as T)
    : (ownedItems[0] ?? null);
}

export function unlockMuseunCosmetic(
  value: unknown,
  itemId: MuseunCosmeticItemId,
  now: number = Date.now(),
): { state: MuseunCosmeticsState; alreadyOwned: boolean } {
  const state = parseMuseunCosmetics(value);
  if (state.owned.includes(itemId)) return { state, alreadyOwned: true };
  const nextState: MuseunCosmeticsState = {
    ...state,
    owned: [...state.owned, itemId],
    accessUntil: {
      ...state.accessUntil,
      [itemId]: now + MUSEUN_COSMETIC_ACCESS_MS,
    },
  };
  if (isProfileBorderItemId(itemId)) {
    nextState.equippedProfileBorder = itemId;
  }
  if (isChatBadgeItemId(itemId)) {
    nextState.equippedChatBadge = itemId;
  }
  return {
    state: nextState,
    alreadyOwned: false,
  };
}

export function isProfileBorderItemId(
  value: unknown,
): value is ProfileBorderItemId {
  return PROFILE_BORDER_VARIANTS.some((variant) => variant.itemId === value);
}

export function isChatBadgeItemId(value: unknown): value is ChatBadgeItemId {
  return CHAT_BADGE_VARIANTS.some((variant) => variant.itemId === value);
}

export function isMuseunCosmeticAccessId(
  value: unknown,
): value is MuseunCosmeticAccessId {
  return isMuseunCosmeticItemId(value) || isChromaNameId(value);
}

export function isMuseunCosmeticUnlocked(
  value: unknown,
  itemId: MuseunCosmeticAccessId,
): boolean {
  const state = parseMuseunCosmetics(value);
  return isChromaNameId(itemId)
    ? state.chromaNames.includes(itemId)
    : state.owned.includes(itemId);
}

export function museunCosmeticAccessUntil(
  value: unknown,
  itemId: MuseunCosmeticAccessId,
): number | null {
  if (!isMuseunCosmeticUnlocked(value, itemId)) return null;
  return parseMuseunCosmetics(value).accessUntil[itemId] ?? null;
}

export function museunCosmeticAccessActive(
  value: unknown,
  itemId: MuseunCosmeticAccessId,
  now: number = Date.now(),
): boolean {
  const activeUntil = museunCosmeticAccessUntil(value, itemId);
  return activeUntil !== null && activeUntil > now;
}

export function extendMuseunCosmeticAccess(
  value: unknown,
  itemId: MuseunCosmeticAccessId,
  requestedDays: unknown,
  now: number = Date.now(),
): {
  state: MuseunCosmeticsState;
  days: number;
  previousUntil: number;
  activeUntil: number;
} | null {
  const days = Math.floor(Number(requestedDays));
  if (!Number.isFinite(days) || days <= 0 || days > 3_650) return null;
  const state = parseMuseunCosmetics(value);
  if (!isMuseunCosmeticUnlocked(state, itemId)) return null;
  const previousUntil = state.accessUntil[itemId] ?? 0;
  const activeUntil = Math.max(now, previousUntil) + days * 24 * 60 * 60 * 1_000;
  return {
    state: {
      ...state,
      accessUntil: { ...state.accessUntil, [itemId]: activeUntil },
    },
    days,
    previousUntil,
    activeUntil,
  };
}

export function unownedProfileBorders(value: unknown): ProfileBorderItemId[] {
  const owned = new Set(parseMuseunCosmetics(value).owned);
  return PROFILE_BORDER_VARIANTS.filter(
    (variant) => !owned.has(variant.itemId),
  ).map((variant) => variant.itemId);
}

export function unownedChatBadges(value: unknown): ChatBadgeItemId[] {
  const owned = new Set(parseMuseunCosmetics(value).owned);
  return CHAT_BADGE_VARIANTS.filter(
    (variant) => !owned.has(variant.itemId),
  ).map((variant) => variant.itemId);
}

function weightedItemOdds<T extends string>(
  available: readonly T[],
  weightOf: (itemId: T) => number,
): Array<{ itemId: T; probabilityPct: number }> {
  const totalWeight = available.reduce(
    (sum, itemId) => sum + weightOf(itemId),
    0,
  );
  if (totalWeight === 0) return [];
  return available.map((itemId) => ({
    itemId,
    probabilityPct: (weightOf(itemId) / totalWeight) * 100,
  }));
}

function drawWeightedItem<T extends string>(
  available: readonly T[],
  weightOf: (itemId: T) => number,
  roll: number,
): T | null {
  const totalWeight = available.reduce(
    (sum, itemId) => sum + weightOf(itemId),
    0,
  );
  if (totalWeight === 0) return null;
  let cursor = Math.max(0, Math.min(totalWeight - 1, Math.floor(roll)));
  for (const itemId of available) {
    const weight = weightOf(itemId);
    if (cursor < weight) return itemId;
    cursor -= weight;
  }
  return available.at(-1) ?? null;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function leastCommonMultiple(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  return Math.abs(left * right) / greatestCommonDivisor(left, right);
}

function rarityFirstItemWeights<T extends string>(
  available: readonly T[],
  variants: readonly {
    itemId: T;
    rarity: CosmeticItemRarity;
  }[],
  rarities: Record<CosmeticItemRarity, { weight: number }>,
): Map<T, number> {
  const availableSet = new Set(available);
  const availableByRarity = new Map<CosmeticItemRarity, T[]>();
  for (const variant of variants) {
    if (!availableSet.has(variant.itemId)) continue;
    const items = availableByRarity.get(variant.rarity) ?? [];
    items.push(variant.itemId);
    availableByRarity.set(variant.rarity, items);
  }
  const commonMultiple = [...availableByRarity.values()].reduce(
    (multiple, items) => leastCommonMultiple(multiple, items.length),
    1,
  );
  const weights = new Map<T, number>();
  for (const [rarity, items] of availableByRarity) {
    const itemWeight = (rarities[rarity].weight * commonMultiple) / items.length;
    for (const itemId of items) weights.set(itemId, itemWeight);
  }
  return weights;
}

export function profileBorderWeight(itemId: ProfileBorderItemId): number {
  const variant = PROFILE_BORDER_VARIANTS.find(
    (candidate) => candidate.itemId === itemId,
  )!;
  return PROFILE_BORDER_RARITIES[variant.rarity].weight;
}

export function chatBadgeWeight(itemId: ChatBadgeItemId): number {
  const variant = CHAT_BADGE_VARIANTS.find(
    (candidate) => candidate.itemId === itemId,
  )!;
  return CHAT_BADGE_RARITIES[variant.rarity].weight;
}

export function profileBorderOdds(value: unknown) {
  const available = unownedProfileBorders(value);
  const weights = rarityFirstItemWeights(
    available,
    PROFILE_BORDER_VARIANTS,
    PROFILE_BORDER_RARITIES,
  );
  return weightedItemOdds(available, (itemId) => weights.get(itemId) ?? 0);
}

export function chatBadgeOdds(value: unknown) {
  const available = unownedChatBadges(value);
  const weights = rarityFirstItemWeights(
    available,
    CHAT_BADGE_VARIANTS,
    CHAT_BADGE_RARITIES,
  );
  return weightedItemOdds(available, (itemId) => weights.get(itemId) ?? 0);
}

export function profileBorderDrawWeight(value: unknown): number {
  const available = unownedProfileBorders(value);
  const weights = rarityFirstItemWeights(
    available,
    PROFILE_BORDER_VARIANTS,
    PROFILE_BORDER_RARITIES,
  );
  return available.reduce(
    (sum, itemId) => sum + (weights.get(itemId) ?? 0),
    0,
  );
}

export function chatBadgeDrawWeight(value: unknown): number {
  const available = unownedChatBadges(value);
  const weights = rarityFirstItemWeights(
    available,
    CHAT_BADGE_VARIANTS,
    CHAT_BADGE_RARITIES,
  );
  return available.reduce(
    (sum, itemId) => sum + (weights.get(itemId) ?? 0),
    0,
  );
}

export function drawProfileBorderByRoll(
  value: unknown,
  roll: number,
): ProfileBorderItemId | null {
  const available = unownedProfileBorders(value);
  const weights = rarityFirstItemWeights(
    available,
    PROFILE_BORDER_VARIANTS,
    PROFILE_BORDER_RARITIES,
  );
  return drawWeightedItem(
    available,
    (itemId) => weights.get(itemId) ?? 0,
    roll,
  );
}

export function drawChatBadgeByRoll(
  value: unknown,
  roll: number,
): ChatBadgeItemId | null {
  const available = unownedChatBadges(value);
  const weights = rarityFirstItemWeights(
    available,
    CHAT_BADGE_VARIANTS,
    CHAT_BADGE_RARITIES,
  );
  return drawWeightedItem(
    available,
    (itemId) => weights.get(itemId) ?? 0,
    roll,
  );
}

export function equipProfileBorder(
  value: unknown,
  itemId: ProfileBorderItemId | null,
  now: number = Date.now(),
): MuseunCosmeticsState | null {
  const state = parseMuseunCosmetics(value);
  if (
    itemId !== null &&
    (!state.owned.includes(itemId) ||
      !museunCosmeticAccessActive(state, itemId, now))
  ) {
    return null;
  }
  return { ...state, equippedProfileBorder: itemId };
}

export function equipChatBadge(
  value: unknown,
  itemId: ChatBadgeItemId | null,
  now: number = Date.now(),
): MuseunCosmeticsState | null {
  const state = parseMuseunCosmetics(value);
  if (
    itemId !== null &&
    (!state.owned.includes(itemId) ||
      !museunCosmeticAccessActive(state, itemId, now))
  ) {
    return null;
  }
  return { ...state, equippedChatBadge: itemId };
}

export function isChromaNameId(value: unknown): value is ChromaNameId {
  return (
    typeof value === "string" &&
    (CHROMA_NAME_IDS as readonly string[]).includes(value)
  );
}

export function getChromaNameVariant(chromaId: ChromaNameId) {
  return CHROMA_NAME_VARIANTS.find(({ id }) => id === chromaId)!;
}

export function getProfileBorderVariant(profileBorderId: ProfileBorderId) {
  return PROFILE_BORDER_VARIANTS.find(({ id }) => id === profileBorderId)!;
}

export function unownedChromaNames(value: unknown): ChromaNameId[] {
  const owned = new Set(parseMuseunCosmetics(value).chromaNames);
  return CHROMA_NAME_IDS.filter((id) => !owned.has(id));
}

export function grantChromaName(
  value: unknown,
  chromaId: ChromaNameId,
  now: number = Date.now(),
): MuseunCosmeticsState {
  const state = parseMuseunCosmetics(value);
  if (state.chromaNames.includes(chromaId)) return state;
  return {
    ...state,
    chromaNames: [...state.chromaNames, chromaId],
    accessUntil: {
      ...state.accessUntil,
      [chromaId]: now + MUSEUN_COSMETIC_ACCESS_MS,
    },
    equippedChromaName: chromaId,
  };
}

export function equipChromaName(
  value: unknown,
  chromaId: ChromaNameId | null,
  now: number = Date.now(),
): MuseunCosmeticsState | null {
  const state = parseMuseunCosmetics(value);
  if (
    chromaId !== null &&
    (!state.chromaNames.includes(chromaId) ||
      !museunCosmeticAccessActive(state, chromaId, now))
  ) {
    return null;
  }
  return { ...state, equippedChromaName: chromaId };
}

export function chromaNameOdds(value: unknown): Array<{
  id: ChromaNameId;
  probabilityPct: number;
}> {
  const available = unownedChromaNames(value);
  const weights = rarityFirstItemWeights(
    available,
    CHROMA_NAME_DRAW_VARIANTS,
    CHROMA_NAME_RARITIES,
  );
  return weightedItemOdds(available, (id) => weights.get(id) ?? 0).map(
    ({ itemId, probabilityPct }) => ({ id: itemId, probabilityPct }),
  );
}

export function chromaNameDrawWeight(value: unknown): number {
  const available = unownedChromaNames(value);
  const weights = rarityFirstItemWeights(
    available,
    CHROMA_NAME_DRAW_VARIANTS,
    CHROMA_NAME_RARITIES,
  );
  return available.reduce((sum, id) => sum + (weights.get(id) ?? 0), 0);
}

export function drawChromaNameByRoll(
  value: unknown,
  roll: number,
): ChromaNameId | null {
  const available = unownedChromaNames(value);
  const weights = rarityFirstItemWeights(
    available,
    CHROMA_NAME_DRAW_VARIANTS,
    CHROMA_NAME_RARITIES,
  );
  return drawWeightedItem(available, (id) => weights.get(id) ?? 0, roll);
}

export function museunCosmeticAppearance(
  value: unknown,
  now: number = Date.now(),
  arenaChampionshipBadges?: unknown,
): MuseunCosmeticAppearance {
  const cosmetics = parseMuseunCosmetics(value);
  const profileBorder = PROFILE_BORDER_VARIANTS.find(
    (variant) => variant.itemId === cosmetics.equippedProfileBorder,
  );
  const chatBadge = CHAT_BADGE_VARIANTS.find(
    (variant) => variant.itemId === cosmetics.equippedChatBadge,
  );
  return {
    profileBorder:
      profileBorder &&
      museunCosmeticAccessActive(cosmetics, profileBorder.itemId, now)
        ? profileBorder.id
        : null,
    chatBadge:
      chatBadge && museunCosmeticAccessActive(cosmetics, chatBadge.itemId, now)
        ? chatBadge.id
        : null,
    chatNameEffect:
      cosmetics.equippedChromaName &&
      museunCosmeticAccessActive(
        cosmetics,
        cosmetics.equippedChromaName,
        now,
      )
        ? cosmetics.equippedChromaName
        : null,
    championshipBadge: bestArenaChampionshipBadge(arenaChampionshipBadges),
  };
}
