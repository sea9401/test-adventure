import type { InputHTMLAttributes } from "react";

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export function TextInput({ className, type = "text", ...rest }: TextInputProps) {
  return (
    <input
      type={type}
      className={[
        "min-h-11 min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none transition-colors focus-visible:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 disabled:opacity-60 sm:min-h-9 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:border-violet-400 dark:focus-visible:ring-violet-400",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
