import { V2LoadoutPanel } from "@/adventure/v2/V2LoadoutPanel";
import {
  V2_SKILLS,
  spCostOf,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";

const SKILL_IDS = [
  "v2_skill_strike",
  "v2_skill_recover",
  "v2c_warrior_warcry",
  "v2c_rogue_poison",
  "v2c_survivor_baitcraft",
  "v2c_farmer_seedselection",
  "v2c_cook_prepwork",
  "v2c_lumberjack_woodreading",
  "v2c_miner_veinreading",
  "v2c_healthtrainer_routine",
] as const satisfies readonly V2SkillId[];

const EQUIPPED = [
  "v2_skill_strike",
  "v2_skill_recover",
  "v2c_farmer_seedselection",
  "v2c_survivor_baitcraft",
] satisfies V2SkillId[];

export default function SkillLoadoutPreviewPage() {
  const library = SKILL_IDS.map((skillId, index) => {
    const skill = V2_SKILLS[skillId];
    return {
      skillId,
      name: skill.name,
      spCost: spCostOf(skill),
      equipped: EQUIPPED.includes(skillId as (typeof EQUIPPED)[number]),
      favorite: index === 0 || index === 5,
      category: skill.category,
    };
  });
  const spUsed = EQUIPPED.reduce(
    (sum, skillId) => sum + spCostOf(V2_SKILLS[skillId]),
    0,
  );

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <strong>DEV 미리보기</strong> — 로그인·DB 없이 전투/생활 탭 전환과
        장착·해제·즐겨찾기를 확인할 수 있습니다.
      </div>
      <V2LoadoutPanel
        previewMode
        loadout={{
          spBudget: 12,
          spUsed,
          equipped: [...EQUIPPED],
          library,
        }}
      />
    </main>
  );
}
