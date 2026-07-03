"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsDownUp,
  DotsSixVertical,
  MagnifyingGlass,
  Rows,
  SquaresFour,
  Star,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { SkillEffectChips } from "./SkillEffectChips";

// SP 로드아웃 패널 — 배운 스킬 라이브러리에서 SP 예산 안으로 장착/해제(코어루프 전용).
//   공용/기본기는 직업 무관 장착(오픈믹스), 시그니처는 현 직업 체인 밖이면 잠김(locked).
//   장착 변경은 POST /api/v2/me/loadout 로 전체 equipped(우선순위 순서)를 재전송 — 서버가
//   validateLoadout 으로 재검증(예산/학습/직업고정). 거부 시 직전 상태로 롤백.

export type V2LoadoutSkill = {
  skillId: string;
  name: string;
  spCost: number;
  equipped: boolean;
  favorite?: boolean;
  category?: V2LoadoutSkillCategory;
};
export type V2LoadoutSpBreakdown = {
  base: number;
  milestoneSp: number;
  masteryBonusSp: number;
  softCapReduction?: number;
  spFruitBonus: number;
  equipmentCodexBonus?: number;
  collectionBonusSp: number;
  collectionBonus?: {
    fishSp: number;
    treasureSp: number;
  };
  groups: Array<{
    id: string;
    label: string;
    cumLevel: number;
    requiredCumLevel: number;
    mastered: boolean;
    remainingCumLevel: number;
    milestoneSp: number;
    masteryBonusSp: number;
  }>;
};
export type V2LoadoutData = {
  spBudget: number;
  spUsed: number;
  equipped: string[]; // 장착 우선순위 순서(갬빗 fallback).
  library: V2LoadoutSkill[];
  spBreakdown?: V2LoadoutSpBreakdown;
};

type DropTarget = {
  kind: "library" | "equipped";
  skillId: string;
  edge: "before" | "after";
};
type DragSession = {
  kind: "library" | "equipped";
  activeId: string;
  pointerId: number;
};
type V2LoadoutSkillCategory =
  | "attack"
  | "heal"
  | "buff"
  | "debuff"
  | "passive";
type SkillFilter =
  | "all"
  | "favorite"
  | "equipped"
  | "available"
  | "overBudget"
  | V2LoadoutSkillCategory;

const AUTO_SCROLL_EDGE_PX = 80;
const AUTO_SCROLL_MAX_STEP = 18;

