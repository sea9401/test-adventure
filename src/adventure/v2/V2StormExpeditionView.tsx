"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudLightning, Question, ShieldChevron } from "@phosphor-icons/react";
import { huntStageName } from "@/adventure/data/v2/dungeon";
import type { Gender } from "@/adventure/profile/avatars";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  STORM_EXPEDITION_ALTAR_CHOICES,
  type StormExpeditionBoonId,
  type StormExpeditionChoice,
  type StormExpeditionChoiceKind,
  type StormExpeditionEncounterKind,
  type StormExpeditionMode,
  type StormExpeditionRiskCurseId,
  type StormExpeditionRiskEventId,
  type StormExpeditionRiskEventOffer,
  type StormExpeditionRouteId,
} from "@/adventure/data/v2/stormExpedition";
import type { StormExpeditionMapNode, StormExpeditionMapNodeId } from "@/adventure/data/v2/stormExpeditionMap";
import {
  type StormExpeditionLootRule,
  type StormExpeditionUniqueRule,
} from "@/adventure/data/v2/stormExpeditionRewards";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { V2_EQUIPMENT, v2EquipCatalogTierLabel, type V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useRefreshGameState } from "@/adventure/v2/GameStateRefreshContext";
import { Card } from "@/components/ui/Card";
import { confirmGameAction, type ConfirmGameAction } from "@/components/ui/gameDialog";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  stormExpeditionChooseRequest,
  stormExpeditionFightRequest,
  stormExpeditionMoveRequest,
  stormExpeditionNodeIntent,
  stormExpeditionRiskRequest,
  stormExpeditionStartRequest,
  stormExpeditionWithdrawRequest,
  type StormExpeditionActionRequest,
} from "./stormExpeditionViewModel";
import {
  StormExpeditionCommandMap,
  type StormExpeditionAutoplayDisplay,
} from "./StormExpeditionCommandMap";
import { StormExpeditionAutoPlanDialog } from "./StormExpeditionAutoPlanDialog";
import {
  StormExpeditionAutoplayResultDialog,
  type StormExpeditionAutoplayResultModel,
} from "./StormExpeditionAutoplayResultDialog";
import {
  StormExpeditionNodeDialog,
  type StormExpeditionNodeDialogAction,
  type StormExpeditionNodeDialogModel,
} from "./StormExpeditionNodeDialog";
import { runStormExpeditionAutoplay } from "./stormExpeditionAutoplay";
import { StormExpeditionGuideDialog } from "./StormExpeditionGuideDialog";
import {
  clearStormExpeditionAutoplayPlan,
  loadStormExpeditionAutoplayDefaults,
  loadStormExpeditionResumePlan,
  storeStormExpeditionAutoplayPlan,
  type StormExpeditionAutoplayPlan,
} from "./stormExpeditionAutoplayPolicy";

type ActiveExpedition = {
  version: 3;
  mode: StormExpeditionMode;
  routeId: StormExpeditionRouteId;
  currentNodeId: StormExpeditionMapNodeId;
  visitedNodeIds: StormExpeditionMapNodeId[];
  completedNodeIds: StormExpeditionMapNodeId[];
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
  retryAfterSec?: number;
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
  nodes?: StormExpeditionMapNode[];
  entranceNodeIds?: StormExpeditionMapNodeId[];
  availableNextNodeIds?: StormExpeditionMapNodeId[];
  choices?: Record<StormExpeditionChoiceKind, StormExpeditionChoice[]>;
  riskEvents?: Record<StormExpeditionRiskEventId, StormExpeditionChoice & { triggerCheckpoint: "supply" | "camp" | "altar"; cost: string }>;
  riskCurses?: Record<StormExpeditionRiskCurseId, StormExpeditionChoice>;
  lootRules?: Record<StormExpeditionEncounterKind, StormExpeditionLootRule>;
  uniqueLootRules?: StormExpeditionUniqueRule;
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
  practice?: boolean;
  practiceEnded?: boolean;
  practiceCompleted?: boolean;
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
  droppedUniqueEquipment?: V2EquipInstance[];
  claimedRewards?: boolean;
  spFruitDropped?: boolean;
  currentNodeId?: StormExpeditionMapNodeId;
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
  invalid_mode: "선택할 수 없는 원정 모드입니다.",
  invalid_node: "선택할 수 없는 원정 노드입니다.",
  node_not_reachable: "현재 위치에서 연결되지 않은 노드입니다.",
  node_not_completed: "현재 체크포인트를 완료한 뒤 이동할 수 있습니다.",
  node_already_visited: "이미 지나온 노드로는 돌아갈 수 없습니다.",
  node_already_completed: "현재 체크포인트는 이미 완료했습니다. 지도에서 다음 노드를 선택해 주세요.",
};

