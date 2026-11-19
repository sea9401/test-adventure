"use client";

import {
  HandFist,
  MagicWand,
  Shield,
  Sneaker,
  Sword,
  type Icon,
} from "@phosphor-icons/react";
import type {
  V2EquipSlot,
  V2Equipment,
  V2WeaponType,
} from "@/adventure/data/v2/v2Equipment";
import {
  BowIcon,
  DaggerIcon,
  NecklaceIcon,
  RingIcon,
} from "./EquipmentSlotIcons";

// 장비 종류 아이콘 — 장비 카드·매물 맨 앞의 선 아이콘. 부위마다 색이 다르고,
//   무기는 종류(대검·지팡이·활·단검)마다 모양이 달라 이름을 읽기 전에 구분된다.
//   화면마다 부위 아이콘 표를 따로 만들지 말고 이 부품을 쓴다.
const WEAPON_ICON: Record<V2WeaponType, Icon> = {
  greatsword: Sword,
  staff: MagicWand,
  bow: BowIcon,
  dagger: DaggerIcon,
};

const SLOT_ICON: Record<
  Exclude<V2EquipSlot, "weapon">,
  { Icon: Icon; color: string }
> = {
  armor: { Icon: Shield, color: "text-sky-500" },
  gloves: { Icon: HandFist, color: "text-amber-500" },
  boots: { Icon: Sneaker, color: "text-emerald-500" },
  ring: { Icon: RingIcon, color: "text-violet-500" },
  necklace: { Icon: NecklaceIcon, color: "text-pink-500" },
};

type EquipmentIconItem = Pick<V2Equipment, "slot" | "concept"> & {
  weaponType?: V2WeaponType;
};

export function equipmentTypeIcon(item: EquipmentIconItem): {
  Icon: Icon;
  color: string;
} {
  if (item.slot !== "weapon") return SLOT_ICON[item.slot];
  // 무기 종류가 비어 있는 옛 무기는 컨셉으로 가장 가까운 종류를 고른다.
  const weaponType: V2WeaponType =
    item.weaponType ??
    (item.concept === "int"
      ? "staff"
      : item.concept === "dex"
        ? "dagger"
        : "greatsword");
  return { Icon: WEAPON_ICON[weaponType], color: "text-rose-500" };
}

export function EquipmentTypeIcon({
  item,
  size = 20,
  colored = true,
  className = "",
}: {
  item: EquipmentIconItem;
  size?: number;
  /** false면 부위 색을 쓰지 않고 주변 글자색을 따른다. */
  colored?: boolean;
  className?: string;
}) {
  const { Icon, color } = equipmentTypeIcon(item);
  return (
    <Icon
      size={size}
      weight="duotone"
      aria-hidden
      className={`shrink-0 ${colored ? color : ""} ${className}`.trim()}
    />
  );
}
