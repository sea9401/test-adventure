import type { ReactNode } from "react";
import {
  SURFACE_ACCENT,
  SURFACE_INSET,
} from "@/components/ui/surfaces";

// 게임 안내서 본문 공용 프리미티브.
// 페이지 안에서 일관된 타이포/간격을 유지하려고 외부에서 일반 <h2>·<p>·<table>
// 대신 이 컴포넌트들을 쓴다.

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-10 scroll-mt-6 text-pretty text-lg font-bold tracking-tight text-zinc-900 first:mt-0 dark:text-zinc-100">
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-6 text-pretty text-sm font-bold text-zinc-800 dark:text-zinc-200">
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 break-keep text-pretty text-[15px] leading-7 text-zinc-700 dark:text-zinc-300">
      {children}
    </p>
  );
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-3 space-y-2.5 pl-5 text-[15px] leading-7 text-zinc-700 dark:text-zinc-300 [&>li]:break-keep [&>li]:text-pretty [&>li]:list-disc [&>li::marker]:text-amber-500">
      {children}
    </ul>
  );
}

export function Em({ children }: { children: ReactNode }) {
  return (
    <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
      {children}
    </strong>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-zinc-100 px-1 py-px font-mono text-[0.85em] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
      {children}
    </code>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${SURFACE_ACCENT} mt-5 break-keep px-4 py-3 text-pretty text-sm leading-6 text-amber-950 dark:text-amber-100`}
    >
      {children}
    </div>
  );
}

export function Table({
  head,
  rows,
  caption,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
  caption?: string;
}) {
  return (
    <div className={`${SURFACE_INSET} mt-5 overflow-x-auto`}>
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        {caption && (
          <caption className="caption-bottom px-3 py-3 text-left text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {caption}
          </caption>
        )}
        <thead className="bg-zinc-100 dark:bg-zinc-800">
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className="border-t border-zinc-200 dark:border-zinc-700"
            >
              {r.map((c, j) => (
                <td
                  key={j}
                  className="break-keep px-3 py-2.5 align-top leading-6 text-zinc-700 dark:text-zinc-300"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
