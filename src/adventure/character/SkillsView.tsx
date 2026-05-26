import { useState } from "react";
import { Sliders, Sparkle, Star } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabBar } from "@/components/ui/TabBar";
import { STAT_LABELS, type StatKey } from "@/adventure/data/stats";
import { statOfSkill } from "./skills";
import type { Skill } from "./types";
import {
  DEFAULT_AP_SKILL_CONDITION,
  formatAPSkillCondition,
  isAPSkillName,
  type APSkillCondition,
} from "@/adventure/character/apSkills";
import { APSkillConditionModal } from "./APSkillConditionModal";

// 미장착 스킬 목록의 탭 키 — "feat" 은 특기, "ap" 은 학습한 AP 스킬, 나머지는 STAT_LABELS.
// 순서: AP / 특기 / 힘 / 활력 / 민첩 / 속도 / 행운.
type SkillTabKey = "ap" | "feat" | StatKey;
const SKILL_TAB_ORDER: SkillTabKey[] = ["ap", "feat", "str", "vit", "dex", "spd", "luk", "int"];

// 보유 스킬을 슬롯으로 관리. 슬롯에 들어간 스킬만 전투에서 발동.
// 일반 슬롯(normalSlots, 3~5) + 특기 전용 슬롯(featSlots, 0~2).
// onEquip/onUnequip 등 미지정 시 읽기 전용.
export function SkillsView({
  skills,
  apSkills,
  equippedNames,
  normalSlots,
  feats,
  equippedFeats,
  featSlots,
  apSkillConditions,
  onEquip,
  onUnequip,
  onEquipFeat,
  onUnequipFeat,
  onSetAPSkillCondition,
}: {
  skills: Skill[];
  /** 학습한 AP 스킬 — 일반 슬롯에 stat 스킬과 같이 장착. 미지정/[] = 미보유. */
  apSkills?: Skill[];
  equippedNames: string[];
  normalSlots: number;
  feats: Skill[];
  /** 슬롯 인덱스 보존된 장착 특기 이름들 — 길이 = featSlots, 빈 슬롯은 null. */
  equippedFeats: (string | null)[];
  featSlots: number;
  /** AP 스킬 슬롯의 발동 조건 맵. 미지정/누락 = always. */
  apSkillConditions?: Partial<Record<string, APSkillCondition>>;
  onEquip?: (name: string) => void;
  onUnequip?: (name: string) => void;
  onEquipFeat?: (name: string) => void;
  onUnequipFeat?: (name: string) => void;
  /** AP 슬롯의 조건 저장 콜백. 미지정 = 조건 편집 UI 숨김. */
  onSetAPSkillCondition?: (name: string, condition: APSkillCondition) => void;
}) {
  // 조건 편집 모달 — 열려있을 때 skillName 보관, 닫히면 null.
  const [editingConditionFor, setEditingConditionFor] = useState<string | null>(
    null,
  );
  const apList = apSkills ?? [];
  if (skills.length === 0 && feats.length === 0 && apList.length === 0) {
    return (
      <EmptyState
        icon={<Sparkle size={40} weight="duotone" />}
        title="아직 익힌 스킬이 없습니다"
        message="모험을 통해 새로운 스킬을 배워보세요."
      />
    );
  }

  const equippedSet = new Set(equippedNames);
  const unequippedSkills = skills.filter((s) => !equippedSet.has(s.name));
  const unequippedAPSkills = apList.filter((s) => !equippedSet.has(s.name));
  // 장착 슬롯 lookup — stat skill 우선, 없으면 AP skill.
  const findSkillByName = (name: string): Skill | null =>
    skills.find((s) => s.name === name) ??
    apList.find((s) => s.name === name) ??
    null;
  const slots: (Skill | null)[] = [];
  for (let i = 0; i < normalSlots; i += 1) {
    const name = equippedNames[i];
    slots.push(name ? findSkillByName(name) : null);
  }
  const slotsFull = equippedNames.length >= normalSlots;
  const featSlotOpen = featSlots > 0;
  // null 슬롯은 Set 에서 제외해 unequippedFeats 필터가 정확하게.
  const equippedFeatSet = new Set(
    equippedFeats.filter((n): n is string => n != null),
  );
  const featSlotsResolved: (Skill | null)[] = [];
  for (let i = 0; i < featSlots; i += 1) {
    const name = equippedFeats[i];
    featSlotsResolved.push(name ? feats.find((f) => f.name === name) ?? null : null);
  }
  // null 슬롯은 "비어 있음" 으로 카운트 — equippedFeats.length 가 아닌 non-null 개수가 기준.
  const featSlotsFull = equippedFeatSet.size >= featSlots;
  const unequippedFeats = feats.filter((f) => !equippedFeatSet.has(f.name));

  return (
    <div className="space-y-3">
      <Card as="section" padding="md">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            장착 슬롯
          </h3>
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {equippedNames.length} / {normalSlots}
            {featSlotOpen && (
              <> · 특기 {equippedFeatSet.size} / {featSlots}</>
            )}
          </span>
        </div>
        <ul className="space-y-2">
          {slots.map((s, i) => {
            const isAP = !!s && isAPSkillName(s.name);
            const condition =
              s && isAP
                ? apSkillConditions?.[s.name] ?? DEFAULT_AP_SKILL_CONDITION
                : null;
            return (
              <SlotRow
                key={`n${i}`}
                skill={s}
                accent="amber"
                emptyLabel="빈 슬롯"
                onUnequip={s && onUnequip ? () => onUnequip(s.name) : undefined}
                apCondition={condition}
                onEditCondition={
                  s && isAP && onSetAPSkillCondition
                    ? () => setEditingConditionFor(s.name)
                    : undefined
                }
              />
            );
          })}
          {featSlotsResolved.map((skill, i) => (
            <SlotRow
              key={`feat${i}`}
              skill={skill}
              accent="violet"
              emptyLabel="특기 슬롯 (빈 칸)"
              icon={
                <Star
                  size={18}
                  weight="duotone"
                  className={`mt-0.5 shrink-0 ${
                    skill ? "text-violet-500" : "text-zinc-400 dark:text-zinc-600"
                  }`}
                />
              }
              onUnequip={
                skill && onUnequipFeat
                  ? () => onUnequipFeat(skill.name)
                  : undefined
              }
            />
          ))}
        </ul>
      </Card>

      {(unequippedSkills.length > 0 ||
        (featSlotOpen && unequippedFeats.length > 0) ||
        unequippedAPSkills.length > 0) && (
        <UnequippedSkillsTabs
          unequippedSkills={unequippedSkills}
          unequippedAPSkills={unequippedAPSkills}
          unequippedFeats={unequippedFeats}
          featSlotOpen={featSlotOpen}
          featSlots={featSlots}
          slotsFull={slotsFull}
          featSlotsFull={featSlotsFull}
          onEquip={onEquip}
          onEquipFeat={onEquipFeat}
        />
      )}
      {editingConditionFor && onSetAPSkillCondition && (
        <APSkillConditionModal
          skillName={editingConditionFor}
          initial={
            apSkillConditions?.[editingConditionFor] ??
            DEFAULT_AP_SKILL_CONDITION
          }
          onSave={(next) => onSetAPSkillCondition(editingConditionFor, next)}
          onClose={() => setEditingConditionFor(null)}
        />
      )}
    </div>
  );
}

