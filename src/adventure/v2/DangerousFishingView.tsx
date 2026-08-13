"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type {
  DangerousBaitId,
  DangerousDepthId,
  DangerousGearKind,
  DangerousZoneId,
} from "@/adventure/data/v2/dangerousFishing";
import type { DangerousFishingAction } from "./dangerousFishingEncounter";
import { DangerousFishingEncounterPanel } from "./DangerousFishingEncounterPanel";
import { DangerousFishingCargoPanel } from "./DangerousFishingCargoPanel";
import { DangerousFishingLoadoutPanel } from "./DangerousFishingLoadoutPanel";
import {
  DangerousFishingBossPanel,
  type DangerousFishingBossViewModel,
} from "./DangerousFishingBossPanel";
import { FishingSubTabs } from "./FishingSubTabs";
import type {
  DangerousFishingBusy,
  DangerousFishingViewModel,
} from "./useDangerousFishing";

export function dangerousFishingErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    network: "연결이 불안정합니다. 잠시 뒤 다시 시도해 주세요.",
    out_of_bait: "선택한 특수 미끼가 없습니다. 기본 미끼를 쓰거나 상점에서 보충하세요.",
    auto_active: "자동 채집이 진행 중입니다. 작업을 정산한 뒤 출항하세요.",
    fishing_level_locked: "기존 낚시에서 15레벨을 달성하면 위험 해역이 열립니다.",
    zone_level_locked: "이 해역은 낚시 레벨이 더 필요합니다.",
    stale: "다른 요청에서 조우가 먼저 진행되었습니다. 최신 상태를 불러왔습니다.",
    too_fast: "낚싯줄이 반응할 때까지 잠깐 기다려 주세요.",
    encounter_active: "진행 중인 조우를 먼저 마쳐 주세요.",
    insufficient_coins: "낚시 코인이 부족합니다.",
  };
  return messages[error] ?? "요청을 처리하지 못했습니다. 상태를 확인하고 다시 시도해 주세요.";
}

export function dangerousFishingShortcut(
  key: string,
  textEntryTarget: boolean,
): DangerousFishingAction | null {
  if (textEntryTarget) return null;
  const normalized = key.toLowerCase();
  if (normalized === "a") return "reel";
  if (normalized === "s") return "give";
  if (normalized === "d") return "brace";
  return null;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "select" || tag === "textarea" || target.isContentEditable;
}

