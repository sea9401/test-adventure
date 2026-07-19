import type { ReactNode } from "react";
import { GameIcon } from "@/adventure/v2/GameIcon";

export function RewardNotice({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`ui-reward-flash flex items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-center text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 ${className}`}
    >
      <GameIcon name="Sparkle" size={15} className="shrink-0" />
      <span>{children}</span>
    </div>
  );
}
