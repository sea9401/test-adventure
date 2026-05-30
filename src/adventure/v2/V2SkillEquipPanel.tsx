"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ArrowUp, ArrowDown, Plus, X } from "@phosphor-icons/react";
import {
  V2_SKILLS,
  emptyV2SkillsState,
  parseV2SkillsState,
  v2SkillSlotsForLevel,
  type V2SkillDefinition,
  type V2SkillId,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";

// 캐릭터 탭의 스킬 슬롯 패널 — 학습 스킬 + 슬롯 장착/해제/순서.
// equipped 배열 순서 = 자동 발동 우선순위 (PR-4 전투 런타임이 사용).
// me/state 자체 fetch — V2GameFlow 가 skills/level state 안 들고 있음.

const CATEGORY_KOR: Record<string, string> = {
  attack: "공격",
  heal: "회복",
  buff: "버프",
  debuff: "디버프",
};

export function V2SkillEquipPanel({ onBack }: { onBack: () => void }) {
  const [skills, setSkills] = useState<V2SkillsState>(() =>
    emptyV2SkillsState(),
  );
  const [level, setLevel] = useState(1);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      if (!res.ok) return;
      const j = (await res.json().catch(() => null)) as {
        character?: { level?: number };
        skills?: unknown;
      } | null;
      if (!j) return;
      setSkills(parseV2SkillsState(j.skills));
      if (typeof j.character?.level === "number") setLevel(j.character.level);
    } catch {}
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function onSkillsChanged(next: V2SkillsState) {
    setSkills(next);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotCount = v2SkillSlotsForLevel(level);
  const equippedSet = useMemo(
    () => new Set(skills.equipped),
    [skills.equipped],
  );
  const learnedDefs = useMemo<V2SkillDefinition[]>(() => {
    return skills.learned
      .map((id) => V2_SKILLS[id])
      .filter((d): d is V2SkillDefinition => !!d);
  }, [skills.learned]);

  async function postEquip(nextEquipped: V2SkillId[]) {
    if (busy) return;
    const prev = skills.equipped;
    setBusy(true);
    setError(null);
    // 낙관 업데이트
    onSkillsChanged({ learned: skills.learned, equipped: nextEquipped });
    try {
      const res = await fetch("/api/v2/me/skill-slots/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipped: nextEquipped }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        skills?: V2SkillsState;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !json.skills) {
        setError(json?.error ?? "장착 실패");
        onSkillsChanged({ learned: skills.learned, equipped: prev });
        return;
      }
      onSkillsChanged(json.skills);
    } catch (e) {
      setError("네트워크 오류");
      onSkillsChanged({ learned: skills.learned, equipped: prev });
      console.error("[equip]", e);
    } finally {
      setBusy(false);
    }
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    const next = [...skills.equipped];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    void postEquip(next);
  }
  function moveDown(index: number) {
    if (index >= skills.equipped.length - 1) return;
    const next = [...skills.equipped];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    void postEquip(next);
  }
  function unequip(index: number) {
    const next = skills.equipped.filter((_, i) => i !== index);
    void postEquip(next);
  }
  function equip(id: V2SkillId) {
    if (skills.equipped.length >= slotCount) {
      setError(`장착 슬롯이 가득 찼습니다 (최대 ${slotCount})`);
      return;
    }
    if (equippedSet.has(id)) return;
    void postEquip([...skills.equipped, id]);
  }

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 캐릭터로
        </button>
        <div>
          <h1 className="text-lg font-bold">스킬 슬롯</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            장착한 순서대로 전투에서 자동 발동을 시도합니다.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200">
          {error}
        </div>
      )}

      <Card padding="md">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            장착 슬롯 ({skills.equipped.length}/{slotCount})
          </span>
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: slotCount }).map((_, i) => {
            const id = skills.equipped[i];
            const def = id ? V2_SKILLS[id] : null;
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md border border-zinc-200 px-2 py-1.5 dark:border-zinc-800"
              >
                <span className="w-5 shrink-0 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  {i + 1}
                </span>
                {def ? (
                  <>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{def.name}</div>
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        {CATEGORY_KOR[def.category] ?? def.category} · MP{" "}
                        {def.mpCost} · CD {def.cooldown}턴
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => moveUp(i)}
                      disabled={busy || i === 0}
                      aria-label="위로"
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      <ArrowUp size={14} weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(i)}
                      disabled={busy || i === skills.equipped.length - 1}
                      aria-label="아래로"
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      <ArrowDown size={14} weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => unequip(i)}
                      disabled={busy}
                      aria-label="해제"
                      className="rounded p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-30 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      <X size={14} weight="bold" />
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-zinc-400 dark:text-zinc-600">
                    빈 슬롯
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card padding="md">
        <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          학습 스킬 ({learnedDefs.length})
        </div>
        <div className="space-y-1">
          {learnedDefs.map((def) => {
            const isEquipped = equippedSet.has(def.id);
            return (
              <div
                key={def.id}
                className="flex items-center gap-2 rounded-md border border-zinc-200 px-2 py-1.5 dark:border-zinc-800"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{def.name}</span>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      T{def.tier} · {CATEGORY_KOR[def.category] ?? def.category}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    MP {def.mpCost} · CD {def.cooldown}턴
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => equip(def.id)}
                  disabled={busy || isEquipped}
                  aria-label="장착"
                  className="rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-30"
                >
                  {isEquipped ? "장착됨" : (
                    <>
                      <Plus size={12} weight="bold" className="inline" /> 장착
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    </main>
  );
}
