import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_CASH_ITEM_IDS,
  type MuseunCashItemId,
} from "./museunCashItems";

export type MuseunCosmeticItemId = {
  [K in MuseunCashItemId]: (typeof MUSEUN_CASH_ITEMS)[K]["delivery"] extends "entitlement"
    ? K
    : never;
}[MuseunCashItemId];

export type MuseunCosmeticsState = {
  owned: MuseunCosmeticItemId[];
  chromaNames: ChromaNameId[];
  equippedChromaName: ChromaNameId | null;
  equippedProfileBorder: ProfileBorderItemId | null;
  equippedChatBadge: ChatBadgeItemId | null;
};

export const CHROMA_NAME_RARITIES = {
  common: { name: "일반", effect: "단색", weight: 1890 },
  rare: { name: "희귀", effect: "투톤", weight: 825 },
  epic: { name: "영웅", effect: "흐르는 크로마", weight: 385 },
  legendary: { name: "전설", effect: "특수 크로마", weight: 231 },
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
  { id: "royal", name: "로열", theme: "금빛·보라", rarity: "legendary" },
  { id: "celestial", name: "천상", theme: "백금·성운", rarity: "legendary" },
  { id: "hologram", name: "홀로그램", theme: "프리즘·오팔", rarity: "legendary" },
  { id: "eclipse", name: "이클립스", theme: "암흑·태양", rarity: "legendary" },
  { id: "genesis", name: "창세", theme: "태초의 빛·혼돈", rarity: "legendary" },
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

export const PROFILE_BORDER_VARIANTS = [
  { id: "prismatic", itemId: "prismatic_profile_border", name: "프리즘" },
  { id: "infernal", itemId: "infernal_profile_border", name: "업화" },
  { id: "oceanic", itemId: "oceanic_profile_border", name: "심해" },
  { id: "verdant", itemId: "verdant_profile_border", name: "세계수" },
  { id: "celestial", itemId: "celestial_profile_border", name: "천상" },
  { id: "obsidian", itemId: "obsidian_profile_border", name: "흑요석" },
  { id: "frozen", itemId: "frozen_profile_border", name: "빙결" },
  { id: "storm", itemId: "storm_profile_border", name: "폭풍" },
  { id: "rose", itemId: "rose_profile_border", name: "장미" },
  { id: "royal", itemId: "royal_profile_border", name: "황실" },
] as const;

export type ProfileBorderId = (typeof PROFILE_BORDER_VARIANTS)[number]["id"];
export type ProfileBorderItemId =
  (typeof PROFILE_BORDER_VARIANTS)[number]["itemId"];

export const CHAT_BADGE_VARIANTS = [
  { id: "starlight", itemId: "starlight_chat_badge", name: "별빛" },
  { id: "crown", itemId: "crown_chat_badge", name: "왕관" },
  { id: "flame", itemId: "flame_chat_badge", name: "불꽃" },
  { id: "crystal", itemId: "crystal_chat_badge", name: "수정" },
  { id: "leaf", itemId: "leaf_chat_badge", name: "새싹" },
  { id: "sword", itemId: "sword_chat_badge", name: "검" },
  { id: "shield", itemId: "shield_chat_badge", name: "방패" },
  { id: "trophy", itemId: "trophy_chat_badge", name: "트로피" },
  { id: "moon", itemId: "moon_chat_badge", name: "달빛" },
  { id: "sun", itemId: "sun_chat_badge", name: "태양" },
  { id: "heart", itemId: "heart_chat_badge", name: "하트" },
  { id: "skull", itemId: "skull_chat_badge", name: "해골" },
  { id: "lightning", itemId: "lightning_chat_badge", name: "번개" },
  { id: "snowflake", itemId: "snowflake_chat_badge", name: "눈꽃" },
  { id: "paw", itemId: "paw_chat_badge", name: "발자국" },
  { id: "feather", itemId: "feather_chat_badge", name: "깃털" },
  { id: "anchor", itemId: "anchor_chat_badge", name: "닻" },
  { id: "music", itemId: "music_chat_badge", name: "음표" },
  { id: "clover", itemId: "clover_chat_badge", name: "네잎클로버" },
  { id: "star", itemId: "star_chat_badge", name: "별" },
] as const;

export type ChatBadgeId = (typeof CHAT_BADGE_VARIANTS)[number]["id"];
export type ChatBadgeItemId = (typeof CHAT_BADGE_VARIANTS)[number]["itemId"];

export type MuseunCosmeticAppearance = {
  profileBorder: ProfileBorderId | null;
  chatBadge: ChatBadgeId | null;
  chatNameEffect: ChromaNameId | null;
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
      equippedChromaName: null,
      equippedProfileBorder: null,
      equippedChatBadge: null,
    };
  }
  const raw = value as {
    [key: string]: unknown;
    owned?: unknown;
    chromaNames?: unknown;
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
  return {
    owned,
    chromaNames,
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
): { state: MuseunCosmeticsState; alreadyOwned: boolean } {
  const state = parseMuseunCosmetics(value);
  if (state.owned.includes(itemId)) return { state, alreadyOwned: true };
  const nextState: MuseunCosmeticsState = {
    ...state,
    owned: [...state.owned, itemId],
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

export function equipProfileBorder(
  value: unknown,
  itemId: ProfileBorderItemId | null,
): MuseunCosmeticsState | null {
  const state = parseMuseunCosmetics(value);
  if (itemId !== null && !state.owned.includes(itemId)) return null;
  return { ...state, equippedProfileBorder: itemId };
}

export function equipChatBadge(
  value: unknown,
  itemId: ChatBadgeItemId | null,
): MuseunCosmeticsState | null {
  const state = parseMuseunCosmetics(value);
  if (itemId !== null && !state.owned.includes(itemId)) return null;
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

export function unownedChromaNames(value: unknown): ChromaNameId[] {
  const owned = new Set(parseMuseunCosmetics(value).chromaNames);
  return CHROMA_NAME_IDS.filter((id) => !owned.has(id));
}

export function grantChromaName(
  value: unknown,
  chromaId: ChromaNameId,
): MuseunCosmeticsState {
  const state = parseMuseunCosmetics(value);
  if (state.chromaNames.includes(chromaId)) return state;
  return {
    ...state,
    chromaNames: [...state.chromaNames, chromaId],
    equippedChromaName: chromaId,
  };
}

export function equipChromaName(
  value: unknown,
  chromaId: ChromaNameId | null,
): MuseunCosmeticsState | null {
  const state = parseMuseunCosmetics(value);
  if (chromaId !== null && !state.chromaNames.includes(chromaId)) return null;
  return { ...state, equippedChromaName: chromaId };
}

export function chromaNameOdds(value: unknown): Array<{
  id: ChromaNameId;
  probabilityPct: number;
}> {
  const available = unownedChromaNames(value);
  if (available.length === 0) return [];
  const totalWeight = available.reduce(
    (sum, id) => sum + chromaNameWeight(id),
    0,
  );
  return available.map((id) => ({
    id,
    probabilityPct: (chromaNameWeight(id) / totalWeight) * 100,
  }));
}

export function chromaNameWeight(chromaId: ChromaNameId): number {
  const variant = getChromaNameVariant(chromaId);
  return CHROMA_NAME_RARITIES[variant.rarity].weight;
}

export function chromaNameDrawWeight(value: unknown): number {
  return unownedChromaNames(value).reduce(
    (sum, id) => sum + chromaNameWeight(id),
    0,
  );
}

export function drawChromaNameByRoll(
  value: unknown,
  roll: number,
): ChromaNameId | null {
  const available = unownedChromaNames(value);
  const totalWeight = available.reduce(
    (sum, id) => sum + chromaNameWeight(id),
    0,
  );
  if (totalWeight === 0) return null;
  let cursor = Math.max(0, Math.min(totalWeight - 1, Math.floor(roll)));
  for (const id of available) {
    const weight = chromaNameWeight(id);
    if (cursor < weight) return id;
    cursor -= weight;
  }
  return available.at(-1) ?? null;
}

export function museunCosmeticAppearance(
  value: unknown,
): MuseunCosmeticAppearance {
  const cosmetics = parseMuseunCosmetics(value);
  const profileBorder = PROFILE_BORDER_VARIANTS.find(
    (variant) => variant.itemId === cosmetics.equippedProfileBorder,
  );
  const chatBadge = CHAT_BADGE_VARIANTS.find(
    (variant) => variant.itemId === cosmetics.equippedChatBadge,
  );
  return {
    profileBorder: profileBorder?.id ?? null,
    chatBadge: chatBadge?.id ?? null,
    chatNameEffect: cosmetics.equippedChromaName,
  };
}
