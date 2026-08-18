"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle, X } from "@phosphor-icons/react";
import { DraftNumberInput } from "@/components/ui/DraftNumberInput";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import {
  V2_SKILLS,
  describeV2Skill,
  effectiveCombatPatternFromEquipped,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { STAT_LABELS, type StatKey } from "@/adventure/data/stats";
import {
  V2_COMBAT_PATTERN_MAX_PRESETS,
  V2_COMBAT_PATTERN_MAX_SUBCONDITIONS,
  V2_COMBAT_PRESET_NAME_MAXLEN,
  type V2CombatAction,
  type V2CombatBlock,
  type V2CombatCondition,
  type V2CombatPreset,
  type V2CombatRole,
  type V2PatternSelfResource,
  type V2PatternSelfStatus,
} from "@/adventure/v2/combat/combatPattern";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { useSystemMessageState } from "./RewardToastProvider";

// "전투 패턴"(갬빗) 에디터 — 우선순위 {조건→행동} 블록을 배열하면 전투에서 위에서부터 조건 맞는
// 스킬 후보를 검사한다. 운영에서는 procChance 실패 시 다음 후보로 넘어간다. 조건 어휘는 1:1
// 자동전투 기준(내HP/MP/버프·적HP/상태·턴).
// 행동은 학습한 스킬 사용(캐릭터>스킬 탭에서 학습). 저장 버튼은 없다 — 편집하면 짧은 디바운스
// 뒤 자동으로 POST /api/v2/me/combat-pattern 한다.

const STAT_KEYS: StatKey[] = ["str", "dex", "vit", "spd", "luk", "int"];

type CondKind = V2CombatCondition["kind"];
type SimpleCondKind = Exclude<CondKind, "all" | "any">;
type PatternChoiceOption<T extends string> = {
  value: T;
  label: string;
  group?: string;
  detail?: string;
};

const COND_KINDS: PatternChoiceOption<CondKind>[] = [
  { value: "always", label: "항상", group: "기본" },
  { value: "self_hp", label: "내 HP", group: "내 상태" },
  { value: "self_mp", label: "내 MP", group: "내 상태" },
  { value: "self_shield", label: "내 보호막", group: "내 상태" },
  { value: "self_buff", label: "내 능력치 버프", group: "내 상태" },
  { value: "self_buff_pct", label: "내 상태 효과", group: "내 상태" },
  { value: "self_resource", label: "내 전투 자원", group: "내 상태" },
  { value: "enemy_hp", label: "적 HP", group: "적 상태" },
  { value: "enemy_status", label: "적 상태", group: "적 상태" },
  { value: "enemy_debuff", label: "적 디버프", group: "적 상태" },
  { value: "turn", label: "내 공격 차례", group: "타이밍" },
  { value: "all", label: "모두 만족", group: "복합 조건" },
  { value: "any", label: "하나 만족", group: "복합 조건" },
];
const SIMPLE_COND_KINDS: PatternChoiceOption<SimpleCondKind>[] =
  COND_KINDS.filter((c): c is PatternChoiceOption<SimpleCondKind> =>
    c.value !== "all" && c.value !== "any",
  );

const ROLE_OPTIONS: { value: V2CombatRole; label: string }[] = [
  { value: "main_attack", label: "주 공격" },
  { value: "heal", label: "회복" },
  { value: "buff", label: "버프" },
  { value: "debuff", label: "디버프" },
];

const ABOVE_BELOW_OPTIONS = [
  { value: "below", label: "이하" },
  { value: "above", label: "이상" },
] as const;
const ACTIVE_OPTIONS = [
  { value: "n", label: "없을 때" },
  { value: "y", label: "있을 때" },
] as const;
type ShieldConditionMode = "inactive" | "active" | "atMost" | "atLeast";
const SHIELD_CONDITION_MODE_OPTIONS = [
  { value: "inactive", label: "없을 때" },
  { value: "active", label: "있을 때" },
  { value: "atMost", label: "이하" },
  { value: "atLeast", label: "이상" },
] as const;
const ACTION_KIND_OPTIONS = [
  { value: "role", label: "역할 사용" },
  { value: "skill", label: "특정 스킬" },
] as const;
const STAT_OPTIONS: PatternChoiceOption<StatKey>[] = STAT_KEYS.map((value) => ({
  value,
  label: STAT_LABELS[value],
}));
const SELF_STATUS_OPTIONS: PatternChoiceOption<V2PatternSelfStatus>[] = [
  { value: "evasion", label: "회피 증가" },
  { value: "crit", label: "치명타 확률 증가" },
  { value: "damageReduction", label: "받는 피해 감소" },
  { value: "reflectDamage", label: "반사 피해" },
  { value: "regen", label: "지속 회복" },
  { value: "guaranteedEvade", label: "확정 회피" },
  { value: "duelistDeclaration", label: "결투가 선언" },
  { value: "berserkerFinisher", label: "혈전 준비" },
  { value: "berserkerDeathOvercome", label: "사망 극복 공격 준비" },
];
const SELF_RESOURCE_OPTIONS: PatternChoiceOption<V2PatternSelfResource>[] = [
  { value: "impact", label: "충격" },
  { value: "ironWallReflect", label: "철벽 반사" },
  { value: "inscription", label: "각인 총합" },
];
const SELF_RESOURCE_OP_OPTIONS = [
  { value: "none", label: "없을 때" },
  { value: "atLeast", label: "이상" },
  { value: "atMost", label: "이하" },
] as const;
const ENEMY_STATUS_OPTIONS = [
  { value: "bleed", label: "출혈" },
  { value: "poison", label: "중독" },
  { value: "vuln", label: "마법취약" },
] as const;
const ENEMY_STATUS_OP_OPTIONS = [
  { value: "atLeast", label: "스택 이상" },
  { value: "atMost", label: "스택 이하" },
  { value: "none", label: "없을 때" },
] as const;
export const ENEMY_DEBUFF_OPTIONS = [
  { value: "vulnerability", label: "받는 피해 증가(취약)" },
  { value: "damageDown", label: "주는 피해 감소" },
  { value: "skillProcDown", label: "스킬 발동률 감소" },
  { value: "healReduction", label: "회복 효과 감소" },
] as const;
const TURN_OP_OPTIONS = [
  { value: "atMost", label: "이하" },
  { value: "atLeast", label: "이상" },
  { value: "every", label: "매 배수" },
] as const;

export function filterPatternChoiceOptions<T extends string>(
  options: readonly PatternChoiceOption<T>[],
  queryRaw: string,
): PatternChoiceOption<T>[] {
  const query = queryRaw.trim().toLocaleLowerCase();
  if (!query) return [...options];
  return options.filter((option) =>
    `${option.label} ${option.group ?? ""} ${option.detail ?? ""}`
      .toLocaleLowerCase()
      .includes(query),
  );
}

export function PatternChoicePicker<T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder = "선택하세요",
  searchable = options.length >= 6,
  disabled = false,
  className = "",
}: {
  value: T;
  options: readonly PatternChoiceOption<T>[];
  onChange: (value: T) => void;
  label: string;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const selected = options.find((option) => option.value === value);
  const visibleOptions = filterPatternChoiceOptions(options, query);
  const groupedOptions = visibleOptions.reduce<
    Array<{ group: string; options: PatternChoiceOption<T>[] }>
  >((groups, option) => {
    const group = option.group ?? "선택지";
    const previous = groups.at(-1);
    if (previous?.group === group) previous.options.push(option);
    else groups.push({ group, options: [option] });
    return groups;
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  const choose = (next: T) => {
    onChange(next);
    close();
  };

  const choiceList = (surface: "mobile" | "desktop") => (
    <>
      {searchable ? (
        <div className="sticky top-0 z-10 bg-white p-3 dark:bg-zinc-900">
          <label className="sr-only" htmlFor={`${titleId}-${surface}-search`}>
            {label} 검색
          </label>
          <input
            id={`${titleId}-${surface}-search`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${label} 검색`}
            className="h-11 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-indigo-400 dark:focus:ring-indigo-950"
          />
        </div>
      ) : null}
      <div className="space-y-3 px-3 pb-4" role="listbox" aria-label={label}>
        {groupedOptions.map((group) => (
          <div key={group.group} role="group" aria-label={group.group}>
            {(groupedOptions.length > 1 || group.group !== "선택지") && (
              <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                {group.group}
              </div>
            )}
            <div className="grid gap-1 sm:grid-cols-2">
              {group.options.map((option) => {
                const active = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => choose(option.value)}
                    className={`min-h-11 rounded-lg border px-3 py-2 text-left transition ${
                      active
                        ? "border-indigo-500 bg-indigo-50 text-indigo-800 dark:border-indigo-400 dark:bg-indigo-950 dark:text-indigo-200"
                        : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {option.label}
                      {active ? <span aria-hidden>✓</span> : null}
                    </span>
                    {option.detail ? (
                      <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                        {option.detail}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {visibleOptions.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-500">
            일치하는 선택지가 없습니다.
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-left text-sm font-medium text-zinc-800 shadow-sm transition hover:border-indigo-400 disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-indigo-500 dark:disabled:text-zinc-500"
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <span aria-hidden className="shrink-0 text-zinc-400">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-50 flex items-end bg-black/45 sm:hidden">
            <button
              type="button"
              aria-label={`${label} 선택 닫기`}
              onClick={close}
              className="absolute inset-0"
            />
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${titleId}-mobile`}
              className={`${SURFACE_CARD} relative z-10 max-h-[78dvh] w-full overflow-y-auto rounded-b-none p-0`}
            >
              <div className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
                <h3 id={`${titleId}-mobile`} className="font-semibold">
                  {label}
                </h3>
                <button
                  type="button"
                  onClick={close}
                  className="min-h-9 rounded-md px-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  닫기
                </button>
              </div>
              {choiceList("mobile")}
            </section>
          </div>
          <section
            role="dialog"
            aria-label={label}
            className={`${SURFACE_CARD} absolute left-0 top-full z-40 mt-1 hidden max-h-96 min-w-80 overflow-y-auto p-0 sm:block`}
          >
            {choiceList("desktop")}
          </section>
        </>
      ) : null}
    </div>
  );
}

export function PatternChoiceButtons<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly PatternChoiceOption<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`min-h-8 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "border-indigo-600 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-500 dark:text-zinc-950"
                : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type SkillPatternChoice = {
  value: string;
  unavailable?: boolean;
};

const SKILL_CATEGORY_LABEL = {
  attack: "공격",
  heal: "회복",
  buff: "버프",
  debuff: "디버프",
  passive: "패시브",
} as const;

export function SkillPatternChoiceList({
  choices,
  value,
  onSelect,
}: {
  choices: readonly SkillPatternChoice[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div role="listbox" aria-label="사용 가능한 스킬" className="space-y-2">
      {choices.map((choice) => {
        const skill = V2_SKILLS[choice.value as V2SkillId];
        if (!skill) return null;
        const active = choice.value === value;
        return (
          <button
            key={choice.value}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onSelect(choice.value)}
            className={`${active ? SURFACE_ACCENT : SURFACE_INSET} w-full p-3 text-left transition hover:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <strong className="text-sm text-zinc-900 dark:text-zinc-100">
                    {skill.name}
                  </strong>
                  <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {SKILL_CATEGORY_LABEL[skill.category]}
                  </span>
                  {choice.unavailable ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      미장착
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {skill.description}
                </span>
              </span>
              {active ? (
                <CheckCircle
                  size={20}
                  weight="fill"
                  aria-label="현재 선택"
                  className="shrink-0 text-indigo-600 dark:text-indigo-300"
                />
              ) : null}
            </span>
            <span className="mt-2 flex flex-wrap gap-1">
              {describeV2Skill(skill).map((detail) => (
                <span
                  key={detail}
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                >
                  {detail}
                </span>
              ))}
            </span>
            {choice.unavailable ? (
              <span className="mt-2 block text-[11px] font-medium text-amber-700 dark:text-amber-300">
                현재 장착되지 않아 전투에서는 발동하지 않습니다.
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function SkillPatternDialog({
  choices,
  value,
  onSelect,
  onClose,
}: {
  choices: readonly SkillPatternChoice[];
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(contentRef);

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-pattern-dialog-title"
        className={`${SURFACE_CARD} flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none sm:rounded-lg`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] dark:border-zinc-700 sm:pt-4">
          <div>
            <h2
              id="skill-pattern-dialog-title"
              className="font-semibold text-zinc-900 dark:text-zinc-100"
            >
              사용할 스킬 선택
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              장착한 액티브 스킬의 효과와 발동 정보를 비교한 뒤 선택하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="사용할 스킬 선택 닫기"
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <SkillPatternChoiceList
            choices={choices}
            value={value}
            onSelect={onSelect}
          />
        </div>
        <footer className="shrink-0 border-t border-zinc-200 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400 sm:pb-3">
          선택하면 이 패턴 블록에 즉시 반영되고 자동 저장됩니다.
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function SkillPatternPicker({
  value,
  choices,
  onChange,
  placeholder = "장착한 스킬 없음",
  disabled = false,
  className = "",
}: {
  value: string;
  choices: readonly SkillPatternChoice[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = V2_SKILLS[value as V2SkillId];
  const close = useCallback(() => setOpen(false), []);
  const choose = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div className={`min-w-0 ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex min-h-10 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left shadow-sm transition hover:border-indigo-400 disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-indigo-500 dark:disabled:text-zinc-500"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {selected?.name ?? placeholder}
          </span>
          {selected ? (
            <span className="mt-0.5 block truncate text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
              {describeV2Skill(selected).slice(0, 3).join(" · ")}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
          {selected ? "변경" : "선택"}
        </span>
      </button>
      {open ? (
        <SkillPatternDialog
          choices={choices}
          value={value}
          onSelect={choose}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

// kind 변경 시 기본 파라미터.
function defaultCondition(kind: CondKind): V2CombatCondition {
  switch (kind) {
    case "always":
      return { kind: "always" };
    case "all":
      return {
        kind: "all",
        conditions: [
          { kind: "self_hp", op: "below", pct: 50 },
          { kind: "self_shield", active: false },
        ],
      };
    case "any":
      return {
        kind: "any",
        conditions: [
          { kind: "self_hp", op: "below", pct: 30 },
          { kind: "self_mp", op: "below", pct: 20 },
        ],
      };
    case "self_hp":
      return { kind: "self_hp", op: "below", pct: 50 };
    case "self_mp":
      return { kind: "self_mp", op: "below", pct: 30 };
    case "self_shield":
      return { kind: "self_shield", active: false };
    case "self_buff":
      return { kind: "self_buff", stat: "str", active: false };
    case "self_buff_pct":
      return { kind: "self_buff_pct", target: "evasion", active: false };
    case "self_resource":
      return {
        kind: "self_resource",
        resource: "impact",
        op: "atLeast",
        value: 3,
      };
    case "enemy_hp":
      return { kind: "enemy_hp", op: "below", pct: 30 };
    case "enemy_status":
      return { kind: "enemy_status", tag: "bleed", op: "atLeast", stacks: 1 };
    case "enemy_debuff":
      return { kind: "enemy_debuff", target: "damageDown", active: false };
    case "turn":
      return { kind: "turn", op: "atMost", value: 1 };
  }
}

type StateShape = {
  ok?: boolean;
  skills?: {
    equipped?: string[];
    pattern?: { blocks?: V2CombatBlock[] } | null;
    presets?: V2CombatPreset[] | null;
  };
};

const num =
  "w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900";

function PatternNumberInput({
  value,
  min,
  max,
  onValueChange,
}: {
  value: number;
  min: number;
  max?: number;
  onValueChange: (value: number) => void;
}) {
  return (
    <DraftNumberInput
      min={min}
      max={max}
      className={num}
      value={value}
      onValueChange={onValueChange}
    />
  );
}

function actionSkillId(action: V2CombatAction): string | null {
  return action.kind === "skill" ? action.skillId : null;
}

export function V2CombatPatternView({
  onBack,
  embedded = false,
}: {
  onBack: () => void;
  // 스킬 허브(탭)에 끼워질 때 — 자체 헤더/페이지 컨테이너 생략(허브가 제공).
  embedded?: boolean;
}) {
  const [blocks, setBlocks] = useState<V2CombatBlock[]>([]);
  const [equipped, setEquipped] = useState<string[]>([]);
  const [presets, setPresets] = useState<V2CombatPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useSystemMessageState();
  // 자동 저장 상태 — idle(아직 편집 없음) → pending(편집됨, 디바운스 대기) → saving → saved/error.
  const [saveState, setSaveState] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v2/me/state");
        const j = (await res.json().catch(() => null)) as StateShape | null;
        const eq = j?.skills?.equipped ?? [];
        setEquipped(eq);
        setPresets(j?.skills?.presets ?? []);
        const saved = j?.skills?.pattern?.blocks;
        // 저장 패턴은 보존하되 그림자 도약 같은 필수 오프너는 엔진과 같은 규칙으로 첫 블록에 보완한다.
        setBlocks(
          effectiveCombatPatternFromEquipped(
            eq,
            saved ? { blocks: saved } : null,
          ).blocks,
        );
      } catch {}
      setLoading(false);
    })();
  }, []);

  const skillName = (id: string) => V2_SKILLS[id as V2SkillId]?.name ?? id;
  // 패시브 스킬은 캐스트 대상 아님(상시 효과) — 전투패턴 슬롯 후보에서 제외.
  const castableEquipped = equipped.filter(
    (id) => V2_SKILLS[id as V2SkillId]?.category !== "passive",
  );
  const roleCandidate = useCallback(
    (role: V2CombatRole): string | null => {
      for (const id of castableEquipped) {
        const def = V2_SKILLS[id as V2SkillId];
        if (!def) continue;
        if (role === "main_attack" && def.category === "attack") return id;
        if (role !== "main_attack" && def.category === role) return id;
      }
      return null;
    },
    [castableEquipped],
  );

  // 사용자가 패턴을 편집할 때마다 호출 — 자동 저장 디바운스를 깨운다(아래 useEffect 가 처리).
  const markEdited = useCallback(() => {
    setSaveState("pending");
    setMsg(null);
  }, [setMsg]);

  const update = useCallback(
    (i: number, next: Partial<V2CombatBlock>) => {
      setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...next } : b)));
      markEdited();
    },
    [markEdited],
  );
  const move = useCallback(
    (i: number, dir: -1 | 1) => {
      setBlocks((prev) => {
        const j = i + dir;
        if (j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      });
      markEdited();
    },
    [markEdited],
  );
  const remove = useCallback(
    (i: number) => {
      setBlocks((prev) => prev.filter((_, idx) => idx !== i));
      markEdited();
    },
    [markEdited],
  );
  const add = useCallback(() => {
    setBlocks((prev) => [
      ...prev,
      {
        condition: { kind: "always" },
        action: { kind: "role", role: "main_attack" },
      },
    ]);
    markEdited();
  }, [markEdited]);

  // 자동 저장 — 편집(markEdited→saveState="pending") 후 짧은 정적기 뒤 1회 POST.
  //   디바운스: 편집이 이어지면 blocks 가 바뀌어 이 effect 가 재실행되며 타이머를 리셋한다.
  //   서버 응답으로 blocks 를 덮어쓰지 않는다(저장 중 들어온 편집을 지우는 클로버 방지).
  useEffect(() => {
    if (loading) return; // 최초 로드 시 불러온 값으로는 저장하지 않음
    if (saveState !== "pending") return; // 편집으로 깨어났을 때만 저장
    const t = setTimeout(async () => {
      // 스킬 안 고른 빈 블록은 서버가 조용히 버린다(parseCombatPattern) → 데이터 손실. 저장을
      //   보류하고 경고만 — 사용자가 스킬을 고르거나 블록(✕)을 지우면 다시 깨어나 재시도한다.
      const emptyCount = blocks.filter((b) => b.action.kind === "skill" && !b.action.skillId).length;
      if (emptyCount > 0) {
        setSaveState("error");
        setMsg(`✗ 스킬을 안 고른 블록이 ${emptyCount}개 있습니다 — 스킬을 고르거나 블록(✕)을 지워주세요`);
        return;
      }
      setSaveState("saving");
      try {
        const res = await fetch("/api/v2/me/combat-pattern", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blocks }),
        });
        const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        // 저장 중 새 편집이 들어왔으면(saveState 가 다시 "pending") 그 상태를 보존 —
        //   다음 디바운스가 최신 편집을 마저 저장하도록 둔다.
        setSaveState((s) => (s === "saving" ? (j?.ok ? "saved" : "error") : s));
      } catch {
        setSaveState((s) => (s === "saving" ? "error" : s));
      }
    }, 700);
    return () => clearTimeout(t);
  }, [saveState, blocks, loading, setMsg]);

  // 프리셋 라이브러리 전체를 서버에 영속(항목 추가/삭제 후 호출). 성공 시 정규화된 결과로 동기화.
  const persistPresets = useCallback(
    async (next: V2CombatPreset[]): Promise<boolean> => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/combat-pattern/presets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ presets: next }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          presets?: V2CombatPreset[];
        } | null;
        if (j?.ok) {
          setPresets(j.presets ?? next);
          return true;
        }
        setMsg("✗ 프리셋 저장 실패");
        return false;
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [setMsg],
  );

  // 현재 편집 중인 블록을 이름 붙여 프리셋으로 저장(같은 이름 = 덮어쓰기).
  const savePreset = useCallback(async () => {
    const name = presetName.trim().slice(0, V2_COMBAT_PRESET_NAME_MAXLEN);
    if (!name) {
      setMsg("✗ 프리셋 이름을 입력하세요");
      return;
    }
    const exists = presets.some((p) => p.name === name);
    if (!exists && presets.length >= V2_COMBAT_PATTERN_MAX_PRESETS) {
      setMsg(`✗ 프리셋은 최대 ${V2_COMBAT_PATTERN_MAX_PRESETS}개`);
      return;
    }
    const entry: V2CombatPreset = { name, pattern: { blocks } };
    const next = exists
      ? presets.map((p) => (p.name === name ? entry : p))
      : [...presets, entry];
    if (await persistPresets(next)) {
      setPresetName("");
      setMsg(`✓ 프리셋 '${name}' 저장`);
    }
  }, [blocks, presetName, presets, persistPresets, setMsg]);

  // 프리셋 불러오기 = 그 블록을 에디터에 싣고 활성 패턴으로 즉시 적용(빠른 스왑).
  const loadPreset = useCallback(
    async (p: V2CombatPreset) => {
      const next = p.pattern.blocks ?? [];
      setBlocks(next);
      setBusy(true);
      // 프리셋 적용은 그 자체로 영속(POST)이므로 자동 저장 디바운스를 깨우지 않는다(saving 으로 고정).
      setSaveState("saving");
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/combat-pattern", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blocks: next }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          pattern?: { blocks?: V2CombatBlock[] };
        } | null;
        if (j?.ok) {
          if (j.pattern?.blocks) setBlocks(j.pattern.blocks);
          setSaveState("saved");
          setMsg(`✓ '${p.name}' 적용됨`);
        } else {
          setSaveState("error");
          setMsg("✗ 적용 실패");
        }
      } catch (err) {
        setSaveState("error");
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [setMsg],
  );

  const deletePreset = useCallback(
    async (name: string) => {
      const next = presets.filter((p) => p.name !== name);
      if (await persistPresets(next)) setMsg(`✓ 프리셋 '${name}' 삭제`);
    },
    [presets, persistPresets, setMsg],
  );

  const Wrapper = embedded ? "div" : "main";
  return (
    <Wrapper
      className={
        embedded
          ? "space-y-3"
          : "mx-auto max-w-[640px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100"
      }
    >
      {!embedded && <SubViewHeader title="스킬 패턴" onBack={onBack} />}
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        위에서부터 조건과 사용 가능 여부를 확인합니다. 스킬 발동률 판정에 실패하면 다음
        블록을 확인하고, 모두 실패하면 기본 공격을 사용합니다. 한 행동의 후보는 같은
        판정값을 공유하므로 같은 스킬을 중복 배치해도 발동률을 따로 다시 굴리지는 않습니다.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      ) : (
        <>
          <section className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                프리셋 ({presets.length}/{V2_COMBAT_PATTERN_MAX_PRESETS})
              </span>
              <span className="text-[11px] text-zinc-400">불러오면 바로 적용됩니다</span>
            </div>
            {presets.length === 0 ? (
              <p className="text-xs text-zinc-400">
                저장된 프리셋이 없습니다. 아래에서 현재 패턴을 이름 붙여 저장하면 빠르게 바꿔 끼울 수 있습니다.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <li
                    key={p.name}
                    className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white py-1 pl-2 pr-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <span className="max-w-[140px] truncate font-medium">{p.name}</span>
                    <button type="button" onClick={() => loadPreset(p)} disabled={busy}
                      className="rounded px-1.5 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40 dark:text-indigo-400 dark:hover:bg-indigo-950">불러오기</button>
                    <button type="button" onClick={() => deletePreset(p.name)} disabled={busy}
                      className="rounded px-1.5 text-rose-500 hover:bg-rose-100 disabled:opacity-40 dark:hover:bg-rose-950">✕</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={presetName}
                maxLength={V2_COMBAT_PRESET_NAME_MAXLEN}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="현재 패턴 이름 (예: 보스용)"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button type="button" onClick={savePreset} disabled={busy}
                className="shrink-0 rounded-md border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                프리셋으로 저장
              </button>
            </div>
          </section>

          {castableEquipped.length === 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              장착한 스킬이 없어 새 역할 블록은 전투에서 발동하지 않습니다.
              <br />
              <span className="text-amber-600/80 dark:text-amber-400/80">
                기존 특정 스킬 블록은 보존되며, 스킬을 다시 장착하면 그대로 발동합니다.
              </span>
            </div>
          )}

          <ul className="space-y-2">
            {blocks.map((b, i) => (
              <li
                key={i}
                className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    우선순위 {i + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                      className="rounded px-1.5 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-800">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}
                      className="rounded px-1.5 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-800">↓</button>
                    <button type="button" onClick={() => remove(i)}
                      className="rounded px-1.5 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950">✕</button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-8 text-zinc-500 dark:text-zinc-400">조건</span>
                  <PatternChoicePicker
                    value={b.condition.kind}
                    options={COND_KINDS}
                    label="행동 조건 선택"
                    className="w-40"
                    onChange={(kind) =>
                      update(i, { condition: defaultCondition(kind) })
                    }
                  />
                  <ConditionParams
                    condition={b.condition}
                    onChange={(condition) => update(i, { condition })}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-8 text-zinc-500 dark:text-zinc-400">행동</span>
                  <PatternChoiceButtons
                    value={b.action.kind}
                    options={ACTION_KIND_OPTIONS}
                    label="행동 방식"
                    onChange={(kind) => {
                      update(i, {
                        action:
                          kind === "role"
                            ? { kind: "role", role: "main_attack" }
                            : { kind: "skill", skillId: castableEquipped[0] ?? "" },
                      });
                    }}
                  />
                  {b.action.kind === "role" ? (
                    <PatternChoiceButtons
                      value={b.action.role}
                      options={ROLE_OPTIONS}
                      label="사용할 역할"
                      onChange={(role) =>
                        update(i, {
                          action: { kind: "role", role },
                        })
                      }
                    />
                  ) : (
                    <SkillPatternPicker
                      value={b.action.skillId}
                      choices={[
                        ...(b.action.skillId &&
                        !castableEquipped.includes(b.action.skillId)
                          ? [
                              {
                                value: b.action.skillId,
                                unavailable: true,
                              },
                            ]
                          : []),
                        ...castableEquipped.map((id) => ({
                          value: id,
                        })),
                      ]}
                      placeholder="장착한 스킬 없음"
                      disabled={
                        castableEquipped.length === 0 && !b.action.skillId
                      }
                      className="w-full sm:w-64"
                      onChange={(skillId) =>
                        update(i, { action: { kind: "skill", skillId } })
                      }
                    />
                  )}
                </div>

                {/* 선택 스킬 정보 칩(MP·피해·효과) — 무엇을 발동하는지 한눈에. */}
                {(() => {
                  const selectedSkillId =
                    b.action.kind === "skill" ? b.action.skillId : roleCandidate(b.action.role);
                  const def = selectedSkillId ? V2_SKILLS[selectedSkillId as V2SkillId] : undefined;
                  if (!def) return null;
                  return (
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-10">
                      {describeV2Skill(def).map((chip, ci) => (
                        <span key={ci}
                          className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {chip}
                        </span>
                      ))}
                    </div>
                  );
                })()}
                {b.action.kind === "role" && (
                  <p className="mt-1 pl-10 text-[11px] text-zinc-500 dark:text-zinc-400">
                    현재 장착 기준: {roleCandidate(b.action.role) ? skillName(roleCandidate(b.action.role)!) : "해당 역할 스킬 없음"}
                  </p>
                )}
                {/* 미장착 스킬 경고 — 저장돼도 전투에서 발동 안 함(평타 폴백). */}
                {actionSkillId(b.action) && !equipped.includes(actionSkillId(b.action)!) && (
                  <p className="mt-1 pl-10 text-[11px] text-amber-600 dark:text-amber-400">
                    미장착 스킬 — 이 블록은 전투에서 발동하지 않습니다
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={add}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
              + 블록 추가
            </button>
            {/* 저장 버튼 없음 — 편집하면 자동 저장된다. 아래는 그 상태 표시. */}
            <span
              role="status"
              className={`text-xs tabular-nums ${
                saveState === "saved"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : saveState === "error"
                    ? "text-rose-600 dark:text-rose-400"
                    : saveState === "pending" || saveState === "saving"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {saveState === "saved"
                ? "✓ 저장됨"
                : saveState === "error"
                  ? "✗ 저장 실패"
                  : saveState === "pending" || saveState === "saving"
                    ? "저장 중…"
                    : "변경하면 자동 저장됩니다"}
            </span>
          </div>

          {msg && (
            <StatusBanner
              role={msg.startsWith("✓") ? "status" : "alert"}
              tone={msg.startsWith("✓") ? "success" : "error"}
            >
              {msg}
            </StatusBanner>
          )}
        </>
      )}
    </Wrapper>
  );
}

// 조건 kind 별 파라미터 입력. 변경 시 같은 kind 유지하며 파라미터만 갱신.
export function ConditionParams({
  condition: c,
  onChange,
}: {
  condition: V2CombatCondition;
  onChange: (c: V2CombatCondition) => void;
}) {
  switch (c.kind) {
    case "always":
      return null;
    case "all":
    case "any":
      return (
        <CompoundConditionParams
          condition={c}
          onChange={onChange}
        />
      );
    case "self_hp":
    case "self_mp":
    case "enemy_hp":
      return (
        <>
          <PatternChoiceButtons
            value={c.op}
            options={ABOVE_BELOW_OPTIONS}
            label="수치 비교 방식"
            onChange={(op) => onChange({ ...c, op })}
          />
          <PatternNumberInput
            key={`${c.kind}-pct`}
            min={0}
            max={100}
            value={c.pct}
            onValueChange={(pct) => onChange({ ...c, pct })}
          />
          <span className="text-zinc-400">%</span>
        </>
      );
    case "self_shield": {
      const mode: ShieldConditionMode =
        "active" in c ? (c.active ? "active" : "inactive") : c.op;
      return (
        <>
          <PatternChoiceButtons
            value={mode}
            options={SHIELD_CONDITION_MODE_OPTIONS}
            label="보호막 비교 방식"
            onChange={(nextMode) => {
              if (nextMode === "inactive" || nextMode === "active") {
                onChange({
                  kind: "self_shield",
                  active: nextMode === "active",
                });
                return;
              }
              onChange({
                kind: "self_shield",
                op: nextMode,
                value: "active" in c ? 0 : c.value,
              });
            }}
          />
          {"active" in c ? null : (
            <PatternNumberInput
              key="self-shield-value"
              min={0}
              value={c.value}
              onValueChange={(value) => onChange({ ...c, value })}
            />
          )}
        </>
      );
    }
    case "self_buff":
      return (
        <>
          <PatternChoicePicker
            value={c.stat}
            options={STAT_OPTIONS}
            label="능력치 선택"
            className="w-28"
            onChange={(stat) => onChange({ ...c, stat })}
          />
          <PatternChoiceButtons
            value={c.active ? "y" : "n"}
            options={ACTIVE_OPTIONS}
            label="능력치 버프 상태"
            onChange={(active) => onChange({ ...c, active: active === "y" })}
          />
        </>
      );
    case "self_buff_pct":
      return (
        <>
          <PatternChoicePicker
            value={c.target}
            options={SELF_STATUS_OPTIONS}
            label="내 상태 효과 선택"
            className="w-48"
            onChange={(target) => onChange({ ...c, target })}
          />
          <PatternChoiceButtons
            value={c.active ? "y" : "n"}
            options={ACTIVE_OPTIONS}
            label="내 상태 효과 유무"
            onChange={(active) => onChange({ ...c, active: active === "y" })}
          />
        </>
      );
    case "self_resource":
      return (
        <>
          <PatternChoicePicker
            value={c.resource}
            options={SELF_RESOURCE_OPTIONS}
            label="내 전투 자원 선택"
            className="w-36"
            onChange={(resource) => onChange({ ...c, resource })}
          />
          <PatternChoiceButtons
            value={c.op}
            options={SELF_RESOURCE_OP_OPTIONS}
            label="전투 자원 비교 방식"
            onChange={(op) => onChange({ ...c, op })}
          />
          {c.op !== "none" && (
            <PatternNumberInput
              key="self-resource-value"
              min={0}
              max={c.resource === "inscription" ? 8 : 3}
              value={c.value}
              onValueChange={(value) => onChange({ ...c, value })}
            />
          )}
        </>
      );
    case "enemy_status":
      return (
        <>
          <PatternChoiceButtons
            value={c.tag}
            options={ENEMY_STATUS_OPTIONS}
            label="적 상태 종류"
            onChange={(tag) => onChange({ ...c, tag })}
          />
          <PatternChoiceButtons
            value={c.op}
            options={ENEMY_STATUS_OP_OPTIONS}
            label="적 상태 비교 방식"
            onChange={(op) => onChange({ ...c, op })}
          />
          {c.op !== "none" && (
            <PatternNumberInput
              key="enemy-status-stacks"
              min={c.op === "atLeast" ? 1 : 0}
              value={c.stacks}
              onValueChange={(stacks) => onChange({ ...c, stacks })}
            />
          )}
        </>
      );
    case "enemy_debuff":
      return (
        <>
          <PatternChoicePicker
            value={c.target}
            options={ENEMY_DEBUFF_OPTIONS}
            label="적 디버프 선택"
            className="w-52"
            onChange={(target) => onChange({ ...c, target })}
          />
          <PatternChoiceButtons
            value={c.active ? "y" : "n"}
            options={ACTIVE_OPTIONS}
            label="적 디버프 유무"
            onChange={(active) => onChange({ ...c, active: active === "y" })}
          />
        </>
      );
    case "turn":
      return (
        <>
          <PatternChoiceButtons
            value={c.op}
            options={TURN_OP_OPTIONS}
            label="공격 차례 비교 방식"
            onChange={(op) => onChange({ ...c, op })}
          />
          <PatternNumberInput
            key="turn-value"
            min={1}
            value={c.value}
            onValueChange={(value) => onChange({ ...c, value })}
          />
          <span className="text-zinc-400">회</span>
        </>
      );
  }
}

function CompoundConditionParams({
  condition: c,
  onChange,
}: {
  condition: Extract<V2CombatCondition, { kind: "all" | "any" }>;
  onChange: (c: V2CombatCondition) => void;
}) {
  const updateChild = (idx: number, child: V2CombatCondition) => {
    onChange({
      ...c,
      conditions: c.conditions.map((prev, i) => (i === idx ? child : prev)),
    });
  };
  const removeChild = (idx: number) => {
    const next = c.conditions.filter((_, i) => i !== idx);
    if (next.length > 0) onChange({ ...c, conditions: next });
  };
  const addChild = () => {
    if (c.conditions.length >= V2_COMBAT_PATTERN_MAX_SUBCONDITIONS) return;
    onChange({
      ...c,
      conditions: [...c.conditions, { kind: "self_hp", op: "below", pct: 50 }],
    });
  };

  return (
    <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
      {c.conditions.map((child, idx) => (
        <div
          key={idx}
          className="flex flex-wrap items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <span className="w-10 text-[11px] text-zinc-400">
            {c.kind === "all" ? "AND" : "OR"} {idx + 1}
          </span>
          <PatternChoicePicker
            value={child.kind === "all" || child.kind === "any" ? "always" : child.kind}
            options={SIMPLE_COND_KINDS}
            label={`하위 조건 ${idx + 1} 선택`}
            className="w-36"
            onChange={(kind) => updateChild(idx, defaultCondition(kind))}
          />
          <ConditionParams condition={child} onChange={(next) => updateChild(idx, next)} />
          {c.conditions.length > 1 && (
            <button
              type="button"
              onClick={() => removeChild(idx)}
              className="rounded px-1.5 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {c.conditions.length < V2_COMBAT_PATTERN_MAX_SUBCONDITIONS && (
        <button
          type="button"
          onClick={addChild}
          className="w-fit rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          + 하위 조건
        </button>
      )}
    </div>
  );
}
