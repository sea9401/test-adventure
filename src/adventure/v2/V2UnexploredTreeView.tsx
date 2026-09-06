"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  Compass,
  Hammer,
  LockKey,
  MapTrifold,
  Trophy,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { confirmGameAction } from "@/components/ui/gameDialog";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { useSystemToast } from "@/adventure/v2/RewardToastProvider";
import { SUMMON_SCROLL_MATERIAL_ID } from "@/adventure/data/v2/coopBosses";
import {
  UNEXPLORED_BOSS_CORE_MATERIAL,
  UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES,
  UNEXPLORED_BOSSES,
  UNEXPLORED_BOSS_IDS,
  UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST,
  UNEXPLORED_SUMMON_STONE_SCROLL_COST,
  UNEXPLORED_SUMMON_STONE_TRACE_COST,
  type UnexploredBossEquipmentCraftRecipe,
  type UnexploredBossId,
} from "@/adventure/data/v2/unexploredBosses";
import { UNEXPLORED_POOL_BY_ID } from "@/adventure/data/v2/unexploredMonsterPools";
import { UNEXPLORED_ACHIEVEMENTS } from "@/adventure/data/v2/unexploredProgression";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import {
  buildUnexploredTreeModel,
  type UnexploredClientSnapshot,
  type UnexploredTreeNodeModel,
} from "./unexploredTreeModel";
import { unexploredNodeRadius } from "./unexploredTreeGeometry";
import { UnexploredTreeViewport } from "./UnexploredTreeViewport";
import { useGameResourceState } from "./GameResourceContext";

const CRAFTING_LOCKED_TEXT =
  "우두머리의 흔적 노드를 활성화하면 제작할 수 있습니다.";

const ERROR_TEXT: Record<string, string> = {
  level_required: "100레벨 달성 후 탐사망을 변경할 수 있습니다.",
  unknown_node: "존재하지 않는 탐사 노드입니다.",
  already_active: "이미 활성화한 노드입니다.",
  point_limit: "사용할 수 있는 탐사 포인트가 부족합니다.",
  not_adjacent: "활성화한 노드와 연결된 길부터 선택해야 합니다.",
  conversion_conflict: "보상 전환 노드는 하나만 선택할 수 있습니다.",
  difficulty_cap: "현재 구성은 최대 난이도 120을 초과합니다.",
  not_active: "활성화되지 않은 노드입니다.",
  start_required: "탐사 시작 노드는 반환할 수 없습니다.",
  would_disconnect: "반환하면 활성 경로가 끊어집니다.",
  insufficient_gold: "노드 반환에 필요한 골드가 부족합니다.",
  boss_node_required: CRAFTING_LOCKED_TEXT,
  insufficient_trace: "소환석 제작에 필요한 흔적이 부족합니다.",
  insufficient_material: "소환석 제작에 필요한 특화 재료가 부족합니다.",
  insufficient_scrolls: "소환석 제작에 필요한 보스 소환서가 부족합니다.",
  insufficient_boss_cores: "장비 제작에 필요한 우두머리 핵이 부족합니다.",
  insufficient_pool_material: "장비 제작에 필요한 연결 특화 재료가 부족합니다.",
  not_craftable: "확정 제작할 수 없는 장비입니다.",
  invalid_request: "장비 제작 요청을 확인해 주세요.",
  request_conflict: "제작 요청 식별자가 충돌했습니다. 다시 시도해 주세요.",
  not_enough_summon_stones: "사용할 소환석이 없습니다.",
  too_many_active: "같은 우두머리의 활성 세션이 너무 많습니다.",
};

type UnexploredTab = "tree" | "achievements" | "traces" | "forge";

const UNEXPLORED_TABS: ReadonlyArray<{
  id: UnexploredTab;
  label: string;
}> = [
  { id: "tree", label: "탐사망" },
  { id: "achievements", label: "탐사 업적" },
  { id: "traces", label: "흔적 보관함" },
  { id: "forge", label: "우두머리 핵 제작소" },
];

function nodeGlyph(node: UnexploredTreeNodeModel): string {
  if (node.kind === "start") return "🧭";
  if (node.kind === "pool") return "👹";
  if (node.kind === "deep") return node.icon === "boss" ? "♛" : "✦";
  if (node.icon.includes("coin")) return "●";
  if (node.icon.includes("material")) return "◆";
  if (node.icon.includes("equipment")) return "🛡";
  if (node.icon.includes("quality")) return "✧";
  if (node.kind === "medium") return "▲";
  if (node.kind === "enhancer") return "+";
  return "•";
}

