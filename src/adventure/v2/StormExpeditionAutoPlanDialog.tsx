"use client";

import { useRef } from "react";
import type {
  StormExpeditionMode,
  StormExpeditionRouteId,
} from "@/adventure/data/v2/stormExpedition";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import type {
  StormExpeditionMapNodeId,
} from "@/adventure/data/v2/stormExpeditionMap";
import {
  STORM_EXPEDITION_RISK_EVENTS,
  type StormExpeditionRiskEventId,
} from "@/adventure/data/v2/stormExpedition";
import type {
  StormExpeditionAutoplayPlan,
  StormExpeditionBoonStrategy,
} from "./stormExpeditionAutoplayPolicy";
import {
  alignStormExpeditionPlanToVisitedRoutes,
  stormExpeditionRiskDecision,
  stormExpeditionVisitedRouteId,
} from "./stormExpeditionAutoplayPolicy";

type Props = {
  open: boolean;
  value: StormExpeditionAutoplayPlan;
  lockedMode?: StormExpeditionMode;
  visitedNodeIds?: readonly StormExpeditionMapNodeId[];
  attemptsLeft: number;
  busy: boolean;
  onChange: (value: StormExpeditionAutoplayPlan) => void;
  onSubmit: (value: StormExpeditionAutoplayPlan) => void;
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
  lockedMode,
  visitedNodeIds = [],
  attemptsLeft,
  busy,
  onChange,
  onSubmit,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const modeAdjustedValue = lockedMode && value.mode !== lockedMode
    ? { ...value, mode: lockedMode }
    : value;
  const effectiveValue = alignStormExpeditionPlanToVisitedRoutes(
    modeAdjustedValue,
    visitedNodeIds,
  );
  const modeLocked = lockedMode !== undefined;
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
              <PlanButton label="실전 모드" selected={effectiveValue.mode === "normal"} disabled={busy || modeLocked || attemptsLeft <= 0} onClick={() => onChange({ ...effectiveValue, mode: "normal" })}>실전</PlanButton>
              <PlanButton label="연습 모드" selected={effectiveValue.mode === "practice"} disabled={busy || modeLocked} onClick={() => onChange({ ...effectiveValue, mode: "practice" })}>연습</PlanButton>
            </div>
            {modeLocked && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">진행 중인 원정에서는 모드를 변경할 수 없습니다.</p>}
            {!modeLocked && attemptsLeft <= 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">오늘의 실전 입장 횟수를 모두 사용했습니다.</p>}
          </fieldset>

          <RouteStage
            label="외곽 항로"
            value={effectiveValue.outerRouteId}
            busy={busy}
            locked={stormExpeditionVisitedRouteId(visitedNodeIds, "outer") !== null}
            onChange={(outerRouteId) => onChange({ ...effectiveValue, outerRouteId })}
          />
          <RouteStage
            label="중층 항로"
            value={effectiveValue.middleRouteId}
            busy={busy}
            locked={stormExpeditionVisitedRouteId(visitedNodeIds, "middle") !== null}
            onChange={(middleRouteId) => onChange({ ...effectiveValue, middleRouteId })}
          />
          <RouteStage
            label="수호자 항로"
            value={effectiveValue.guardianRouteId}
            busy={busy}
            locked={stormExpeditionVisitedRouteId(visitedNodeIds, "guardian") !== null}
            onChange={(guardianRouteId) => onChange({ ...effectiveValue, guardianRouteId })}
          />

          <fieldset className={`${SURFACE_INSET} p-3`}>
            <legend className="px-1 text-sm font-bold">축복 전략</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {STRATEGIES.map((strategy) => (
                <PlanButton
                  key={strategy.id}
                  label={`축복 전략 ${strategy.name}`}
                  selected={effectiveValue.boonStrategy === strategy.id}
                  disabled={busy}
                  onClick={() => onChange({ ...effectiveValue, boonStrategy: strategy.id })}
                >
                  <span className="block font-semibold">{strategy.name}</span>
                  <span className="mt-1 block text-[11px] font-normal">{strategy.description}</span>
                </PlanButton>
              ))}
            </div>
          </fieldset>

          <fieldset className={`${SURFACE_INSET} p-3`}>
            <legend className="px-1 text-sm font-bold">위험 이벤트</legend>
            <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-300">
              이벤트마다 자동 수락 여부를 정합니다. 선택하지 않은 이벤트는 안전하게 지나칩니다.
            </p>
            <div className="space-y-2">
              {(Object.keys(STORM_EXPEDITION_RISK_EVENTS) as StormExpeditionRiskEventId[]).map((eventId) => {
                const event = STORM_EXPEDITION_RISK_EVENTS[eventId];
                const decision = stormExpeditionRiskDecision(effectiveValue, eventId);
                return (
                  <div key={eventId} className={`${SURFACE_CARD} p-3`}>
                    <div className="text-sm font-semibold">{event.name}</div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{event.description}</p>
                    <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">대가 · {event.cost}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(["decline", "accept"] as const).map((nextDecision) => (
                        <PlanButton
                          key={nextDecision}
                          label={`${event.name} ${nextDecision === "accept" ? "수락" : "지나치기"}`}
                          selected={decision === nextDecision}
                          disabled={busy}
                          onClick={() => onChange({
                            ...effectiveValue,
                            riskEventDecisions: {
                              ...effectiveValue.riskEventDecisions,
                              [eventId]: nextDecision,
                            },
                          })}
                        >
                          {nextDecision === "accept" ? "수락" : "지나치기"}
                        </PlanButton>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <p className={`${SURFACE_INSET} border-rose-300 p-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:text-rose-300`}>
            패배하면 임시 전리품을 모두 잃으며 자동 귀환하지 않습니다.
          </p>
          <button
            type="button"
            disabled={busy || (!modeLocked && effectiveValue.mode === "normal" && attemptsLeft <= 0)}
            onClick={() => onSubmit(effectiveValue)}
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
  locked,
  onChange,
}: {
  label: "외곽 항로" | "중층 항로" | "수호자 항로";
  value: StormExpeditionRouteId;
  busy: boolean;
  locked: boolean;
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
            disabled={busy || locked}
            onClick={() => onChange(route.id)}
          >
            {route.name}
          </PlanButton>
        ))}
      </div>
      {locked && (
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          이미 방문한 항로로 고정됩니다.
        </p>
      )}
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