export function DangerousFishingView({
  model,
  boss,
  loading,
  busy,
  error,
  onBack,
  onOpenFishing,
  onStartVoyage,
  onReturnVoyage,
  onStartEncounter,
  onAction,
  onShop,
  onStartBossAttempt,
  onBossAction,
  onClaimBossReward,
}: {
  model: DangerousFishingViewModel | null;
  boss: DangerousFishingBossViewModel | null;
  loading: boolean;
  busy: DangerousFishingBusy;
  error: string | null;
  onBack?: () => void;
  onOpenFishing?: () => void;
  onStartVoyage: (zoneId: DangerousZoneId, depthId: DangerousDepthId) => Promise<boolean>;
  onReturnVoyage: () => Promise<boolean>;
  onStartEncounter: (baitId: DangerousBaitId) => Promise<boolean>;
  onAction: (action: DangerousFishingAction, encounterId: string, revision: number) => Promise<boolean>;
  onShop: (kind: DangerousGearKind | "bait", id: string, action: "buy" | "equip") => Promise<boolean>;
  onStartBossAttempt: (eventId: string) => Promise<boolean>;
  onBossAction: (action: DangerousFishingAction, eventId: string, encounterId: string, revision: number) => Promise<boolean>;
  onClaimBossReward: (eventId: string) => Promise<boolean>;
}) {
  const [zoneId, setZoneId] = useState<DangerousZoneId>("shattered_reef");
  const [depthId, setDepthId] = useState<DangerousDepthId>("surface");
  const [baitId, setBaitId] = useState<DangerousBaitId>("basic_bait");
  const encounter = model?.state.voyage?.encounter ?? null;

  useEffect(() => {
    if (!encounter) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || busy) return;
      const action = dangerousFishingShortcut(event.key, isTextEntryTarget(event.target));
      if (!action) return;
      event.preventDefault();
      void onAction(action, encounter.id, encounter.revision);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, encounter, onAction]);

  return (
    <main className={`${SURFACE_CARD} mx-auto my-2 w-[calc(100%-1rem)] max-w-[780px] space-y-4 rounded-2xl p-4 text-zinc-900 shadow-lg dark:text-zinc-100 sm:my-4 sm:w-[calc(100%-2rem)] sm:p-6`}>
      <SubViewHeader title="위험 해역 낚시" onBack={onBack} />
      <FishingSubTabs active="dangerous" onOpenFishing={onOpenFishing} />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        기존 낚시와 별개의 선택형 콘텐츠입니다. 정해진 20분 세션이나 일일 숙제 없이 한 번의 어획 후에도 귀환할 수 있습니다.
      </p>

      {error ? (
        <div role="alert" className={`${SURFACE_INSET} border-rose-300 p-3 text-sm text-rose-700 dark:border-rose-800 dark:text-rose-300`}>
          {dangerousFishingErrorMessage(error)}
        </div>
      ) : null}

      {loading && !model ? (
        <div className={`${SURFACE_INSET} p-8 text-center text-sm text-zinc-500`}>위험 해역 정보를 불러오는 중…</div>
      ) : !model ? (
        <div className={`${SURFACE_INSET} p-8 text-center text-sm text-zinc-500`}>정보를 불러오지 못했습니다. 다시 시도해 주세요.</div>
      ) : !model.heritage.unlocked ? (
        <section className={`${SURFACE_INSET} space-y-3 p-5 text-center`}>
          <h2 className="font-bold">낚시 레벨 15에 열립니다</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">현재 {model.heritage.fishingLevel}레벨입니다. 기존 낚시에서 경험치를 쌓으면 별도 비용 없이 스타터 세트를 받습니다.</p>
        </section>
      ) : (
        <>
          <DangerousFishingBossPanel
            model={boss}
            busy={busy !== null}
            onStart={onStartBossAttempt}
            onAction={onBossAction}
            onClaim={onClaimBossReward}
          />
          {!model.state.voyage ? (
            <section className={`${SURFACE_CARD} space-y-4 p-4`}>
              <div>
                <h2 className="font-bold">출항 준비</h2>
                <p className="text-xs text-zinc-500">해역과 수심이 깊을수록 사고 위험과 희귀 어종 기회가 커집니다.</p>
              </div>
              <label className="block text-xs font-semibold">
                해역
                <select className="mt-1 min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900" value={zoneId} onChange={(event) => setZoneId(event.target.value as DangerousZoneId)}>
                  {Object.values(model.catalogs.zones).map((zone) => <option key={zone.id} value={zone.id} disabled={model.heritage.fishingLevel < zone.unlockLevel}>{zone.name} · Lv {zone.unlockLevel}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                수심
                <select className="mt-1 min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900" value={depthId} onChange={(event) => setDepthId(event.target.value as DangerousDepthId)}>
                  {Object.values(model.catalogs.depths).map((depth) => <option key={depth.id} value={depth.id}>{depth.name} · 위험 +{depth.riskBonus}</option>)}
                </select>
              </label>
              <Button fullWidth variant="danger" disabled={busy !== null || model.activeAutoActivity !== null} onClick={() => void onStartVoyage(zoneId, depthId)}>
                {model.activeAutoActivity ? "자동 채집 정산 필요" : "출항하기"}
              </Button>
            </section>
          ) : (
            <>
              <section className={`${SURFACE_INSET} flex flex-wrap items-center justify-between gap-2 p-3 text-sm`}>
                <span className="font-bold">{model.catalogs.zones[model.state.voyage.zoneId].name} · {model.catalogs.depths[model.state.voyage.depthId].name}</span>
                <span>위험도 {model.riskPreview.risk} · 사고 확률 {Math.round(model.riskPreview.accidentChance * 100)}% · 최대 손실 {Math.round(model.riskPreview.maxLossFraction * 100)}%</span>
              </section>
              {encounter ? (
                <DangerousFishingEncounterPanel encounter={encounter} busy={busy !== null} onAction={(action) => void onAction(action, encounter.id, encounter.revision)} />
              ) : (
                <section className={`${SURFACE_CARD} space-y-3 p-4`}>
                  <h2 className="font-bold">다음 어획</h2>
                  <label className="block text-xs font-semibold">
                    미끼
                    <select className="mt-1 min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900" value={baitId} onChange={(event) => setBaitId(event.target.value as DangerousBaitId)}>
                      {Object.values(model.catalogs.baits).map((bait) => <option key={bait.id} value={bait.id} disabled={!bait.unlimited && (model.state.baitCounts[bait.id] ?? 0) <= 0}>{bait.name} · {bait.unlimited ? "무제한" : `${model.state.baitCounts[bait.id] ?? 0}개`}</option>)}
                    </select>
                  </label>
                  <Button fullWidth variant="info" disabled={busy !== null} onClick={() => void onStartEncounter(baitId)}>낚싯줄 던지기</Button>
                </section>
              )}
              <DangerousFishingCargoPanel model={model} busy={busy !== null} onReturn={() => void onReturnVoyage()} />
            </>
          )}
          {!model.state.voyage?.encounter ? (
            <DangerousFishingLoadoutPanel model={model} busy={busy !== null} onShop={(kind, id, action) => void onShop(kind, id, action)} />
          ) : null}
        </>
      )}
    </main>
  );
}
