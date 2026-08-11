"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise, CloudLightning, Flag, ShieldChevron } from "@phosphor-icons/react";
import type { Gender } from "@/adventure/profile/avatars";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  STORM_EXPEDITION_ALTAR_CHOICES,
  type StormExpeditionBoonId,
  type StormExpeditionChoice,
  type StormExpeditionChoiceKind,
  type StormExpeditionEncounterKind,
  type StormExpeditionNode,
  type StormExpeditionRiskCurseId,
  type StormExpeditionRiskEventId,
  type StormExpeditionRiskEventOffer,
  type StormExpeditionRouteId,
} from "@/adventure/data/v2/stormExpedition";
import {
  STORM_EXPEDITION_EQUIPMENT_IDS,
  STORM_EXPEDITION_ROUTE_MATERIAL_ID,
  type StormExpeditionLootRule,
} from "@/adventure/data/v2/stormExpeditionRewards";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { V2_EQUIPMENT, v2EquipCatalogTierLabel, type V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

type ActiveExpedition = {
  version: 2;
  routeId: StormExpeditionRouteId;
  nodeIndex: number;
  encounterIndex: number;
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  defeatedCount: number;
  pendingGold: number;
  pendingMaterials: Record<string, number>;
  pendingEquipment: V2EquipInstance[];
  boons: StormExpeditionBoonId[];
  nextBattleEffects: string[];
  altarOffers: StormExpeditionBoonId[];
  chosenChoices: Partial<Record<StormExpeditionChoiceKind, string>>;
  riskEvent: StormExpeditionRiskEventOffer | null;
};

type ExpeditionStatus = {
  ok?: boolean;
  error?: string;
  unlocked?: boolean;
  unlockDepth?: number;
  frontierDepth?: number;
  attemptsLeft?: number;
  nodeCount?: number;
  gold?: number;
  state?: {
    clears: number;
    active: ActiveExpedition | null;
    spFruitPity: number;
    spFruitObtained: number;
  };
  routes?: Array<{
    id: StormExpeditionRouteId;
    name: string;
    tagline: string;
    threat: string;
    statTheme: string;
    accent: "sky" | "violet" | "amber";
  }>;
  nodes?: StormExpeditionNode[];
  choices?: Record<StormExpeditionChoiceKind, StormExpeditionChoice[]>;
  riskEvents?: Record<StormExpeditionRiskEventId, StormExpeditionChoice & { nodeIndex: 1 | 3 | 5; cost: string }>;
  riskCurses?: Record<StormExpeditionRiskCurseId, StormExpeditionChoice>;
  lootRules?: Record<StormExpeditionEncounterKind, StormExpeditionLootRule>;
  spFruitReward?: {
    materialId: string;
    chance: number;
    pityClears: number;
    cap: number;
  };
  success?: boolean;
  bossClear?: boolean;
  failed?: boolean;
  withdrew?: boolean;
  choiceApplied?: boolean;
  choiceId?: string;
  riskEventResolved?: boolean;
  riskEventAccepted?: boolean;
  riskEventId?: StormExpeditionRiskEventId;
  gainedGold?: number;
  enemyName?: string;
  gainedMaterials?: Record<string, number>;
  gainedEquipment?: V2EquipInstance[];
  droppedMaterials?: Record<string, number>;
  droppedEquipment?: V2EquipInstance | null;
  claimedRewards?: boolean;
  spFruitDropped?: boolean;
  nodeIndex?: number;
  encounterIndex?: number;
  encounterKind?: StormExpeditionEncounterKind;
  routeId?: StormExpeditionRouteId;
  replay?: ReplayPayload;
  startPlayerHp?: number;
  playerName?: string;
  gender?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  locked: "심해 폐허 최심부를 돌파하면 원정이 열립니다.",
  no_attempts: "오늘의 원정 입장 횟수를 모두 사용했습니다.",
  already_active: "이미 진행 중인 원정이 있습니다.",
  no_active: "진행 중인 원정이 없습니다.",
  nothing_to_claim: "적을 한 번 처치한 뒤부터 귀환할 수 있습니다.",
  choice_required: "먼저 현재 구간의 선택을 완료해 주세요.",
  battle_required: "현재 구간은 전투로 돌파해야 합니다.",
  invalid_choice: "선택할 수 없는 원정 효과입니다.",
  stale_state: "원정 상태가 이미 갱신되었습니다. 현재 지도를 다시 확인해 주세요.",
  invalid_decision: "위험 이벤트 선택을 확인해 주세요.",
  risk_event_unavailable: "이 위험 이벤트는 이미 처리했거나 현재 위치에서 선택할 수 없습니다.",
  risk_event_required: "현재 위험 이벤트를 수락하거나 지나친 뒤 정비를 선택해 주세요.",
  risk_debt_pending: "균열 상자의 대가인 강화 전투를 치른 뒤 귀환할 수 있습니다.",
};

export function V2StormExpeditionView() {
  const router = useRouter();
  const { refreshGameState } = useGameState();
  const [status, setStatus] = useState<ExpeditionStatus | null>(null);
  const [result, setResult] = useState<ExpeditionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [skipReplay, setSkipReplay] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/v2/storm-expedition");
      const json = await response.json().catch(() => null) as ExpeditionStatus | null;
      if (!json?.ok) throw new Error(json?.error ?? `http ${response.status}`);
      setStatus(json);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const act = useCallback(async (
    action: "start" | "fight" | "choose" | "risk_event" | "withdraw",
    payload?: {
      routeId?: StormExpeditionRouteId;
      choiceId?: string;
      expectedNodeIndex?: number;
      expectedEncounterIndex?: number;
      decision?: "accept" | "decline";
    },
  ) => {
    setBusy(true);
    try {
      const response = await fetch("/api/v2/storm-expedition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await response.json().catch(() => null) as ExpeditionStatus | null;
      if (!json) {
        setResult({ ok: false, error: `http ${response.status}` });
        return;
      }
      setStatus(json);
      setResult(action === "start" ? null : skipReplay ? { ...json, replay: undefined } : json);
      if (json.claimedRewards) await refreshGameState();
    } catch {
      setResult({ ok: false, error: "network" });
    } finally {
      setBusy(false);
    }
  }, [refreshGameState, skipReplay]);

  const active = status?.state?.active ?? null;
  const currentNode = active ? status?.nodes?.[active.nodeIndex] ?? null : null;
  const activeRoute = status?.routes?.find((route) => route.id === (active?.routeId ?? result?.routeId)) ?? null;
  const replay = useMemo(() => result?.replay ? {
    payload: result.replay,
    outcome: result.success ? "win" as const : "lose" as const,
    playerName: result.playerName ?? "모험가",
    gender: (result.gender ?? "male1") as Gender,
  } : null, [result]);

  return (
    <main className="mx-auto max-w-[900px] space-y-4 p-4 text-zinc-900 sm:p-6 dark:text-zinc-100">
      <SubViewHeader
        title={<><CloudLightning size={21} weight="duotone" className="text-sky-500" />폭풍 원정</>}
        onBack={() => router.push("/battle")}
      />

      {loadError && <LoadErrorBanner onRetry={refresh} />}
      {loading && !status && <Card padding="md" className="text-center text-sm text-zinc-500">원정 정보를 불러오는 중...</Card>}

      {status && (
        <Card padding="md" className="space-y-3 overflow-hidden border-sky-200 dark:border-sky-900/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400">Route expedition</p>
              <h1 className="mt-1 text-xl font-bold">세 갈래 길, 아홉 개의 체크포인트</h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">일곱 번의 전투 사이에서 회복과 축복을 선택합니다. 적을 처치한 뒤에는 언제든 전리품을 들고 귀환할 수 있습니다.</p>
            </div>
            <button type="button" onClick={() => void refresh()} className="rounded-md border border-sky-200 p-2 text-sky-600 dark:border-sky-800" aria-label="새로고침"><ArrowClockwise size={16} /></button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <Metric label="오늘 입장" value={`${status.attemptsLeft ?? 0}회`} />
            <Metric label="완주" value={`${status.state?.clears ?? 0}회`} />
            <Metric label="보유 골드" value={`${(status.gold ?? 0).toLocaleString("ko-KR")} G`} />
          </div>
          {status.spFruitReward && (
            <SpFruitProgress
              reward={status.spFruitReward}
              pity={status.state?.spFruitPity ?? 0}
              obtained={status.state?.spFruitObtained ?? 0}
            />
          )}
        </Card>
      )}

      {status && !status.unlocked && (
        <StatusBanner tone="warning">심해 폐허 최심부 돌파 후 개방 · 현재 진행 {Math.floor((status.frontierDepth ?? 2) / 2)}/{Math.floor((status.unlockDepth ?? 72) / 2)}단계</StatusBanner>
      )}
      {result?.error && <StatusBanner tone="error">{ERROR_MESSAGES[result.error] ?? "원정을 진행하지 못했습니다. 잠시 후 다시 시도해 주세요."}</StatusBanner>}
      {result?.bossClear && <StatusBanner tone="success">폭풍의 심장을 쓰러뜨렸습니다. 모든 임시 전리품을 확보했습니다.</StatusBanner>}
      {result?.spFruitDropped && <StatusBanner tone="success">원정 완주 보상으로 SP 열매 V를 획득했습니다. SP 열매 천장 횟수가 초기화됩니다.</StatusBanner>}
      {result?.withdrew && <StatusBanner tone="success">안전하게 귀환해 임시 전리품을 모두 확보했습니다.</StatusBanner>}
      {result?.failed && <StatusBanner tone="error">전투에서 패배해 이번 원정의 임시 전리품을 모두 잃었습니다.</StatusBanner>}
      {result?.choiceApplied && <StatusBanner tone="info">선택한 정비 효과를 적용했습니다.</StatusBanner>}
      {result?.riskEventResolved && <StatusBanner tone={result.riskEventAccepted ? "warning" : "info"}>{result.riskEventAccepted ? "위험 계약을 수락했습니다. 이익과 대가가 즉시 적용됩니다." : "위험 이벤트를 지나쳤습니다."}</StatusBanner>}

      {status?.unlocked && !active && !replay && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1"><Flag size={18} className="text-sky-500" /><h2 className="font-semibold">첫 입구 · 항로 선택</h2></div>
          <div className="grid gap-3 md:grid-cols-3">
            {status.routes?.map((route) => (
              <button
                type="button"
                key={route.id}
                disabled={busy || (status.attemptsLeft ?? 0) <= 0}
                onClick={() => void act("start", { routeId: route.id })}
                className={`${SURFACE_CARD} min-h-48 p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:hover:border-sky-800`}
              >
                <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">{route.statTheme}</span>
                <h3 className="mt-1 text-base font-bold">{route.name}</h3>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{route.tagline}</p>
                <p className="mt-3 text-xs font-medium text-rose-700 dark:text-rose-300">위협 · {route.threat}</p>
                <div className={`${SURFACE_INSET} mt-3 space-y-1 p-2.5 text-xs`}>
                  <p className="font-semibold">{V2_MATERIALS[STORM_EXPEDITION_ROUTE_MATERIAL_ID[route.id]]?.name}</p>
                  <p className="text-zinc-500 dark:text-zinc-400">{v2EquipCatalogTierLabel(16)} 장비 {STORM_EXPEDITION_EQUIPMENT_IDS[route.id].length}종</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {active && !replay && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <Card padding="md" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs text-zinc-500">진행 중인 항로</p><h2 className="text-lg font-bold">{activeRoute?.name ?? "폭풍 항로"}</h2></div>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">{active.nodeIndex + 1}/{status?.nodeCount ?? 9}</span>
            </div>
            <ExpeditionMap nodes={status?.nodes ?? []} active={active} />
          </Card>

          <div className="space-y-4">
            <Card padding="md" className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-sky-600 dark:text-sky-400">현재 체크포인트</p>
                <h2 className="mt-0.5 text-lg font-bold">{currentNode?.name ?? "폭풍 항로"}</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{currentNode?.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <Metric label="HP" value={`${active.hp.toLocaleString("ko-KR")} / ${active.maxHp.toLocaleString("ko-KR")}`} />
                <Metric label="MP" value={`${active.mp.toLocaleString("ko-KR")} / ${active.maxMp.toLocaleString("ko-KR")}`} />
              </div>
              {active.boons.length > 0 && <BoonList boons={active.boons} />}
              {active.riskEvent?.status === "accepted" && (
                <AcceptedRisk
                  offer={active.riskEvent}
                  definition={status?.riskEvents?.[active.riskEvent.id]}
                  curse={active.riskEvent.curseId ? status?.riskCurses?.[active.riskEvent.curseId] : undefined}
                />
              )}
              {currentNode?.kind === "battle" && currentNode.encounterKind && (
                <BattleControls
                  busy={busy}
                  node={currentNode}
                  encounterIndex={active.encounterIndex}
                  lootRule={status?.lootRules?.[currentNode.encounterKind]}
                  equipmentChanceMultiplier={active.riskEvent?.status === "accepted" && active.riskEvent.id === "storm_contract" ? 2 : 1}
                  goldMultiplier={active.riskEvent?.status === "accepted" && active.riskEvent.id === "golden_compass" ? 1.35 : 1}
                  skipReplay={skipReplay}
                  onSkipReplay={setSkipReplay}
                  onFight={() => void act("fight", {
                    expectedNodeIndex: active.nodeIndex,
                    expectedEncounterIndex: active.encounterIndex,
                  })}
                />
              )}
              {currentNode && currentNode.kind !== "battle" && active.riskEvent?.status === "offered" && active.riskEvent.nodeIndex === active.nodeIndex && (
                <RiskEventControls
                  busy={busy}
                  offer={active.riskEvent}
                  definition={status?.riskEvents?.[active.riskEvent.id]}
                  boon={active.riskEvent.boonId ? status?.choices?.altar.find((choice) => choice.id === active.riskEvent?.boonId) : undefined}
                  curse={active.riskEvent.curseId ? status?.riskCurses?.[active.riskEvent.curseId] : undefined}
                  onDecision={(decision) => void act("risk_event", {
                    decision,
                    expectedNodeIndex: active.nodeIndex,
                    expectedEncounterIndex: active.encounterIndex,
                  })}
                />
              )}
              {currentNode && currentNode.kind !== "battle" && !(active.riskEvent?.status === "offered" && active.riskEvent.nodeIndex === active.nodeIndex) && (
                <ChoiceControls
                  busy={busy}
                  kind={currentNode.kind}
                  choices={(status?.choices?.[currentNode.kind] ?? []).filter((choice) => currentNode.kind !== "altar" || (active.altarOffers.includes(choice.id as StormExpeditionBoonId) && !active.boons.includes(choice.id as StormExpeditionBoonId)))}
                  onChoose={(choiceId) => void act("choose", {
                    choiceId,
                    expectedNodeIndex: active.nodeIndex,
                    expectedEncounterIndex: active.encounterIndex,
                  })}
                />
              )}
            </Card>

            <Card padding="md" className="space-y-3 border-amber-200 dark:border-amber-900/70">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">임시 전리품 가방</p><span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">패배 시 전부 소실</span></div>
              <LootRows gold={active.pendingGold} materials={active.pendingMaterials} equipment={active.pendingEquipment} />
              <button type="button" disabled={busy || active.defeatedCount <= 0 || active.nextBattleEffects.includes("risk_enemy_fury")} onClick={() => void act("withdraw", {
                expectedNodeIndex: active.nodeIndex,
                expectedEncounterIndex: active.encounterIndex,
              })} className="h-10 w-full rounded-md border border-amber-300 text-sm font-semibold text-amber-800 disabled:opacity-40 dark:border-amber-800 dark:text-amber-200">{active.nextBattleEffects.includes("risk_enemy_fury") ? "강화된 다음 전투 후 귀환 가능" : "지금 전리품을 확보하고 귀환"}</button>
              <p className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><ShieldChevron size={14} /> 적 {active.defeatedCount}/7 처치 · 전투 체크포인트마다 귀환 가능</p>
            </Card>
          </div>
        </div>
      )}

      {replay && (
        <ReplayBattleScene
          payload={replay.payload}
          startPlayerHp={result?.startPlayerHp}
          playerName={replay.playerName}
          gender={replay.gender}
          exp={0}
          maxExp={1}
          playerSubtitle={`${activeRoute?.name ?? "원정"} · ${status?.nodes?.[result?.nodeIndex ?? 0]?.name ?? "전투"}`}
          outcome={replay.outcome}
          outcomeAction={{
            label: active ? "원정 지도 확인" : "원정대로 돌아가기",
            busyLabel: "이동 중...",
            busy: false,
            onClick: () => setResult((current) => current ? { ...current, replay: undefined } : null),
          }}
        />
      )}

      {!replay && (result?.success || result?.claimedRewards) && (
        <Card padding="md" className="space-y-3 border-emerald-200 dark:border-emerald-900">
          <div><p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{result.claimedRewards ? "확정 획득" : "이번 전투 전리품"}</p><h2 className="mt-0.5 font-bold">{result.enemyName ?? "원정 전투"} 처치 보상</h2></div>
          <LootRows
            gold={result.claimedRewards ? result.gainedGold : undefined}
            materials={result.claimedRewards ? result.gainedMaterials : result.droppedMaterials}
            equipment={result.claimedRewards ? result.gainedEquipment : result.droppedEquipment ? [result.droppedEquipment] : []}
          />
          {!result.claimedRewards && active && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">임시 가방에 담겼습니다. 다음 전투 전에 귀환하면 안전하게 확보할 수 있습니다.</p>}
        </Card>
      )}
    </main>
  );
}

function ExpeditionMap({ nodes, active }: { nodes: StormExpeditionNode[]; active: ActiveExpedition }) {
  return (
    <ol className="space-y-0">
      {nodes.map((node, index) => {
        const completed = index < active.nodeIndex;
        const current = index === active.nodeIndex;
        return (
          <li key={node.id} className="relative flex gap-3 pb-3 last:pb-0">
            {index < nodes.length - 1 && <span className={`absolute left-[13px] top-7 h-[calc(100%-1rem)] w-px ${completed ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-700"}`} />}
            <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${completed ? "border-emerald-500 bg-emerald-500 text-white" : current ? "border-sky-500 bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" : "border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-500"}`}>{completed ? "✓" : index + 1}</span>
            <div className={`min-w-0 pt-0.5 ${current ? "text-zinc-950 dark:text-white" : completed ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-400 dark:text-zinc-500"}`}>
              <p className="text-sm font-semibold">{node.name}{current && (node.encounterCount ?? 1) > 1 ? ` · ${active.encounterIndex + 1}/${node.encounterCount}전` : ""}</p>
              <p className="text-xs">{node.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function BattleControls({ busy, node, encounterIndex, lootRule, equipmentChanceMultiplier, goldMultiplier, skipReplay, onSkipReplay, onFight }: {
  busy: boolean;
  node: StormExpeditionNode;
  encounterIndex: number;
  lootRule?: StormExpeditionLootRule;
  equipmentChanceMultiplier: number;
  goldMultiplier: number;
  skipReplay: boolean;
  onSkipReplay: (value: boolean) => void;
  onFight: () => void;
}) {
  const finalBoss = node.encounterKind === "final_boss";
  return (
    <div className="space-y-3">
      {lootRule && (
        <div className={`${SURFACE_INSET} space-y-1 p-3 text-xs`}>
          <p className="font-semibold">이번 전투 드롭</p>
          <p className="text-zinc-600 dark:text-zinc-300">항로 재료 {lootRule.routeMaterialChance >= 1 ? `${lootRule.routeMaterialMin}~${lootRule.routeMaterialMax}개 확정` : formatChance(lootRule.routeMaterialChance)} · 6티어 장비 {formatChance(Math.min(1, lootRule.equipmentChance * equipmentChanceMultiplier))}</p>
          {(lootRule.originFragmentGuaranteed > 0 || lootRule.originFragmentChance > 0) && <p className="text-violet-700 dark:text-violet-300">7차 재료 {lootRule.originFragmentGuaranteed > 0 ? `${lootRule.originFragmentGuaranteed}개 이상 확정` : formatChance(lootRule.originFragmentChance)}</p>}
          {goldMultiplier > 1 && <p className="font-semibold text-amber-700 dark:text-amber-300">황금 나침반 · 이번 골드 +{Math.round((goldMultiplier - 1) * 100)}%</p>}
        </div>
      )}
      <label className="flex items-center justify-end gap-2 text-xs text-zinc-500">
        <input type="checkbox" checked={skipReplay} onChange={(event) => onSkipReplay(event.target.checked)} className="accent-sky-600" />전투 결과 바로 보기
      </label>
      <button type="button" disabled={busy} onClick={onFight} className="h-11 w-full rounded-md bg-sky-600 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">{busy ? "전투 중..." : finalBoss ? "폭풍의 심장 도전" : (node.encounterCount ?? 1) > 1 ? `${encounterIndex + 1}전 시작` : "전투 시작"}</button>
    </div>
  );
}

function ChoiceControls({ busy, kind, choices, onChoose }: { busy: boolean; kind: StormExpeditionChoiceKind; choices: StormExpeditionChoice[]; onChoose: (choiceId: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-zinc-500">{kind === "altar" ? "제시된 축복 3개 중 하나를 선택하세요." : "한 가지를 선택하면 다음 구간으로 이동합니다."}</p>
      {choices.map((choice) => (
        <button key={choice.id} type="button" disabled={busy} onClick={() => onChoose(choice.id)} className={`${SURFACE_INSET} w-full p-3 text-left transition hover:border-sky-300 disabled:opacity-50 dark:hover:border-sky-800`}>
          <span className="text-sm font-semibold">{choice.name}</span>
          <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{choice.description}</span>
        </button>
      ))}
    </div>
  );
}

function RiskEventControls({ busy, offer, definition, boon, curse, onDecision }: {
  busy: boolean;
  offer: StormExpeditionRiskEventOffer;
  definition?: StormExpeditionChoice & { cost: string };
  boon?: StormExpeditionChoice;
  curse?: StormExpeditionChoice;
  onDecision: (decision: "accept" | "decline") => void;
}) {
  return (
    <div className={`${SURFACE_INSET} space-y-3 border-rose-300 p-3 dark:border-rose-900`}>
      <div>
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">선택형 위험 이벤트</p>
        <h3 className="mt-0.5 font-bold">{definition?.name ?? offer.id}</h3>
      </div>
      <div className="space-y-1.5 text-xs">
        <p className="text-emerald-700 dark:text-emerald-300">이익 · {definition?.description}{boon ? ` (${boon.name}: ${boon.description})` : ""}</p>
        <p className="text-rose-700 dark:text-rose-300">대가 · {curse ? `${curse.name}: ${curse.description}` : definition?.cost}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => onDecision("decline")} className="h-10 rounded-md border border-zinc-300 text-sm font-semibold disabled:opacity-50 dark:border-zinc-700">지나치기</button>
        <button type="button" disabled={busy} onClick={() => onDecision("accept")} className="h-10 rounded-md bg-rose-600 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">위험 감수</button>
      </div>
    </div>
  );
}

function AcceptedRisk({ offer, definition, curse }: {
  offer: StormExpeditionRiskEventOffer;
  definition?: StormExpeditionChoice & { cost: string };
  curse?: StormExpeditionChoice;
}) {
  return (
    <div className={`${SURFACE_INSET} space-y-1 p-3 text-xs`}>
      <p className="font-semibold text-rose-700 dark:text-rose-300">적용 중인 위험 · {definition?.name ?? offer.id}</p>
      <p className="text-zinc-600 dark:text-zinc-300">{definition?.description}</p>
      <p className="text-rose-700 dark:text-rose-300">{curse ? `${curse.name}: ${curse.description}` : definition?.cost}</p>
    </div>
  );
}

function BoonList({ boons }: { boons: StormExpeditionBoonId[] }) {
  return (
    <div className={`${SURFACE_INSET} p-3`}>
      <p className="text-xs font-semibold">보유한 제단 축복</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {boons.map((boon) => <span key={boon} className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">{STORM_EXPEDITION_ALTAR_CHOICES.find((choice) => choice.id === boon)?.name ?? boon}</span>)}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className={`${SURFACE_INSET} px-2 py-2.5`}><p className="text-[11px] text-zinc-500">{label}</p><p className="mt-0.5 font-semibold tabular-nums">{value}</p></div>;
}

function SpFruitProgress({ reward, pity, obtained }: {
  reward: NonNullable<ExpeditionStatus["spFruitReward"]>;
  pity: number;
  obtained: number;
}) {
  const completed = obtained >= reward.cap;
  const fruitName = V2_MATERIALS[reward.materialId]?.name ?? "SP 열매 V";
  return (
    <div className={`${SURFACE_INSET} flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 text-xs`}>
      <div>
        <p className="font-semibold text-violet-700 dark:text-violet-300">완주 보상 · {fruitName}</p>
        <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">
          {completed
            ? "원정에서 획득할 수 있는 최대 수량을 모두 얻었습니다."
            : `최종 보스 처치 시 ${formatChance(reward.chance)} · ${reward.pityClears}회 연속 미획득 시 확정`}
        </p>
      </div>
      <div className="text-right font-semibold tabular-nums">
        <p>획득 {obtained}/{reward.cap}개</p>
        {!completed && <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">천장 {pity}/{reward.pityClears}회</p>}
      </div>
    </div>
  );
}

function LootRows({ gold, materials, equipment = [] }: { gold?: number; materials?: Record<string, number>; equipment?: V2EquipInstance[] }) {
  const entries = Object.entries(materials ?? {}).filter(([, amount]) => amount > 0);
  if ((gold ?? 0) <= 0 && entries.length <= 0 && equipment.length <= 0) return <p className="text-sm text-zinc-500">아직 확보한 전리품이 없습니다.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {(gold ?? 0) > 0 && <li>골드 · {(gold ?? 0).toLocaleString("ko-KR")} G</li>}
      {entries.map(([id, amount]) => <li key={id}>{V2_MATERIALS[id]?.name ?? id} · {amount.toLocaleString("ko-KR")}개</li>)}
      {equipment.map((instance) => {
        const item = V2_EQUIPMENT[instance.id];
        return <li key={instance.iid} className="font-semibold text-violet-700 dark:text-violet-300">{item ? `${v2EquipCatalogTierLabel(item.tier)} ${item.name}` : instance.id}</li>;
      })}
    </ul>
  );
}

function formatChance(chance: number): string {
  const pct = chance * 100;
  if (pct >= 1) return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`;
  return `${pct.toFixed(2)}%`;
}
