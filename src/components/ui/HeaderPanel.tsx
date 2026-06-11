import type { ReactNode } from "react";

const HEADER_PANEL =
  "rounded-xl bg-white/75 p-4 shadow-sm backdrop-blur-sm dark:bg-zinc-900/80";

export function HeaderPanel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={[HEADER_PANEL, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
