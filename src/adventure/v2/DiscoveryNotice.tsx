import type { ComponentPropsWithoutRef } from "react";
import { GameIcon } from "@/adventure/v2/GameIcon";

type DiscoveryKind = "hunt" | "utility";

export function DiscoveryNotice({
  kind,
  align = "center",
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  kind: DiscoveryKind;
  align?: "center" | "start";
}) {
  return (
    <div
      className={`ui-reward-flash flex items-center gap-1.5 rounded-md border border-sky-400 bg-sky-50 px-2 py-1.5 text-xs font-semibold text-sky-800 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-200 ${
        align === "start" ? "justify-start text-left" : "justify-center text-center"
      } ${className ?? ""}`}
      {...props}
    >
      <GameIcon
        name={kind === "hunt" ? "Sparkle" : "Ticket"}
        size={15}
        className="shrink-0"
      />
      <span>{children}</span>
    </div>
  );
}
