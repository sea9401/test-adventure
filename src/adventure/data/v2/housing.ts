import type { CoopBossKindId } from "./coopBosses";
import type { FishId } from "./fish";
import type { CodexMasteryCategory } from "./codexMasteryTypes";
import {
  codexTrophyDisplayCategory,
  isCodexTrophyId,
  type CodexTrophyDisplayCategory,
  type CodexTrophyId,
  type CodexMasteryTrophyTier,
} from "./codexMasteryTrophies";

// 개인 숙소 — 격자 배치와 공개 전시의 서버/클라이언트 공용 모델.
// 1차는 기본 가구를 전원에게 지급한다. 이후 가구 제작이 붙으면 owned 수량만 별도 파생해
// validateHousingState 의 ownedCounts 인자로 넘기면 배치 저장 형식은 그대로 유지된다.

export const HOUSING_SAVE_KEY = "housing.v1";
export const HOUSING_GRID_COLUMNS = 8;
export const HOUSING_GRID_ROWS = 6;
export const HOUSING_MAX_PLACEMENTS = 20;

export type HousingDisplayKind = "equipment" | "fish" | "boss";

export type HousingDisplayRef =
  | { kind: "equipment"; iid: string }
  | { kind: "fish"; fishId: FishId }
  | { kind: "boss"; bossId: CoopBossKindId };

export type HousingMasteryTrophyRef = {
  trophyId: CodexTrophyId;
};

export type HousingFurnitureCategory = "furniture" | "display";

export const HOUSING_FURNITURE = {
  traveler_bed: {
    id: "traveler_bed",
    name: "모험가의 침대",
    description: "긴 모험 뒤 잠시 숨을 고르는 소박한 침대입니다.",
    image: "/images/housing/traveler_bed.webp",
    category: "furniture",
    width: 2,
    height: 2,
    baseOwned: 1,
  },
  oak_desk: {
    id: "oak_desk",
    name: "원목 작업대",
    description: "모험 기록과 지도를 펼쳐 두는 단단한 작업대입니다.",
    image: "/images/housing/oak_desk.webp",
    category: "furniture",
    width: 2,
    height: 1,
    baseOwned: 1,
  },
  record_shelf: {
    id: "record_shelf",
    name: "모험 기록 서가",
    description: "지나온 지역의 기록을 모아 둔 작은 서가입니다.",
    image: "/images/housing/record_shelf.webp",
    category: "furniture",
    width: 2,
    height: 1,
    baseOwned: 1,
  },
  herb_planter: {
    id: "herb_planter",
    name: "약초 화분",
    description: "농장에서 옮겨 심은 약초가 은은한 향을 냅니다.",
    image: "/images/housing/herb_planter.webp",
    category: "furniture",
    width: 1,
    height: 1,
    baseOwned: 2,
  },
  trophy_aquarium: {
    id: "trophy_aquarium",
    name: "대물 전시 수조",
    description: "낚시 도감에 등록한 개인 최대어를 전시합니다.",
    image: "/images/housing/trophy_aquarium.webp",
    category: "display",
    displayKind: "fish",
    width: 2,
    height: 1,
    baseOwned: 1,
  },
  equipment_mannequin: {
    id: "equipment_mannequin",
    name: "장비 마네킹",
    description: "보유 중인 장비 한 점을 대표 장비로 전시합니다.",
    image: "/images/housing/equipment_mannequin.webp",
    category: "display",
    displayKind: "equipment",
    width: 1,
    height: 2,
    baseOwned: 2,
  },
  boss_trophy: {
    id: "boss_trophy",
    name: "토벌 트로피",
    description: "직접 토벌한 협동 보스의 기록을 전시합니다.",
    image: "/images/housing/boss_trophy.webp",
    category: "display",
    displayKind: "boss",
    width: 1,
    height: 1,
    baseOwned: 2,
  },
  weapon_rack: {
    id: "weapon_rack",
    name: "무기 진열대",
    description: "보유 중인 무기나 장비를 가로 진열대에 전시합니다.",
    image: "/images/housing/weapon_rack.webp",
    category: "display",
    displayKind: "equipment",
    width: 2,
    height: 1,
    baseOwned: 1,
  },
  pine_work_shelf: { id: "pine_work_shelf", name: "소나무 작업 선반", description: "다듬은 목재로 만든 실용적인 생활 가구입니다.", category: "furniture", width: 2, height: 1, baseOwned: 0 },
  iron_work_lamp: { id: "iron_work_lamp", name: "철제 작업등", description: "작업대 주변을 밝히는 단단한 조명입니다.", category: "furniture", width: 1, height: 1, baseOwned: 0 },
  life_work_desk: { id: "life_work_desk", name: "생활 장인의 작업대", description: "목공과 제련의 흔적이 함께 남은 넓은 작업대입니다.", category: "furniture", width: 2, height: 1, baseOwned: 0 },
  herb_display_planter: { id: "herb_display_planter", name: "약초 전시 화분", description: "희귀 약초를 보기 좋게 정리한 화분입니다.", category: "furniture", width: 1, height: 1, baseOwned: 0 },
  fishing_trophy_wall: { id: "fishing_trophy_wall", name: "낚시 기념 벽장식", description: "기억에 남는 조과를 벽에 남기는 장식입니다.", category: "furniture", width: 2, height: 1, baseOwned: 0 },
  cookware_display: { id: "cookware_display", name: "조리도구 전시대", description: "오래 쓴 조리도구를 단정하게 전시합니다.", category: "furniture", width: 2, height: 1, baseOwned: 0 },
  master_bed: { id: "master_bed", name: "명인의 휴식 침대", description: "명인 목재로 완성한 넓은 침대입니다.", category: "furniture", width: 2, height: 2, baseOwned: 0 },
  arcane_alloy_display: { id: "arcane_alloy_display", name: "마력 합금 전시대", description: "마력 합금의 빛을 보존한 전시대입니다.", category: "furniture", width: 1, height: 2, baseOwned: 0 },
} as const;

