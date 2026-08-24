import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { SURFACE_INSET } from "./surfaces";

type InsetPadding = "none" | "sm" | "md";

const PADDING: Record<InsetPadding, string> = {
  none: "",
  sm: "p-2",
  md: "p-3",
};

type InsetOwnProps = {
  padding?: InsetPadding;
  className?: string;
  children?: ReactNode;
};

export type InsetProps<T extends ElementType = "div"> = InsetOwnProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof InsetOwnProps | "as">;

export function Inset<T extends ElementType = "div">({
  as,
  padding = "sm",
  className,
  children,
  ...rest
}: InsetProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={[SURFACE_INSET, PADDING[padding], className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </Tag>
  );
}
