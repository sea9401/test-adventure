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
  const slots = EQUIPPED_SUMMARY_SLOTS.map((entry) => {
    const iid = equipped[entry.slot];
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
                (tag) => V2_EQUIP_TAG_SETS.find((set) => set.id === tag)?.name,
              ),
            ].filter((name): name is string => Boolean(name)),
          ),
        )
      : [];
    return { ...entry, inst, item, setNames };
  });
  const anyEquipped = slots.some((entry) => entry.item);
  const anySet = slots.some((entry) => entry.setNames.length > 0);
  // 칸마다 상자를 두지 않고, 세트가 없다는 말은 칸마다 되풀이하지 않고 머리에 한 번만 적는다.
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[0.8125rem] font-semibold text-zinc-700 dark:text-zinc-200">
          장착 중
        </h2>
        {anyEquipped && !anySet ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            세트 효과 없음
          </span>
        ) : null}
      </div>
      <div
        className="mt-2 grid grid-cols-3 gap-x-1.5 gap-y-1 sm:grid-cols-6 lg:grid-cols-2"
        aria-label="장착 장비"
      >
        {slots.map(({ slot, label, Icon, color, inst, item, setNames }) => {
          const setLabel = setNames.join(", ");
          const content = (
            <>
              <Icon size={20} weight="duotone" className={`shrink-0 ${color}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span
                  className={`flex min-w-0 items-baseline text-[0.8125rem] font-semibold leading-snug ${item ? powerNameClass(item, inst?.roll) : "text-zinc-500 dark:text-zinc-400"}`}
                >
                  <span className="truncate">{item?.name ?? "비어 있음"}</span>
                  {inst?.enhance && inst.enhance.level > 0 && (
                    <span className="ml-0.5 shrink-0 text-amber-600 dark:text-amber-400">
                      +{inst.enhance.level}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[0.6875rem] leading-snug text-zinc-500 dark:text-zinc-400">
                  {label}
                  {setLabel ? (
                    <span
                      data-testid="equipped-set-label"
                      title={`세트 · ${setLabel}`}
                      className="font-medium text-violet-600 dark:text-violet-400"
                    >
                      {" · "}
                      {setLabel}
                    </span>
                  ) : null}
                </span>
              </span>
            </>
          );
          const cell = "flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left";
          return inst && item ? (
            <button
              key={slot}
              type="button"
              onClick={(event) => onOpen(inst, anchorOf(event.currentTarget))}
              aria-label={`${label} ${item.name} 정보`}
              title={`${item.name}${inst.enhance?.level ? ` +${inst.enhance.level}` : ""}`}
              className={`${cell} transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:hover:bg-zinc-800 dark:focus-visible:ring-offset-zinc-950`}
            >
              {content}
            </button>
          ) : (
            <div key={slot} className={cell}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