export type HousingFurnitureId = keyof typeof HOUSING_FURNITURE;

export type HousingPlacement = {
  uid: string;
  furnitureId: HousingFurnitureId;
  x: number;
  y: number;
  rotated: boolean;
  display?: HousingDisplayRef;
  masteryTrophy?: HousingMasteryTrophyRef;
};

export type HousingState = {
  version: 1;
  isPublic: boolean;
  layout: HousingPlacement[];
};

export type HousingDisplayOption =
  | {
      kind: "equipment";
      iid: string;
      label: string;
      detail: string;
    }
  | {
      kind: "fish";
      fishId: FishId;
      label: string;
      detail: string;
    }
  | {
      kind: "boss";
      bossId: CoopBossKindId;
      label: string;
      detail: string;
    }
  | {
      kind: "masteryTrophy";
      trophyId: CodexTrophyId;
      category: CodexTrophyDisplayCategory;
      currentTier: CodexMasteryTrophyTier;
      label: string;
      detail: string;
    };

export type HousingEntitlements = {
  ownedCounts?: Partial<Record<HousingFurnitureId, number>>;
  equipmentIids?: ReadonlySet<string>;
  fishIds?: ReadonlySet<string>;
  bossIds?: ReadonlySet<string>;
  masteryTrophyIds?: ReadonlySet<string>;
};

export type HousingValidationResult =
  | { ok: true; state: HousingState }
  | {
      ok: false;
      error:
        | "invalid_room"
        | "too_many_items"
        | "invalid_placement"
        | "duplicate_placement"
        | "furniture_not_owned"
        | "items_overlap"
        | "invalid_display"
        | "display_not_owned"
        | "invalid_mastery_trophy"
        | "mastery_trophy_not_owned";
    };

type HousingMasteryTrophyCategory = CodexMasteryCategory | "overall" | "research";

const ALL_MASTERY_TROPHY_CATEGORIES: readonly HousingMasteryTrophyCategory[] = [
  "equipment",
  "fish",
  "monster",
  "cooking",
  "life",
  "job",
  "overall",
  "research",
];

const HOUSING_MASTERY_TROPHY_CATEGORIES: Partial<
  Record<HousingFurnitureId, readonly HousingMasteryTrophyCategory[]>
