"use client";

import { Prohibit } from "@phosphor-icons/react";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD } from "@/components/ui/surfaces";

export function TreasureDisabledPanel({ onBack }: { onBack: () => void }) {
  return (
    <PageShell spacing="tight">
      <SubViewHeader title="발굴 감정소" onBack={onBack} />
      <section className={`${SURFACE_CARD} p-4`}>
        <div className="flex items-start gap-3">
          <Prohibit
            size={24}
            weight="duotone"
            className="mt-0.5 shrink-0 text-zinc-500"
          />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              발굴 콘텐츠는 임시 비활성화되었습니다.
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              관련 화면과 길드 발굴 지원소는 재정비 후 다시 열릴 예정입니다.
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