export function stormExpeditionUnlockStatusText(frontierDepth: number): string {
  return (
    "심해 폐허 · 최심부 돌파 후 개방 · 현재 " +
    huntStageName(Math.max(1, frontierDepth))
  );
}

export function stormExpeditionStatusAfterResponse(
  current: ExpeditionStatus | null,
  response: ExpeditionStatus,
): ExpeditionStatus | null {
  return response.state ? response : current;
}

export function stormExpeditionErrorMessage(
  result: Pick<ExpeditionStatus, "error" | "retryAfterSec">,
): string {
  if (result.error === "rate_limited") {
    const retryAfterSec = Math.max(
      1,
      Math.ceil(Number(result.retryAfterSec) || 1),
    );
    return `원정 요청이 많습니다. ${retryAfterSec}초 후 일괄 진행을 다시 시작해 주세요.`;
  }
  return result.error
    ? ERROR_MESSAGES[result.error]
      ?? "원정을 진행하지 못했습니다. 잠시 후 다시 시도해 주세요."
    : "";
}

export function stormExpeditionResultAfterResponse(
  action: StormExpeditionActionRequest["action"],
  response: ExpeditionStatus,
  suppressReplay: boolean,
): ExpeditionStatus | null {
  if (response.error) return response;
  if (action === "start") return null;
  return suppressReplay ? { ...response, replay: undefined } : response;
}

const DEFAULT_AUTOPLAY_PLAN: StormExpeditionAutoplayPlan = {
  version: 1,
  mode: "normal",
  outerRouteId: "gale",
  middleRouteId: "gale",
  guardianRouteId: "gale",
  boonStrategy: "offense",
};

export async function confirmStormExpeditionExit({
  mode,
  onExit,
  confirm = confirmGameAction,
}: {
  mode: StormExpeditionMode;
  onExit: () => void;
  confirm?: ConfirmGameAction;
}): Promise<boolean> {
  const message = mode === "practice"
    ? "연습 원정을 종료할까요?"
    : "원정에서 귀환할까요?\n현재 임시 전리품을 모두 확보하고 원정을 종료합니다.";
  if (!(await confirm(message))) return false;
  onExit();
  return true;
}

export function stormExpeditionArrivalNodeId(
  action: StormExpeditionActionRequest["action"],
  response: {
    error?: string;
    state?: { active: { currentNodeId: StormExpeditionMapNodeId } | null };
  },
): StormExpeditionMapNodeId | null {
  if (response.error || (action !== "start" && action !== "move")) return null;
  return response.state?.active?.currentNodeId ?? null;
}

export function shouldShowAcceptedRisk(
  riskEvent: StormExpeditionRiskEventOffer | null,
  nextBattleEffects: readonly string[],
): boolean {
  if (riskEvent?.status !== "accepted") return false;
  return riskEvent.id !== "rift_cache"
    || nextBattleEffects.includes("risk_enemy_fury");
}

export function buildStormExpeditionAutoplayResultModel(
  kind: "complete" | "defeated",
  status: {
    currentNodeId?: StormExpeditionMapNodeId;
    nodes?: readonly { id: StormExpeditionMapNodeId; name: string }[];
    gainedGold?: number;
    gainedMaterials?: Record<string, number>;
    gainedEquipment?: readonly unknown[];
  },
  latestActive: {
    currentNodeId: StormExpeditionMapNodeId;
    pendingGold: number;
    pendingMaterials: Record<string, number>;
    pendingEquipment: readonly unknown[];
  } | null,
): StormExpeditionAutoplayResultModel {
  const reachedNodeId = status.currentNodeId ?? latestActive?.currentNodeId;
  const reachedNodeName = status.nodes?.find((node) => node.id === reachedNodeId)?.name
    ?? reachedNodeId
    ?? "원정 시작점";
  if (kind === "complete") {
    return {
      kind,
      reachedNodeName,
      rewards: compactLootSummary(
        status.gainedGold,
        status.gainedMaterials,
        status.gainedEquipment,
      ),
    };
  }
  return {
    kind,
    reachedNodeName,
    lostLoot: compactLootSummary(
      latestActive?.pendingGold,
      latestActive?.pendingMaterials,
      latestActive?.pendingEquipment,
    ),
  };
}

