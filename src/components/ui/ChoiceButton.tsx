import type { ButtonHTMLAttributes, ReactNode } from "react";

type ChoiceTone = "neutral" | "warning" | "info" | "danger" | "primary";

const TONE: Record<ChoiceTone, string> = {
  neutral: "data-[selected=true]:border-zinc-400 data-[selected=true]:bg-zinc-100 dark:data-[selected=true]:border-zinc-500 dark:data-[selected=true]:bg-zinc-800",
  warning: "data-[selected=true]:border-amber-400 data-[selected=true]:bg-amber-50 dark:data-[selected=true]:border-amber-600 dark:data-[selected=true]:bg-amber-950",
  info: "data-[selected=true]:border-sky-400 data-[selected=true]:bg-sky-50 dark:data-[selected=true]:border-sky-600 dark:data-[selected=true]:bg-sky-950",
  danger: "data-[selected=true]:border-rose-400 data-[selected=true]:bg-rose-50 dark:data-[selected=true]:border-rose-600 dark:data-[selected=true]:bg-rose-950",
  primary: "data-[selected=true]:border-indigo-400 data-[selected=true]:bg-indigo-50 dark:data-[selected=true]:border-indigo-600 dark:data-[selected=true]:bg-indigo-950",
};

export type ChoiceButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected: boolean;
  tone?: ChoiceTone;
  children: ReactNode;
};

export function ChoiceButton({
  selected,
  tone = "neutral",
  className,
  children,
  type = "button",
  ...rest
}: ChoiceButtonProps) {
  const cls = [
    "rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-left transition disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700",
    TONE[tone],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={cls}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      {...rest}
    >
      {children}
    </button>
  );
}
