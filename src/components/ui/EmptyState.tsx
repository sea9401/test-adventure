import Link from "next/link";
import type { ReactNode } from "react";
import { Button, buttonClassName } from "./Button";
import { SURFACE_INSET } from "./surfaces";

// 빈 상태는 "왜 비었는지 + 채우는 방법"을 말하고, 가능하면 채우러 가는 바로가기를 준다.
export type EmptyStateAction = { label: string; href?: string; onClick?: () => void };

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: EmptyStateAction;
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
      {action?.href ? (
        <Link href={action.href} className={buttonClassName({ variant: "secondary", size: "sm", className: "mt-4" })}>
          {action.label}
        </Link>
      ) : action?.onClick ? (
        <Button size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}
