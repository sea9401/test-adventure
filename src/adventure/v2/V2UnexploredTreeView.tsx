"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowClockwise, Compass, LockKey, MapTrifold } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { useSystemToast } from "@/adventure/v2/RewardToastProvider";
import {
  buildUnexploredTreeModel,
  type UnexploredClientSnapshot,
  type UnexploredTreeNodeModel,
} from "./unexploredTreeModel";

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
};

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

function nodeRadius(node: UnexploredTreeNodeModel): number {
  return { start: 34, small: 15, medium: 25, pool: 31, enhancer: 22, deep: 34 }[
    node.kind
  ];
}

function nodeColors(node: UnexploredTreeNodeModel, selected: boolean) {
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
}: {
  initialSnapshot?: UnexploredClientSnapshot | null;
  onBack: () => void;
}) {
  const { notifySystem } = useSystemToast();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialSnapshot?.selectedNodeIds[0] ?? null,
  );
  const [loading, setLoading] = useState(initialSnapshot === null);
  const [busy, setBusy] = useState(false);

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
  const positions = useMemo(
    () => new Map(model?.nodes.map((node) => [node.id, node]) ?? []),
    [model],
  );

  async function mutate(
    mutation:
      | { action: "activate" | "refund"; nodeId: string }
      | { action: "reset" },
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
      notifySystem(
        mutation.action === "activate"
          ? "✓ 탐사 노드를 활성화했습니다."
          : mutation.action === "refund"
            ? "✓ 탐사 노드를 반환했습니다."
            : "✓ 탐사망을 초기화했습니다.",
        "success",
      );
    } catch (error) {
      notifySystem(`✗ ${(error as Error).message}`, "error");
    } finally {
      setBusy(false);
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
  return (
    <PageShell className="max-w-[1400px] overflow-x-hidden" spacing="tight">
      <SubViewHeader
        title="미개척지 탐사망"
        onBack={onBack}
        right={
          <Button
            size="xs"
            variant="secondary"
            disabled={!snapshot.eligible || snapshot.spentPoints <= 1 || busy}
            onClick={() => void mutate({ action: "reset" })}
          >
            <ArrowClockwise size={15} /> 초기화
          </Button>
        }
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

      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className={`${SURFACE_CARD} min-w-0 p-2 sm:p-3`}>
          <div className={`${SURFACE_INSET} aspect-square w-full min-w-0 overflow-hidden`}>
            <svg
              viewBox="-80 -80 1960 1960"
              className="block h-full w-full"
              aria-label="미개척지 160노드 탐사망"
            >
              {model.edges.map((edge) => {
                const left = positions.get(edge.left);
                const right = positions.get(edge.right);
                if (!left || !right) return null;
                const stroke = edge.state === "active"
                  ? "#f59e0b"
                  : edge.state === "preview"
                    ? "#8b5cf6"
                    : "#d4d4d8";
                return (
                  <line
                    key={`${edge.left}-${edge.right}`}
                    x1={left.x}
                    y1={left.y}
                    x2={right.x}
                    y2={right.y}
                    stroke={stroke}
                    strokeWidth={edge.state === "inactive" ? 3 : 7}
                  />
                );
              })}
              {model.nodes.map((node) => {
                const isSelected = node.id === selectedNodeId;
                const colors = nodeColors(node, isSelected);
                const radius = nodeRadius(node);
                return (
                  <g
                    key={node.id}
                    data-unexplored-node={node.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`노드 선택: ${node.name}`}
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
                        fill="#3f3f46"
                      >
                        {node.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
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
                <div className={`${SURFACE_INSET} mt-3 p-3 text-sm`}>
                  <p className="font-medium">난이도</p>
                  <p>
                    {model.currentDifficulty}
                    {selected.state === "available" && (
                      <> → <strong className="text-violet-600 dark:text-violet-300">{model.previewDifficulty}</strong></>
                    )}
                  </p>
                </div>
                <div className="mt-3">
                  {selected.state === "available" && (
                    <Button
                      fullWidth
                      variant="primary"
                      loading={busy}
                      disabled={!snapshot.eligible}
                      onClick={() => void mutate({ action: "activate", nodeId: selected.id })}
                    >
                      탐사 포인트 1 사용
                    </Button>
                  )}
                  {selected.state === "active" && selected.id !== "start" && (
                    <Button
                      fullWidth
                      variant="danger"
                      loading={busy}
                      disabled={!snapshot.eligible}
                      onClick={() => void mutate({ action: "refund", nodeId: selected.id })}
                    >
                      {snapshot.refundGoldCost.toLocaleString()}G로 반환
                    </Button>
                  )}
                  {selected.state === "locked" && (
                    <Button fullWidth disabled>
                      <LockKey size={16} /> 경로 또는 포인트 필요
                    </Button>
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
                  <li key={pool.poolId} className={`${SURFACE_INSET} flex justify-between px-3 py-2`}>
                    <span>{pool.name}</span><strong>{pool.share}%</strong>
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
    </PageShell>
  );
}
