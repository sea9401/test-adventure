import { PlumpGameIcon, type PlumpGameIconName } from "@/components/icons/PlumpGameIcon";

export function fishingRankIconName(rank: number): PlumpGameIconName | null {
  if (rank === 1) return "rank_gold";
  if (rank === 2) return "rank_silver";
  if (rank === 3) return "rank_bronze";
  return null;
}

export function FishingRankIcon({ rank }: { rank: number }) {
  const iconName = fishingRankIconName(rank);
  return (
    <span className="inline-flex w-7 shrink-0 items-center justify-center tabular-nums">
      {iconName ? <PlumpGameIcon name={iconName} size={18} /> : `${rank}위`}
    </span>
  );
}
