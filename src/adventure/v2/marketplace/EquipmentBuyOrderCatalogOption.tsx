import {
  V2_EQUIP_SETS,
  V2_EQUIP_TAG_SETS,
  type V2Equipment,
} from "@/adventure/data/v2/v2Equipment";

const EQUIPMENT_SET_NAMES = new Map(
  [...V2_EQUIP_SETS, ...V2_EQUIP_TAG_SETS].map((set) => [set.id, set.name]),
);

export function equipmentBuyOrderSetNames(item: V2Equipment): string[] {
  const setIds = [item.setId, ...(item.setTags ?? [])];
  return [
    ...new Set(
      setIds
        .map((setId) => (setId ? EQUIPMENT_SET_NAMES.get(setId) : undefined))
        .filter((name): name is string => name != null),
    ),
  ];
}

export function EquipmentBuyOrderCatalogOption({
  item,
  selected,
  onSelect,
}: {
  item: V2Equipment;
  selected: boolean;
  onSelect: (item: V2Equipment) => void;
}) {
  const setNames = equipmentBuyOrderSetNames(item);
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs ${
        selected
          ? "bg-sky-100 font-semibold text-sky-900 dark:bg-zinc-800 dark:text-sky-100"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      <span className="min-w-0">
        <span className="block">{item.name}</span>
        {setNames.length > 0 ? (
          <span className="mt-0.5 block text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
            {setNames.map((name) => `${name} 세트`).join(" · ")}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
        기본 위력 {item.power.toLocaleString()}
      </span>
    </button>
  );
}
