"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QUESTS, getQuestById, questTargetTotal, type Quest } from "../data/quests";
import type { MaterialId } from "../data/materials";
import type { NpcId } from "../data/npcs";
import type { RegionId } from "../data/world";
import type { ItemId } from "../data/items";
import { findItemId } from "../data/items";
import type { EquippedSlots } from "../character/types";
import {
  defaultQuestEntry,
  loadQuestProgress,
  mergeQuestProgress,
  saveQuestProgress,
  type QuestProgressEntry,
  type QuestProgressMap,
} from "./storage";
import { cooldownStatus } from "./cooldown";
import { useSavedValue } from "@/lib/storage/SaveProvider";
import { useRemotePatch } from "@/lib/storage/useRemotePatch";

export type ClaimResult =
  | { ok: true; quest: Quest }
  | { ok: false; reason: "not-found" | "not-ready" };

export type DeliverResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "not-deliver" | "not-active" | "insufficient" };

/** 전투 종료 컨텍스트 — kill_within_hp / no_potion_boss 조건 판정용. */
export type KillCtx = { hpFraction?: number; potionsUsed?: number };

// 서버에서 받은 raw 와 localStorage 백업을 머지해 초기 progress 를 만든다.
// 서버 PATCH 가 일시적으로 손실(409 drop / 410 race 등)되어도 localStorage 가
// 백업하고 있던 진행이 reload 후 자연 복원되도록.
function readInitial(raw: unknown): QuestProgressMap {
  const remote: QuestProgressMap =
    raw && typeof raw === "object" ? (raw as QuestProgressMap) : {};
  const local = loadQuestProgress();
  const merged = mergeQuestProgress(remote, local);
  // 과거 repeatable=true 시절 완료 후 state="available" 로 돌아간 entry 가, 이제
  // repeatable=false 로 바뀐 의뢰라면 "completed" 로 정정 — 안 그러면 NPC 대화창이
  // 같은 의뢰를 영구히 다시 제안한다 (PR #108 이후 잔존 세이브).
  for (const [id, entry] of Object.entries(merged)) {
    if (entry.state !== "available" || entry.completedCount <= 0) continue;
    const quest = getQuestById(id);
    if (!quest || quest.repeatable) continue;
    merged[id] = { ...entry, state: "completed" };
  }
  // 카운트 balance 감축 후 잔존 진행 정정 — 옛 count 시절 쌓인 progress 가
  // 새 count 보다 크거나 같은데 state="active" 로 박혀 보상이 안 열리는 경우.
  // 예: 창공의 주재 strike count 3→1 (#381) 이후 진행 2/1 로 멈춤.
  for (const [id, entry] of Object.entries(merged)) {
    if (entry.state !== "active") continue;
    const quest = getQuestById(id);
    if (!quest) continue;
    if (entry.progress >= questTargetTotal(quest.target)) {
      merged[id] = { ...entry, state: "ready" };
    }
  }
  return merged;
}

