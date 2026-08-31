"use client";

import { useRef } from "react";
import type {
  StormExpeditionChoice,
  StormExpeditionChoiceKind,
} from "@/adventure/data/v2/stormExpedition";
import type { StormExpeditionMapNode } from "@/adventure/data/v2/stormExpeditionMap";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

export type StormExpeditionNodeDialogModel =
  | {
      kind: "battle";
      node: StormExpeditionMapNode;
      encounterIndex: number;
      encounterCount: number;
      enemyName: string | null;
      rewardLines: readonly string[];
      skipReplay: boolean;
    }
  | {
      kind: "choice";
      node: StormExpeditionMapNode;
      choiceKind: StormExpeditionChoiceKind;
      hp: number;
      maxHp: number;
      mp: number;
      maxMp: number;
      choices: readonly StormExpeditionChoice[];
    }
  | {
      kind: "risk";
      node: StormExpeditionMapNode;
      title: string;
      benefit: string;
      cost: string;
    }
  | {
      kind: "move";
      node: StormExpeditionMapNode;
      routeName: string | null;
      disabledReason: string | null;
    }
  | {
      kind: "completed";
      node: StormExpeditionMapNode;
      summary: readonly string[];
    }
  | {
      kind: "locked";
      node: StormExpeditionMapNode;
      reason: string;
    };

export type StormExpeditionNodeDialogAction =
  | { kind: "fight" }
  | { kind: "choose"; choiceId: string }
  | { kind: "risk"; decision: "accept" | "decline" }
  | { kind: "move" }
  | { kind: "skip_replay"; value: boolean };

type Props = {
  open: boolean;
  model: StormExpeditionNodeDialogModel;
  busy: boolean;
  onAction: (action: StormExpeditionNodeDialogAction) => void;
  onClose: () => void;
};

export function StormExpeditionNodeDialog(props: Props) {
  return props.open ? <OpenStormExpeditionNodeDialog {...props} /> : null;
}

function OpenStormExpeditionNodeDialog({ model, busy, onAction, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeIfIdle = () => {
    if (!busy) onClose();
  };
  useEscapeKey(closeIfIdle);
  useModalA11y(panelRef);
  const titleId = `storm-expedition-node-dialog-${model.node.id}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeIfIdle();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${SURFACE_CARD} max-h-[min(88vh,760px)] w-full max-w-lg overflow-y-auto p-4`}
      >
        <div>
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">{modelLabel(model)}</p>
          <h2 id={titleId} className="mt-0.5 text-lg font-bold">{model.node.name}</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{model.node.description}</p>
        </div>

        <div className="mt-4">
          {model.kind === "battle" && <BattleBody model={model} busy={busy} onAction={onAction} />}
          {model.kind === "choice" && <ChoiceBody model={model} busy={busy} onAction={onAction} />}
          {model.kind === "risk" && <RiskBody model={model} busy={busy} onAction={onAction} />}
          {model.kind === "move" && <MoveBody model={model} busy={busy} onAction={onAction} />}
          {model.kind === "completed" && <SummaryBody lines={model.summary} />}
          {model.kind === "locked" && <SummaryBody lines={[model.reason]} />}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={closeIfIdle}
          className="mt-4 min-h-11 w-full rounded-md border border-zinc-300 px-4 text-sm font-semibold transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          확인
        </button>
      </div>
    </div>
  );
}

function BattleBody({
  model,
  busy,
  onAction,
}: {
  model: Extract<StormExpeditionNodeDialogModel, { kind: "battle" }>;
  busy: boolean;
  onAction: Props["onAction"];
}) {
  return (
    <div className="space-y-3">
      <div className={`${SURFACE_INSET} space-y-1 p-3 text-sm`}>
        {model.enemyName && <p><span className="text-zinc-500">적</span> · {model.enemyName}</p>}
        <p><span className="text-zinc-500">연전</span> · {model.encounterIndex + 1} / {model.encounterCount}전</p>
        {model.rewardLines.map((line) => <p key={line}>{line}</p>)}
      </div>
      <label className="flex min-h-11 items-center justify-end gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={model.skipReplay}
          disabled={busy}
          onChange={(event) => onAction({ kind: "skip_replay", value: event.target.checked })}
          className="accent-sky-600"
        />
        전투 결과 바로 보기
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() => onAction({ kind: "fight" })}
        className="min-h-11 w-full rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {busy ? "전투 처리 중" : "전투 시작"}
      </button>
    </div>
  );
}