> = Object.freeze({
  record_shelf: ALL_MASTERY_TROPHY_CATEGORIES,
  trophy_aquarium: ["fish"],
  equipment_mannequin: ["equipment"],
  boss_trophy: ["monster"],
  weapon_rack: ["equipment"],
  cookware_display: ["cooking"],
});

export function housingMasteryTrophyCategoriesFor(
  furnitureId: HousingFurnitureId,
): readonly HousingMasteryTrophyCategory[] {
  return HOUSING_MASTERY_TROPHY_CATEGORIES[furnitureId] ?? [];
}

export function housingMasteryTrophyIsEligible(
  furnitureId: HousingFurnitureId,
  category: HousingMasteryTrophyCategory,
): boolean {
  return housingMasteryTrophyCategoriesFor(furnitureId).includes(category);
}

export function isHousingFurnitureId(value: unknown): value is HousingFurnitureId {
  return typeof value === "string" && value in HOUSING_FURNITURE;
}

export function housingOwnedCount(
  id: HousingFurnitureId,
  ownedCounts?: Partial<Record<HousingFurnitureId, number>>,
): number {
  const supplied = ownedCounts?.[id];
  if (typeof supplied === "number" && Number.isFinite(supplied)) {
    return Math.max(0, Math.floor(supplied));
  }
  return HOUSING_FURNITURE[id].baseOwned;
}

export function housingPlacementSize(
  placement: Pick<HousingPlacement, "furnitureId" | "rotated">,
): { width: number; height: number } {
  const def = HOUSING_FURNITURE[placement.furnitureId];
  return placement.rotated
    ? { width: def.height, height: def.width }
    : { width: def.width, height: def.height };
}

export function housingDisplayKindFor(
  furnitureId: HousingFurnitureId,
): HousingDisplayKind | null {
  const def = HOUSING_FURNITURE[furnitureId];
  return "displayKind" in def ? def.displayKind : null;
}

export const DEFAULT_HOUSING_LAYOUT: HousingPlacement[] = [
  { uid: "bed-1", furnitureId: "traveler_bed", x: 0, y: 3, rotated: false },
  { uid: "shelf-1", furnitureId: "record_shelf", x: 0, y: 0, rotated: false },
  { uid: "trophy-1", furnitureId: "boss_trophy", x: 3, y: 0, rotated: false },
  {
    uid: "mannequin-1",
    furnitureId: "equipment_mannequin",
    x: 6,
    y: 0,
    rotated: false,
  },
  { uid: "aquarium-1", furnitureId: "trophy_aquarium", x: 5, y: 4, rotated: false },
  { uid: "plant-1", furnitureId: "herb_planter", x: 3, y: 4, rotated: false },
  { uid: "desk-1", furnitureId: "oak_desk", x: 3, y: 2, rotated: false },
];

export function defaultHousingState(): HousingState {
  return {
    version: 1,
    isPublic: true,
    layout: DEFAULT_HOUSING_LAYOUT.map((placement) => ({ ...placement })),
  };
}

function parseDisplayRef(raw: unknown): HousingDisplayRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (value.kind === "equipment" && typeof value.iid === "string") {
    const iid = value.iid.trim();
    return iid && iid.length <= 160 ? { kind: "equipment", iid } : undefined;
  }
  if (value.kind === "fish" && typeof value.fishId === "string") {
    const fishId = value.fishId.trim();
    return fishId && fishId.length <= 100
      ? { kind: "fish", fishId: fishId as FishId }
      : undefined;
  }
  if (value.kind === "boss" && typeof value.bossId === "string") {
    const bossId = value.bossId.trim();
    return bossId && bossId.length <= 100
      ? { kind: "boss", bossId: bossId as CoopBossKindId }
      : undefined;
  }
  return undefined;
}

function parseMasteryTrophyRef(
  raw: unknown,
): HousingMasteryTrophyRef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const trophyId = (raw as { trophyId?: unknown }).trophyId;
  if (typeof trophyId !== "string") return undefined;
  const normalized = trophyId.trim();
  return isCodexTrophyId(normalized) ? { trophyId: normalized } : undefined;
}

