"use client";

import { useRef } from "react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

export type StormExpeditionAutoplayResultModel =
  | { kind: "complete"; reachedNodeName: string; rewards: readonly string[] }
  | { kind: "defeated"; reachedNodeName: string; lostLoot: readonly string[] };

export function StormExpeditionAutoplayResultDialog({
  open,
  model,
  onClose,
}: {
  open: boolean;
  model: StormExpeditionAutoplayResultModel;
  onClose: () => void;
}) {
  return open ? <OpenStormExpeditionAutoplayResultDialog model={model} onClose={onClose} /> : null;
}

function OpenStormExpeditionAutoplayResultDialog({
  model,
  onClose,
}: {
  model: StormExpeditionAutoplayResultModel;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(panelRef);
  const complete = model.kind === "complete";
  const lines = complete ? model.rewards : model.lostLoot;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="storm-expedition-autoplay-result-title"
        className={`${SURFACE_CARD} w-full max-w-md p-4`}
      >
        <p className={`text-xs font-semibold ${complete ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
          {complete ? "완주" : "패배"}
        </p>
        <h2 id="storm-expedition-autoplay-result-title" className="mt-1 text-lg font-bold">
          {complete ? "일괄 진행 완료" : "일괄 진행 패배"}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">도달 지점 · {model.reachedNodeName}</p>
        <div className={`${SURFACE_INSET} mt-3 space-y-1 p-3 text-sm`}>
          <p className="font-semibold">{complete ? "확정 보상" : "잃은 임시 전리품"}</p>
          {lines.length > 0
            ? lines.map((line) => <p key={line}>{line}</p>)
            : <p className="text-zinc-500 dark:text-zinc-400">표시할 전리품이 없습니다.</p>}
        </div>
        <button type="button" onClick={onClose} className="mt-4 min-h-11 w-full rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500">
          확인
        </button>
      </div>
    </div>
  );
}
