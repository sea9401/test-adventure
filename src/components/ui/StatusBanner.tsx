import type { HTMLAttributes, ReactNode } from "react";

type StatusTone = "success" | "error" | "warning" | "info" | "actionable";

const TONE_CLASS: Record<StatusTone, string> = {
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-zinc-950 dark:text-emerald-300",
  error:
    "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-zinc-950 dark:text-rose-300",
  warning:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-zinc-950 dark:text-amber-300",
  info:
    "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-zinc-950 dark:text-sky-300",
  actionable:
    "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-zinc-950 dark:text-orange-200",
};

export function StatusBanner({
  tone,
  children,
  className,
  ...rest
}: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={[
        "rounded-lg border px-3 py-2 text-xs",
        TONE_CLASS[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