function parsePlacement(raw: unknown): HousingPlacement | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!isHousingFurnitureId(value.furnitureId)) return null;
  const uid = typeof value.uid === "string" ? value.uid.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(uid)) return null;
  if (!Number.isInteger(value.x) || !Number.isInteger(value.y)) return null;
  const placement: HousingPlacement = {
    uid,
    furnitureId: value.furnitureId,
    x: value.x as number,
    y: value.y as number,
    rotated: value.rotated === true,
  };
  const display = parseDisplayRef(value.display);
  if (display) placement.display = display;
  const masteryTrophy = parseMasteryTrophyRef(value.masteryTrophy);
  if (masteryTrophy) {
    const category = codexTrophyDisplayCategory(masteryTrophy.trophyId);
    if (
      category &&
      housingMasteryTrophyIsEligible(placement.furnitureId, category)
    ) {
      placement.masteryTrophy = masteryTrophy;
    }
  }
  return placement;
}

function placementCells(placement: HousingPlacement): string[] {
  const { width, height } = housingPlacementSize(placement);
  const cells: string[] = [];
  for (let y = placement.y; y < placement.y + height; y += 1) {
    for (let x = placement.x; x < placement.x + width; x += 1) {
      cells.push(`${x}:${y}`);
    }
  }
  return cells;
}

function displayIsEntitled(
  display: HousingDisplayRef,
  entitlements: HousingEntitlements,
): boolean {
  if (display.kind === "equipment") {
    return entitlements.equipmentIids?.has(display.iid) === true;
  }
  if (display.kind === "fish") {
    return entitlements.fishIds?.has(display.fishId) === true;
  }
  return entitlements.bossIds?.has(display.bossId) === true;
}

export function validateHousingState(
  raw: unknown,
  entitlements: HousingEntitlements = {},
): HousingValidationResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid_room" };
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.layout) || typeof value.isPublic !== "boolean") {
    return { ok: false, error: "invalid_room" };
  }
  if (value.layout.length > HOUSING_MAX_PLACEMENTS) {
    return { ok: false, error: "too_many_items" };
  }

  const layout: HousingPlacement[] = [];
  const uids = new Set<string>();
  const furnitureCounts = new Map<HousingFurnitureId, number>();
  const cells = new Set<string>();

  for (const rawPlacement of value.layout) {
    const rawPlacementValue = rawPlacement && typeof rawPlacement === "object"
      ? rawPlacement as Record<string, unknown>
      : null;
    const suppliedMasteryTrophy = rawPlacementValue &&
      Object.hasOwn(rawPlacementValue, "masteryTrophy");
    const parsedMasteryTrophy = suppliedMasteryTrophy
      ? parseMasteryTrophyRef(rawPlacementValue.masteryTrophy)
      : undefined;
    if (suppliedMasteryTrophy && !parsedMasteryTrophy) {
      return { ok: false, error: "invalid_mastery_trophy" };
    }
    const placement = parsePlacement(rawPlacement);
    if (!placement) return { ok: false, error: "invalid_placement" };
    if (suppliedMasteryTrophy && !placement.masteryTrophy) {
      return { ok: false, error: "invalid_mastery_trophy" };
    }
    if (uids.has(placement.uid)) return { ok: false, error: "duplicate_placement" };
    uids.add(placement.uid);

    const { width, height } = housingPlacementSize(placement);
    if (
      placement.x < 0 ||
      placement.y < 0 ||
      placement.x + width > HOUSING_GRID_COLUMNS ||
      placement.y + height > HOUSING_GRID_ROWS
    ) {
      return { ok: false, error: "invalid_placement" };
    }

    const count = (furnitureCounts.get(placement.furnitureId) ?? 0) + 1;
    furnitureCounts.set(placement.furnitureId, count);
    if (count > housingOwnedCount(placement.furnitureId, entitlements.ownedCounts)) {
      return { ok: false, error: "furniture_not_owned" };
    }

    for (const cell of placementCells(placement)) {
      if (cells.has(cell)) return { ok: false, error: "items_overlap" };
      cells.add(cell);
    }

    const expectedDisplayKind = housingDisplayKindFor(placement.furnitureId);
    if (placement.display && placement.display.kind !== expectedDisplayKind) {
      return { ok: false, error: "invalid_display" };
    }
    if (placement.display && !displayIsEntitled(placement.display, entitlements)) {
      return { ok: false, error: "display_not_owned" };
    }
    if (
      placement.masteryTrophy &&
      entitlements.masteryTrophyIds?.has(placement.masteryTrophy.trophyId) !== true
    ) {
      return { ok: false, error: "mastery_trophy_not_owned" };
    }
    layout.push(placement);
  }

  return {
    ok: true,
    state: { version: 1, isPublic: value.isPublic, layout },
  };
}