export function V2LoadoutPanel({
  loadout,
  onChanged,
}: {
  loadout: V2LoadoutData;
  onChanged?: () => void;
}) {
  // 단일 진실원천 = order(장착된 id 우선순위 리스트). 메타(코스트/잠금/시그)는 library 에서.
  const [order, setOrder] = useState<string[]>(loadout.equipped);
  const [libraryOrder, setLibraryOrder] = useState<string[]>(
    loadout.library.map((s) => s.skillId),
  );
  const [favoriteIds, setFavoriteIds] = useState<string[]>(
    loadout.library.filter((s) => s.favorite).map((s) => s.skillId),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("all");
  const [compact, setCompact] = useState(false);
  const [showSpDetails, setShowSpDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);

  // 부모가 /me/state 를 다시 불러(예: 스킬 학습 후) loadout 이 갱신되면 서버 진실로 동기화.
  //   토글은 같은 prop 참조라 effect 미발화 → 낙관적 로컬 상태 유지. 학습 등 refresh 시에만 리셋.
  const equippedKey = loadout.equipped.join(",");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버 loadout prop 이 바뀔 때 로컬 편집 순서 재시드
    setOrder(loadout.equipped);
    setMsg(null);
    // equippedKey 로 내용 비교(refresh 마다 새 배열 ref 라도 내용 같으면 미발화).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equippedKey]);

  const libraryKey = loadout.library
    .map((s) => `${s.skillId}:${s.favorite ? "1" : "0"}`)
    .join(",");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버 library prop 이 바뀔 때 표시 순서 재시드
    setLibraryOrder(loadout.library.map((s) => s.skillId));
    setFavoriteIds(
      loadout.library.filter((s) => s.favorite).map((s) => s.skillId),
    );
    // libraryKey 로 내용 비교(refresh 마다 새 배열 ref 라도 내용 같으면 미발화).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryKey]);

  const meta = useMemo(
    () => new Map(loadout.library.map((s) => [s.skillId, s])),
    [loadout.library],
  );
  const equippedSet = useMemo(() => new Set(order), [order]);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const orderedLibrary = useMemo(() => {
    const byId = new Map(loadout.library.map((s) => [s.skillId, s]));
    const seen = new Set<string>();
    const out: V2LoadoutSkill[] = [];
    for (const id of libraryOrder) {
      const skill = byId.get(id);
      if (!skill || seen.has(id)) continue;
      seen.add(id);
      out.push(skill);
    }
    for (const skill of loadout.library) {
      if (seen.has(skill.skillId)) continue;
      seen.add(skill.skillId);
      out.push(skill);
    }
    return out;
  }, [libraryOrder, loadout.library]);
  const spUsed = order.reduce((a, id) => a + (meta.get(id)?.spCost ?? 0), 0);
  const { spBudget } = loadout;
  const pct = spBudget > 0 ? Math.min(100, (spUsed / spBudget) * 100) : 0;
  const spBreakdown = loadout.spBreakdown;
  const equippedSkills = useMemo(
    () => order.map((id) => meta.get(id)).filter((s): s is V2LoadoutSkill => !!s),
    [meta, order],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleLibrary = useMemo(
    () =>
      orderedLibrary.filter((s) => {
        const equipped = equippedSet.has(s.skillId);
        const favorite = favoriteSet.has(s.skillId);
        const wouldFit = spUsed + s.spCost <= spBudget;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          s.name.toLowerCase().includes(normalizedQuery) ||
          s.skillId.toLowerCase().includes(normalizedQuery);
        if (!matchesQuery) return false;
        if (filter === "favorite") return favorite;
        if (filter === "equipped") return equipped;
        if (filter === "available") return !equipped && wouldFit;
        if (filter === "overBudget") return !equipped && !wouldFit;
        if (filter === "all") return true;
        return s.category === filter;
      }),
    [
      equippedSet,
      favoriteSet,
      filter,
      normalizedQuery,
      orderedLibrary,
      spBudget,
      spUsed,
    ],
  );
  const filterDefs: Array<{ id: SkillFilter; label: string }> = [
    { id: "all", label: "전체" },
    { id: "favorite", label: "즐겨찾기" },
    { id: "equipped", label: "장착 중" },
    { id: "available", label: "장착 가능" },
    { id: "overBudget", label: "SP 부족" },
    { id: "passive", label: "패시브" },
    { id: "attack", label: "공격" },
    { id: "heal", label: "회복" },
    { id: "buff", label: "버프" },
    { id: "debuff", label: "디버프" },
  ];

  useEffect(() => {
    return () => {
      if (autoScrollFrameRef.current != null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
      }
    };
  }, []);

  async function commit(nextOrder: string[]) {
    const prev = order;
    setOrder(nextOrder); // 낙관적 반영.
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/loadout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ equipped: nextOrder }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        overBudget?: boolean;
      } | null;
      if (!j?.ok) {
        setOrder(prev); // 롤백.
        setMsg(
          j?.overBudget ? "스킬포인트가 부족해요" : "장착을 변경할 수 없어요",
        );
      } else {
        onChanged?.();
      }
    } catch {
      setOrder(prev);
      setMsg("오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  }

  async function commitSkillPrefs(nextOrder: string[], nextFavorites: string[]) {
    const prev = libraryOrder;
    const prevFavorites = favoriteIds;
    setLibraryOrder(nextOrder);
    setFavoriteIds(nextFavorites);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/skill-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: nextOrder, favorites: nextFavorites }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        skillOrder?: string[];
        favoriteSkills?: string[];
      } | null;
      if (!j?.ok) {
        setLibraryOrder(prev);
        setFavoriteIds(prevFavorites);
        setMsg("스킬 정리를 저장할 수 없어요");
      } else if (Array.isArray(j.skillOrder)) {
        setLibraryOrder(j.skillOrder);
        setFavoriteIds(Array.isArray(j.favoriteSkills) ? j.favoriteSkills : []);
      }
    } catch {
      setLibraryOrder(prev);
      setFavoriteIds(prevFavorites);
      setMsg("오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  }

  function toggle(skillId: string) {
    if (equippedSet.has(skillId)) {
      commit(order.filter((x) => x !== skillId));
    } else {
      commit([...order, skillId]);
    }
  }

  function clearEquipped() {
    if (busy || order.length === 0) return;
    commit([]);
  }

  function reorderSkill(
    activeId: string,
    overId: string,
    edge: "before" | "after",
  ) {
    if (activeId === overId) return;
    const current = orderedLibrary.map((s) => s.skillId);
    if (!current.includes(activeId)) return;
    const next = current.filter((id) => id !== activeId);
    const overIdx = next.indexOf(overId);
    if (overIdx < 0) return;
    next.splice(edge === "after" ? overIdx + 1 : overIdx, 0, activeId);
    if (next.join(",") === current.join(",")) return;
    commitSkillPrefs(next, favoriteIds);
  }

  function reorderEquipped(
    activeId: string,
    overId: string,
    edge: "before" | "after",
  ) {
    if (activeId === overId) return;
    if (!order.includes(activeId)) return;
    const next = order.filter((id) => id !== activeId);
    const overIdx = next.indexOf(overId);
    if (overIdx < 0) return;
    next.splice(edge === "after" ? overIdx + 1 : overIdx, 0, activeId);
    if (next.join(",") === order.join(",")) return;
    commit(next);
  }

  function dropEdgeForClientY(target: HTMLElement, clientY: number) {
    const rect = target.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2 ? "before" : "after";
  }

  function dropEdgeForClientX(target: HTMLElement, clientX: number) {
    const rect = target.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2 ? "before" : "after";
  }

  function dropTargetAtPoint(x: number, y: number): DropTarget | null {
    const session = dragSessionRef.current;
    if (!session) return null;
    for (const el of document.elementsFromPoint(x, y)) {
      if (!(el instanceof HTMLElement)) continue;
      if (session.kind === "equipped") {
        const chip = el.closest<HTMLElement>("[data-equipped-drop-id]");
        const skillId = chip?.dataset.equippedDropId;
        if (!chip || !skillId || skillId === session.activeId) return null;
        return {
          kind: "equipped",
          skillId,
          edge: dropEdgeForClientX(chip, x),
        };
      }
      const row = el.closest<HTMLElement>("[data-skill-drop-id]");
      const skillId = row?.dataset.skillDropId;
      if (!row || !skillId || skillId === session.activeId) return null;
      return { kind: "library", skillId, edge: dropEdgeForClientY(row, y) };
    }
    return null;
  }

  function updateDropTargetAtPoint(x: number, y: number) {
    setDropTarget(dropTargetAtPoint(x, y));
  }

  function stopAutoScroll() {
    if (autoScrollFrameRef.current != null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    pointerRef.current = null;
  }

  function autoScrollStep() {
    const pointer = pointerRef.current;
    if (!pointer || !dragSessionRef.current) {
      autoScrollFrameRef.current = null;
      return;
    }

    const viewportH = window.innerHeight;
    const topDist = pointer.y;
    const bottomDist = viewportH - pointer.y;
    let delta = 0;
    if (topDist < AUTO_SCROLL_EDGE_PX) {
      delta = -Math.ceil(
        ((AUTO_SCROLL_EDGE_PX - topDist) / AUTO_SCROLL_EDGE_PX) *
          AUTO_SCROLL_MAX_STEP,
      );
    } else if (bottomDist < AUTO_SCROLL_EDGE_PX) {
      delta = Math.ceil(
        ((AUTO_SCROLL_EDGE_PX - bottomDist) / AUTO_SCROLL_EDGE_PX) *
          AUTO_SCROLL_MAX_STEP,
      );
    }

    if (delta !== 0) {
      window.scrollBy({ top: delta });
      updateDropTargetAtPoint(pointer.x, pointer.y);
    }
    autoScrollFrameRef.current = requestAnimationFrame(autoScrollStep);
  }

  function ensureAutoScroll() {
    if (autoScrollFrameRef.current == null) {
      autoScrollFrameRef.current = requestAnimationFrame(autoScrollStep);
    }
  }

  function updatePointerDrag(x: number, y: number) {
    pointerRef.current = { x, y };
    updateDropTargetAtPoint(x, y);
    ensureAutoScroll();
  }

  function finishPointerDrag(x: number, y: number) {
    const session = dragSessionRef.current;
    const target = dropTargetAtPoint(x, y) ?? dropTarget;
    if (session && target && session.kind === target.kind) {
      if (session.kind === "equipped") {
        reorderEquipped(session.activeId, target.skillId, target.edge);
      } else {
        reorderSkill(session.activeId, target.skillId, target.edge);
      }
    }
    dragSessionRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
    stopAutoScroll();
  }

  function toggleFavorite(skillId: string) {
    const nextFavorites = favoriteSet.has(skillId)
      ? favoriteIds.filter((id) => id !== skillId)
      : [...favoriteIds, skillId];
    commitSkillPrefs(
      orderedLibrary.map((s) => s.skillId),
      nextFavorites,
    );
  }

  function sortPinnedFirst() {
    const ids = orderedLibrary.map((s) => s.skillId);
    const idSet = new Set(ids);
    const seen = new Set<string>();
    const next: string[] = [];
    for (const id of favoriteIds) {
      if (!idSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    for (const id of order) {
      if (!idSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    commitSkillPrefs(next, favoriteIds);
  }

  function startPointerDrag(
    kind: "library" | "equipped",
    skillId: string,
    pointerId: number,
    x: number,
    y: number,
  ) {
    dragSessionRef.current = { kind, activeId: skillId, pointerId };
    setDraggingId(skillId);
    setDropTarget(null);
    updatePointerDrag(x, y);
  }

  function cancelPointerDrag(pointerId: number) {
    if (dragSessionRef.current?.pointerId !== pointerId) return;
    dragSessionRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
    stopAutoScroll();
  }

  if (loadout.library.length === 0) {
    return (
      <Card padding="md">
        <h2 className="text-sm font-semibold">스킬</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          아직 배운 스킬이 없어요. 아래에서 스킬을 먼저 배우세요.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">스킬</h2>
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            스킬포인트{" "}
            <strong className="tabular-nums text-violet-700 dark:text-violet-400">
              {spUsed}
            </strong>{" "}
            / {spBudget}
          </span>
          {spBreakdown && (
            <button
              type="button"
              onClick={() => setShowSpDetails((v) => !v)}
              className="rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-expanded={showSpDetails}
            >
              {showSpDetails ? "상세 접기" : "상세"}
            </button>
          )}
        </div>
      </div>
      {/* SP 예산 바 */}
      <div className="war-meter-track mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="war-meter-fill h-full rounded-full bg-violet-500 transition-[width] dark:bg-violet-600"
          style={{ width: `${pct}%` }}
        />
      </div>
      {spBreakdown && showSpDetails && (
        <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
            <span>기본 {spBreakdown.base}</span>
            <span>숙련도 +{spBreakdown.milestoneSp}</span>
            <span>직업군 정복 +{spBreakdown.masteryBonusSp}</span>
            {(spBreakdown.softCapReduction ?? 0) > 0 && (
              <span>상한 조정 -{spBreakdown.softCapReduction}</span>
            )}
            <span>SP 열매 +{spBreakdown.spFruitBonus}</span>
            <span>도감 +{spBreakdown.collectionBonusSp}</span>
            <span>장비 도감 +{spBreakdown.equipmentCodexBonus ?? 0}</span>
          </div>
          {spBreakdown.groups.length > 0 && (
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {spBreakdown.groups.map((g) => {
                const masteryPct =
                  g.requiredCumLevel > 0
                    ? Math.min(100, (g.cumLevel / g.requiredCumLevel) * 100)
                    : 0;
                return (
                  <div key={g.id} className="min-w-0">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-medium text-zinc-700 dark:text-zinc-200">
                        {g.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                        {g.mastered
                          ? `정복 +${g.masteryBonusSp}`
                          : `${g.cumLevel.toLocaleString()} / ${g.requiredCumLevel.toLocaleString()}`}
                      </span>
                    </div>
                    <div className="war-meter-track mt-1 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className={`war-meter-fill h-full rounded-full ${
                          g.mastered
                            ? "bg-emerald-500 dark:bg-emerald-500"
                            : "bg-sky-500 dark:bg-sky-500"
                        }`}
                        style={{ width: `${masteryPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        배운 스킬을 스킬포인트 예산 안에서 장착하세요. 공용·기본기는 어느 직업이든,
        시그니처는 그 직업일 때만 장착할 수 있어요.
      </p>
      {equippedSkills.length > 0 && (
        <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              장착 중
            </div>
            <button
              type="button"
              onClick={clearEquipped}
              disabled={busy || order.length === 0}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              초기화
            </button>
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {equippedSkills.map((s, idx) => (
              <div
                key={s.skillId}
                data-equipped-drop-id={s.skillId}
                className={`ui-lift-card relative inline-flex h-8 max-w-44 shrink-0 items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-1.5 text-xs font-medium text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200 ${
                  draggingId === s.skillId ? "opacity-55" : ""
                }`}
              >
                {dropTarget?.kind === "equipped" &&
                  dropTarget.skillId === s.skillId && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute bottom-1 top-1 w-1 rounded-full bg-sky-400 shadow-[0_0_0_2px_rgba(14,165,233,0.16)] dark:bg-sky-500 ${
                        dropTarget.edge === "before" ? "-left-1" : "-right-1"
                      }`}
                    />
                  )}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${s.name} 장착 순서 이동`}
                  title="드래그해서 장착 순서 변경"
                  onPointerDown={(e) => {
                    if (busy || e.button !== 0) return;
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    startPointerDrag(
                      "equipped",
                      s.skillId,
                      e.pointerId,
                      e.clientX,
                      e.clientY,
                    );
                  }}
                  onPointerMove={(e) => {
                    if (dragSessionRef.current?.pointerId !== e.pointerId) return;
                    e.preventDefault();
                    updatePointerDrag(e.clientX, e.clientY);
                  }}
                  onPointerUp={(e) => {
                    if (dragSessionRef.current?.pointerId !== e.pointerId) return;
                    e.preventDefault();
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                    finishPointerDrag(e.clientX, e.clientY);
                  }}
                  onPointerCancel={(e) => cancelPointerDrag(e.pointerId)}
                  className={`flex h-6 w-5 touch-none cursor-grab items-center justify-center rounded text-violet-500 active:cursor-grabbing dark:text-violet-300 ${
                    busy ? "pointer-events-none opacity-40" : "hover:bg-violet-100 dark:hover:bg-violet-900"
                  }`}
                >
                  <DotsSixVertical size={14} weight="bold" />
                </span>
                <span className="tabular-nums text-violet-500 dark:text-violet-400">
                  {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => toggle(s.skillId)}
                  disabled={busy}
                  title={`${s.name} 해제`}
                  className="min-w-0 truncate rounded px-1 py-0.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {s.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          스킬 목록
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="relative min-w-52 flex-1 sm:max-w-xs">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="스킬 검색"
              className="h-8 w-full rounded-md border border-zinc-300 bg-white py-1 pl-8 pr-2 text-xs text-zinc-800 outline-none focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {compact ? (
                <Rows size={14} weight="bold" />
              ) : (
                <SquaresFour size={14} weight="bold" />
              )}
              {compact ? "상세" : "간략"}
            </button>
            <button
              type="button"
              onClick={sortPinnedFirst}
              disabled={busy || (order.length === 0 && favoriteIds.length === 0)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <ArrowsDownUp size={14} weight="bold" />
              즐겨찾기 우선
            </button>
          </div>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {filterDefs.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`h-7 shrink-0 rounded-md border px-2 text-[11px] font-medium ${
                filter === f.id
                  ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                  : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>
            표시 {visibleLibrary.length} / {orderedLibrary.length}
          </span>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
            disabled={query.length === 0 && filter === "all"}
            className="rounded px-1.5 py-0.5 font-medium text-zinc-600 hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            검색 초기화
          </button>
        </div>

        <ul className="mt-3 space-y-1.5">
          {visibleLibrary.map((s) => {
          const equipped = equippedSet.has(s.skillId);
          const favorite = favoriteSet.has(s.skillId);
          const wouldFit = spUsed + s.spCost <= spBudget;
          return (
            <li
              key={s.skillId}
              data-skill-drop-id={s.skillId}
              className={`ui-skill-card relative flex items-start gap-2 rounded-md border px-2 py-2 transition-colors sm:px-3 ${
                equipped
                  ? "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40"
                  : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
              } ${
                draggingId === s.skillId ? "opacity-55" : ""
              }`}
            >
              {dropTarget?.kind === "library" &&
                dropTarget.skillId === s.skillId && (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-3 right-3 h-1 rounded-full bg-sky-400 shadow-[0_0_0_2px_rgba(14,165,233,0.16)] dark:bg-sky-500 ${
                    dropTarget.edge === "before" ? "-top-1" : "-bottom-1"
                  }`}
                />
              )}
              <span
                role="button"
                tabIndex={0}
                aria-label={`${s.name} 순서 이동`}
                title="드래그해서 순서 변경"
                onPointerDown={(e) => {
                  if (busy || e.button !== 0) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  startPointerDrag(
                    "library",
                    s.skillId,
                    e.pointerId,
                    e.clientX,
                    e.clientY,
                  );
                }}
                onPointerMove={(e) => {
                  if (dragSessionRef.current?.pointerId !== e.pointerId) return;
                  e.preventDefault();
                  updatePointerDrag(e.clientX, e.clientY);
                }}
                onPointerUp={(e) => {
                  if (dragSessionRef.current?.pointerId !== e.pointerId) return;
                  e.preventDefault();
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                  finishPointerDrag(e.clientX, e.clientY);
                }}
                onPointerCancel={(e) => {
                  if (dragSessionRef.current?.pointerId !== e.pointerId) return;
                  dragSessionRef.current = null;
                  setDraggingId(null);
                  setDropTarget(null);
                  stopAutoScroll();
                }}
                className={`flex h-9 w-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-500 active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 ${
                  busy ? "pointer-events-none opacity-40" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                <DotsSixVertical size={18} weight="bold" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  {favorite && (
                    <Star
                      size={14}
                      weight="fill"
                      className="shrink-0 text-amber-500"
                    />
                  )}
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {s.name}
                  </span>
                  <span className="shrink-0 rounded bg-zinc-200/70 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300">
                    SP {s.spCost}
                  </span>
                </div>
                {/* 간단한 효과 설명 — 패시브면 "지능 +10%" 등, 액티브면 피해/회복 + MP·쿨다운. */}
                {!compact && <SkillEffectChips skillId={s.skillId} />}
              </div>
              <div className="flex shrink-0 items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleFavorite(s.skillId)}
                  disabled={busy}
                  aria-label={
                    favorite ? `${s.name} 즐겨찾기 해제` : `${s.name} 즐겨찾기`
                  }
                  title={favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                  className={`flex h-8 w-8 items-center justify-center rounded-md border disabled:cursor-not-allowed disabled:opacity-50 ${
                    favorite
                      ? "border-amber-400 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                      : "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Star size={15} weight={favorite ? "fill" : "regular"} />
                </button>
                {equipped ? (
                  <button
                    type="button"
                    onClick={() => toggle(s.skillId)}
                    disabled={busy}
                    aria-label={`${s.name} 해제`}
                    className="rounded-md border border-violet-500 bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-300"
                  >
                    해제
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(s.skillId)}
                    disabled={busy || !wouldFit}
                    aria-label={`${s.name} 장착`}
                    className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {!wouldFit ? "SP 부족" : "장착"}
                  </button>
                )}
              </div>
            </li>
          );
          })}
          {visibleLibrary.length === 0 && (
            <li className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              조건에 맞는 스킬이 없어요.
            </li>
          )}
        </ul>
      </div>

      {msg && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
        >
          {msg}
        </div>
      )}
    </Card>
  );
}
