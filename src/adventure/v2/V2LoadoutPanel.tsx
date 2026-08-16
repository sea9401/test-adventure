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
import {
  exclusiveSkillConflicts,
  isLifestyleSkill,
  V2_SKILLS,
  v2SkillSearchText,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  DUELIST_STANCE_BONUS_PCT,
  composeDuelistDeclaration,
  duelistDeclarationSummary,
  duelistStanceSnapshot,
  highestEquippedDeclaration,
} from "./combat/duelistCombat";
import { SkillEffectChips } from "./SkillEffectChips";
import { useSystemMessageState } from "./RewardToastProvider";
import {
  matchesSkillLibraryClassification,
  SKILL_JOB_TIER_OPTIONS,
  SKILL_LINEAGE_OPTIONS,
  type SkillJobTierFilter,
  type SkillLineageFilter,
} from "./skillLibraryFilters";

// SP 로드아웃 패널 — 배운 전투 스킬은 SP 예산 안으로 장착/해제하고, 생활 패시브는 항상 적용한다.
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
  ritualMode?: "power" | "focus" | null;
  ritualLevel?: number;
  ritualBonusPct?: number;
  ritualPowerBonusPct?: number;
  ritualFocusBonusPct?: number;
  ritualPowerEligible?: boolean;
  ritualFocusEligible?: boolean;
  ritualEligible?: boolean;
  ritualRefund?: {
    gold: number;
    proficiency: number;
  };
};
export type V2LoadoutSpBreakdown = {
  base: number;
  milestoneSp: number;
  masteryBonusSp: number;
  jobUnlockSp?: number;
  softCapReduction?: number;
  spFruitBonus: number;
  equipmentCodexBonus?: number;
  collectionBonusSp: number;
  collectionBonus?: {
    fishSp: number;
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

export async function waitForLoadoutRefresh(
  onChanged?: () => void | Promise<void>,
): Promise<void> {
  await onChanged?.();
}

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
type SkillDomain = "combat" | "lifestyle";

const AUTO_SCROLL_EDGE_PX = 80;
const AUTO_SCROLL_MAX_STEP = 18;

export const V2_SKILL_VISIBILITY_STORAGE_KEY =
  "adventure.v2.loadoutHiddenSkillIds";

function isLifestyleSkillId(skillId: string): boolean {
  const skill = V2_SKILLS[skillId as V2SkillId];
  return !!skill && isLifestyleSkill(skill);
}

export function loadoutExclusiveConflictMessage(
  skillIds: readonly string[],
): string | null {
  const knownIds = skillIds.filter(
    (skillId): skillId is V2SkillId => skillId in V2_SKILLS,
  );
  const conflicts = exclusiveSkillConflicts(knownIds);
  if (conflicts.some((conflict) => conflict.group === "berserker_madness")) {
    return "광기 계열은 하나만 장착할 수 있습니다.";
  }
  return conflicts.length > 0
    ? "같은 계열 스킬은 하나만 장착할 수 있습니다."
    : null;
}

export function V2LoadoutPanel({
  loadout,
  onChanged,
  previewMode = false,
  currentJobId,
}: {
  loadout: V2LoadoutData;
  onChanged?: () => void | Promise<void>;
  /** 로그인·DB 없는 /dev 미리보기에서 저장 요청 없이 로컬 상호작용만 확인한다. */
  previewMode?: boolean;
  currentJobId?: string;
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
  const [skillTierFilter, setSkillTierFilter] =
    useState<SkillJobTierFilter>("all");
  const [skillLineageFilter, setSkillLineageFilter] =
    useState<SkillLineageFilter>("all");
  const [domain, setDomain] = useState<SkillDomain>("combat");
  const [compact, setCompact] = useState(false);
  const [visibilitySettingsOpen, setVisibilitySettingsOpen] = useState(false);
  const [hiddenSkillIds, setHiddenSkillIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showSpDetails, setShowSpDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useSystemMessageState();
  const dragSessionRef = useRef<DragSession | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);

  const duelistPreview = useMemo(() => {
    if (!currentJobId || !(currentJobId in DUELIST_STANCE_BONUS_PCT)) return null;
    const stance = duelistStanceSnapshot(currentJobId, order, []);
    const highest = highestEquippedDeclaration(order);
    const declaration = highest
      ? composeDuelistDeclaration(order, highest)
      : null;
    return { stance, declaration };
  }, [currentJobId, order]);

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

  // 사냥터 표시 설정과 같은 로컬 저장 방식. 서버 렌더 결과와 첫 화면을 맞춘 뒤
  // 브라우저에서만 저장값을 불러온다.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(V2_SKILL_VISIBILITY_STORAGE_KEY);
        setHiddenSkillIds(parseHiddenSkillIds(raw));
      } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
  const combatEquippedSkills = useMemo(
    () => equippedSkills.filter((skill) => !isLifestyleSkillId(skill.skillId)),
    [equippedSkills],
  );
  const lifestyleEquippedSkills = useMemo(
    () => equippedSkills.filter((skill) => isLifestyleSkillId(skill.skillId)),
    [equippedSkills],
  );
  const searchIndex = useMemo(
    () =>
      new Map(
        loadout.library.map((skill) => {
          const def = V2_SKILLS[skill.skillId as V2SkillId];
          const text = def
            ? v2SkillSearchText(def)
            : `${skill.skillId} ${skill.name}`.toLowerCase();
          return [skill.skillId, text] as const;
        }),
      ),
    [loadout.library],
  );
  const queryTerms = useMemo(
    () =>
      query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    [query],
  );
  const domainLibrary = useMemo(
    () =>
      orderedLibrary.filter(
        (skill) =>
          isLifestyleSkillId(skill.skillId) === (domain === "lifestyle"),
      ),
    [domain, orderedLibrary],
  );
  const displayedDomainLibrary = useMemo(
    () =>
      domainLibrary.filter(
        (skill) => isSkillDisplayed(skill.skillId, hiddenSkillIds, equippedSet),
      ),
    [domainLibrary, equippedSet, hiddenSkillIds],
  );
  const hiddenDomainCount = domainLibrary.length - displayedDomainLibrary.length;
  const visibleLibrary = useMemo(
    () =>
      displayedDomainLibrary.filter((s) => {
        const equipped = equippedSet.has(s.skillId);
        const favorite = favoriteSet.has(s.skillId);
        const wouldFit = spUsed + s.spCost <= spBudget;
        const searchText = searchIndex.get(s.skillId) ?? "";
        const matchesQuery =
          queryTerms.length === 0 ||
          queryTerms.every((term) => searchText.includes(term));
        if (!matchesQuery) return false;
        if (
          !matchesSkillLibraryClassification(
            s.skillId,
            skillTierFilter,
            skillLineageFilter,
          )
        ) {
          return false;
        }
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
      displayedDomainLibrary,
      queryTerms,
      searchIndex,
      skillLineageFilter,
      skillTierFilter,
      spBudget,
      spUsed,
    ],
  );
  const allFilterDefs: Array<{ id: SkillFilter; label: string }> = [
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
  const filterDefs =
    domain === "lifestyle"
      ? allFilterDefs.filter((item) =>
          ["all", "favorite", "equipped", "passive"].includes(item.id),
        )
      : allFilterDefs;

  useEffect(() => {
    return () => {
      if (autoScrollFrameRef.current != null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
      }
    };
  }, []);

  async function commit(nextOrder: string[]) {
    if (previewMode) {
      setOrder(nextOrder);
      await waitForLoadoutRefresh(onChanged);
      return;
    }
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
        exclusiveConflicts?: Array<{ group?: string }>;
      } | null;
      if (!j?.ok) {
        setOrder(prev); // 롤백.
        setMsg(
          j?.exclusiveConflicts?.some(
            (conflict) => conflict.group === "berserker_madness",
          )
            ? "광기 계열은 하나만 장착할 수 있습니다."
            : j?.overBudget
              ? "스킬포인트가 부족해요"
              : "장착을 변경할 수 없어요",
        );
      } else {
        await waitForLoadoutRefresh(onChanged);
      }
    } catch {
      setOrder(prev);
      setMsg("오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  }

  async function commitSkillPrefs(nextOrder: string[], nextFavorites: string[]) {
    if (previewMode) {
      setLibraryOrder(nextOrder);
      setFavoriteIds(nextFavorites);
      return;
    }
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
    if (isLifestyleSkillId(skillId)) return;
    if (equippedSet.has(skillId)) {
      commit(order.filter((x) => x !== skillId));
    } else {
      const nextOrder = [...order, skillId];
      const exclusiveMessage = loadoutExclusiveConflictMessage(nextOrder);
      if (exclusiveMessage) {
        setMsg(exclusiveMessage);
        return;
      }
      commit(nextOrder);
    }
  }

  function setHiddenSkills(next: Set<string>) {
    setHiddenSkillIds(next);
    try {
      if (next.size === 0) {
        localStorage.removeItem(V2_SKILL_VISIBILITY_STORAGE_KEY);
      } else {
        localStorage.setItem(
          V2_SKILL_VISIBILITY_STORAGE_KEY,
          JSON.stringify([...next].sort()),
        );
      }
    } catch {}
  }

  function toggleSkillVisibility(skillId: string) {
    // 전투에 쓰는 스킬이 목록에서 사라져 해제 경로를 잃지 않도록 보호한다.
    if (equippedSet.has(skillId)) return;
    setHiddenSkills(toggleHiddenSkill(hiddenSkillIds, skillId));
  }

  function showAllSkillsInDomain() {
    const domainIds = new Set(domainLibrary.map((skill) => skill.skillId));
    setHiddenSkills(
      new Set([...hiddenSkillIds].filter((skillId) => !domainIds.has(skillId))),
    );
  }

  function clearCombatSkills() {
    const next = order.filter((id) => isLifestyleSkillId(id));
    if (busy || next.length === order.length) return;
    commit(next);
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
      <Card padding="md" className="w-full min-w-0 max-w-full">
        <h2 className="text-sm font-semibold">스킬</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          아직 배운 스킬이 없어요. 아래에서 스킬을 먼저 배우세요.
        </p>
      </Card>
    );
  }

  return (
    <Card padding="md" className="w-full min-w-0 max-w-full">
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
        <div className={`mt-2 px-3 py-2 ${SURFACE_INSET}`}>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
            <span>기본 {spBreakdown.base}</span>
            <span>직업 해금 +{spBreakdown.jobUnlockSp ?? 0}</span>
            {(spBreakdown.softCapReduction ?? 0) > 0 && (
              <span>상한 조정 -{spBreakdown.softCapReduction}</span>
            )}
            <span>SP 열매 +{spBreakdown.spFruitBonus}</span>
            <span>도감 +{spBreakdown.collectionBonusSp}</span>
            <span>장비 도감 +{spBreakdown.equipmentCodexBonus ?? 0}</span>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        배운 전투 스킬을 스킬포인트 예산 안에서 장착하세요. 생활 패시브는 SP를
        사용하지 않으며 배우면 자동으로 항상 적용됩니다.
      </p>
      {duelistPreview && (
        <div className={`mt-3 space-y-1.5 p-3 text-xs ${SURFACE_INSET}`}>
          <div className="font-semibold text-zinc-800 dark:text-zinc-100">
            {duelistPreview.stance.active
              ? `결투 태세 활성 · 평타 피해 +${duelistPreview.stance.bonusPct}%`
              : `결투 태세 비활성 · ${duelistPreview.stance.blockingSkillName ?? "현재 직업 조건 불충족"}${duelistPreview.stance.blockingSkillName ? " 장착 중" : ""}`}
          </div>
          {duelistPreview.declaration ? (
            <>
              <div className="font-medium text-violet-700 dark:text-violet-300">
                {duelistPreview.declaration.declarationName}에 하위 선언{" "}
                {Math.max(0, duelistPreview.declaration.chainCount - 1)}개 연계
              </div>
              <div className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                {duelistDeclarationSummary(duelistPreview.declaration)}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
              선언을 장착하면 가장 높은 차수의 선언에 하위 효과가 합쳐집니다.
            </div>
          )}
        </div>
      )}
      <div className="mt-4 grid gap-2 border-t border-zinc-200 pt-3 sm:grid-cols-2 dark:border-zinc-800">
        <section className={`${SURFACE_INSET} p-3`} aria-labelledby="combat-equipped-heading">
          <div className="flex items-center justify-between gap-2">
            <div
              id="combat-equipped-heading"
              className="text-xs font-semibold text-zinc-700 dark:text-zinc-200"
            >
              전투 스킬 장착
            </div>
            <button
              type="button"
              onClick={clearCombatSkills}
              disabled={busy || combatEquippedSkills.length === 0}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              전부 해제
            </button>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            표시 순서대로 전투에서 먼저 사용합니다.
          </p>
          {combatEquippedSkills.length > 0 ? (
            <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 pb-1">
              {combatEquippedSkills.map((s, idx) => (
                <div
                  key={s.skillId}
                  data-equipped-drop-id={s.skillId}
                  className={`ui-lift-card relative inline-flex min-h-11 sm:h-8 max-w-full shrink-0 items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-1.5 text-xs font-medium text-violet-800 sm:max-w-44 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200 ${
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
                    className={`flex h-11 w-11 sm:h-6 sm:w-5 touch-none cursor-grab items-center justify-center rounded text-violet-500 active:cursor-grabbing dark:text-violet-300 ${
                      busy
                        ? "pointer-events-none opacity-40"
                        : "hover:bg-violet-100 dark:hover:bg-violet-900"
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
          ) : (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              장착한 전투 스킬이 없어요.
            </p>
          )}
        </section>

        <section className={`${SURFACE_INSET} p-3`} aria-labelledby="lifestyle-equipped-heading">
          <div
            id="lifestyle-equipped-heading"
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-300"
          >
            생활 패시브 적용 <span className="font-normal">· SP 0</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            배우면 자동으로 항상 적용됩니다.
          </p>
          {lifestyleEquippedSkills.length > 0 ? (
            <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 pb-1">
              {lifestyleEquippedSkills.map((s) => (
                <span
                  key={s.skillId}
                  className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                >
                  <span className="truncate">{s.name}</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    적용 중
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              배운 생활 패시브가 없어요.
            </p>
          )}
        </section>
      </div>
      <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {(["combat", "lifestyle"] as const).map((item) => {
            const active = domain === item;
            const count = orderedLibrary.filter(
              (skill) =>
                isLifestyleSkillId(skill.skillId) === (item === "lifestyle"),
            ).length;
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setDomain(item);
                  setFilter("all");
                }}
                aria-pressed={active}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {item === "combat" ? "전투 스킬" : "생활 스킬"} {count}
              </button>
            );
          })}
        </div>
        {domain === "lifestyle" && (
          <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            생활 패시브는 SP를 사용하지 않으며, 배우는 즉시 항상 적용됩니다.
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">
            표시 스킬 {displayedDomainLibrary.length}/{domainLibrary.length}
          </span>
          <button
            type="button"
            onClick={() => setVisibilitySettingsOpen((open) => !open)}
            aria-expanded={visibilitySettingsOpen}
            className="rounded-md border border-zinc-300 px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            표시 설정
          </button>
        </div>
        {visibilitySettingsOpen && (
          <Card padding="sm" className="mt-2 space-y-2">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              체크를 끈 스킬은 보유 목록에서만 숨겨집니다. 장착 중인 스킬은 항상
              표시됩니다.
            </p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {domainLibrary.map((skill) => {
                const equipped = equippedSet.has(skill.skillId);
                const checked = equipped || !hiddenSkillIds.has(skill.skillId);
                return (
                  <label
                    key={skill.skillId}
                    className={`flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 ${
                      equipped
                        ? "cursor-not-allowed text-zinc-500 dark:text-zinc-400"
                        : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="min-w-0 truncate font-medium">
                      {skill.name}
                      {equipped && (
                        <span className="ml-1.5 text-[11px] font-normal text-violet-600 dark:text-violet-400">
                          장착 중
                        </span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={equipped}
                      onChange={() => toggleSkillVisibility(skill.skillId)}
                      aria-label={`${skill.name} 목록에 표시`}
                      className="h-4 w-4 shrink-0 accent-rose-600"
                    />
                  </label>
                );
              })}
            </div>
            {hiddenDomainCount > 0 && (
              <button
                type="button"
                onClick={showAllSkillsInDomain}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {domain === "combat" ? "전투 스킬" : "생활 스킬"} 전체 표시
              </button>
            )}
          </Card>
        )}
        <div className="mt-3 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          {domain === "combat" ? "전투 스킬 목록" : "생활 스킬 목록"}
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <label className="relative min-w-0 flex-1 sm:min-w-52 sm:max-w-xs">
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
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 sm:flex-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <ArrowsDownUp size={14} weight="bold" />
              즐겨찾기 우선
            </button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
          <label className="space-y-1">
            <span className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              스킬 차수
            </span>
            <select
              value={skillTierFilter}
              onChange={(event) =>
                setSkillTierFilter(event.target.value as SkillJobTierFilter)
              }
              className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-800 outline-none focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {SKILL_JOB_TIER_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              직업 계열
            </span>
            <select
              value={skillLineageFilter}
              onChange={(event) =>
                setSkillLineageFilter(
                  event.target.value as SkillLineageFilter,
                )
              }
              className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-800 outline-none focus:border-sky-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {SKILL_LINEAGE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-2 flex min-w-0 max-w-full overflow-x-auto gap-1.5 pb-1">
          {filterDefs.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`h-7 shrink-0 rounded-md border px-2 text-[11px] font-medium ${
                filter === f.id
                  ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300"
                  : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>
            검색 결과 {visibleLibrary.length} / {displayedDomainLibrary.length}
          </span>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
              setSkillTierFilter("all");
              setSkillLineageFilter("all");
            }}
            disabled={
              query.length === 0 &&
              filter === "all" &&
              skillTierFilter === "all" &&
              skillLineageFilter === "all"
            }
            className="rounded px-1.5 py-0.5 font-medium text-zinc-600 hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            검색 초기화
          </button>
        </div>

        <ul className="mt-3 space-y-1.5">
          {visibleLibrary.map((s) => {
          const equipped = equippedSet.has(s.skillId);
          const lifestyle = isLifestyleSkillId(s.skillId);
          const favorite = favoriteSet.has(s.skillId);
          const wouldFit = spUsed + s.spCost <= spBudget;
          const skillDef = V2_SKILLS[s.skillId as V2SkillId];
          return (
            <li
              key={s.skillId}
              data-skill-drop-id={s.skillId}
              className={`ui-skill-card relative flex flex-col sm:flex-row gap-2 rounded-md border px-2 py-2 transition-colors sm:items-start sm:px-3 ${
                equipped
                  ? "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950"
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
              <div className="flex w-full min-w-0 items-start gap-2 sm:contents">
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
                className={`flex h-11 w-11 sm:h-9 sm:w-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-500 active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 ${
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
                  <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                    SP {s.spCost}
                  </span>
                </div>
                {/* 간단한 효과 설명 — 패시브면 "지능 +10%" 등, 액티브면 피해/회복 + MP·쿨다운. */}
                {!compact && <SkillEffectChips skillId={s.skillId} />}
                {skillDef?.exclusiveGroup && (
                  <span className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                    같은 계열 1개만 장착
                  </span>
                )}
              </div>
              </div>
              <div className="grid w-full sm:w-[6.25rem] shrink-0 grid-cols-[2.75rem_minmax(0,1fr)] sm:grid-cols-[2rem_minmax(0,1fr)] items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleFavorite(s.skillId)}
                  disabled={busy}
                  aria-label={
                    favorite ? `${s.name} 즐겨찾기 해제` : `${s.name} 즐겨찾기`
                  }
                  title={favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                  className={`flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-md border disabled:cursor-not-allowed disabled:opacity-50 ${
                    favorite
                      ? "border-amber-400 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      : "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Star size={15} weight={favorite ? "fill" : "regular"} />
                </button>
                {lifestyle ? (
                  <span
                    aria-label={`${s.name} 적용 중`}
                    className="inline-flex h-8 w-full items-center justify-center whitespace-nowrap rounded-md border border-emerald-500 bg-emerald-50 px-2 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  >
                    적용 중
                  </span>
                ) : equipped ? (
                  <button
                    type="button"
                    onClick={() => toggle(s.skillId)}
                    disabled={busy}
                    aria-label={`${s.name} 해제`}
                    className="w-full whitespace-nowrap rounded-md border border-violet-500 bg-violet-500/15 px-2 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-300"
                  >
                    해제
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(s.skillId)}
                    disabled={busy || !wouldFit}
                    aria-label={`${s.name} 장착`}
                    className="w-full whitespace-nowrap rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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

export function toggleHiddenSkill(
  hidden: ReadonlySet<string>,
  skillId: string,
): Set<string> {
  const next = new Set(hidden);
  if (next.has(skillId)) next.delete(skillId);
  else next.add(skillId);
  return next;
}

export function parseHiddenSkillIds(raw: string | null): Set<string> {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return new Set();
    const next = new Set<string>();
    for (const value of parsed) {
      if (typeof value !== "string") continue;
      const skillId = value.trim();
      if (skillId.length > 0 && skillId.length <= 128) next.add(skillId);
    }
    return next;
  } catch {
    return new Set();
  }
}

export function isSkillDisplayed(
  skillId: string,
  hidden: ReadonlySet<string>,
  equipped: ReadonlySet<string>,
): boolean {
  return equipped.has(skillId) || !hidden.has(skillId);
}
