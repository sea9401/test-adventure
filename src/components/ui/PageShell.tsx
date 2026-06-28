import type { ElementType, ComponentPropsWithoutRef, ReactNode } from "react";

type PageShellSpacing = "tight" | "normal" | "loose";

const SPACING: Record<PageShellSpacing, string> = {
  tight: "space-y-3",
  normal: "space-y-4",
  loose: "space-y-5",
};

type PageShellOwnProps = {
  spacing?: PageShellSpacing;
  className?: string;
  children?: ReactNode;
};

export type PageShellProps<T extends ElementType = "main"> = PageShellOwnProps & {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, keyof PageShellOwnProps | "as">;

export function PageShell<T extends ElementType = "main">({
  as,
  spacing = "normal",
  className,
  children,
  ...rest
}: PageShellProps<T>) {
  const Tag = (as ?? "main") as ElementType;
  const cls = [
    "mx-auto w-full max-w-[720px] px-4 py-5 text-zinc-900 sm:px-6 sm:py-6 dark:text-zinc-100",
    SPACING[spacing],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
