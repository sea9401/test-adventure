import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "soft"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "ghost";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

const BASE =
  "relative inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950";

// 주 버튼 색은 화면 스타일이 정한다(globals.css의 --ui-primary*). 클래식은 보라, 금빛은 금색.
const PRIMARY =
  "border border-primary-border bg-primary text-on-primary hover:bg-primary-hover";

// 버튼 위계는 주 행동(primary)·보조(secondary)·위험(danger)·약한 강조(soft)·글자(ghost)뿐이다.
//   success·warning·info는 화면마다 초록·주황·하늘색 주 버튼이 섞이던 원인이라 주 버튼과 같은
//   모양으로 그린다. 새 코드는 primary를 쓰고, 위험 행동(삭제·판매·초기화)만 danger.
const VARIANT: Record<ButtonVariant, string> = {
  primary: PRIMARY,
  secondary:
    "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
  soft:
    "border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200 dark:hover:bg-violet-900",
  success: PRIMARY,
  warning: PRIMARY,
  danger:
    "border border-rose-600 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500",
  info: PRIMARY,
  ghost:
    "border border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
};

const SIZE: Record<ButtonSize, string> = {
  xs: "min-h-10 sm:min-h-7 px-2 py-1 text-xs",
  sm: "min-h-10 sm:min-h-8 px-3 py-1.5 text-sm",
  md: "min-h-11 sm:min-h-10 px-4 py-2 text-sm",
  lg: "min-h-11 px-5 py-2.5 text-base sm:min-h-12",
  icon: "size-11 shrink-0 p-0",
};

export type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

export function buttonClassName({
  variant = "secondary",
  size = "sm",
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}) {
  return [
    BASE,
    variant !== "ghost" ? "ui-game-button" : "",
    VARIANT[variant],
    SIZE[size],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "sm",
  fullWidth = false,
  className,
  children,
  type = "button",
  disabled,
  loading = false,
  loadingLabel,
  "aria-label": ariaLabel,
  ...rest
}: ButtonProps) {
  const cls = buttonClassName({ variant, size, fullWidth, className });
  const accessibleLoadingLabel =
    loadingLabel ??
    (typeof children === "string"
      ? `${children} 처리 중`
      : ariaLabel ?? "처리 중");

  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={loading ? accessibleLoadingLabel : ariaLabel}
      {...rest}
    >
      <span
        data-button-content="true"
        className={`inline-flex items-center justify-center gap-1.5 ${loading ? "invisible" : ""}`}
      >
        {children}
      </span>
      {loading && (
        <span
          data-button-spinner="true"
          aria-hidden="true"
          className="absolute inset-0 inline-flex items-center justify-center"
        >
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
        </span>
      )}
    </button>
  );
}
