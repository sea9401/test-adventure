"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type {
  DangerousBaitId,
  DangerousDepthId,
  DangerousZoneId,
} from "@/adventure/data/v2/dangerousFishing";
import type { DangerousFishingAction } from "./dangerousFishingEncounter";
import { DangerousFishingEncounterPanel } from "./DangerousFishingEncounterPanel";
import { DangerousFishingRealtimePanel } from "./DangerousFishingRealtimePanel";
import { DangerousFishingCargoPanel } from "./DangerousFishingCargoPanel";
import { DangerousFishingPreparationPanel } from "./DangerousFishingPreparationPanel";
import {
  DangerousFishingBossPanel,
  type DangerousFishingBossViewModel,
} from "./DangerousFishingBossPanel";
import { FishingSubTabs } from "./FishingSubTabs";
import { ActivityVerificationGate } from "./ActivityVerificationGate";
import { DangerousFishingFeedbackCard } from "./DangerousFishingFeedbackCard";
import type { DangerousFishingFeedback } from "./dangerousFishingFeedback";
import type {
  ActivityVerificationChallenge,
  ActivityVerificationSubmission,
} from "./useActivityVerification";
import type {
  DangerousFishingBusy,
  DangerousFishingViewModel,
} from "./useDangerousFishing";
import type { DangerousRealtimeJsonReader } from "./useDangerousFishingRealtime";

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
    voyage_active: "진행 중인 항해를 마치고 귀환한 뒤 거대어 개인 시도를 시작하세요.",
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
  feedback = null,
  verification = null,
  verifyHuman,
  readJson,
  onBack,
  onOpenFishing,
  onOpenChallenges,
  onOpenLeaderboard,
  onOpenHallOfFame,
  onOpenShop,
  onStartVoyage,
  onReturnVoyage,
  onStartEncounter,
  onAction,
  onStartBossAttempt,
  onBossAction,
  onClaimBossReward,
  onRealtimeFinish,
}: {
  model: DangerousFishingViewModel | null;
  boss: DangerousFishingBossViewModel | null;
  loading: boolean;
  busy: DangerousFishingBusy;
  error: string | null;
  feedback?: DangerousFishingFeedback | null;
  verification?: ActivityVerificationChallenge | null;
  verifyHuman?: (
    submission: ActivityVerificationSubmission,
  ) => Promise<boolean>;
  readJson: DangerousRealtimeJsonReader;
  onBack?: () => void;
  onOpenFishing?: () => void;
  onOpenChallenges?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenHallOfFame?: () => void;
  onOpenShop?: () => void;
  onStartVoyage: (zoneId: DangerousZoneId, depthId: DangerousDepthId) => Promise<boolean>;
  onReturnVoyage: () => Promise<boolean>;
  onStartEncounter: (baitId: DangerousBaitId) => Promise<boolean>;
  onAction: (action: DangerousFishingAction, encounterId: string, revision: number) => Promise<boolean>;
  onStartBossAttempt: (eventId: string) => Promise<boolean>;
  onBossAction: (action: DangerousFishingAction, eventId: string, encounterId: string, revision: number) => Promise<boolean>;
  onClaimBossReward: (eventId: string, bossName?: string) => Promise<boolean>;
  onRealtimeFinish: (
    scope: "voyage" | "boss",
    response: Record<string, unknown>,
  ) => void;
}) {
  const [activeTab, setActiveTab] = useState<"voyage" | "boss">("voyage");
  const [zoneId, setZoneId] = useState<DangerousZoneId>("shattered_reef");
  const [depthId, setDepthId] = useState<DangerousDepthId>("surface");
  const [baitId, setBaitId] = useState<DangerousBaitId>("basic_bait");
  const [preparedEncounter, setPreparedEncounter] = useState<{
    voyageId: string;
    baitId: DangerousBaitId;
  } | null>(null);
  const pendingEncounterScrollRef = useRef<"voyage" | "boss" | null>(null);
  const voyageEncounterRef = useRef<HTMLDivElement>(null);
  const bossEncounterRef = useRef<HTMLDivElement>(null);
  const encounter = model?.state.voyage?.encounter ?? null;
  const realtimeEncounter =
    encounter?.simulationVersion === 2 ? encounter : null;
  const legacyEncounter =
    encounter && encounter.simulationVersion !== 2 ? encounter : null;
  const realtimeEncounterId = realtimeEncounter?.id ?? null;
  const realtimeBossEncounterId = boss?.realtimeAttempt?.encounter.id ?? null;
  const interactionBlocked = busy !== null || verification !== null;
  const encounterPrepared = Boolean(
    !encounter &&
    preparedEncounter &&
    preparedEncounter.voyageId === model?.state.voyage?.id &&
    preparedEncounter.baitId === baitId,
  );
  const activeFeedback = feedback?.scope === activeTab ? feedback : null;
  const showPurpose =
    model?.heritage.unlocked === true &&
    !encounter &&
    !(activeTab === "boss" && (boss?.attempt || boss?.realtimeAttempt));
  const showLegacyGuide =
    !realtimeEncounter &&
    !(activeTab === "boss" && boss?.realtimeAttempt);

  useEffect(() => {
    if (!legacyEncounter || activeTab !== "voyage") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || interactionBlocked) return;
      const action = dangerousFishingShortcut(event.key, isTextEntryTarget(event.target));
      if (!action) return;
      event.preventDefault();
      void onAction(action, legacyEncounter.id, legacyEncounter.revision);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, interactionBlocked, legacyEncounter, onAction]);

  useEffect(() => {
    const pendingScope = pendingEncounterScrollRef.current;
    const target =
      pendingScope === "voyage" && realtimeEncounterId
        ? voyageEncounterRef.current
        : pendingScope === "boss" && realtimeBossEncounterId
          ? bossEncounterRef.current
          : null;
    if (!target) return;
    pendingEncounterScrollRef.current = null;
    target.scrollIntoView({ block: "start" });
  }, [realtimeBossEncounterId, realtimeEncounterId]);

  const prepareEncounter = () => {
    const voyageId = model?.state.voyage?.id;
    if (!voyageId) return;
    setPreparedEncounter({ voyageId, baitId });
  };
  const changeBait = (nextBaitId: DangerousBaitId) => {
    setBaitId(nextBaitId);
    setPreparedEncounter(null);
  };
  const startPreparedEncounter = async () => {
    pendingEncounterScrollRef.current = "voyage";
    const started = await onStartEncounter(baitId);
    if (started) {
      setPreparedEncounter(null);
    } else {
      pendingEncounterScrollRef.current = null;
    }
  };
  const startPreparedBossAttempt = async (eventId: string) => {
    pendingEncounterScrollRef.current = "boss";
    const started = await onStartBossAttempt(eventId);
    if (!started) pendingEncounterScrollRef.current = null;
    return started;
  };

  return (
    <main className={`${SURFACE_CARD} mx-auto my-2 w-[calc(100%-1rem)] max-w-[780px] space-y-4 rounded-2xl p-4 text-zinc-900 shadow-lg dark:text-zinc-100 sm:my-4 sm:w-[calc(100%-2rem)] sm:p-6`}>
      <SubViewHeader title="위험 해역 낚시" onBack={onBack} />
      <FishingSubTabs
        active="dangerous"
        onOpenFishing={onOpenFishing}
        onOpenChallenges={onOpenChallenges}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenHallOfFame={onOpenHallOfFame}
        onOpenShop={onOpenShop}
      />
      {verification && verifyHuman ? (
        <ActivityVerificationGate
          challenge={verification}
          onVerify={verifyHuman}
        />
      ) : null}
      <TabBar
        tabs={[
          { key: "voyage", label: "출항", badge: model?.state.voyage ? "!" : undefined },
          {
            key: "boss",
            label: "거대어",
            badge:
              boss?.event?.status === "active" || (boss?.eligible && !boss.claimed)
                ? "!"
                : undefined,
          },
        ]}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel="위험 해역 콘텐츠"
        size="md"
      />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        기존 낚시와 별개의 선택형 콘텐츠입니다. 정해진 20분 세션이나 일일 숙제 없이 한 번의 어획 후에도 귀환할 수 있습니다.
      </p>
      {showPurpose ? (
        <section className={`${SURFACE_INSET} space-y-3 p-4`} aria-label="위험 해역 목표와 보상">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold">위험 해역에서 얻는 것</h2>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                더 위험한 해역에서 어획하고, 돌아와 성장과 교환 보상으로 확정합니다.
              </p>
            </div>
            {onOpenShop ? (
              <Button size="xs" variant="secondary" onClick={onOpenShop}>
                위험 해역 교환 보기
              </Button>
            ) : null}
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <div className={`${SURFACE_CARD} p-3`}>
              <strong>1. 어획 성공</strong>
              <p className="mt-1 leading-5 text-zinc-600 dark:text-zinc-300">
                경험치·코인·도감을 즉시 획득
              </p>
            </div>
            <div className={`${SURFACE_CARD} p-3`}>
              <strong>2. 안전 귀환</strong>
              <p className="mt-1 leading-5 text-zinc-600 dark:text-zinc-300">
                화물을 상점 교환·거래소 재료로 확정
              </p>
            </div>
            <div className={`${SURFACE_CARD} p-3`}>
              <strong>3. 거대어 제압</strong>
              <p className="mt-1 leading-5 text-zinc-600 dark:text-zinc-300">
                공용 제압에 기여하고 코인·거대어 증표 획득
              </p>
            </div>
          </div>
        </section>
      ) : null}
      {showLegacyGuide ? (
      <details className={`${SURFACE_INSET} group p-4 text-sm`}>
        <summary className="cursor-pointer font-bold">처음 이용하시나요?</summary>
        <div className="mt-3 space-y-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          <ol className="list-decimal space-y-1 pl-5">
            <li>해역과 수심을 고른 뒤 출항하고 미끼를 선택해 낚싯줄을 던집니다.</li>
            <li>물고기의 현재 행동에 맞는 조작을 누릅니다.</li>
            <li>어체력과 거리를 모두 0으로 만들면 어획에 성공합니다.</li>
            <li>잡은 재료는 귀환 전 화물입니다. 안전 귀환해야 거래 가능한 재료로 확정됩니다.</li>
          </ol>
          <div className="grid gap-1 sm:grid-cols-3">
            <span className={`${SURFACE_CARD} px-2 py-1.5`}>돌진 → 줄 풀기(S)</span>
            <span className={`${SURFACE_CARD} px-2 py-1.5`}>몸부림·잠수 → 버티기(D)</span>
            <span className={`${SURFACE_CARD} px-2 py-1.5`}>급선회 → 감아올리기(A)</span>
          </div>
          <p>
            장력이 최대치를 넘으면 줄이 끊어지고, 너무 낮은 상태가 계속되면 바늘이 빠집니다.
            위험도 3부터 다음 투척 때 사고로 화물 일부를 잃을 수 있으므로 처음에는 한 마리마다 귀환하는 편이 안전합니다.
          </p>
        </div>
      </details>
      ) : null}

      {error && error !== "human_verification_required" ? (
        <div role="alert" className={`${SURFACE_INSET} border-rose-300 p-3 text-sm text-rose-700 dark:border-rose-800 dark:text-rose-300`}>
          {dangerousFishingErrorMessage(error)}
        </div>
      ) : null}
      {activeFeedback && !encounter && activeTab === "voyage" ? (
        <DangerousFishingFeedbackCard feedback={activeFeedback} />
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
      ) : activeTab === "boss" ? (
        <div ref={bossEncounterRef} className="scroll-mt-24">
          <DangerousFishingBossPanel
            model={boss}
            busy={interactionBlocked}
            feedback={activeFeedback}
            startBlockedReason={
              model.state.voyage
                ? "진행 중인 항해를 마치고 귀환한 뒤 개인 시도를 시작할 수 있습니다."
                : null
            }
            onStart={startPreparedBossAttempt}
            onAction={onBossAction}
            onClaim={onClaimBossReward}
            onOpenShop={onOpenShop}
            readJson={readJson}
            verification={verification}
            onRealtimeFinish={(response) => onRealtimeFinish("boss", response)}
          />
        </div>
      ) : (
        <>
          {!model.state.voyage ? (
            <DangerousFishingPreparationPanel
              model={model}
              zoneId={zoneId}
              depthId={depthId}
              baitId={baitId}
              busy={interactionBlocked}
              encounterPrepared={encounterPrepared}
              onZoneChange={setZoneId}
              onDepthChange={setDepthId}
              onBaitChange={changeBait}
              onStartVoyage={() => void onStartVoyage(zoneId, depthId)}
              onPrepareEncounter={prepareEncounter}
              onStartEncounter={() => void startPreparedEncounter()}
              onCancelEncounter={() => setPreparedEncounter(null)}
              onOpenShop={onOpenShop}
            />
          ) : (
            <>
              {!encounter ? (
                <div className="relative aspect-[16/7] overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
                  <Image
                    src={model.catalogs.zones[model.state.voyage.zoneId].imageSrc}
                    alt={`${model.catalogs.zones[model.state.voyage.zoneId].name} 항해 장면`}
                    fill
                    sizes="(min-width: 780px) 720px, 100vw"
                    className="object-cover"
                    loading="eager"
                  />
                </div>
              ) : null}
              <section className={`${SURFACE_INSET} flex flex-wrap items-center justify-between gap-2 p-3 text-sm`}>
                <span className="font-bold">{model.catalogs.zones[model.state.voyage.zoneId].name} · {model.catalogs.depths[model.state.voyage.depthId].name}</span>
                <span>위험도 {model.riskPreview.risk} · 사고 확률 {Math.round(model.riskPreview.accidentChance * 100)}% · 최대 손실 {Math.round(model.riskPreview.maxLossFraction * 100)}%</span>
              </section>
              {realtimeEncounter ? (
                <div ref={voyageEncounterRef} className="scroll-mt-24">
                  <DangerousFishingRealtimePanel
                    encounter={realtimeEncounter}
                    serverNow={model.now}
                    scene={{
                      encounterImageSrc:
                        model.catalogs.zones[model.state.voyage.zoneId]
                          .encounterImageSrc,
                      depth: model.state.voyage.depthId,
                      risk: realtimeEncounter.config.risk,
                      description: `${model.catalogs.zones[model.state.voyage.zoneId].name} · ${model.catalogs.depths[model.state.voyage.depthId].name}`,
                    }}
                    targetMetadata={{
                      imageSrc:
                        model.catalogs.fish[realtimeEncounter.targetId].imageSrc,
                      name: model.catalogs.fish[realtimeEncounter.targetId].name,
                    }}
                    endpointTarget={{
                      kind: "voyage",
                      endpoint: "/api/v2/dangerous-fishing/encounter",
                    }}
                    readJson={readJson}
                    verification={verification}
                    onFinish={(response) =>
                      onRealtimeFinish("voyage", response)
                    }
                    feedback={activeFeedback}
                  />
                </div>
              ) : legacyEncounter ? (
                <DangerousFishingEncounterPanel
                  encounter={legacyEncounter}
                  sceneImageSrc={model.catalogs.zones[model.state.voyage.zoneId].imageSrc}
                  targetImageSrc={model.catalogs.fish[legacyEncounter.targetId].imageSrc}
                  targetName={model.catalogs.fish[legacyEncounter.targetId].name}
                  busy={interactionBlocked}
                  feedback={activeFeedback}
                  onAction={(action) => void onAction(action, legacyEncounter.id, legacyEncounter.revision)}
                />
              ) : (
                <DangerousFishingPreparationPanel
                  model={model}
                  zoneId={zoneId}
                  depthId={depthId}
                  baitId={baitId}
                  busy={interactionBlocked}
                  encounterPrepared={encounterPrepared}
                  onZoneChange={setZoneId}
                  onDepthChange={setDepthId}
                  onBaitChange={changeBait}
                  onStartVoyage={() => void onStartVoyage(zoneId, depthId)}
                  onPrepareEncounter={prepareEncounter}
                  onStartEncounter={() => void startPreparedEncounter()}
                  onCancelEncounter={() => setPreparedEncounter(null)}
                  onOpenShop={onOpenShop}
                />
              )}
              <DangerousFishingCargoPanel
                model={model}
                busy={interactionBlocked}
                onReturn={() => void onReturnVoyage()}
                onOpenShop={onOpenShop}
              />
            </>
          )}
        </>
      )}
    </main>
  );
}
