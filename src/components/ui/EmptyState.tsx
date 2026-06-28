import type { ReactNode } from "react";
import { SURFACE_INSET } from "./surfaces";

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: ReactNode;
  title: string;
  message: string;
}) {
  return (
    <section className={`${SURFACE_INSET} border-dashed p-8 text-center`}>
      <div className="mx-auto inline-flex text-zinc-400 dark:text-zinc-500">
        {icon}
      </div>
      <div className="mt-3 text-base font-medium text-zinc-700 dark:text-zinc-300">
        {title}
      </div>
      <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {message}
      </div>
    </section>
  );
}
