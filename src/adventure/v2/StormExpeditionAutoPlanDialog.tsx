"use client";

import { useRef } from "react";
import type { StormExpeditionRouteId } from "@/adventure/data/v2/stormExpedition";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import type {
  StormExpeditionAutoplayPlan,
  StormExpeditionBoonStrategy,
} from "./stormExpeditionAutoplayPolicy";

type Props = {
  open: boolean;
  value: StormExpeditionAutoplayPlan;
  attemptsLeft: number;
  busy: boolean;
  onChange: (value: StormExpeditionAutoplayPlan) => void;
  onSubmit: () => void;
  onClose: () => void;
};

const ROUTES: readonly { id: StormExpeditionRouteId; name: string }[] = [
  { id: "gale", name: "칼바람" },
  { id: "thunder", name: "뇌운" },
  { id: "wreckage", name: "잔해" },
];

const STRATEGIES: readonly { id: StormExpeditionBoonStrategy; name: string; description: string }[] = [
  { id: "offense", name: "공격 우선", description: "완력·속도·치명타 축복을 먼저 선택" },
  { id: "survival", name: "생존 우선", description: "승리 회복·피해 감소 축복을 먼저 선택" },
  { id: "resource", name: "자원 우선", description: "최대 MP와 회복 축복을 먼저 선택" },
];

export function StormExpeditionAutoPlanDialog(props: Props) {
  return props.open ? <OpenStormExpeditionAutoPlanDialog {...props} /> : null;
}

function OpenStormExpeditionAutoPlanDialog({
  value,
  attemptsLeft,
  busy,
  onChange,
  onSubmit,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeIfIdle = () => {
    if (!busy) onClose();
  };
  useEscapeKey(closeIfIdle);
  useModalA11y(panelRef);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="storm-expedition-auto-plan-title"
        className={`${SURFACE_CARD} max-h-[min(92vh,820px)] w-full max-w-2xl overflow-y-auto p-4 sm:p-5`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="storm-expedition-auto-plan-title" className="text-lg font-bold">일괄 진행 설정</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">세 구간 항로와 축복 운영 방침을 정하면 완주 또는 패배까지 이어서 진행합니다.</p>
          </div>
          <button type="button" disabled={busy} onClick={closeIfIdle} className="min-h-11 shrink-0 rounded-md border border-zinc-300 px-3 text-sm font-semibold disabled:opacity-50 dark:border-zinc-700">닫기</button>
        </div>

        <div className="mt-4 space-y-4">
          <fieldset className={`${SURFACE_INSET} p-3`}>
            <legend className="px-1 text-sm font-bold">모드</legend>
            <div className="grid grid-cols-2 gap-2">
              <PlanButton label="실전 모드" selected={value.mode === "normal"} disabled={busy || attemptsLeft <= 0} onClick={() => onChange({ ...value, mode: "normal" })}>실전</PlanButton>
              <PlanButton label="연습 모드" selected={value.mode === "practice"} disabled={busy} onClick={() => onChange({ ...value, mode: "practice" })}>연습</PlanButton>
            </div>
            {attemptsLeft <= 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">오늘의 실전 입장 횟수를 모두 사용했습니다.</p>}
          </fieldset>

          <RouteStage
            label="외곽 항로"
            value={value.outerRouteId}
            busy={busy}
            onChange={(outerRouteId) => onChange({ ...value, outerRouteId })}
          />
          <RouteStage
            label="중층 항로"
            value={value.middleRouteId}
            busy={busy}
            onChange={(middleRouteId) => onChange({ ...value, middleRouteId })}
          />
          <RouteStage
            label="수호자 항로"
            value={value.guardianRouteId}
            busy={busy}
            onChange={(guardianRouteId) => onChange({ ...value, guardianRouteId })}
          />

          <fieldset className={`${SURFACE_INSET} p-3`}>
            <legend className="px-1 text-sm font-bold">축복 전략</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {STRATEGIES.map((strategy) => (
                <PlanButton
                  key={strategy.id}
                  label={`축복 전략 ${strategy.name}`}
                  selected={value.boonStrategy === strategy.id}
                  disabled={busy}
                  onClick={() => onChange({ ...value, boonStrategy: strategy.id })}
                >
                  <span className="block font-semibold">{strategy.name}</span>
                  <span className="mt-1 block text-[11px] font-normal">{strategy.description}</span>
                </PlanButton>
              ))}
            </div>
          </fieldset>

          <p className={`${SURFACE_INSET} border-rose-300 p-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:text-rose-300`}>
            패배하면 임시 전리품을 모두 잃으며 자동 귀환하지 않습니다.
          </p>
          <button
            type="button"
            disabled={busy || (value.mode === "normal" && attemptsLeft <= 0)}
            onClick={onSubmit}
            className="min-h-11 w-full rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? "시작 준비 중" : "일괄 진행 시작"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RouteStage({
  label,
  value,
  busy,
  onChange,
}: {
  label: "외곽 항로" | "중층 항로" | "수호자 항로";
  value: StormExpeditionRouteId;
  busy: boolean;
  onChange: (routeId: StormExpeditionRouteId) => void;
}) {
  return (
    <fieldset className={`${SURFACE_INSET} p-3`}>
      <legend className="px-1 text-sm font-bold">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {ROUTES.map((route) => (
          <PlanButton
            key={route.id}
            label={`${label} ${route.name}`}
            selected={value === route.id}
            disabled={busy}
            onClick={() => onChange(route.id)}
          >
            {route.name}
          </PlanButton>
        ))}
      </div>
    </fieldset>
  );
}

function PlanButton({
  label,
  selected,
  disabled,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 rounded-md border px-2 py-2 text-sm transition disabled:opacity-50 ${selected ? "border-sky-500 bg-sky-100 font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "border-zinc-300 bg-white text-zinc-700 hover:border-sky-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"}`}
    >
      {children}
    </button>
  );
}
