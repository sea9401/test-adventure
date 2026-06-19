import type { ElementType, ComponentPropsWithoutRef, ReactNode } from "react";
import { SURFACE_CARD } from "./surfaces";

type CardPadding = "none" | "sm" | "md" | "lg";

const PAD: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

// 카드 표면 = surface 토큰 SSOT(불투명 흰/zinc-900). 새 패널도 직접 색 짜지 말고 SURFACE_* 사용.
const SURFACE = SURFACE_CARD;

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
