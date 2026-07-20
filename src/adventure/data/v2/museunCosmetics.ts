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
};

export const CHROMA_NAME_RARITIES = {
  common: { name: "일반", effect: "단색", weight: 12 },
  rare: { name: "희귀", effect: "투톤", weight: 5 },
  epic: { name: "영웅", effect: "흐르는 크로마", weight: 2 },
  legendary: { name: "전설", effect: "특수 크로마", weight: 1 },
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
  { id: "abyss", name: "심해", theme: "청록·남색", rarity: "rare" },
  { id: "starlight", name: "별빛", theme: "남색·분홍", rarity: "rare" },
  { id: "blossom", name: "벚꽃", theme: "분홍·살구", rarity: "rare" },
  { id: "venom", name: "베놈", theme: "연두·초록", rarity: "rare" },
  { id: "ocean", name: "오션", theme: "하늘·바다", rarity: "rare" },
  { id: "sunset", name: "선셋", theme: "주황·자주", rarity: "rare" },
  { id: "glacier", name: "빙하", theme: "은빛·하늘", rarity: "rare" },
  { id: "mintrose", name: "민트 로즈", theme: "민트·장미", rarity: "rare" },
  { id: "spectrum", name: "스펙트럼", theme: "무지개", rarity: "epic" },
  { id: "aurora", name: "오로라", theme: "청록·보라", rarity: "epic" },
  { id: "inferno", name: "인페르노", theme: "진홍·황금", rarity: "epic" },
  { id: "cyber", name: "사이버", theme: "시안·네온 핑크", rarity: "epic" },
  { id: "twilight", name: "황혼", theme: "보라·주황", rarity: "epic" },
  { id: "solar", name: "솔라", theme: "황금·주홍", rarity: "epic" },
  { id: "royal", name: "로열", theme: "금빛·보라", rarity: "legendary" },
  { id: "celestial", name: "천상", theme: "백금·성운", rarity: "legendary" },
  { id: "hologram", name: "홀로그램", theme: "프리즘·오팔", rarity: "legendary" },
  { id: "eclipse", name: "이클립스", theme: "암흑·태양", rarity: "legendary" },
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

export type MuseunCosmeticAppearance = {
  profileBorder: "prismatic" | null;
  chatBadge: "starlight" | null;
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
    return { owned: [], chromaNames: [], equippedChromaName: null };
  }
  const raw = value as {
    owned?: unknown;
    chromaNames?: unknown;
    equippedChromaName?: unknown;
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
  return { owned, chromaNames, equippedChromaName };
}

export function unlockMuseunCosmetic(
  value: unknown,
  itemId: MuseunCosmeticItemId,
): { state: MuseunCosmeticsState; alreadyOwned: boolean } {
  const state = parseMuseunCosmetics(value);
  if (state.owned.includes(itemId)) return { state, alreadyOwned: true };
  return {
    state: { ...state, owned: [...state.owned, itemId] },
    alreadyOwned: false,
  };
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
  const owned = new Set(cosmetics.owned);
  return {
    profileBorder: owned.has("prismatic_profile_border")
      ? "prismatic"
      : null,
    chatBadge: owned.has("starlight_chat_badge") ? "starlight" : null,
    chatNameEffect: cosmetics.equippedChromaName,
  };
}