// 미장착 스킬 + 특기를 하나의 카드 안 탭으로 묶어 보여준다. 탭 순서는 특기 → 힘 → 활력
// → 민첩 → 속도 → 행운. 특기 슬롯이 닫혀 있으면(featSlotOpen=false) 특기 탭은 숨김.
// 각 탭에 해당 카테고리의 개수를 라벨에 함께 표시.
function UnequippedSkillsTabs({
  unequippedSkills,
  unequippedAPSkills,
  unequippedFeats,
  featSlotOpen,
  featSlots,
  slotsFull,
  featSlotsFull,
  onEquip,
  onEquipFeat,
}: {
  unequippedSkills: Skill[];
  unequippedAPSkills: Skill[];
  unequippedFeats: Skill[];
  featSlotOpen: boolean;
  featSlots: number;
  slotsFull: boolean;
  featSlotsFull: boolean;
  onEquip?: (name: string) => void;
  onEquipFeat?: (name: string) => void;
}) {
  // 스탯별 버킷 — 한 번만 분류.
  const byStat: Record<StatKey, Skill[]> = {
    str: [],
    dex: [],
    vit: [],
    spd: [],
    luk: [],
    int: [],
  };
  for (const s of unequippedSkills) {
    const stat = statOfSkill(s.name);
    if (stat) byStat[stat].push(s);
  }

  const countOf = (key: SkillTabKey): number =>
    key === "feat"
      ? unequippedFeats.length
      : key === "ap"
        ? unequippedAPSkills.length
        : byStat[key].length;
  const labelOf = (key: SkillTabKey): string => {
    const base =
      key === "feat" ? "특기" : key === "ap" ? "AP" : STAT_LABELS[key];
    return `${base} ${countOf(key)}`;
  };

  // 특기 슬롯이 닫혀 있으면 특기 탭은 노출하지 않음.
  // AP 탭은 보유한 AP 스킬이 있을 때만 노출.
  const visibleTabs = SKILL_TAB_ORDER.filter((k) => {
    if (k === "feat") return featSlotOpen;
    if (k === "ap") return unequippedAPSkills.length > 0;
    return true;
  });
  const tabs = visibleTabs.map((key) => ({ key, label: labelOf(key) }));

  // 기본 활성 탭 = 노출 탭 중 항목이 있는 첫 탭 (없으면 첫 탭). 빈 탭으로 시작해서
  // 사용자가 빈 화면을 마주치지 않도록. 초기 마운트 시 한 번만 결정 — 이후 사용자
  // 선택을 그대로 따른다(useState 의 lazy initializer).
  const [active, setActive] = useState<SkillTabKey>(
    () => visibleTabs.find((k) => countOf(k) > 0) ?? visibleTabs[0],
  );

  return (
    <Card as="section" padding="md">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        보유 (미장착)
      </h3>
      <TabBar
        tabs={tabs}
        active={active}
        onChange={setActive}
        ariaLabel="미장착 스킬 카테고리"
        size="sm"
        scrollable
        className="mb-3"
      />
      {active === "feat" ? (
        unequippedFeats.length === 0 ? (
          <EmptyTabHint>
            장착할 수 있는 특기가 없습니다. 두 요구 스탯을 함께 올리면 새 특기가
            해금됩니다.
          </EmptyTabHint>
        ) : (
          <>
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              특기 슬롯 전용 — {featSlots}개까지 장착
            </p>
            <ul className="space-y-2">
              {unequippedFeats.map((f) => (
                <ListRow
                  key={f.name}
                  skill={f}
                  icon={
                    <Star
                      size={18}
                      weight="duotone"
                      className="mt-0.5 shrink-0 text-violet-400 dark:text-violet-500"
                    />
                  }
                  actionLabel="장착"
                  disabled={featSlotsFull}
                  onAction={
                    onEquipFeat ? () => onEquipFeat(f.name) : undefined
                  }
                />
              ))}
            </ul>
          </>
        )
      ) : active === "ap" ? (
        unequippedAPSkills.length === 0 ? (
          <EmptyTabHint>학습한 AP 스킬이 없습니다.</EmptyTabHint>
        ) : (
          <>
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              스킬북으로 학습한 AP 스킬 — 일반 슬롯에 장착하면 전투 중 AP 소비해 발동
            </p>
            <ul className="space-y-2">
              {unequippedAPSkills.map((s) => (
                <ListRow
                  key={s.name}
                  skill={s}
                  actionLabel="장착"
                  disabled={slotsFull}
                  onAction={onEquip ? () => onEquip(s.name) : undefined}
                />
              ))}
            </ul>
          </>
        )
      ) : byStat[active].length === 0 ? (
        <EmptyTabHint>{STAT_LABELS[active]} 계열 보유 스킬이 없습니다.</EmptyTabHint>
      ) : (
        <ul className="space-y-2">
          {byStat[active].map((s) => (
            <ListRow
              key={s.name}
              skill={s}
              actionLabel="장착"
              disabled={slotsFull}
              onAction={onEquip ? () => onEquip(s.name) : undefined}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function EmptyTabHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
      {children}
    </p>
  );
}


function SlotRow({
  skill,
  accent,
  emptyLabel,
  icon,
  onUnequip,
  apCondition,
  onEditCondition,
}: {
  skill: Skill | null;
  accent: "amber" | "violet";
  emptyLabel: string;
  icon?: React.ReactNode;
  onUnequip?: () => void;
  /** AP 스킬 슬롯이면 발동 조건 (always 포함). 비-AP 면 null. */
  apCondition?: APSkillCondition | null;
  /** AP 슬롯 조건 편집 시작. 미지정이면 pill 클릭 비활성. */
  onEditCondition?: () => void;
}) {
  const filled =
    accent === "violet"
      ? "border-violet-300 bg-violet-50/60 dark:border-violet-800/60 dark:bg-violet-900/10"
      : "border-amber-300 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-900/10";
  return (
    <li
      className={`flex items-start gap-2.5 rounded-md border px-3 py-2 ${
        skill
          ? filled
          : "border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40"
      }`}
    >
      {icon ?? (
        <Sparkle
          size={18}
          weight="duotone"
          className={`mt-0.5 shrink-0 ${
            skill ? "text-amber-500" : "text-zinc-400 dark:text-zinc-600"
          }`}
        />
      )}
      <div className="min-w-0 flex-1">
        {skill ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {skill.name}
              </span>
              {apCondition && onEditCondition && (
                <button
                  type="button"
                  onClick={onEditCondition}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
                  aria-label={`${skill.name} 발동 조건 편집`}
                >
                  <Sliders size={12} weight="bold" />
                  <span>
                    {apCondition.kind === "always"
                      ? "항상"
                      : formatAPSkillCondition(apCondition)}
                  </span>
                </button>
              )}
            </div>
            {skill.description && (
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {skill.description}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm italic text-zinc-400 dark:text-zinc-600">
            {emptyLabel}
          </div>
        )}
      </div>
      {skill && onUnequip && (
        <button
          type="button"
          onClick={onUnequip}
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          해제
        </button>
      )}
    </li>
  );
}

function ListRow({
  skill,
  icon,
  actionLabel,
  disabled,
  onAction,
}: {
  skill: Skill;
  icon?: React.ReactNode;
  actionLabel: string;
  disabled?: boolean;
  onAction?: () => void;
}) {
  return (
    <li className="flex items-start gap-2.5 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      {icon ?? (
        <Sparkle
          size={18}
          weight="duotone"
          className="mt-0.5 shrink-0 text-zinc-400 dark:text-zinc-600"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {skill.name}
        </div>
        {skill.description && (
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {skill.description}
          </div>
        )}
      </div>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {actionLabel}
        </button>
      )}
    </li>
  );
}
