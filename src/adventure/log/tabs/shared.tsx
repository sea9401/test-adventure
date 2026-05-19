"use client";

import { MONSTERS, type MonsterSkill } from "@/adventure/data/monsters";
import { MATERIALS } from "@/adventure/data/materials";
import { ITEMS } from "@/adventure/data/items";
import { getRecipeById } from "@/adventure/data/recipes";
import { SKILL_BOOKS } from "@/adventure/data/skillBooks";
import type { NpcRole } from "@/adventure/data/npcs";
import { getRevealStage, type MonsterRevealStage } from "@/adventure/log/thresholds";
import type { TitleCounterKey } from "@/adventure/data/titles";

export type TitleCounterValues = Partial<Record<TitleCounterKey, number>>;

export const ROLE_LABEL: Record<NpcRole, string> = {
  elder: "촌장",
  vendor: "상인",
  innkeeper: "여관 주인",
  quest: "의뢰인",
  lore: "마을 사람",
  stranger: "방문자",
  trainer: "교관",
};

// "오늘" / "어제" / "N일 전" / 한 달 넘으면 절대 날짜.
export function relativeTime(ts?: number): string {
  if (!ts) return "—";
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days < 1) return "오늘";
  if (days === 1) return "어제";
  if (days < 30) return `${days}일 전`;
  return new Date(ts).toLocaleDateString("ko-KR");
}

export function describeDrop(
  d: NonNullable<(typeof MONSTERS)[string]["drops"]>[number],
): string {
  if (d.kind === "material") {
    const name = MATERIALS[d.materialId]?.name ?? d.materialId;
    return d.amount && d.amount > 1 ? `${name} ×${d.amount}` : name;
  }
  if (d.kind === "gold") return `골드 +${d.amount}`;
  if (d.kind === "equip") return ITEMS[d.itemId]?.name ?? d.itemId;
  if (d.kind === "equip_one_of") return `장비 ${d.itemIds.length}종 중 1`;
  if (d.kind === "recipe") return getRecipeById(d.recipeId)?.name ?? d.recipeId;
  if (d.kind === "skill_book") return SKILL_BOOKS[d.bookId]?.name ?? d.bookId;
  // recipe_one_of
  return `${d.recipeIds.length}종 중 1`;
}

// 몬스터 스킬 효과 한 줄 — 도감 펼침에서 스킬명 옆 회색 부제로 노출.
// 전투 로그에 "[name]" 으로 찍히는 그 스킬의 메커니즘 요약.
export function describeMonsterSkill(s: MonsterSkill): string {
  switch (s.kind) {
    case "heavy_blow":
      return `${s.everyPhases}턴마다 강타 — 데미지 ×${s.multiplier}`;
    case "enrage":
      return `HP ${Math.round(s.hpFraction * 100)}% 이하에서 격노 — ATK +${s.atkBonus}`;
    case "brace":
      return `피격 데미지 -${s.damageReduction} (최소 1)`;
    case "pierce":
      return `이 적의 공격이 방어 -${s.armorPierce} 관통`;
  }
}

export function MonsterAvatarMini({
  name,
  encountered,
}: {
  name: string;
  encountered: boolean;
}) {
  const image = MONSTERS[name]?.image;
  if (!image) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-zinc-100 text-[10px] text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
        ?
      </span>
    );
  }
  return (
    <span className="inline-block h-5 w-5 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt={encountered ? name : ""}
        className={`h-full w-full object-cover ${encountered ? "" : "opacity-30 brightness-0"}`}
      />
    </span>
  );
}

// 몬스터 세부 정보 블록 — 처치 수에 따라 단계적으로 스탯/드랍 공개.
// 장소 탭의 몬스터 행 펼침 등에서 재사용. isBoss=true 일 때 보스 전용 낮은 임계(1/5/10) 적용.
export function MonsterStatBlock({
  name,
  kills,
  isBoss,
}: {
  name: string;
  kills: number;
  isBoss?: boolean;
}) {
  const monster = MONSTERS[name];
  const stage = getRevealStage(kills, isBoss ?? false);
  if (!monster) return null;
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <StatRow label="HP" value={monster.hp} unlocked={stage >= 2} />
        <StatRow label="EXP" value={monster.exp} unlocked={stage >= 4} />
        <StatRow label="ATK" value={monster.atk} unlocked={stage >= 3} />
        <StatRow label="DEF" value={monster.def} unlocked={stage >= 3} />
        <StatRow label="SPD" value={monster.spd} unlocked={stage >= 3} />
      </div>
      {monster.skill && stage >= 3 && (
        <div className="mt-2 border-t border-dashed border-zinc-200 pt-1 dark:border-zinc-700">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            스킬
          </div>
          <div className="mt-0.5 text-[11px]">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {monster.skill.name}
            </span>
            <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
              — {describeMonsterSkill(monster.skill)}
            </span>
          </div>
        </div>
      )}
      {monster.drops && monster.drops.length > 0 && stage >= 3 && (
        <div className="mt-2 border-t border-dashed border-zinc-200 pt-1 dark:border-zinc-700">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            드랍
          </div>
          <ul className="mt-0.5 space-y-0.5 text-[11px] text-zinc-700 dark:text-zinc-300">
            {monster.drops.map((d, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2">
                <span className="truncate">{describeDrop(d)}</span>
                <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                  {stage >= 4
                    ? `${(d.chance * 100).toFixed(d.chance < 0.01 ? 2 : 1)}%`
                    : "?"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function StatRow({
  label,
  value,
  unlocked,
}: {
  label: string;
  value: number;
  unlocked: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span
        className={`tabular-nums ${
          unlocked
            ? "text-zinc-900 dark:text-zinc-100"
            : "text-zinc-300 dark:text-zinc-700"
        }`}
      >
        {unlocked ? value : "?"}
      </span>
    </div>
  );
}

export { getRevealStage };
export type { MonsterRevealStage };
