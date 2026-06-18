"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, BookOpen, CaretRight } from "@phosphor-icons/react";
import {
  MANUAL_GROUP_LABEL,
  MANUAL_SECTIONS,
  type ManualGroup,
  type ManualSection,
} from "./sections";

// 메뉴얼 공용 셸 — 데스크탑은 좌측 사이드바 + 본문, 모바일은 본문 위에 select.
// 셸 자체는 클라이언트 컴포넌트 (라우터 push 사용). 본문은 정적 — 안에 어떤 컴포넌트도 들어갈 수 있다.

export function ManualLayout({
  currentSlug,
  title,
  children,
}: {
  currentSlug: string | null;
  title: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const grouped = groupSections(MANUAL_SECTIONS);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next && next !== currentSlug) router.push(`/manual/${next}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4">
      {/* 상단 헤더 */}
      <div className="flex items-center gap-2">
        <Link
          href="/"
          aria-label="게임으로"
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <ArrowLeft size={16} weight="bold" />
          게임으로
        </Link>
        <div className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          <BookOpen size={18} weight="duotone" className="text-amber-500" />
          메뉴얼
        </div>
      </div>

      {/* 배너 */}
      <div className="relative h-32 w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 md:h-44">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/ui/manual.webp"
          alt=""
          aria-hidden
          className="h-full w-full object-cover"
        />
      </div>

      {/* 모바일 — 섹션 선택 select */}
      <div className="md:hidden">
        <label className="sr-only" htmlFor="manual-section-select">
          섹션 선택
        </label>
        <select
          id="manual-section-select"
          value={currentSlug ?? ""}
          onChange={handleSelectChange}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="" disabled>
            메뉴얼 목차
          </option>
          {grouped.map(({ group, sections }) => (
            <optgroup key={group} label={MANUAL_GROUP_LABEL[group]}>
              {sections.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex gap-4 md:flex-row flex-col">
        {/* 데스크탑 — 사이드바 */}
        <aside className="hidden md:block md:w-60 md:shrink-0">
          <nav className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-zinc-200 bg-white/90 p-3 dark:border-zinc-800 dark:bg-zinc-950/90">
            {grouped.map(({ group, sections }) => (
              <div key={group} className="mb-3 last:mb-0">
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {MANUAL_GROUP_LABEL[group]}
                </div>
                <ul>
                  {sections.map((s) => {
                    const active = s.slug === currentSlug;
                    return (
                      <li key={s.slug}>
                        <Link
                          href={`/manual/${s.slug}`}
                          className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                            active
                              ? "bg-amber-500/15 font-medium text-amber-700 dark:text-amber-300"
                              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          }`}
                        >
                          <span>{s.title}</span>
                          {active && (
                            <CaretRight
                              size={14}
                              weight="bold"
                              className="opacity-60"
                            />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* 본문 */}
        <main className="min-w-0 flex-1">
          <div className="rounded-lg border border-zinc-200 bg-white/90 p-5 dark:border-zinc-800 dark:bg-zinc-950/90 md:p-6">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </h1>
            <div className="mt-4">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

function groupSections(
  sections: readonly ManualSection[],
): { group: ManualGroup; sections: ManualSection[] }[] {
  const order: ManualGroup[] = [
    "intro",
    "combat",
    "growth",
    "world",
    "versus",
  ];
  const map = new Map<ManualGroup, ManualSection[]>();
  for (const s of sections) {
    const arr = map.get(s.group) ?? [];
    arr.push(s);
    map.set(s.group, arr);
  }
  return order
    .map((g) => ({ group: g, sections: map.get(g) ?? [] }))
    .filter((g) => g.sections.length > 0);
}
