"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  V2_SKILLS,
  type V2SkillDefinition,
  type V2SkillId,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { v2SkillMpCost } from "@/adventure/battle/combatShared";
import type { V2Instructor } from "@/adventure/data/v2/v2SkillInstructors";

// 교관 NPC 모달 — 해당 스탯 스킬 카탈로그 (Tier 1 보유 표시 + Tier 2 학습 버튼).
// 학습 API 호출 + 낙관 업데이트.

const STAT_KOR: Record<string, string> = {
  str: "힘",
  dex: "민첩",
  vit: "활력",
  spd: "속도",
  luk: "행운",
  int: "지능",
};

export function V2InstructorModal({
  instructor,
  skills,
  gold,
  level,
  onClose,
  onLearned,
}: {
  instructor: V2Instructor;
  skills: V2SkillsState;
  gold: number;
  level: number;
  onClose: () => void;
  onLearned: (nextSkills: V2SkillsState, nextGold: number) => void;
}) {
  useEscapeKey(onClose);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  const [busyId, setBusyId] = useState<V2SkillId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 이 교관의 스킬 — stat 매칭 + tier 정렬.
  const skillsList = useMemo<V2SkillDefinition[]>(() => {
    return Object.values(V2_SKILLS)
      .filter((s) => !s.monsterOnly && s.stat === instructor.stat)
      .sort((a, b) => a.tier - b.tier);
  }, [instructor.stat]);

  async function handleLearn(def: V2SkillDefinition) {
    if (busyId) return;
    setBusyId(def.id);
    setError(null);
    try {
      const res = await fetch("/api/v2/me/skill-slots/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: def.id }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        skills?: V2SkillsState;
        gold?: number;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok || !json.skills || json.gold == null) {
        setError(json?.error ?? "학습 실패");
        return;
      }
      onLearned(json.skills, json.gold);
    } catch (e) {
      setError("네트워크 오류");
      console.error("[learn]", e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="instructor-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className="no-scrollbar max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="instructor-modal-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {instructor.name}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {instructor.greeting}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2 -mt-1 inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-3 space-y-2">
          {skillsList.map((s) => (
            <SkillRow
              key={s.id}
              def={s}
              owned={skills.learned.includes(s.id)}
              gold={gold}
              level={level}
              skills={skills}
              busy={busyId === s.id}
              onLearn={() => handleLearn(s)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function effectSummary(def: V2SkillDefinition): string {
  return def.effects
    .map((e) => {
      if (e.kind === "damage") {
        const flat = e.baseFlat ? ` + ${e.baseFlat}` : "";
        return `피해 ${def.stat.toUpperCase()}×${e.statCoef}${flat}`;
      }
      if (e.kind === "heal") {
        if (e.pctMaxHp) return `HP +${e.pctMaxHp}%`;
        if (e.flat) return `HP +${e.flat}`;
        return "HP 회복";
      }
      if (e.kind === "selfBuff") {
        return `${(STAT_KOR[e.stat] ?? e.stat).toUpperCase()} +${e.pct}% ${e.turns}턴`;
      }
      if (e.kind === "enemyDebuff") {
        return `적 ${(STAT_KOR[e.stat] ?? e.stat).toUpperCase()} −${e.pct}% ${e.turns}턴`;
      }
      // PR-8 — dot effect 표시.
      return `${e.label} ${e.dmgPerTurn}/턴 (${e.turns}턴)`;
    })
    .join(" · ");
}

function SkillRow({
  def,
  owned,
  gold,
  level,
  skills,
  busy,
  onLearn,
}: {
  def: V2SkillDefinition;
  owned: boolean;
  gold: number;
  level: number;
  skills: V2SkillsState;
  busy: boolean;
  onLearn: () => void;
}) {
  const learn = def.learn;
  const isStarter = !learn; // Tier 1 = 자동 보유, 학습 조건 없음

  // 학습 가능 검사 (클라이언트 미리보기) — 서버가 권위.
  const goldOk = !learn || gold >= learn.goldCost;
  const levelOk = !learn || learn.level == null || level >= learn.level;
  const prereqOk =
    !learn ||
    (learn.prereqSkillIds ?? []).every((p) => skills.learned.includes(p));
  // 스탯 체크는 서버에서만 (totalStats 클라 노출 시 추가 가능).
  const canLearnLocal = !owned && goldOk && levelOk && prereqOk;

  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{def.name}</span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              T{def.tier}
            </span>
            {owned && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                보유
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {def.description}
          </p>
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            MP {v2SkillMpCost(def)} · {effectSummary(def)}
          </div>
        </div>
        {!isStarter && !owned && (
          <button
            type="button"
            onClick={onLearn}
            disabled={busy || !canLearnLocal}
            className="shrink-0 rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "..." : `학습 ${learn!.goldCost}골드`}
          </button>
        )}
      </div>
      {learn && !owned && (
        <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
          {learn.level != null && (
            <div className={levelOk ? "" : "text-rose-600 dark:text-rose-400"}>
              레벨 {learn.level}+
            </div>
          )}
          {learn.stat && (
            <div>
              {(STAT_KOR[learn.stat.key] ?? learn.stat.key).toUpperCase()}{" "}
              {learn.stat.min}+
            </div>
          )}
          {(learn.prereqSkillIds ?? []).map((p) => (
            <div
              key={p}
              className={prereqOk ? "" : "text-rose-600 dark:text-rose-400"}
            >
              선행: {V2_SKILLS[p]?.name ?? p}
            </div>
          ))}
          <div className={goldOk ? "" : "text-rose-600 dark:text-rose-400"}>
            골드 {learn.goldCost} ({gold})
          </div>
        </div>
      )}
    </div>
  );
}