function compactLootSummary(
  gold: number | undefined,
  materials: Record<string, number> | undefined,
  equipment: readonly unknown[] | undefined,
): string[] {
  const lines: string[] = [];
  if ((gold ?? 0) > 0) lines.push(`${Math.floor(gold ?? 0).toLocaleString("ko-KR")} G`);
  const materialCount = Object.values(materials ?? {}).reduce((sum, amount) => sum + Math.max(0, amount), 0);
  if (materialCount > 0) lines.push(`재료 ${materialCount.toLocaleString("ko-KR")}개`);
  if ((equipment?.length ?? 0) > 0) lines.push(`장비 ${equipment?.length.toLocaleString("ko-KR")}개`);
  return lines;
}

export function V2StormExpeditionView() {
  const router = useRouter();
  const refreshGameState = useRefreshGameState();
  const [status, setStatus] = useState<ExpeditionStatus | null>(null);
  const [result, setResult] = useState<ExpeditionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [skipReplay, setSkipReplay] = useState(false);
  const [selectedMode, setSelectedMode] = useState<StormExpeditionMode>("normal");
  const [openNodeId, setOpenNodeId] = useState<StormExpeditionMapNodeId | null>(null);
  const [autoPlanOpen, setAutoPlanOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [autoPlan, setAutoPlan] = useState<StormExpeditionAutoplayPlan>(() =>
    typeof window === "undefined"
      ? DEFAULT_AUTOPLAY_PLAN
      : loadStormExpeditionAutoplayDefaults(window.localStorage) ?? DEFAULT_AUTOPLAY_PLAN
  );
  const [resumePlan, setResumePlan] = useState<StormExpeditionAutoplayPlan | null>(null);
  const [autoplay, setAutoplay] = useState<StormExpeditionAutoplayDisplay>({ kind: "idle" });
  const [autoplayResult, setAutoplayResult] = useState<StormExpeditionAutoplayResultModel | null>(null);
  const stopAutoplayRef = useRef(false);
  const autoplayRunIdRef = useRef(0);
  const latestAutoplayActiveRef = useRef<ActiveExpedition | null>(null);
  const storageInitializedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/v2/storm-expedition");
      const json = await response.json().catch(() => null) as ExpeditionStatus | null;
      if (!json?.ok) throw new Error(json?.error ?? `http ${response.status}`);
      setStatus(json);
      if (!storageInitializedRef.current) {
        storageInitializedRef.current = true;
        const activeRun = json.state?.active;
        if (!activeRun) {
          clearStormExpeditionAutoplayPlan(window.localStorage);
        } else {
          const storedPlan = loadStormExpeditionResumePlan(window.localStorage, activeRun.visitedNodeIds);
          if (storedPlan) {
            setAutoPlan(storedPlan);
            setResumePlan(storedPlan);
            setAutoplay({ kind: "resume" });
          }
        }
      }
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

  const requestAction = useCallback(async (
    request: StormExpeditionActionRequest,
    options: { suppressReplay?: boolean } = {},
  ): Promise<ExpeditionStatus | null> => {
    setBusy(true);
    try {
      const response = await fetch("/api/v2/storm-expedition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const json = await response.json().catch(() => null) as ExpeditionStatus | null;
      if (!json) {
        setResult({ ok: false, error: `http ${response.status}` });
        return null;
      }
      setStatus((current) => stormExpeditionStatusAfterResponse(current, json));
      setResult(stormExpeditionResultAfterResponse(
        request.action,
        json,
        Boolean(skipReplay || options.suppressReplay),
      ));
      if (json.error) setOpenNodeId(null);
      if (json.claimedRewards) await refreshGameState();
      if (json.failed || json.bossClear || json.practiceCompleted || json.withdrew || json.practiceEnded) {
        clearStormExpeditionAutoplayPlan(window.localStorage);
        setResumePlan(null);
      }
      return json;
    } catch {
      setResult({ ok: false, error: "network" });
      return null;
    } finally {
      setBusy(false);
    }
  }, [refreshGameState, skipReplay]);

  const active = status?.state?.active ?? null;
  const autoplayLocked = autoplay.kind === "running" || autoplay.kind === "stopping";
  const displayedPlan = resumePlan ?? (autoplayLocked ? autoPlan : null);
  const isPracticeRun = active?.mode === "practice" || result?.practice === true;
  const currentNode = active ? status?.nodes?.find((node) => node.id === active.currentNodeId) ?? null : null;
  const previewableNodeIds = active ? currentNode?.nextNodeIds ?? [] : status?.entranceNodeIds ?? [];
  const activeRoute = status?.routes?.find((route) => route.id === (active?.routeId ?? result?.routeId)) ?? null;

  const runAutoplay = useCallback(async (plan: StormExpeditionAutoplayPlan) => {
    if (!status || autoplayLocked) return;
    storeStormExpeditionAutoplayPlan(window.localStorage, plan);
    setAutoPlan(plan);
    setSelectedMode(plan.mode);
    setResumePlan(null);
    setAutoPlanOpen(false);
    setOpenNodeId(null);
    setAutoplayResult(null);
    setResult(null);
    stopAutoplayRef.current = false;
    const runId = autoplayRunIdRef.current + 1;
    autoplayRunIdRef.current = runId;
    latestAutoplayActiveRef.current = status.state?.active ?? null;
    setAutoplay({ kind: "running", label: "계획 확인 중" });

    const runResult = await runStormExpeditionAutoplay({
      initialStatus: status,
      plan,
      request: async (request) => {
        const response = await requestAction(request, { suppressReplay: true });
        if (!response) throw new Error("network");
        return response;
      },
      onStatus: (nextStatus, label) => {
        if (autoplayRunIdRef.current !== runId) return;
        const nextActive = nextStatus.state?.active;
        if (nextActive) latestAutoplayActiveRef.current = nextActive as ActiveExpedition;
        setAutoplay((current) => current.kind === "stopping"
          ? { kind: "stopping", label }
          : { kind: "running", label });
      },
      shouldStop: () => stopAutoplayRef.current || autoplayRunIdRef.current !== runId,
    });

    if (autoplayRunIdRef.current !== runId) return;
    const finalStatus = runResult.status as ExpeditionStatus;
    if (runResult.kind === "complete" || runResult.kind === "defeated") {
      clearStormExpeditionAutoplayPlan(window.localStorage);
      setResumePlan(null);
      setAutoplay({ kind: "idle" });
      setAutoplayResult(buildStormExpeditionAutoplayResultModel(
        runResult.kind,
        finalStatus,
        latestAutoplayActiveRef.current,
      ));
      return;
    }
    if (runResult.kind === "conflict") {
      clearStormExpeditionAutoplayPlan(window.localStorage);
      setResumePlan(null);
      setAutoplay({ kind: "error", message: runResult.message });
      return;
    }
    setResumePlan(plan);
    setAutoplay({ kind: "resume" });
    if (runResult.kind === "stale") void refresh();
  }, [autoplayLocked, refresh, requestAction, status]);

  const stopAutoplay = useCallback(() => {
    stopAutoplayRef.current = true;
    setAutoplay((current) => current.kind === "running"
      ? { kind: "stopping", label: current.label }
      : current);
  }, []);

  const useManualProgress = useCallback(() => {
    autoplayRunIdRef.current += 1;
    stopAutoplayRef.current = true;
    clearStormExpeditionAutoplayPlan(window.localStorage);
    setResumePlan(null);
    setAutoplay({ kind: "idle" });
  }, []);

  const exitActiveExpedition = useCallback(() => {
    if (!active) return;
    void confirmStormExpeditionExit({
      mode: active.mode,
      onExit: () => void requestAction(stormExpeditionWithdrawRequest(active.currentNodeId, active.encounterIndex)),
    });
  }, [active, requestAction]);
  const replay = useMemo(() => result?.replay ? {
    payload: result.replay,
    outcome: result.success ? "win" as const : "lose" as const,
    playerName: result.playerName ?? "모험가",
    gender: (result.gender ?? "male1") as Gender,
  } : null, [result]);
  const openNode = status?.nodes?.find((node) => node.id === openNodeId) ?? null;
  const openNodeDialogModel = useMemo(() => buildStormExpeditionNodeDialogModel({
    status,
    active,
    node: openNode,
    skipReplay,
    selectedMode,
  }), [active, openNode, selectedMode, skipReplay, status]);

  const executeManualRequest = useCallback(async (request: StormExpeditionActionRequest) => {
    const response = await requestAction(request);
    if (!response) return;
    const arrivalNodeId = stormExpeditionArrivalNodeId(request.action, response);
    if (arrivalNodeId) setOpenNodeId(arrivalNodeId);
    if (!response.state?.active) setOpenNodeId(null);
  }, [requestAction]);

  const handleNodeAction = useCallback((action: StormExpeditionNodeDialogAction) => {
    if (action.kind === "skip_replay") {
      setSkipReplay(action.value);
      return;
    }
    if (!openNode) return;
    if (action.kind === "move") {
      const request = active
        ? stormExpeditionMoveRequest(openNode.id, active.currentNodeId, active.encounterIndex)
        : stormExpeditionStartRequest(selectedMode, openNode.id);
      void executeManualRequest(request);
      return;
    }
    if (!active || openNode.id !== active.currentNodeId) return;
    if (action.kind === "fight") {
      void executeManualRequest(stormExpeditionFightRequest(active.currentNodeId, active.encounterIndex));
    } else if (action.kind === "choose") {
      void executeManualRequest(stormExpeditionChooseRequest(action.choiceId, active.currentNodeId, active.encounterIndex));
    } else {
      void executeManualRequest(stormExpeditionRiskRequest(action.decision, active.currentNodeId, active.encounterIndex));
    }
  }, [active, executeManualRequest, openNode, selectedMode]);

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
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="rounded-md border border-sky-200 p-2 text-sky-600 dark:border-sky-800"
              aria-label="폭풍 원정 도움말"
              aria-haspopup="dialog"
            >
              <Question size={16} weight="bold" aria-hidden />
            </button>
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
        <StatusBanner tone="warning">
          {stormExpeditionUnlockStatusText(status.frontierDepth ?? 2)}
        </StatusBanner>
      )}
      {result?.error && <StatusBanner tone="error">{stormExpeditionErrorMessage(result)}</StatusBanner>}
      {result?.practiceCompleted && <StatusBanner tone="success">폭풍의 심장까지 연습을 마쳤습니다. 입장 횟수와 보상·완주 기록은 변하지 않았습니다.</StatusBanner>}
      {result?.bossClear && !result.practiceCompleted && <StatusBanner tone="success">폭풍의 심장을 쓰러뜨렸습니다. 모든 임시 전리품을 확보했습니다.</StatusBanner>}
      {result?.spFruitDropped && <StatusBanner tone="success">원정 완주 보상으로 SP 열매 V를 획득했습니다. SP 열매 천장 횟수가 초기화됩니다.</StatusBanner>}
      {result?.withdrew && <StatusBanner tone="success">안전하게 귀환해 임시 전리품을 모두 확보했습니다.</StatusBanner>}
      {result?.practiceEnded && <StatusBanner tone="info">연습을 종료했습니다. 입장 횟수와 보상·기록은 변하지 않았습니다.</StatusBanner>}
      {result?.failed && <StatusBanner tone="error">{result.practice ? "연습 전투에서 패배해 연습이 종료됐습니다." : "전투에서 패배해 이번 원정의 임시 전리품을 모두 잃었습니다."}</StatusBanner>}
      {result?.choiceApplied && <StatusBanner tone="info">선택한 정비 효과를 적용했습니다.</StatusBanner>}
      {result?.riskEventResolved && <StatusBanner tone={result.riskEventAccepted ? "warning" : "info"}>{result.riskEventAccepted ? (isPracticeRun ? "위험 계약을 수락했습니다. 연습에서는 전투 효과와 대가만 적용됩니다." : "위험 계약을 수락했습니다. 이익과 대가가 즉시 적용됩니다.") : "위험 이벤트를 지나쳤습니다."}</StatusBanner>}

      {status?.unlocked && !active && !replay && (
        <section className="space-y-4">
          <StormExpeditionCommandMap
            nodes={status.nodes ?? []}
            active={null}
            availableNodeIds={status.entranceNodeIds ?? []}
            nodeCount={status.nodeCount ?? 9}
            plan={displayedPlan}
            autoplay={autoplay}
            entry={{ selectedMode, attemptsLeft: status.attemptsLeft ?? 0, onModeChange: setSelectedMode }}
            onNodeOpen={(nodeId) => {
              if (!busy && !autoplayLocked && autoplay.kind !== "resume") setOpenNodeId(nodeId);
            }}
            onOpenAutoplayPlan={() => {
              setAutoPlan((current) => ({ ...current, mode: selectedMode }));
              setAutoPlanOpen(true);
            }}
            onStopAutoplay={stopAutoplay}
            onResumeAutoplay={() => resumePlan && void runAutoplay(resumePlan)}
            onUseManual={useManualProgress}
          />
          {openNodeDialogModel && (
            <StormExpeditionNodeDialog
              open={openNodeId !== null}
              model={openNodeDialogModel}
              busy={busy || autoplayLocked}
              onAction={handleNodeAction}
              onClose={() => setOpenNodeId(null)}
            />
          )}
        </section>
      )}

      {active && !replay && (
        <section className="space-y-4">
          {active.mode === "practice" && (
            <StatusBanner tone="info">
              <strong>연습 모드</strong> · 실전과 같은 전투와 선택을 체험하지만 입장 횟수와 보상·완주 기록은 변하지 않습니다.
            </StatusBanner>
          )}
          <StormExpeditionCommandMap
            nodes={status?.nodes ?? []}
            active={active}
            availableNodeIds={status?.availableNextNodeIds ?? []}
            previewableNodeIds={previewableNodeIds}
            nodeCount={status?.nodeCount ?? 9}
            plan={displayedPlan}
            autoplay={autoplay}
            onNodeOpen={(nodeId) => {
              if (!busy && !autoplayLocked && autoplay.kind !== "resume") setOpenNodeId(nodeId);
            }}
            onOpenAutoplayPlan={() => setAutoPlanOpen(true)}
            onStopAutoplay={stopAutoplay}
            onResumeAutoplay={() => resumePlan && void runAutoplay(resumePlan)}
            onUseManual={useManualProgress}
          />
          <Card as="details" padding="md" className="group space-y-3" data-testid="storm-expedition-support">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold">
              <span>{active.mode === "practice" ? "연습 안내와 적용 효과" : "전리품 가방과 적용 효과"}</span>
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {active.mode === "practice" ? "보상 없음" : `${active.pendingGold.toLocaleString("ko-KR")} G · 패배 시 소실`}
              </span>
            </summary>
            <div className="space-y-3 pt-2">
              {active.boons.length > 0 && <BoonList boons={active.boons} />}
              {shouldShowAcceptedRisk(active.riskEvent, active.nextBattleEffects) && active.riskEvent && (
                <AcceptedRisk
                  offer={active.riskEvent}
                  definition={status?.riskEvents?.[active.riskEvent.id]}
                  curse={active.riskEvent.curseId ? status?.riskCurses?.[active.riskEvent.curseId] : undefined}
                  practice={active.mode === "practice"}
                />
              )}
              {active.mode === "practice" ? (
                <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">연습에서는 골드·재료·장비·SP 열매가 생성되지 않으며 완주와 천장 기록도 오르지 않습니다.</p>
              ) : (
                <LootRows gold={active.pendingGold} materials={active.pendingMaterials} equipment={active.pendingEquipment} />
              )}
              <button
                type="button"
                disabled={busy || autoplayLocked || autoplay.kind === "resume" || (active.mode === "normal" && (active.defeatedCount <= 0 || active.nextBattleEffects.includes("risk_enemy_fury")))}
                onClick={exitActiveExpedition}
                className="min-h-11 w-full rounded-md border border-amber-300 text-sm font-semibold text-amber-800 disabled:opacity-50 dark:border-amber-800 dark:text-amber-200"
              >
                {active.mode === "practice"
                  ? "연습 종료"
                  : active.nextBattleEffects.includes("risk_enemy_fury")
                    ? "강화된 다음 전투 후 귀환 가능"
                    : "지금 전리품을 확보하고 귀환"}
              </button>
              <p className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><ShieldChevron size={14} /> 적 {active.defeatedCount}/7 처치 · 전투 체크포인트마다 귀환 가능</p>
            </div>
          </Card>
          {openNodeDialogModel && (
            <StormExpeditionNodeDialog
              open={openNodeId !== null}
              model={openNodeDialogModel}
              busy={busy || autoplayLocked}
              onAction={handleNodeAction}
              onClose={() => setOpenNodeId(null)}
            />
          )}
        </section>
      )}

      <StormExpeditionAutoPlanDialog
        open={autoPlanOpen}
        value={autoPlan}
        lockedMode={active?.mode}
        attemptsLeft={status?.attemptsLeft ?? 0}
        busy={autoplayLocked}
        onChange={setAutoPlan}
        onSubmit={(plan) => void runAutoplay(plan)}
        onClose={() => setAutoPlanOpen(false)}
      />

      {autoplayResult && (
        <StormExpeditionAutoplayResultDialog
          open
          model={autoplayResult}
          onClose={() => setAutoplayResult(null)}
        />
      )}

      <StormExpeditionGuideDialog
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
      />

      {replay && (
        <ReplayBattleScene
          payload={replay.payload}
          startPlayerHp={result?.startPlayerHp}
          playerName={replay.playerName}
          gender={replay.gender}
          exp={0}
          maxExp={1}
          playerSubtitle={`${isPracticeRun ? "연습 모드 · " : ""}${activeRoute?.name ?? "원정"} · ${status?.nodes?.find((node) => node.id === result?.currentNodeId)?.name ?? "전투"}`}
          outcome={replay.outcome}
          outcomeAction={{
            label: active ? "원정 지도 확인" : "원정대로 돌아가기",
            busyLabel: "이동 중...",
            busy: false,
            onClick: () => setResult((current) => current ? { ...current, replay: undefined } : null),
          }}
        />
      )}

      {!replay && !isPracticeRun && (result?.success || result?.claimedRewards) && (
        <Card padding="md" className="space-y-3 border-emerald-200 dark:border-emerald-900">
          <div><p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{result.claimedRewards ? "확정 획득" : "이번 전투 전리품"}</p><h2 className="mt-0.5 font-bold">{result.enemyName ?? "원정 전투"} 처치 보상</h2></div>
          <LootRows
            gold={result.claimedRewards ? result.gainedGold : undefined}
            materials={result.claimedRewards ? result.gainedMaterials : result.droppedMaterials}
            equipment={result.claimedRewards
              ? result.gainedEquipment
              : [
                  ...(result.droppedEquipment ? [result.droppedEquipment] : []),
                  ...(result.droppedUniqueEquipment ?? []),
                ]}
          />
          {!result.claimedRewards && active && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">임시 가방에 담겼습니다. 다음 전투 전에 귀환하면 안전하게 확보할 수 있습니다.</p>}
        </Card>
      )}
    </main>
  );
}