function nodeColors(node: UnexploredTreeNodeModel, selected: boolean) {
  if (node.planState === "activate") {
    return { fill: "#7c3aed", stroke: "#c4b5fd", text: "#ffffff" };
  }
  if (node.planState === "refund") {
    return { fill: "#be123c", stroke: "#fda4af", text: "#ffffff" };
  }
  if (selected) return { fill: "#7c3aed", stroke: "#c4b5fd", text: "#ffffff" };
  if (node.state === "active") {
    return { fill: "#d97706", stroke: "#fcd34d", text: "#ffffff" };
  }
  if (node.state === "available") {
    return { fill: "#f5f3ff", stroke: "#8b5cf6", text: "#5b21b6" };
  }
  return { fill: "#e4e4e7", stroke: "#a1a1aa", text: "#71717a" };
}

function formatPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value}%`;
}

export function V2UnexploredTreeView({
  initialSnapshot = null,
  onBack,
  onOpenSession,
}: {
  initialSnapshot?: UnexploredClientSnapshot | null;
  onBack: () => void;
  onOpenSession?: (sessionId: string) => void;
}) {
  const { notifySystem } = useSystemToast();
  const { applyResourcePatch } = useGameResourceState();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialSnapshot?.selectedNodeIds[0] ?? null,
  );
  const [loading, setLoading] = useState(initialSnapshot === null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<UnexploredTab>("tree");
  const [bossBusy, setBossBusy] = useState<UnexploredBossId | null>(null);
  const [equipmentCraftBusy, setEquipmentCraftBusy] =
    useState<V2EquipmentId | null>(null);
  const pendingCraftRequestIds = useRef<
    Partial<Record<UnexploredBossId, string>>
  >({});
  const pendingEquipmentCraftRequestIds = useRef<
    Partial<Record<V2EquipmentId, string>>
  >({});

  useEffect(() => {
    if (initialSnapshot !== null) return;
    let cancelled = false;
    void fetch("/api/v2/unexplored")
      .then(async (response) => {
        const body = (await response.json()) as {
          snapshot?: UnexploredClientSnapshot;
          error?: string;
        };
        if (!response.ok || !body.snapshot) {
          throw new Error(body.error ?? `http ${response.status}`);
        }
        if (!cancelled) {
          setSnapshot(body.snapshot);
          setSelectedNodeId(body.snapshot.selectedNodeIds[0] ?? null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          notifySystem(`✗ 탐사망 조회 실패: ${(error as Error).message}`, "error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSnapshot, notifySystem]);

  const model = useMemo(
    () => (snapshot ? buildUnexploredTreeModel(snapshot, selectedNodeId) : null),
    [selectedNodeId, snapshot],
  );
  async function mutate(
    mutation:
      | { action: "activate_path" | "refund_path"; nodeId: string }
      | { action: "reset" },
    nodeCount = 1,
  ) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/v2/unexplored", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mutation),
      });
      const body = (await response.json()) as {
        snapshot?: UnexploredClientSnapshot;
        error?: string;
      };
      if (!response.ok || !body.snapshot) {
        throw new Error(ERROR_TEXT[body.error ?? ""] ?? body.error ?? "변경 실패");
      }
      setSnapshot(body.snapshot);
      applyResourcePatch({
        gold: body.snapshot.gold,
        bankedGold: body.snapshot.bankedGold,
      });
      notifySystem(
        mutation.action === "activate_path"
          ? `✓ 탐사 노드 ${nodeCount.toLocaleString()}개를 활성화했습니다.`
          : mutation.action === "refund_path"
            ? `✓ 탐사 노드 ${nodeCount.toLocaleString()}개를 반환했습니다.`
            : "✓ 탐사망을 초기화했습니다.",
        "success",
      );
    } catch (error) {
      notifySystem(`✗ ${(error as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function craftSummonStone(bossId: UnexploredBossId) {
    if (bossBusy) return;
    const requestId =
      pendingCraftRequestIds.current[bossId] ?? crypto.randomUUID();
    pendingCraftRequestIds.current[bossId] = requestId;
    let serverAnswered = false;
    setBossBusy(bossId);
    try {
      const response = await fetch("/api/v2/unexplored/craft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bossId, requestId }),
      });
      serverAnswered = true;
      const body = (await response.json()) as {
        error?: string;
        gold?: number;
        bankedGold?: number;
        materials?: Record<string, number>;
        traces?: UnexploredClientSnapshot["traces"];
        achievementIds?: UnexploredClientSnapshot["achievementIds"];
        baseGoldCost?: number;
        goldCost?: number;
        liberationDiscountPct?: number;
      };
      if (
        !response.ok ||
        body.gold == null ||
        body.bankedGold == null ||
        !body.materials ||
        !body.traces ||
        !body.achievementIds
      ) {
        throw new Error(ERROR_TEXT[body.error ?? ""] ?? body.error ?? "제작 실패");
      }
      pendingCraftRequestIds.current[bossId] = undefined;
      applyResourcePatch({ gold: body.gold, bankedGold: body.bankedGold });
      setSnapshot((current) =>
        current
          ? {
              ...current,
              gold: body.gold!,
              bankedGold: body.bankedGold!,
              materials: body.materials!,
              traces: body.traces!,
              achievementIds: body.achievementIds!,
              summonStoneCraftCost:
                body.baseGoldCost != null &&
                body.goldCost != null &&
                body.liberationDiscountPct != null
                  ? {
                      baseGoldCost: body.baseGoldCost,
                      goldCost: body.goldCost,
                      liberationDiscountPct: body.liberationDiscountPct,
                    }
                  : current.summonStoneCraftCost,
            }
          : current,
      );
      notifySystem(`✓ ${UNEXPLORED_BOSSES[bossId].name} 소환석을 제작했습니다.`, "success");
    } catch (error) {
      // 서버가 명시적으로 거절한 요청은 새 ID로 다시 시도한다. 응답 자체를 받지 못한 경우만
      // 같은 ID를 보존해, 첫 요청이 서버에서 성공했을 가능성을 멱등 영수증으로 확인한다.
      if (serverAnswered) pendingCraftRequestIds.current[bossId] = undefined;
      notifySystem(`✗ ${(error as Error).message}`, "error");
    } finally {
      setBossBusy(null);
    }
  }

  async function summonPersonalBoss(bossId: UnexploredBossId) {
    if (bossBusy) return;
    setBossBusy(bossId);
    try {
      const response = await fetch("/api/v2/unexplored/summon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bossId }),
      });
      const body = (await response.json()) as {
        error?: string;
        sessionId?: string;
        summonStonesLeft?: number;
      };
      if (!response.ok || !body.sessionId || body.summonStonesLeft == null) {
        throw new Error(ERROR_TEXT[body.error ?? ""] ?? body.error ?? "소환 실패");
      }
      const summonMaterialId = UNEXPLORED_BOSSES[bossId].summonMaterialId;
      setSnapshot((current) => {
        if (!current) return current;
        const materials = { ...current.materials };
        if (body.summonStonesLeft! > 0) {
          materials[summonMaterialId] = body.summonStonesLeft!;
        } else {
          delete materials[summonMaterialId];
        }
        return { ...current, materials };
      });
      notifySystem(`✓ ${UNEXPLORED_BOSSES[bossId].name}을 소환했습니다.`, "success");
      onOpenSession?.(body.sessionId);
    } catch (error) {
      notifySystem(`✗ ${(error as Error).message}`, "error");
    } finally {
      setBossBusy(null);
    }
  }

  async function craftBossEquipment(
    recipe: UnexploredBossEquipmentCraftRecipe,
  ) {
    if (equipmentCraftBusy) return;
    setEquipmentCraftBusy(recipe.equipmentId);
    try {
      const confirmed = await confirmGameAction({
        title: `${recipe.equipmentName} 확정 제작`,
        message: [
          `우두머리 핵 ${recipe.bossCoreCost.toLocaleString()}개`,
          ...recipe.materialCosts.map(
            (cost) => `${cost.materialName} ${cost.count.toLocaleString()}개`,
          ),
        ].join("\n"),
        confirmLabel: "확정 제작",
        tone: "warning",
      });
      if (!confirmed) return;

      const requestId =
        pendingEquipmentCraftRequestIds.current[recipe.equipmentId] ??
        crypto.randomUUID();
      pendingEquipmentCraftRequestIds.current[recipe.equipmentId] = requestId;
      let serverAnswered = false;
      try {
        const response = await fetch("/api/v2/unexplored/equipment-craft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            equipmentId: recipe.equipmentId,
            requestId,
          }),
        });
        serverAnswered = true;
        const body = (await response.json()) as {
          error?: string;
          equipmentId?: V2EquipmentId;
          equipmentIid?: string;
          materials?: Record<string, number>;
        };
        if (
          !response.ok ||
          body.equipmentId !== recipe.equipmentId ||
          !body.equipmentIid ||
          !body.materials
        ) {
          throw new Error(
            ERROR_TEXT[body.error ?? ""] ?? body.error ?? "장비 제작 실패",
          );
        }
        pendingEquipmentCraftRequestIds.current[recipe.equipmentId] = undefined;
        setSnapshot((current) =>
          current ? { ...current, materials: body.materials! } : current
        );
        notifySystem(`✓ ${recipe.equipmentName}을 제작했습니다.`, "success");
      } catch (error) {
        if (serverAnswered) {
          pendingEquipmentCraftRequestIds.current[recipe.equipmentId] = undefined;
        }
        notifySystem(`✗ ${(error as Error).message}`, "error");
      }
    } finally {
      setEquipmentCraftBusy(null);
    }
  }

  if (loading || !snapshot || !model) {
    return (
      <PageShell className="max-w-[1400px] overflow-x-hidden">
        <SubViewHeader title="미개척지 탐사망" onBack={onBack} />
        <div className={`${SURFACE_CARD} p-6 text-center text-sm text-zinc-500`}>
          탐사망을 불러오는 중입니다.
        </div>
      </PageShell>
    );
  }

  const selected = model.selected;
  const completedAchievementIds = new Set(snapshot.achievementIds);
  const spendableGold = snapshot.gold + snapshot.bankedGold;
  const craftCost = snapshot.summonStoneCraftCost;
  return (
    <PageShell className="max-w-[1400px] overflow-x-hidden" spacing="tight">
      <SubViewHeader
        title="미개척지 탐사망"
        onBack={onBack}
        right={activeTab === "tree" ? (
          <Button
            size="xs"
            variant="secondary"
            disabled={!snapshot.eligible || snapshot.spentPoints <= 1 || busy}
            onClick={() => void mutate({ action: "reset" })}
          >
            <ArrowClockwise size={15} /> 초기화
          </Button>
        ) : undefined}
      />

      <section className={`${SURFACE_ACCENT} grid gap-3 p-4 sm:grid-cols-3`}>
        <div>
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">탐사 포인트</p>
          <p className="text-lg font-bold">{snapshot.spentPoints} / {snapshot.earnedPoints}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">탐사 경험치</p>
          <p className="text-lg font-bold">
            {snapshot.nextPointCost > 0
              ? `${snapshot.explorationXp.toLocaleString()} / ${snapshot.nextPointCost.toLocaleString()}`
              : "완료"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200">현재 사냥터</p>
          <p className="text-lg font-bold">난이도 {snapshot.difficulty}</p>
        </div>
      </section>

      {!snapshot.eligible && (
        <div className={`${SURFACE_CARD} flex items-center gap-3 p-4 text-sm`}>
          <LockKey size={22} className="shrink-0 text-zinc-500" />
          <span>100레벨 달성 후 다시 입장할 수 있습니다. 기존 탐사 진행도는 유지됩니다.</span>
        </div>
      )}

      <div
        role="tablist"
        aria-label="개척 노드 콘텐츠"
        className={`${SURFACE_CARD} grid grid-cols-2 gap-1 p-1 sm:grid-cols-4`}
      >
        {UNEXPLORED_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              id={`unexplored-tab-${tab.id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`unexplored-panel-${tab.id}`}
              className={`min-h-11 rounded-lg px-2 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                selected
                  ? "bg-violet-600 text-white dark:bg-violet-500 dark:text-white"
                  : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id="unexplored-panel-achievements"
        role="tabpanel"
        aria-labelledby="unexplored-tab-achievements"
        aria-label="탐사 업적"
        hidden={activeTab !== "achievements"}
      >
      <section className={`${SURFACE_CARD} space-y-3 p-4`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy size={22} className="text-amber-500" />
            <div>
              <h2 className="font-bold">탐사 업적</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                업적마다 탐사 포인트를 1개 획득합니다.
              </p>
            </div>
          </div>
          <strong className="shrink-0 text-sm text-amber-700 dark:text-amber-300">
            {snapshot.achievementIds.length} / {UNEXPLORED_ACHIEVEMENTS.length} 완료
          </strong>
        </div>
        <ul aria-label="탐사 업적" className="grid gap-2 md:grid-cols-2">
          {UNEXPLORED_ACHIEVEMENTS.map((achievement) => {
            const completed = completedAchievementIds.has(achievement.id);
            return (
              <li
                key={achievement.id}
                aria-label={`${achievement.name} ${completed ? "완료" : "미완료"}`}
                className={`${SURFACE_INSET} flex items-start gap-3 p-3`}
              >
                {completed ? (
                  <CheckCircle
                    size={21}
                    weight="fill"
                    className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  />
                ) : (
                  <LockKey
                    size={21}
                    className="mt-0.5 shrink-0 text-zinc-400 dark:text-zinc-500"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                    <h3 className="text-sm font-bold">{achievement.name}</h3>
                    <span
                      className={
                        completed
                          ? "text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                          : "text-xs font-semibold text-zinc-500 dark:text-zinc-400"
                      }
                    >
                      {completed ? "완료" : "미완료"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                    {achievement.description}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    탐사 포인트 +1
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      </div>

      <div
        id="unexplored-panel-tree"
        role="tabpanel"
        aria-labelledby="unexplored-tab-tree"
        aria-label="탐사망"
        hidden={activeTab !== "tree"}
        className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <section className={`${SURFACE_CARD} min-w-0 p-2 sm:p-3`}>
          <UnexploredTreeViewport ariaLabel="미개척지 160노드 탐사망">
              {model.edges.map((edge) => {
                const stroke = edge.state === "active"
                  ? "#f59e0b"
                  : edge.state === "refund"
                    ? "#e11d48"
                  : edge.state === "preview"
                    ? "#8b5cf6"
                    : "#d4d4d8";
                return (
                  <path
                    key={`${edge.left}-${edge.right}`}
                    data-unexplored-edge={`${edge.left}|${edge.right}`}
                    d={edge.path}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={edge.state === "inactive" ? 3 : 7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
              {model.nodes.map((node) => {
                const isSelected = node.id === selectedNodeId;
                const colors = nodeColors(node, isSelected);
                const radius = unexploredNodeRadius(node);
                return (
                  <g
                    key={node.id}
                    data-unexplored-node={node.id}
                    data-unexplored-plan={node.planState ?? undefined}
                    role="button"
                    tabIndex={0}
                    aria-label={`노드 선택: ${node.name}${
                      node.planState === "activate"
                        ? " · 활성화 대기"
                        : node.planState === "refund"
                          ? " · 반환 대기"
                          : ""
                    }`}
                    onClick={() => setSelectedNodeId(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        setSelectedNodeId(node.id);
                      }
                    }}
                    className="cursor-pointer outline-none"
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={radius}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={isSelected ? 8 : 5}
                    />
                    <text
                      x={node.x}
                      y={node.y + 7}
                      textAnchor="middle"
                      fontSize={node.kind === "small" ? 20 : 25}
                      fontWeight="700"
                      fill={colors.text}
                    >
                      {nodeGlyph(node)}
                    </text>
                    {node.kind !== "small" && node.kind !== "enhancer" && (
                      <text
                        x={node.x}
                        y={node.y + radius + 24}
                        textAnchor="middle"
                        fontSize="19"
                        fontWeight="700"
                        className="fill-zinc-700 dark:fill-zinc-200"
                      >
                        {node.name}
                      </text>
                    )}
                  </g>
                );
              })}
          </UnexploredTreeViewport>
        </section>

        <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
          <section className={`${SURFACE_CARD} p-4`}>
            <div className="mb-3 flex items-center gap-2">
              <MapTrifold size={22} className="text-violet-500" />
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {selected?.categoryLabel ?? "노드 상세"}
                </p>
                <h2 className="font-bold">{selected?.name ?? "노드를 선택하세요"}</h2>
              </div>
            </div>
            {selected ? (
              <>
                <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {selected.description}
                </p>
                {model.routePointPreview && (
                  <div className={`${SURFACE_INSET} mt-3 p-3 text-sm`}>
                    <p className="font-medium">
                      최단 경로 · 탐사 포인트 {model.routePointPreview.required.toLocaleString()}개 필요
                    </p>
                    <p className={model.routePointPreview.shortfall > 0
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-zinc-600 dark:text-zinc-300"}>
                      사용 가능 {model.routePointPreview.available.toLocaleString()}개
                      {model.routePointPreview.shortfall > 0 &&
                        ` · ${model.routePointPreview.shortfall.toLocaleString()}개 부족`}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      목표 노드 포함 · 이미 활성화한 노드 제외
                    </p>
                  </div>
                )}
                <div className={`${SURFACE_INSET} mt-3 p-3 text-sm`}>
                  <p className="font-medium">난이도</p>
                  <p>
                    {model.currentDifficulty}
                    {model.plan?.error === null && (
                      <> → <strong className="text-violet-600 dark:text-violet-300">{model.previewDifficulty}</strong></>
                    )}
                  </p>
                </div>
                <div className="mt-3">
                  {model.plan?.action === "activate" &&
                    model.plan.error === null && (
                    <Button
                      fullWidth
                      variant="primary"
                      loading={busy}
                      disabled={!snapshot.eligible}
                      onClick={() => void mutate(
                        { action: "activate_path", nodeId: selected.id },
                        model.plan!.nodeIds.length,
                      )}
                    >
                      탐사 포인트 {model.plan.nodeIds.length.toLocaleString()} 사용 ·{" "}
                      {model.plan.nodeIds.length.toLocaleString()}개 활성화
                    </Button>
                  )}
                  {model.plan?.action === "refund" &&
                    model.plan.error === null && (() => {
                      const refundGoldCost =
                        snapshot.refundGoldCost * model.plan.nodeIds.length;
                      const canAfford =
                        snapshot.gold + snapshot.bankedGold >= refundGoldCost;
                      return (
                        <div className="space-y-2">
                          {!canAfford && (
                            <p className="text-xs leading-5 text-rose-700 dark:text-rose-300">
                              {ERROR_TEXT.insufficient_gold}
                            </p>
                          )}
                          <Button
                            fullWidth
                            variant="danger"
                            loading={busy}
                            disabled={!snapshot.eligible || !canAfford}
                            onClick={() => void mutate(
                              { action: "refund_path", nodeId: selected.id },
                              model.plan!.nodeIds.length,
                            )}
                          >
                            {refundGoldCost.toLocaleString()}G로{" "}
                            {model.plan.nodeIds.length.toLocaleString()}개 반환
                          </Button>
                        </div>
                      );
                    })()}
                  {model.plan?.error && (
                    <div className="space-y-2">
                      <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
                        {ERROR_TEXT[model.plan.error] ??
                          `현재 상태에서는 ${
                            model.plan.action === "activate" ? "활성화" : "반환"
                          }할 수 없습니다.`}
                      </p>
                      <Button fullWidth disabled>
                        <LockKey size={16} />{" "}
                        {model.plan.action === "activate" ? "활성화" : "반환"} 불가
                      </Button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500">지도에서 노드를 선택하면 효과를 비교할 수 있습니다.</p>
            )}
          </section>

          <section className={`${SURFACE_CARD} p-4`}>
            <div className="mb-2 flex items-center gap-2 font-bold">
              <Compass size={20} className="text-amber-500" /> 활성 특화 풀
            </div>
            {model.poolSummary.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {model.poolSummary.slice(0, 3).map((pool) => (
                  <li key={pool.poolId} className={`${SURFACE_INSET} space-y-1 px-3 py-2`}>
                    <div className="flex justify-between gap-2">
                      <span>{pool.name}</span><strong>{pool.share}%</strong>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300">
                      {pool.materialName} · 재료 {pool.materialRateText}
                    </p>
                    {pool.weaponName && pool.weaponRateText ? (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        {pool.weaponName} · 무기 {pool.weaponRateText}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">기본 몬스터 풀 100%</p>
            )}
          </section>

          <section className={`${SURFACE_CARD} p-4 text-sm`}>
            <h3 className="mb-2 font-bold">현재 보상 보정</h3>
            <div className="grid grid-cols-2 gap-2">
              <span>골드</span><strong className="text-right">{formatPct(snapshot.rewardSummary.gold)}</strong>
              <span>일반 재료</span><strong className="text-right">{formatPct(snapshot.rewardSummary.baseMaterial)}</strong>
              <span>장비</span><strong className="text-right">{formatPct(snapshot.rewardSummary.equipment)}</strong>
              <span>특화 재료</span><strong className="text-right">{formatPct(snapshot.rewardSummary.specialMaterial)}</strong>
            </div>
          </section>
        </aside>
      </div>

      <div
        id="unexplored-panel-traces"
        role="tabpanel"
        aria-labelledby="unexplored-tab-traces"
        aria-label="흔적 보관함"
        hidden={activeTab !== "traces"}
      >
      <section className={`${SURFACE_CARD} space-y-3 p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Hammer size={22} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <h2 className="font-bold">흔적 보관함</h2>
              <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                우두머리의 흔적 노드를 활성화한 뒤 우두머리 계열 특화
                몬스터를 처치하면 획득합니다. 제작한 소환석은 노드나 레벨
                상태와 관계없이 사용할 수 있습니다.
              </p>
            </div>
          </div>
          <div className={`${SURFACE_INSET} min-w-0 px-3 py-2 text-right`}>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              보유 골드
            </p>
            <p className="break-all font-mono text-sm font-bold text-amber-700 dark:text-amber-300">
              {spendableGold.toLocaleString()}G
            </p>
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-3">
          {UNEXPLORED_BOSS_IDS.map((bossId) => {
            const boss = UNEXPLORED_BOSSES[bossId];
            const [poolAId, poolBId] = boss.pools;
            const poolA = UNEXPLORED_POOL_BY_ID[poolAId];
            const poolB = UNEXPLORED_POOL_BY_ID[poolBId];
            const traceA = snapshot.traces[poolAId] ?? 0;
            const traceB = snapshot.traces[poolBId] ?? 0;
            const materialA = snapshot.materials[poolA.materialId] ?? 0;
            const materialB = snapshot.materials[poolB.materialId] ?? 0;
            const scrolls = snapshot.materials[SUMMON_SCROLL_MATERIAL_ID] ?? 0;
            const summonStones = snapshot.materials[boss.summonMaterialId] ?? 0;
            const hasRecipe =
              traceA >= UNEXPLORED_SUMMON_STONE_TRACE_COST &&
              traceB >= UNEXPLORED_SUMMON_STONE_TRACE_COST &&
              materialA >= UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST &&
              materialB >= UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST &&
              scrolls >= UNEXPLORED_SUMMON_STONE_SCROLL_COST &&
              spendableGold >= craftCost.goldCost;
            const craftingUnlocked = snapshot.effects?.traceEnabled === true;
            return (
              <article key={bossId} className={`${SURFACE_INSET} space-y-3 p-3`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold">{boss.name} 소환석</h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      보유 {summonStones.toLocaleString()}개 · 나만 전투
                    </p>
                  </div>
                  <img
                    src={boss.monster.image}
                    alt={boss.name}
                    className="h-12 w-12 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
                  />
                </div>
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
                  <dt>{poolA.name} 흔적</dt>
                  <dd className="text-right font-mono">{traceA.toLocaleString()} / {UNEXPLORED_SUMMON_STONE_TRACE_COST}</dd>
                  <dt>{poolB.name} 흔적</dt>
                  <dd className="text-right font-mono">{traceB.toLocaleString()} / {UNEXPLORED_SUMMON_STONE_TRACE_COST}</dd>
                  <dt>{poolA.materialName}</dt>
                  <dd className="text-right font-mono">{materialA.toLocaleString()} / {UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST}</dd>
                  <dt>{poolB.materialName}</dt>
                  <dd className="text-right font-mono">{materialB.toLocaleString()} / {UNEXPLORED_SUMMON_STONE_POOL_MATERIAL_COST}</dd>
                  <dt>보스 소환서</dt>
                  <dd className="text-right font-mono">{scrolls.toLocaleString()} / {UNEXPLORED_SUMMON_STONE_SCROLL_COST}</dd>
                  <dt>골드</dt>
                  <dd className="text-right font-mono">
                    {craftCost.goldCost.toLocaleString()}G
                  </dd>
                </dl>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="xs"
                    variant="warning"
                    loading={bossBusy === bossId}
                    disabled={
                      bossBusy !== null || (craftingUnlocked && !hasRecipe)
                    }
                    aria-disabled={!craftingUnlocked || !hasRecipe || undefined}
                    className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-amber-600 dark:aria-disabled:hover:bg-amber-600"
                    aria-label={`${boss.name} 소환석 제작`}
                    onClick={() => {
                      if (!craftingUnlocked) {
                        notifySystem(`✗ ${CRAFTING_LOCKED_TEXT}`, "error");
                        return;
                      }
                      void craftSummonStone(bossId);
                    }}
                  >
                    제작
                  </Button>
                  <Button
                    size="xs"
                    variant="danger"
                    loading={bossBusy === bossId}
                    disabled={bossBusy !== null || summonStones < 1}
                    aria-label={`${boss.name} 소환`}
                    onClick={() => void summonPersonalBoss(bossId)}
                  >
                    소환
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      </div>

      <div
        id="unexplored-panel-forge"
        role="tabpanel"
        aria-labelledby="unexplored-tab-forge"
        aria-label="우두머리 핵 제작소"
        hidden={activeTab !== "forge"}
      >
      <section className={`${SURFACE_CARD} space-y-3 p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Hammer size={22} className="mt-0.5 shrink-0 text-violet-600" />
            <div>
              <h2 className="font-bold">우두머리 핵 제작소</h2>
              <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                일반 고유 장비는 핵과 연결 특화 재료로 확정 제작할 수 있습니다.
                초희귀 고유는 개인 보스 토벌에서만 획득할 수 있습니다.
              </p>
            </div>
          </div>
          <strong className="shrink-0 text-sm text-violet-700 dark:text-violet-300">
            보유 우두머리 핵 {(snapshot.materials[
              UNEXPLORED_BOSS_CORE_MATERIAL.id
            ] ?? 0).toLocaleString()}개
          </strong>
        </div>
        <div className="grid gap-3 xl:grid-cols-3">
          {UNEXPLORED_BOSS_IDS.map((bossId) => {
            const boss = UNEXPLORED_BOSSES[bossId];
            const recipes = UNEXPLORED_BOSS_EQUIPMENT_CRAFT_RECIPES.filter(
              (recipe) => recipe.bossId === bossId,
            );
            const dropOnly = boss.uniqueDrops.find(
              (drop) => drop.chancePct === 0.5,
            );
            return (
              <article
                key={bossId}
                aria-label={`${boss.name} 장비 제작`}
                className={`${SURFACE_INSET} space-y-3 p-3`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold">{boss.name}</h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      일반 고유 2종 확정 제작
                    </p>
                  </div>
                  <img
                    src={boss.monster.image}
                    alt=""
                    className="h-10 w-10 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
                  />
                </div>
                {recipes.map((recipe) => {
                  const coreCount = snapshot.materials[
                    UNEXPLORED_BOSS_CORE_MATERIAL.id
                  ] ?? 0;
                  const craftable =
                    coreCount >= recipe.bossCoreCost &&
                    recipe.materialCosts.every(
                      (cost) =>
                        (snapshot.materials[cost.materialId] ?? 0) >= cost.count,
                    );
                  return (
                    <div
                      key={recipe.equipmentId}
                      className={`${SURFACE_CARD} space-y-2 p-3`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold">
                            {recipe.equipmentName}
                          </h4>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {recipe.chancePct}% 일반 고유
                          </p>
                        </div>
                        <Button
                          size="xs"
                          variant="warning"
                          loading={equipmentCraftBusy === recipe.equipmentId}
                          disabled={equipmentCraftBusy !== null || !craftable}
                          aria-label={`${recipe.equipmentName} 확정 제작`}
                          onClick={() => void craftBossEquipment(recipe)}
                        >
                          확정 제작
                        </Button>
                      </div>
                      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
                        <dt>우두머리 핵</dt>
                        <dd className="text-right font-mono">
                          {coreCount.toLocaleString()} / {recipe.bossCoreCost.toLocaleString()}
                        </dd>
                        {recipe.materialCosts.map((cost) => (
                          <div key={cost.materialId} className="contents">
                            <dt>{cost.materialName}</dt>
                            <dd className="text-right font-mono">
                              {(snapshot.materials[cost.materialId] ?? 0).toLocaleString()} / {cost.count.toLocaleString()}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
                {dropOnly ? (
                  <div className={`${SURFACE_CARD} p-3`}>
                    <h4 className="text-sm font-bold">{dropOnly.equipmentName}</h4>
                    <p className="mt-1 text-xs font-semibold text-violet-700 dark:text-violet-300">
                      0.5% · 토벌 드롭 전용
                    </p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      </div>
    </PageShell>
  );
}