function ChoiceBody({
  model,
  busy,
  onAction,
}: {
  model: Extract<StormExpeditionNodeDialogModel, { kind: "choice" }>;
  busy: boolean;
  onAction: Props["onAction"];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        HP {formatNumber(model.hp)} / {formatNumber(model.maxHp)} · MP {formatNumber(model.mp)} / {formatNumber(model.maxMp)}
      </p>
      {model.choiceKind === "altar" && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">이번에 제시된 축복 중 하나를 선택하세요.</p>
      )}
      {model.choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          disabled={busy}
          onClick={() => onAction({ kind: "choose", choiceId: choice.id })}
          className={`${SURFACE_INSET} min-h-11 w-full p-3 text-left transition hover:border-sky-400 disabled:opacity-50`}
        >
          <span className="text-sm font-semibold">{choice.name}</span>
          <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{choice.description}</span>
        </button>
      ))}
    </div>
  );
}

function RiskBody({
  model,
  busy,
  onAction,
}: {
  model: Extract<StormExpeditionNodeDialogModel, { kind: "risk" }>;
  busy: boolean;
  onAction: Props["onAction"];
}) {
  return (
    <div className={`${SURFACE_INSET} space-y-3 border-rose-300 p-3 dark:border-rose-900`}>
      <h3 className="font-bold">{model.title}</h3>
      <p className="text-sm text-emerald-700 dark:text-emerald-300">이익 · {model.benefit}</p>
      <p className="text-sm text-rose-700 dark:text-rose-300">대가 · {model.cost}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => onAction({ kind: "risk", decision: "decline" })} className="min-h-11 rounded-md border border-zinc-300 text-sm font-semibold disabled:opacity-50 dark:border-zinc-700">지나치기</button>
        <button type="button" disabled={busy} onClick={() => onAction({ kind: "risk", decision: "accept" })} className="min-h-11 rounded-md bg-rose-600 text-sm font-semibold text-white disabled:opacity-50">위험 감수</button>
      </div>
    </div>
  );
}

function MoveBody({
  model,
  busy,
  onAction,
}: {
  model: Extract<StormExpeditionNodeDialogModel, { kind: "move" }>;
  busy: boolean;
  onAction: Props["onAction"];
}) {
  return (
    <div className="space-y-3">
      {model.routeName && <p className="text-sm font-semibold">{model.routeName}</p>}
      {model.disabledReason && <p className={`${SURFACE_INSET} p-3 text-sm text-amber-700 dark:text-amber-300`}>{model.disabledReason}</p>}
      <button
        type="button"
        disabled={busy || model.disabledReason !== null}
        onClick={() => onAction({ kind: "move" })}
        className="min-h-11 w-full rounded-md bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "이동 처리 중" : "이 경로로 이동"}
      </button>
    </div>
  );
}

function SummaryBody({ lines }: { lines: readonly string[] }) {
  return (
    <div className={`${SURFACE_INSET} space-y-1 p-3 text-sm`}>
      {lines.map((line) => <p key={line}>{line}</p>)}
    </div>
  );
}

function modelLabel(model: StormExpeditionNodeDialogModel): string {
  if (model.kind === "completed") return "완료한 체크포인트";
  if (model.kind === "locked") return "잠긴 체크포인트";
  if (model.kind === "move") return "다음 경로 확인";
  if (model.kind === "risk") return "위험 이벤트";
  if (model.kind === "battle") return "전투 체크포인트";
  return "선택 체크포인트";
}

function formatNumber(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString("ko-KR");
}
