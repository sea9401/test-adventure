import {
  Bone,
  BookOpen,
  Bug,
  Camera,
  Coins,
  Diamond,
  Fire,
  Flask,
  IdentificationCard,
  Mountains,
  MapTrifold,
  Orange,
  Package,
  PawPrint,
  Scroll,
  ShieldPlus,
  Snowflake,
  Sparkle,
  Toolbox,
  TreasureChest,
  Tree,
  Waves,
  type Icon,
  type IconProps,
} from "@phosphor-icons/react";
import { STAMINA_SHARD_MATERIAL_ID } from "@/adventure/data/v2/staminaPotionCrafting";
import {
  ENHANCE_EMBER_MATERIAL_ID,
  TORN_MAP_FRAGMENT_MATERIAL_ID,
} from "@/adventure/data/v2/scavengedCrafting";

export type InventoryIconKind =
  | "bone"
  | "book"
  | "bug"
  | "camera"
  | "coin"
  | "crystal"
  | "enhance-blue"
  | "enhance-red"
  | "ember"
  | "flask"
  | "identity"
  | "map"
  | "ore"
  | "package"
  | "paw"
  | "scroll"
  | "shield"
  | "snow"
  | "sparkle"
  | "toolbox"
  | "treasure"
  | "tree"
  | "waves"
  | "fruit"
  | "reforge";

const ICONS: Record<InventoryIconKind, { Icon: Icon; tone: string }> = {
  bone: { Icon: Bone, tone: "text-stone-500 dark:text-stone-400" },
  book: { Icon: BookOpen, tone: "text-violet-600 dark:text-violet-400" },
  bug: { Icon: Bug, tone: "text-rose-600 dark:text-rose-400" },
  camera: { Icon: Camera, tone: "text-fuchsia-600 dark:text-fuchsia-400" },
  coin: { Icon: Coins, tone: "text-amber-600 dark:text-amber-400" },
  crystal: { Icon: Diamond, tone: "text-cyan-600 dark:text-cyan-400" },
  "enhance-blue": {
    Icon: Diamond,
    tone: "text-blue-600 dark:text-blue-400",
  },
  "enhance-red": { Icon: Diamond, tone: "text-red-600 dark:text-red-400" },
  ember: { Icon: Fire, tone: "text-orange-600 dark:text-orange-400" },
  flask: { Icon: Flask, tone: "text-emerald-600 dark:text-emerald-400" },
  fruit: { Icon: Orange, tone: "text-lime-600 dark:text-lime-400" },
  identity: {
    Icon: IdentificationCard,
    tone: "text-sky-600 dark:text-sky-400",
  },
  map: { Icon: MapTrifold, tone: "text-teal-600 dark:text-teal-400" },
  ore: { Icon: Mountains, tone: "text-slate-600 dark:text-slate-400" },
  package: { Icon: Package, tone: "text-amber-600 dark:text-amber-400" },
  paw: { Icon: PawPrint, tone: "text-orange-600 dark:text-orange-400" },
  reforge: { Icon: Sparkle, tone: "text-cyan-600 dark:text-cyan-400" },
  scroll: { Icon: Scroll, tone: "text-violet-600 dark:text-violet-400" },
  shield: { Icon: ShieldPlus, tone: "text-teal-600 dark:text-teal-400" },
  snow: { Icon: Snowflake, tone: "text-sky-600 dark:text-sky-400" },
  sparkle: { Icon: Sparkle, tone: "text-purple-600 dark:text-purple-400" },
  toolbox: { Icon: Toolbox, tone: "text-orange-600 dark:text-orange-400" },
  treasure: {
    Icon: TreasureChest,
    tone: "text-sky-600 dark:text-sky-400",
  },
  tree: { Icon: Tree, tone: "text-emerald-600 dark:text-emerald-400" },
  waves: { Icon: Waves, tone: "text-blue-600 dark:text-blue-400" },
};

/** 인벤토리의 저장 ID를 화면에서 알아보기 쉬운 시각 계열로 묶는다. */
export function inventoryIconKind(itemId: string): InventoryIconKind {
  if (itemId === "profile_image_permit") return "camera";
  if (itemId === "rename_permit") return "identity";
  if (itemId === "adventure_support_30d") return "shield";
  if (itemId === "exp_tome") return "flask";
  if (itemId === STAMINA_SHARD_MATERIAL_ID) return "flask";
  if (itemId === ENHANCE_EMBER_MATERIAL_ID) return "ember";
  if (itemId === TORN_MAP_FRAGMENT_MATERIAL_ID) return "map";
  if (itemId === "v2_red_enhance_stone") return "enhance-red";
  if (itemId === "v2_blue_enhance_stone") return "enhance-blue";
  if (itemId.includes("reforge_stone")) return "reforge";

  if (itemId.startsWith("sp_fruit_")) return "fruit";
  if (itemId.includes("equipment_box")) return "treasure";
  if (itemId.includes("mastery_tome")) return "book";
  if (itemId.includes("summon_scroll")) return "scroll";
  if (itemId.includes("wall_repair_kit")) return "toolbox";
  if (itemId.includes("coop_coin")) return "coin";

  if (itemId.includes("mountain_claw") || itemId.includes("mountain_trace")) {
    return "paw";
  }
  if (itemId.includes("abyssal_scale")) return "waves";
  if (itemId.includes("canyon_chitin")) return "bug";
  if (itemId.includes("lake_crystal")) return "snow";
  if (itemId.includes("void_relic")) return "sparkle";

  if (itemId.includes("venom_gland") || itemId.includes("conductive_sac")) {
    return "flask";
  }
  if (itemId.includes("burrowing_jaw") || itemId.includes("serrated_bone")) {
    return "bone";
  }
  if (
    itemId.includes("resonant_core") ||
    itemId.includes("prayer_core") ||
    itemId.includes("thunder_runestone")
  ) {
    return "sparkle";
  }

  if (
    itemId.includes("timber") ||
    itemId.includes("processed_softwood") ||
    itemId.includes("processed_hardwood") ||
    itemId.includes("processed_masterwood") ||
    itemId.endsWith("_log")
  ) {
    return "tree";
  }
  if (
    itemId.includes("_ore") ||
    itemId.includes("mining_stone") ||
    itemId.includes("coal") ||
    itemId.includes("refined_iron") ||
    itemId.includes("basic_ingot") ||
    itemId.includes("precious_ingot") ||
    itemId.includes("arcane_alloy") ||
    itemId.includes("mithril_shard")
  ) {
    return "ore";
  }
  if (
    itemId.includes("stone") ||
    itemId.includes("gem") ||
    itemId.includes("crystal") ||
    itemId.includes("shard")
  ) {
    return "crystal";
  }

  return "package";
}

export function InventoryItemIcon({
  itemId,
  className,
  size = 20,
  ...props
}: Omit<IconProps, "children"> & { itemId: string }) {
  const { Icon: Component, tone } = ICONS[inventoryIconKind(itemId)];
  return (
    <Component
      {...props}
      aria-hidden="true"
      className={[tone, className].filter(Boolean).join(" ")}
      size={size}
      weight="duotone"
    />
  );
}
