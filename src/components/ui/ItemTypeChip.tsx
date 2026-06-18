import type { V2Equipment } from "@/adventure/data/v2/v2Equipment";
import { v2ItemTypeLabel } from "@/adventure/data/v2/v2Equipment";

// 아이템 종류 칩 — 이름 옆에 붙는 작은 라벨(무기는 세검/대검/활…, 그 외는 갑옷/장갑…).
// 이름 truncate 와 같은 flex 행에서 쓰므로 shrink-0 으로 줄어들지 않게.
export function ItemTypeChip({
  item,
  className = "",
}: {
  item: V2Equipment;
  className?: string;
}) {
  return (
    <span
      className={`shrink-0 rounded bg-zinc-100 px-1.5 py-px text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 ${className}`}
    >
      {v2ItemTypeLabel(item)}
    </span>
  );
}
