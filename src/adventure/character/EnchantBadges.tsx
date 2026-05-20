import { ENCHANT_AFFIXES, type EnchantSlot } from "./enchant";

// 자루에 부여된 마법부여 슬롯을 보라색 알약 뱃지로 표시한다. 강화 패널·부여 다이얼로그·
// 인벤토리 목록·장착 툴팁이 모두 이걸 쓴다. 슬롯이 없으면 아무것도 안 그린다.
export function EnchantBadges({
  slots,
  className = "",
}: {
  slots: readonly EnchantSlot[] | undefined;
  className?: string;
}) {
  if (!slots || slots.length === 0) return null;
  return (
    <div
      className={`flex flex-wrap gap-1 text-[11px] text-violet-700 dark:text-violet-300 ${className}`}
    >
      {slots.map((s, i) => {
        const a = ENCHANT_AFFIXES[s.affixId];
        const unit = a.unit === "percent" ? "%" : "";
        return (
          <span
            key={i}
            className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 dark:border-violet-800 dark:bg-violet-950"
          >
            {a.name} {s.value}
            {unit}
          </span>
        );
      })}
    </div>
  );
}