export function useQuests() {
  const initial = useSavedValue("quest-progress.v2");
  const [progress, setProgress] = useState<QuestProgressMap>(() =>
    readInitial(initial),
  );

  // localStorage 백업 — 서버 동기화 손실 시 reload 후 복원에 사용.
  useEffect(() => {
    saveQuestProgress(progress);
  }, [progress]);
  // setState 업데이터가 큐잉되어 다음 렌더에 처리되므로 동기 계산용 미러 ref 가 필요.
  const progressRef = useRef<QuestProgressMap>(progress);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useRemotePatch("quest-progress.v2", progress);

  const getEntry = useCallback(
    (id: string): QuestProgressEntry => progress[id] ?? defaultQuestEntry(),
    [progress],
  );

  const accept = useCallback((id: string) => {
    const cur = progressRef.current;
    const entry = cur[id] ?? defaultQuestEntry();
    if (entry.state !== "available") return;
    const quest = getQuestById(id);
    if (quest && cooldownStatus(quest, entry, Date.now()).onCooldown) return;
    const next: QuestProgressMap = {
      ...cur,
      [id]: { ...entry, state: "active", progress: 0 },
    };
    progressRef.current = next;
    setProgress(next);
  }, []);

  // 전투 승리 시 호출 — 활성 kill 계열 퀘스트의 진행도 증가.
  // ctx 로 kill_within_hp (마지막 HP 비율) / no_potion_boss (소비 포션 수) 판정.
  // 자동 사냥 경로는 ctx 없이 호출 — 그 경우 조건부 kind 는 진행 안 됨(의도).
  const recordKill = useCallback(
    (monsterName: string, ctx?: KillCtx): string[] => {
      const cur = progressRef.current;
      const next: QuestProgressMap = { ...cur };
      const justReady: string[] = [];
      let changed = false;
      for (const quest of QUESTS) {
        const t = quest.target;
        if (t.kind !== "kill" && t.kind !== "kill_within_hp" && t.kind !== "no_potion_boss") continue;
        if (t.monsterName !== monsterName) continue;
        if (t.kind === "kill_within_hp" && (ctx?.hpFraction ?? 0) < t.minHpFraction) continue;
        if (t.kind === "no_potion_boss" && (ctx?.potionsUsed ?? 0) > 0) continue;
        const entry = next[quest.id] ?? defaultQuestEntry();
        if (entry.state !== "active") continue;
        const total = questTargetTotal(t);
        if (entry.progress >= total) continue;
        const newProgress = entry.progress + 1;
        const newState: QuestProgressEntry["state"] =
          newProgress >= total ? "ready" : "active";
        next[quest.id] = { ...entry, progress: newProgress, state: newState };
        if (newState === "ready") justReady.push(quest.id);
        changed = true;
      }
      if (changed) {
        progressRef.current = next;
        setProgress(next);
      }
      return justReady;
    },
    [],
  );

  // 단순 누적형 진행도 증가 — talk_to_npc / visit_region / craft_item 공용.
  // matcher 가 target 을 보고 활성 의뢰인지 판정.
  const bumpCounter = (
    matcher: (t: Quest["target"]) => boolean,
  ): string[] => {
    const cur = progressRef.current;
    const next: QuestProgressMap = { ...cur };
    const justReady: string[] = [];
    let changed = false;
    for (const quest of QUESTS) {
      if (!matcher(quest.target)) continue;
      const entry = next[quest.id] ?? defaultQuestEntry();
      if (entry.state !== "active") continue;
      const total = questTargetTotal(quest.target);
      if (entry.progress >= total) continue;
      const newProgress = entry.progress + 1;
      const newState: QuestProgressEntry["state"] =
        newProgress >= total ? "ready" : "active";
      next[quest.id] = { ...entry, progress: newProgress, state: newState };
      if (newState === "ready") justReady.push(quest.id);
      changed = true;
    }
    if (changed) {
      progressRef.current = next;
      setProgress(next);
    }
    return justReady;
  };

  const recordTalk = useCallback(
    (npcId: NpcId): string[] =>
      bumpCounter((t) => t.kind === "talk_to_npc" && t.npcId === npcId),
    [],
  );

  const recordVisit = useCallback(
    (regionId: RegionId): string[] =>
      bumpCounter((t) => t.kind === "visit_region" && t.regionId === regionId),
    [],
  );

  const recordCraft = useCallback(
    (itemId: ItemId): string[] =>
      bumpCounter((t) => t.kind === "craft_item" && t.itemId === itemId),
    [],
  );

// 장착 슬롯이 바뀔 때마다(또는 의뢰 progress 바뀔 때) 호출 — equip_item / equip_set
  // 조건이 충족되면 active → ready 로 전환. 한 번 ready 가 되면 unequip 해도 demote 안 함
  // ("입어 본 적 있다"는 사실로 인정). 변화 없으면 setProgress 호출하지 않음 (loop 방지).
  const checkEquip = useCallback((equippedSlots: EquippedSlots): string[] => {
    const equippedIds = new Set<ItemId>();
    for (const slot of ["weapon", "armor", "accessory"] as const) {
      const id = findItemId(equippedSlots[slot]);
      if (id) equippedIds.add(id);
    }
    const cur = progressRef.current;
    const next: QuestProgressMap = { ...cur };
    const justReady: string[] = [];
    let changed = false;
    for (const quest of QUESTS) {
      const t = quest.target;
      if (t.kind !== "equip_item" && t.kind !== "equip_set") continue;
      const entry = next[quest.id] ?? defaultQuestEntry();
      if (entry.state !== "active") continue; // ready/available/completed 은 손대지 않음.
      if (t.kind === "equip_item") {
        if (!equippedIds.has(t.itemId)) continue;
        next[quest.id] = { ...entry, progress: 1, state: "ready" };
        justReady.push(quest.id);
        changed = true;
      } else {
        const match = t.itemIds.filter((id) => equippedIds.has(id)).length;
        const total = t.itemIds.length;
        const newState: QuestProgressEntry["state"] =
          match >= total ? "ready" : "active";
        if (entry.progress === match && entry.state === newState) continue;
        next[quest.id] = { ...entry, progress: match, state: newState };
        if (newState === "ready") justReady.push(quest.id);
        changed = true;
      }
    }
    if (changed) {
      progressRef.current = next;
      setProgress(next);
    }
    return justReady;
  }, []);

  // deliver 퀘스트 전용 — NPC 대화에서 호출. 인벤토리 재료를 검사·소비하고
  // 상태를 active → ready 로 전환. 이후 호출자가 claim 으로 보상까지 마무리.
  // 인벤토리 접근은 호출자가 주입 (순환 의존 회피).
  const tryDeliver = useCallback(
    (
      id: string,
      materialCount: (m: MaterialId) => number,
      consumeMaterial: (m: MaterialId, n: number) => boolean,
    ): DeliverResult => {
      const quest = getQuestById(id);
      if (!quest) return { ok: false, reason: "not-found" };
      if (quest.target.kind !== "deliver") return { ok: false, reason: "not-deliver" };
      const cur = progressRef.current;
      const entry = cur[id] ?? defaultQuestEntry();
      if (entry.state !== "active") return { ok: false, reason: "not-active" };
      const need = quest.target.count;
      if (materialCount(quest.target.materialId) < need)
        return { ok: false, reason: "insufficient" };
      if (!consumeMaterial(quest.target.materialId, need))
        return { ok: false, reason: "insufficient" };
      const next: QuestProgressMap = {
        ...cur,
        [id]: { ...entry, state: "ready" },
      };
      progressRef.current = next;
      setProgress(next);
      return { ok: true };
    },
    [],
  );

  // 보상 수령 — 호출 측이 캐릭터 상태 갱신을 함께 처리.
  // 2026-05-19 EPIC #3-2 이후 primary 경로는 서버 라우트 (`/api/quests/claim`).
  // 이 함수는 readiness 확인 + 사람이 읽을 정보 제공만 하고 state 전환은 서버 응답의
  // replaceFromSaved 에 맡긴다. (이중 전환 방지.)
  const claim = useCallback((id: string): ClaimResult => {
    const quest = getQuestById(id);
    if (!quest) return { ok: false, reason: "not-found" };
    const cur = progressRef.current;
    const entry = cur[id] ?? defaultQuestEntry();
    if (entry.state !== "ready") return { ok: false, reason: "not-ready" };
    return { ok: true, quest };
  }, []);

  // 서버 권위 액션(`/api/quests/claim`) 의 응답으로 받은 quest-progress.v2 값을 통째 교체.
  // EPIC #3-2 패턴 — 클라 mutation 을 거치지 않고 서버 결과를 그대로 반영.
  const replaceFromSaved = useCallback((raw: unknown) => {
    const next = readInitial(raw);
    progressRef.current = next;
    setProgress(next);
  }, []);

  return {
    progress,
    hydrated: true,
    getEntry,
    accept,
    recordKill,
    recordTalk,
    recordVisit,
    recordCraft,
    checkEquip,
    tryDeliver,
    claim,
    replaceFromSaved,
  };
}