function buildStormExpeditionNodeDialogModel({
  status,
  active,
  node,
  skipReplay,
  selectedMode,
}: {
  status: ExpeditionStatus | null;
  active: ActiveExpedition | null;
  node: StormExpeditionMapNode | null;
  skipReplay: boolean;
  selectedMode: StormExpeditionMode;
}): StormExpeditionNodeDialogModel | null {
  if (!status || !node) return null;
  const availableNodeIds = active
    ? status.availableNextNodeIds ?? []
    : status.entranceNodeIds ?? [];
  const intent = stormExpeditionNodeIntent(node.id, active, availableNodeIds, node.kind);
  const route = status.routes?.find((candidate) => candidate.id === node.routeId) ?? null;

  if (intent.kind === "move") {
    const disabledReason = !active && selectedMode === "normal" && (status.attemptsLeft ?? 0) <= 0
      ? "오늘의 실전 입장 횟수를 모두 사용했습니다. 연습 모드를 선택해 주세요."
      : null;
    return { kind: "move", node, routeName: route?.name ?? null, disabledReason };
  }
  if (intent.kind === "completed") {
    const choice = node.kind === "battle"
      ? null
      : (() => {
          const choiceKind = node.kind;
          const choiceId = active?.chosenChoices[choiceKind];
          return choiceId
            ? status.choices?.[choiceKind]?.find((candidate) => candidate.id === choiceId) ?? null
            : null;
        })();
    return {
      kind: "completed",
      node,
      summary: choice
        ? [`${choice.name} 선택 완료`, choice.description]
        : [node.kind === "battle" ? "전투 완료" : "체크포인트 완료"],
    };
  }
  if (intent.kind === "locked") {
    return {
      kind: "locked",
      node,
      reason: active
        ? "앞선 체크포인트를 완료하고 연결된 경로로 이동해야 합니다."
        : "먼저 외곽 항로를 선택해 원정을 시작해야 합니다.",
    };
  }
  if (!active || node.id !== active.currentNodeId) return null;
  if (intent.kind === "risk" && active.riskEvent) {
    const definition = status.riskEvents?.[active.riskEvent.id];
    const boon = active.riskEvent.boonId
      ? status.choices?.altar.find((choice) => choice.id === active.riskEvent?.boonId)
      : null;
    const curse = active.riskEvent.curseId
      ? status.riskCurses?.[active.riskEvent.curseId]
      : null;
    return {
      kind: "risk",
      node,
      title: definition?.name ?? active.riskEvent.id,
      benefit: `${definition?.description ?? "원정 이익"}${boon ? ` (${boon.name}: ${boon.description})` : ""}`,
      cost: curse ? `${curse.name}: ${curse.description}` : definition?.cost ?? "위험 효과가 적용됩니다.",
    };
  }
  if (intent.kind === "battle") {
    const rewardLines = stormExpeditionBattleRewardLines(status, active, node);
    return {
      kind: "battle",
      node,
      encounterIndex: active.encounterIndex,
      encounterCount: node.encounterCount ?? 1,
      enemyName: null,
      rewardLines,
      skipReplay,
    };
  }
  if (intent.kind === "choice" && node.kind !== "battle") {
    const choices = (status.choices?.[node.kind] ?? []).filter((choice) =>
      node.kind !== "altar"
      || (active.altarOffers.includes(choice.id as StormExpeditionBoonId)
        && !active.boons.includes(choice.id as StormExpeditionBoonId))
    );
    return {
      kind: "choice",
      node,
      choiceKind: node.kind,
      hp: active.hp,
      maxHp: active.maxHp,
      mp: active.mp,
      maxMp: active.maxMp,
      choices,
    };
  }
  return null;
}

