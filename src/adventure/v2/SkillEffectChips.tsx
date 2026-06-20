"use client";

import {
  V2_SKILLS,
  describeV2Skill,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { v2SkillMpCost } from "@/adventure/v2/combat/combatShared";

// 스킬 효과 칩 — 피해/회복/버프/디버프/DoT (패시브면 "지능 +10%" 등) + MP·쿨다운·속성.
//   학습 화면과 로드아웃 화면이 같은 표기를 공유한다. id 미존재/무효과면 아무것도 렌더하지 않음.
export function SkillEffectChips({ skillId }: { skillId: string }) {
  const def = V2_SKILLS[skillId as V2SkillId];
  if (!def) return null;
  // 실효 MP — 시그니처 차수별 자동 산정은 은퇴(v2SkillMpCost = def.mpCost 리터럴 그대로 반환).
  const chips = describeV2Skill(def, v2SkillMpCost(def));
  if (chips.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
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
