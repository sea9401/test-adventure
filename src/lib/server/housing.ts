import {
  BOSS_TITLE_TO_KIND,
  COOP_BOSSES,
  type CoopBossKindId,
} from "@/adventure/data/v2/coopBosses";
import { FISH, FISH_TIERS } from "@/adventure/data/v2/fish";
import {
  FISHING_CODEX_KEY,
  caughtFishIds,
  parseFishCodex,
} from "@/adventure/v2/fishingCodex";
import {
  V2_EQUIPMENT,
  V2_SLOT_LABEL,
  parseEquipmentSave,
  v2EquipCatalogTierDisplayLabel,
} from "@/adventure/data/v2/v2Equipment";
import {
  housingDisplayKey,
  housingOptionKey,
  type HousingDisplayOption,
  type HousingEntitlements,
  type HousingFurnitureId,
  type HousingState,
} from "@/adventure/data/v2/housing";
import { parseLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";
import { LIFE_CRAFTING_RECIPES } from "@/adventure/v2/lifeCrafting";

type AdventureLog = {
  coopBossKinds?: unknown;
  titles?: unknown;
};

export const HOUSING_SUPPORT_SAVE_KEYS = [
  "equipment.v2",
  "adventure-log.v2",
  FISHING_CODEX_KEY,
] as const;

function killedBossIds(raw: unknown): Set<CoopBossKindId> {
  const log = raw && typeof raw === "object" ? (raw as AdventureLog) : {};
  const result = new Set<CoopBossKindId>();
  if (Array.isArray(log.coopBossKinds)) {
    for (const value of log.coopBossKinds) {
      if (typeof value === "string" && value in COOP_BOSSES) {
        result.add(value as CoopBossKindId);
      }
    }
  }
  if (log.titles && typeof log.titles === "object") {
    for (const titleId of Object.keys(log.titles)) {
      const bossId = BOSS_TITLE_TO_KIND[titleId];
      if (bossId) result.add(bossId);
    }
  }
  return result;
}

export function housingContextFromSaves(args: {
  equipmentRaw: unknown;
  adventureLogRaw: unknown;
  fishingCodexRaw: unknown;
  lifeWorkshopRaw?: unknown;
}): {
  entitlements: HousingEntitlements;
  displayOptions: HousingDisplayOption[];
} {
  const { owned } = parseEquipmentSave(args.equipmentRaw);
  const equipmentOptions: HousingDisplayOption[] = owned
    .map((instance) => {
      const def = V2_EQUIPMENT[instance.id];
      if (!def) return null;
      const enhanceLabel = instance.enhance?.level
        ? ` · +${instance.enhance.level}`
        : "";
      return {
        kind: "equipment" as const,
        iid: instance.iid,
        label: def.name,
        detail: `${V2_SLOT_LABEL[def.slot]} · ${v2EquipCatalogTierDisplayLabel(def.tier)}${enhanceLabel}`,
        sortTier: def.tier,
        sortEnhance: instance.enhance?.level ?? 0,
      };
    })
    .filter((option): option is NonNullable<typeof option> => option !== null)
    .sort((a, b) => {
      if (b.sortTier !== a.sortTier) return b.sortTier - a.sortTier;
      if (b.sortEnhance !== a.sortEnhance) return b.sortEnhance - a.sortEnhance;
      return a.label.localeCompare(b.label, "ko");
    })
    .map(({ sortTier: _sortTier, sortEnhance: _sortEnhance, ...option }) => option);

  const fishCodex = parseFishCodex(args.fishingCodexRaw);
  const caughtFish = caughtFishIds(fishCodex);
  const fishOptions: HousingDisplayOption[] = Object.entries(fishCodex.fish)
    .map(([fishId, entry]) => {
      const fish = FISH[fishId as keyof typeof FISH];
      if (!fish || !entry.caughtEver) return null;
      return {
        kind: "fish" as const,
        fishId: fish.id,
        label: fish.name,
        detail: `${FISH_TIERS[fish.tier].label} · 개인 최대 ${entry.bestSize.toFixed(1)}cm`,
        sortSize: entry.bestSize,
        sortTier: fish.tier,
      };
    })
    .filter((option): option is NonNullable<typeof option> => option !== null)
    .sort((a, b) => {
      const tierOrder = ["common", "uncommon", "rare", "epic", "legendary"];
      const tierDiff = tierOrder.indexOf(b.sortTier) - tierOrder.indexOf(a.sortTier);
      return tierDiff || b.sortSize - a.sortSize;
    })
    .map(({ sortSize: _sortSize, sortTier: _sortTier, ...option }) => option);

  const bossIds = killedBossIds(args.adventureLogRaw);
  const workshop = parseLifeWorkshopState(args.lifeWorkshopRaw);
  const ownedCounts: Partial<Record<HousingFurnitureId, number>> = {};
  for (const recipe of LIFE_CRAFTING_RECIPES) {
    if (recipe.kind === "furniture") {
      ownedCounts[recipe.outputId as HousingFurnitureId] = workshop.crafting.balances[recipe.outputId] ?? 0;
    }
  }
  const bossOptions: HousingDisplayOption[] = [...bossIds]
    .map((bossId) => ({
      kind: "boss" as const,
      bossId,
      label: COOP_BOSSES[bossId].name,
      detail: `${COOP_BOSSES[bossId].difficulty === "hard" ? "하드 " : ""}협동 보스 토벌 기록`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));

  return {
    entitlements: {
      ownedCounts,
      equipmentIids: new Set(owned.map((instance) => instance.iid)),
      fishIds: new Set(caughtFish),
      bossIds,
    },
    displayOptions: [...equipmentOptions, ...fishOptions, ...bossOptions],
  };
}

export function publicHousingOptions(
  state: HousingState,
  options: readonly HousingDisplayOption[],
): HousingDisplayOption[] {
  const selected = new Set(
    state.layout.flatMap((placement) => {
      const display = placement.display;
      if (!display) return [];
      if (display.kind === "equipment") return [`equipment:${display.iid}`];
      if (display.kind === "fish") return [`fish:${display.fishId}`];
      return [`boss:${display.bossId}`];
    }),
  );
  return options.filter((option) => {
    if (option.kind === "equipment") return selected.has(`equipment:${option.iid}`);
    if (option.kind === "fish") return selected.has(`fish:${option.fishId}`);
    return selected.has(`boss:${option.bossId}`);
  });
}

export function sanitizePublicHousingState(
  state: HousingState,
  options: readonly HousingDisplayOption[],
): HousingState {
  const allowed = new Set(options.map(housingOptionKey));
  return {
    ...state,
    layout: state.layout.map((placement) => {
      if (!placement.display || allowed.has(housingDisplayKey(placement.display))) {
        return placement;
      }
      const { display: _display, ...withoutDisplay } = placement;
      return withoutDisplay;
    }),
  };
}