function stormExpeditionBattleRewardLines(
  status: ExpeditionStatus,
  active: ActiveExpedition,
  node: StormExpeditionMapNode,
): string[] {
  if (!node.encounterKind) return [];
  const lootRule = status.lootRules?.[node.encounterKind];
  if (!lootRule) return [];
  const equipmentMultiplier = active.riskEvent?.status === "accepted" && active.riskEvent.id === "storm_contract" ? 2 : 1;
  const lines = [
    active.mode === "practice" ? "연습 모드 · 보상 지급 없음" : "이번 전투 예상 보상",
    `항로 재료 ${lootRule.routeMaterialChance >= 1 ? `${lootRule.routeMaterialMin}~${lootRule.routeMaterialMax}개 확정` : formatChance(lootRule.routeMaterialChance)} · 6티어 장비 ${formatChance(Math.min(1, lootRule.equipmentChance * equipmentMultiplier))}`,
  ];
  if (status.uniqueLootRules) {
    lines.push(...stormUniqueDropPreview(node.encounterKind, status.uniqueLootRules, equipmentMultiplier));
  }
  return lines;
}

function AcceptedRisk({ offer, definition, curse, practice }: {
  offer: StormExpeditionRiskEventOffer;
  definition?: StormExpeditionChoice & { cost: string };
  curse?: StormExpeditionChoice;
  practice: boolean;
}) {
  return (
    <div className={`${SURFACE_INSET} space-y-1 p-3 text-xs`}>
      <p className="font-semibold text-rose-700 dark:text-rose-300">적용 중인 위험 · {definition?.name ?? offer.id}</p>
      <p className="text-zinc-600 dark:text-zinc-300">{definition?.description}</p>
      <p className="text-rose-700 dark:text-rose-300">{curse ? `${curse.name}: ${curse.description}` : definition?.cost}</p>
      {practice && offer.id !== "unstable_blessing" && <p className="font-semibold text-violet-700 dark:text-violet-300">연습에서는 보상 이익 없이 전투 효과와 대가만 적용 중입니다.</p>}
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

export function stormUniqueDropPreview(
  encounterKind: StormExpeditionEncounterKind,
  rule: StormExpeditionUniqueRule,
  multiplier: number,
): string[] {
  const boosted = Math.max(0, multiplier);
  if (encounterKind === "guardian") {
    return [
      `항로 유니크 ${formatChance(
        Math.min(1, rule.guardianRouteChance * boosted),
      )}`,
    ];
  }
  if (encounterKind !== "final_boss") return [];
  return [
    `항로 유니크 ${formatChance(Math.min(1, rule.finalRouteChance * boosted))}`,
    `교차 유니크 ${formatChance(Math.min(1, rule.finalCrossChance * boosted))}`,
    `폭풍심장 유니크 ${formatChance(rule.finalHeartChance)}`,
  ];
}
