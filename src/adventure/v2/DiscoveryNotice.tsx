import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { GameIcon } from "@/adventure/v2/GameIcon";

type DiscoveryKind = "hunt" | "location" | "utility";

export function DiscoveryNotice({
  kind,
  align = "center",
  children,
  className,
  action,
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  kind: DiscoveryKind;
  align?: "center" | "start";
  action?: ReactNode;
}) {
  return (
    <div
      className={`ui-reward-flash flex items-center gap-2 rounded-md border border-sky-400 bg-sky-50 px-2 py-1.5 text-xs font-semibold text-sky-800 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-200 ${
        action
          ? "justify-between text-left"
          : align === "start"
            ? "justify-start text-left"
            : "justify-center text-center"
      } ${className ?? ""}`}
      {...props}
    >
      <GameIcon
        name={
          kind === "utility"
            ? "Ticket"
            : kind === "location"
              ? "MapTrifold"
              : "Sparkle"
        }
        size={15}
        className="shrink-0"
      />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}
