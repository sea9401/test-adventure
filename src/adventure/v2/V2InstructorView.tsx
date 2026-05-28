"use client";

import { useCallback, useEffect, useState } from "react";
import { GraduationCap } from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { V2_SKILL_INSTRUCTORS } from "@/adventure/data/v2/v2SkillInstructors";
import type { V2Instructor } from "@/adventure/data/v2/v2SkillInstructors";
import { V2InstructorModal } from "@/adventure/v2/V2InstructorModal";
import {
  parseV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";

// 마을 탭 안 교관 진입 화면. 6 NPC 카드. 클릭 시 모달.
// me/state 자체 fetch — V2GameFlow 가 skills/gold state 안 들고 있음.

const STAT_KOR: Record<string, string> = {
  str: "힘",
  dex: "민첩",
  vit: "활력",
  spd: "속도",
  luk: "행운",
  int: "지능",
};

type MeState = {
  skills: V2SkillsState;
  gold: number;
  level: number;
};

export function V2InstructorView({ onBack }: { onBack: () => void }) {
  const [me, setMe] = useState<MeState | null>(null);
  const [openInstructor, setOpenInstructor] = useState<V2Instructor | null>(
    null,
  );

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      if (!res.ok) return;
      const j = (await res.json().catch(() => null)) as {
        character?: { gold?: number; level?: number };
        skills?: unknown;
      } | null;
      if (!j) return;
      setMe({
        skills: parseV2SkillsState(j.skills),
        gold: typeof j.character?.gold === "number" ? j.character.gold : 0,
        level: typeof j.character?.level === "number" ? j.character.level : 1,
      });
    } catch {}
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 마을로
        </button>
        <div>
          <h1 className="text-lg font-bold">전직 교관</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            각 스탯의 교관에게 골드를 내고 스킬을 배운다.
          </p>
        </div>
      </header>

      <div className="space-y-2">
        {V2_SKILL_INSTRUCTORS.map((inst) => (
          <EntryCard
            key={inst.id}
            icon={
              <GraduationCap
                size={28}
                weight="duotone"
                className="text-sky-500"
              />
            }
            title={inst.name}
            description={`${STAT_KOR[inst.stat] ?? inst.stat} 계열 스킬 — "${inst.greeting.split(/[.\n]/)[0]}"`}
            onClick={() => setOpenInstructor(inst)}
          />
        ))}
      </div>

      {openInstructor && me && (
        <V2InstructorModal
          instructor={openInstructor}
          skills={me.skills}
          gold={me.gold}
          level={me.level}
          onClose={() => setOpenInstructor(null)}
          onLearned={(nextSkills, nextGold) => {
            setMe({ ...me, skills: nextSkills, gold: nextGold });
          }}
        />
      )}
    </main>
  );
}