// 읽기 경로는 손상된 과거 세이브 한 건 때문에 숙소 전체가 열리지 않지 않도록 유효한 배치만
// 순서대로 복구한다. 쓰기 경로는 위 validateHousingState 로 엄격 검증한다.
export function parseHousingState(
  raw: unknown,
  ownedCounts?: Partial<Record<HousingFurnitureId, number>>,
): HousingState {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { layout?: unknown }).layout)) {
    return defaultHousingState();
  }
  const value = raw as { isPublic?: unknown; layout: unknown[] };
  const recovered: HousingPlacement[] = [];
  const counts = new Map<HousingFurnitureId, number>();
  const cells = new Set<string>();
  const uids = new Set<string>();

  for (const rawPlacement of value.layout.slice(0, HOUSING_MAX_PLACEMENTS)) {
    const placement = parsePlacement(rawPlacement);
    if (!placement || uids.has(placement.uid)) continue;
    const { width, height } = housingPlacementSize(placement);
    if (
      placement.x < 0 ||
      placement.y < 0 ||
      placement.x + width > HOUSING_GRID_COLUMNS ||
      placement.y + height > HOUSING_GRID_ROWS
    ) continue;
    const count = (counts.get(placement.furnitureId) ?? 0) + 1;
    if (count > housingOwnedCount(placement.furnitureId, ownedCounts)) continue;
    const nextCells = placementCells(placement);
    if (nextCells.some((cell) => cells.has(cell))) continue;
    const expectedDisplayKind = housingDisplayKindFor(placement.furnitureId);
    if (placement.display?.kind !== expectedDisplayKind) delete placement.display;
    counts.set(placement.furnitureId, count);
    uids.add(placement.uid);
    nextCells.forEach((cell) => cells.add(cell));
    recovered.push(placement);
  }

  return {
    version: 1,
    isPublic: value.isPublic !== false,
    layout: recovered,
  };
}

export function housingDisplayKey(display: HousingDisplayRef): string {
  if (display.kind === "equipment") return `equipment:${display.iid}`;
  if (display.kind === "fish") return `fish:${display.fishId}`;
  return `boss:${display.bossId}`;
}

export function housingOptionKey(option: HousingDisplayOption): string {
  if (option.kind === "equipment") return `equipment:${option.iid}`;
  if (option.kind === "fish") return `fish:${option.fishId}`;
  if (option.kind === "boss") return `boss:${option.bossId}`;
  return `masteryTrophy:${option.trophyId}`;
}

export function housingMasteryTrophyKey(
  masteryTrophy: HousingMasteryTrophyRef,
): string {
  return `masteryTrophy:${masteryTrophy.trophyId}`;
}

export function stripHousingMasteryTrophies(state: HousingState): HousingState {
  return {
    ...state,
    layout: state.layout.map((placement) => {
      const { masteryTrophy: _masteryTrophy, ...withoutMasteryTrophy } = placement;
      return withoutMasteryTrophy;
    }),
  };
}

export function restoreHousingMasteryTrophies(
  stored: HousingState,
  submitted: HousingState,
): HousingState {
  const storedByUid = new Map(
    stored.layout.map((placement) => [placement.uid, placement.masteryTrophy]),
  );
  return {
    ...submitted,
    layout: submitted.layout.map((placement) => {
      const { masteryTrophy: _submittedMasteryTrophy, ...withoutMasteryTrophy } =
        placement;
      const masteryTrophy = storedByUid.get(placement.uid);
      if (!masteryTrophy) return withoutMasteryTrophy;
      const category = codexTrophyDisplayCategory(masteryTrophy.trophyId);
      return category &&
          housingMasteryTrophyIsEligible(placement.furnitureId, category)
        ? { ...withoutMasteryTrophy, masteryTrophy }
        : withoutMasteryTrophy;
    }),
  };
}
