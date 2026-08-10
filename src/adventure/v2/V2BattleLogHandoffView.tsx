"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FilmStrip } from "@phosphor-icons/react";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { BattleLogScrollTopButton } from "@/adventure/v2/BattleLogScrollTopButton";
import {
  readBattleLogHandoff,
  type BattleLogHandoff,
} from "@/adventure/v2/battleLogHandoff";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_INSET } from "@/components/ui/surfaces";

function TextBattleLog({
  handoff,
}: {
  handoff: Extract<BattleLogHandoff, { kind: "text" }>;
}) {
  return (
    <Card padding="md" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-700">
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
            {handoff.playerName} 대 {handoff.enemyName}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {handoff.lines.length.toLocaleString()}개 기록 · 첫 행동부터 표시
          </p>
        </div>
      </div>
      <ol className="space-y-2">
        {handoff.lines.map((line, index) => (
          <li
            key={`${index}:${line}`}
            className={`${SURFACE_INSET} grid grid-cols-[2.25rem_1fr] gap-2 px-3 py-2 text-sm`}
          >
            <span className="text-right text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
              {index + 1}
            </span>
            <span className="min-w-0 break-words text-zinc-700 dark:text-zinc-200">
              {line}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

const OVERLAY_SCROLL_TARGET_ID = "battle-log-overlay-scroll";

export function V2BattleLogHandoffView({
  handoffId,
  presentation = "page",
}: {
  handoffId: string;
  presentation?: "page" | "overlay";
}) {
  const router = useRouter();
  const [handoff, setHandoff] = useState<BattleLogHandoff | null | undefined>(
    undefined,
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 탭에 저장된 페이지 전달값을 읽는다.
    setHandoff(readBattleLogHandoff(handoffId));
  }, [handoffId]);

  const title = handoff?.title ?? "전투 로그";
  const scrollTargetId =
    presentation === "overlay" ? OVERLAY_SCROLL_TARGET_ID : undefined;

  const content = (
    <main className="mx-auto max-w-[880px] space-y-4 px-4 py-5 text-zinc-900 sm:p-6 dark:text-zinc-100">
      <SubViewHeader
        title={
          <>
            <FilmStrip size={20} weight="duotone" className="text-emerald-500" />
            {title}
          </>
        }
        onBack={() => router.back()}
      />

      {handoff === undefined && (
        <Card
          padding="md"
          className="text-center text-sm text-zinc-500 dark:text-zinc-400"
        >
          전투 로그를 여는 중…
        </Card>
      )}

      {handoff === null && (
        <Card padding="md" className="space-y-3 text-center">
          <p className="font-semibold">전투 로그를 찾을 수 없어요.</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            오래된 기록이거나 다른 브라우저 탭에서 연 주소일 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            이전 화면으로 돌아가기
          </button>
        </Card>
      )}

      {handoff?.kind === "replay" && (
        <ReplayBattleScene
          {...handoff.replay}
          presentation="page"
          scrollTargetId={scrollTargetId}
        />
      )}
      {handoff?.kind === "text" && <TextBattleLog handoff={handoff} />}

      {handoff?.kind === "text" && (
        <BattleLogScrollTopButton scrollTargetId={scrollTargetId} />
      )}
    </main>
  );

  if (presentation === "overlay") {
    return (
      <div
        id={OVERLAY_SCROLL_TARGET_ID}
        role="dialog"
        aria-modal="true"
        aria-label="전투 로그"
        data-battle-log-scroll-container="true"
        className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-white dark:bg-zinc-950"
      >
        {content}
      </div>
    );
  }

  return content;
}
