import type { FishingCatchItemId } from "@/adventure/v2/fishingStock";
import { GameIcon } from "@/adventure/v2/GameIcon";

const CATCH_ITEM_TONE: Record<FishingCatchItemId, string> = {
  catch_common: "text-zinc-500 dark:text-zinc-400",
  catch_fresh: "text-emerald-600 dark:text-emerald-400",
  catch_quality: "text-sky-600 dark:text-sky-400",
  catch_special: "text-violet-600 dark:text-violet-400",
  catch_legendary: "text-amber-600 dark:text-amber-400",
};

export function FishingCatchItemIcon({
  itemId,
  size = 18,
  className = "",
}: {
  itemId: FishingCatchItemId;
  size?: number;
  className?: string;
}) {
  return (
    <GameIcon
      name="Fish"
      size={size}
      className={`shrink-0 ${CATCH_ITEM_TONE[itemId]} ${className}`}
    />
  );
}
