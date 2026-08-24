"use client";

import {
  HandFist,
  Shield,
  Sneaker,
  Sword,
  type Icon,
} from "@phosphor-icons/react";
import { NecklaceIcon, RingIcon } from "../EquipmentSlotIcons";
import {
  V2_EQUIP_SETS,
  V2_EQUIP_TAG_SETS,
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { Inset } from "@/components/ui/Inset";
import {
  anchorOf,
  powerNameClass,
  type ItemCardAnchor,
} from "../V2ItemCard";

const EQUIPPED_SUMMARY_SLOTS: {
  slot: V2EquipSlot;
  label: string;
  Icon: Icon;
  color: string;
}[] = [
  { slot: "weapon", label: "무기", Icon: Sword, color: "text-rose-500" },
  { slot: "armor", label: "갑옷", Icon: Shield, color: "text-sky-500" },
  { slot: "gloves", label: "장갑", Icon: HandFist, color: "text-amber-500" },
  { slot: "boots", label: "신발", Icon: Sneaker, color: "text-emerald-500" },
  { slot: "ring", label: "반지", Icon: RingIcon, color: "text-violet-500" },
  { slot: "necklace", label: "목걸이", Icon: NecklaceIcon, color: "text-pink-500" },
];

export function EquippedItemSummaryGrid({
  equipped,
  owned,
  onOpen,
}: {
  equipped: Partial<Record<V2EquipSlot, string>>;
  owned: readonly V2EquipInstance[];
  onOpen: (inst: V2EquipInstance, anchor: ItemCardAnchor) => void;
}) {
  const byIid = new Map(owned.map((inst) => [inst.iid, inst]));
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" aria-label="장착 장비">
      {EQUIPPED_SUMMARY_SLOTS.map(({ slot, label, Icon, color }) => {
        const iid = equipped[slot];
        const inst = iid ? byIid.get(iid) : undefined;
        const item = inst ? V2_EQUIPMENT[inst.id] : undefined;
        const setNames = item
          ? Array.from(
              new Set(
                [
                  item.setId
                    ? V2_EQUIP_SETS.find((set) => set.id === item.setId)?.name
                    : undefined,
                  ...(item.setTags ?? []).map(
                    (tag) =>
                      V2_EQUIP_TAG_SETS.find((set) => set.id === tag)?.name,
                  ),
                ].filter((name): name is string => Boolean(name)),
              ),
            )
          : [];
        const setLabel = setNames.length
          ? `세트 · ${setNames.join(", ")}`
          : "세트 없음";
        const content = (
          <>
            <span className="flex items-center justify-center gap-1">
              <Icon size={17} weight="duotone" className={color} aria-hidden />
              <span className="text-[0.625rem] text-zinc-500 dark:text-zinc-400">{label}</span>
            </span>
            <span className={`flex min-w-0 items-baseline justify-center text-[0.6875rem] font-semibold ${item ? powerNameClass(item, inst?.roll) : "text-zinc-400 dark:text-zinc-500"}`}>
              <span className="truncate">{item?.name ?? "비어 있음"}</span>
              {inst?.enhance && inst.enhance.level > 0 && (
                <span className="ml-0.5 shrink-0 text-amber-600 dark:text-amber-400">+{inst.enhance.level}</span>
              )}
            </span>
            {item ? (
              <span
                data-testid="equipped-set-label"
                title={setLabel}
                className={`w-full truncate text-[0.625rem] leading-tight ${
                  setNames.length
                    ? "font-medium text-violet-600 dark:text-violet-400"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {setLabel}
              </span>
            ) : (
              <span className="text-[0.625rem] leading-tight text-zinc-300 dark:text-zinc-700">
                —
              </span>
            )}
          </>
        );
        return inst && item ? (
          <Inset
            as="button"
            padding="none"
            key={slot}
            type="button"
            onClick={(event) => onOpen(inst, anchorOf(event.currentTarget))}
            aria-label={`${label} ${item.name} 정보`}
            title={`${item.name}${inst.enhance?.level ? ` +${inst.enhance.level}` : ""}`}
            className="flex min-h-16 min-w-0 flex-col justify-center gap-1 px-1.5 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white hover:bg-zinc-100 dark:focus-visible:ring-violet-400 dark:focus-visible:ring-offset-zinc-950 dark:hover:bg-zinc-900"
          >
            {content}
          </Inset>
        ) : (
          <Inset key={slot} padding="none" className="flex min-h-16 min-w-0 flex-col justify-center gap-1 px-1.5 py-1.5 text-center">
            {content}
          </Inset>
        );
      })}
    </div>
  );
}
