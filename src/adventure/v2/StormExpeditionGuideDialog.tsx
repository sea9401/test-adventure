"use client";

import { useRef } from "react";
import { X } from "@phosphor-icons/react";
import {
  STORM_EXPEDITION_DAILY_ATTEMPTS,
  STORM_EXPEDITION_STAGE_COUNT,
  STORM_EXPEDITION_UNLOCK_DEPTH,
  type StormExpeditionRouteId,
} from "@/adventure/data/v2/stormExpedition";
import {
  STORM_EXPEDITION_CROSS_UNIQUE_IDS,
  STORM_EXPEDITION_EQUIPMENT_IDS,
  STORM_EXPEDITION_HEART_UNIQUE_ID,
  STORM_EXPEDITION_ROUTE_UNIQUE_IDS,
  STORM_EXPEDITION_UNIQUE_LOOT,
} from "@/adventure/data/v2/stormExpeditionRewards";
import { huntStageName } from "@/adventure/data/v2/dungeon";
import { V2_EQUIPMENT, type V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

const ROUTES: readonly { id: StormExpeditionRouteId; name: string }[] = [
  { id: "wreckage", name: "잔해" },
  { id: "gale", name: "칼바람" },
  { id: "thunder", name: "뇌운" },
];

function equipmentNames(ids: readonly V2EquipmentId[]): string {
  return ids.map((id) => V2_EQUIPMENT[id]?.name ?? id).join(" · ");
}

function chanceText(chance: number): string {
  return `${(chance * 100).toFixed(2)}%`;
}

export function StormExpeditionGuideDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return open ? <OpenStormExpeditionGuideDialog onClose={onClose} /> : null;
}

function OpenStormExpeditionGuideDialog({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(panelRef);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="storm-expedition-guide-title"
        className={`${SURFACE_CARD} max-h-[min(90vh,820px)] w-full max-w-2xl overflow-y-auto p-4 sm:p-5`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              다시 보는 원정 설명
            </p>
            <h2 id="storm-expedition-guide-title" className="mt-0.5 text-lg font-bold">
              폭풍 원정 도움말
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="도움말 닫기"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X size={18} weight="bold" aria-hidden />
          </button>
        </div>

        <section className={`${SURFACE_INSET} mt-4 space-y-2 p-3 text-sm`}>
          <h3 className="font-bold">진행 방법</h3>
          <p>
            {huntStageName(STORM_EXPEDITION_UNLOCK_DEPTH)} 돌파 후 열리며, 실전은 하루 {STORM_EXPEDITION_DAILY_ATTEMPTS}회 입장할 수 있습니다.
          </p>
          <p>{STORM_EXPEDITION_STAGE_COUNT}개 체크포인트 · 7개 전투로 구성되며, 연결된 다음 노드로만 이동합니다.</p>
          <p>보급품과 폭풍 제단에서는 항로를 바꿀 수 있고, 선택한 뒤의 적과 보상은 새 항로를 따릅니다.</p>
          <p>전투 보상은 임시 가방에 쌓입니다. 전투 뒤 귀환하면 확보하지만, 다음 전투에서 패배하면 임시 전리품을 모두 잃습니다.</p>
          <p>연습 모드는 입장 횟수를 쓰지 않으며 보상·완주·천장 기록도 남기지 않습니다.</p>
        </section>

        <section className="mt-4 space-y-2">
          <h3 className="font-bold">항로 장비</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            아래 일반 장신구는 해당 항로의 모든 전투에서 나오며, 깊은 체크포인트일수록 장비 획득 확률이 높습니다.
          </p>
          {ROUTES.map((route) => (
            <div key={route.id} className={`${SURFACE_INSET} p-3`}>
              <p className="text-sm font-semibold">{route.name} 항로의 모든 전투</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                {equipmentNames(STORM_EXPEDITION_EQUIPMENT_IDS[route.id])}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-4 space-y-2">
          <h3 className="font-bold">폭풍 원정 전용 유니크</h3>
          {ROUTES.map((route) => (
            <div key={route.id} className={`${SURFACE_INSET} p-3`}>
              <p className="text-sm font-semibold">
                {V2_EQUIPMENT[STORM_EXPEDITION_ROUTE_UNIQUE_IDS[route.id]]?.name}
              </p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                {route.name} 항로 · 해당 항로 수호자 {chanceText(STORM_EXPEDITION_UNIQUE_LOOT.guardianRouteChance)} · 폭풍의 심장 {chanceText(STORM_EXPEDITION_UNIQUE_LOOT.finalRouteChance)}
              </p>
            </div>
          ))}
          <div className={`${SURFACE_INSET} p-3`}>
            <p className="text-sm font-semibold">
              {equipmentNames(STORM_EXPEDITION_CROSS_UNIQUE_IDS)}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              모든 항로 · 폭풍의 심장 {chanceText(STORM_EXPEDITION_UNIQUE_LOOT.finalCrossChance)}
            </p>
          </div>
          <div className={`${SURFACE_INSET} p-3`}>
            <p className="text-sm font-semibold">
              {V2_EQUIPMENT[STORM_EXPEDITION_HEART_UNIQUE_ID]?.name}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              모든 항로 · 폭풍의 심장 {chanceText(STORM_EXPEDITION_UNIQUE_LOOT.finalHeartChance)}
            </p>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            표기 확률은 기본 확률입니다. 폭풍 계약은 항로·교차 유니크 확률을 2배로 올리지만 폭풍심장 유니크 확률은 바꾸지 않습니다.
          </p>
        </section>
      </div>
    </div>
  );
}
