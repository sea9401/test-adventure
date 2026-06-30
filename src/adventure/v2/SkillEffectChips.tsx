"use client";

import {
  V2_SKILLS,
  describeV2Skill,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";

// 스킬 효과 칩 — 피해/회복/버프/디버프/DoT (패시브면 "지능 +10%" 등) + MP·쿨다운·속성.
//   학습 화면과 로드아웃 화면이 같은 표기를 공유한다. id 미존재/무효과면 아무것도 렌더하지 않음.
export function SkillEffectChips({ skillId }: { skillId: string }) {
  const def = V2_SKILLS[skillId as V2SkillId];
  if (!def) return null;
  // MP 는 고정 절대값 모델 → describeV2Skill 이 "MP 55" 칩으로 자족 표기(maxMp 주입 불필요).
  const chips = describeV2Skill(def);
  const kind = def.category === "passive" || def.passive ? "패시브" : "액티브";
  const kindClass =
    kind === "패시브"
      ? "bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300"
      : "bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300";
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      <span className={`rounded px-1.5 py-0.5 text-[10px] ${kindClass}`}>
        {kind}
      </span>
      {chips.map((c, i) => (
        <span
          key={i}
          className="rounded bg-zinc-200/70 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300"
        >
          {c}
        </span>
      ))}
    </div>
  );
}
