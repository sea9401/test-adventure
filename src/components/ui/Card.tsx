import type { ElementType, ComponentPropsWithoutRef, ReactNode } from "react";

type CardPadding = "none" | "sm" | "md" | "lg";

const PAD: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

// 배경(zinc-50/950) 위에서 카드가 떠 보이도록 — light: 흰색+shadow, dark: zinc-900(배경보다 1단 밝게)+border 강조.
const SURFACE =
  "rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900";

type CardOwnProps = {
  padding?: CardPadding;
  className?: string;
  children?: ReactNode;
};

export type CardProps<T extends ElementType = "div"> = CardOwnProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof CardOwnProps | "as">;

export function Card<T extends ElementType = "div">({
  as,
  padding = "sm",
  className,
  children,
  ...rest
}: CardProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const cls = [SURFACE, PAD[padding], className].filter(Boolean).join(" ");
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
