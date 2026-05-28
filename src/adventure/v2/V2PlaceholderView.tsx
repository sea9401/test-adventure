"use client";

import { Wrench } from "@phosphor-icons/react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 마을 시설 등의 "준비 중" placeholder — 후속 PR 에서 실제 기능으로 교체.

export function V2PlaceholderView({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title={title} onBack={onBack} />
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center shadow-sm dark:bg-zinc-900">
        <div className="mx-auto inline-flex text-zinc-400 dark:text-zinc-500">
          <Wrench size={40} weight="duotone" />
        </div>
        <div className="mt-3 text-base font-medium text-zinc-700 dark:text-zinc-300">
          준비 중
        </div>
        <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          후속 업데이트에서 만나요.
        </div>
      </div>
    </main>
  );
}
