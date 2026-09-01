"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchGameState } from "./fetchGameState";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { V2_SKILLS, type V2SkillId } from "@/adventure/data/v2/v2Skills";
import {
  SKILL_RITUAL_MAX_LEVEL,
  nextSkillRitualStep,
  skillRitualFocusBonusPct,
  skillRitualPowerBonusPct,
  skillRitualRefund,
  type SkillRitualMode,
} from "@/adventure/data/v2/skillRitual";
import { SkillEffectChips } from "./SkillEffectChips";
import {
  V2LoadoutPanel,
  type V2LoadoutData,
  type V2LoadoutSkill,
} from "./V2LoadoutPanel";
import { V2LoadoutPresetsPanel } from "./V2LoadoutPresetsPanel";
import {
  diffLoadoutStats,
  loadoutStatSnapshot,
  LoadoutStatResponsiveLayout,
  type LoadoutStatDelta,
  type LoadoutStatSnapshot,
  type LoadoutStatSource,
} from "./LoadoutStatSummary";
import {
  useGameState,
  type GameResourcePatch,
} from "./GameStateProvider";
import { useSystemMessageState } from "./RewardToastProvider";

// v2 학습 — 숙달 포인트로 직업 스킬을 습득하고 SP 로드아웃을 구성한다.
// 캐릭터 탭 "스킬" 항목(/character/skills). 옛 "훈련장"(마을 탭) 대체 — 대련(허수아비)은
// 전투 탭(/battle/sparring)으로 분리.

type ElementalRow = {
  skillId: string;
  name: string;
  cost: number;
  spCost: number;
  learned: boolean;
  ritualMode?: SkillRitualMode | null;
  ritualLevel?: number;
  ritualBonusPct?: number;
  ritualPowerBonusPct?: number;
  ritualFocusBonusPct?: number;
  ritualPowerEligible?: boolean;
  ritualFocusEligible?: boolean;
  ritualEligible?: boolean;
  ritualRefund?: {
    gold: number;
    proficiency: number;
  };
};

type StateShape = LoadoutStatSource & {
  ok?: boolean;
  jobsV2?: { currentJobId?: string } | null;
  elementalSkills?: ElementalRow[];
  proficiency?: { current?: { points: number } };
  loadout?: V2LoadoutData; // 코어루프 flag-on 만 존재(SP 로드아웃).
};

export function nextLoadoutStatFeedback(
  previous: LoadoutStatSnapshot | null,
  source: LoadoutStatSource,
  compare: boolean,
): {
  current: LoadoutStatSnapshot | null;
  delta: LoadoutStatDelta | null;
} {
  const current = loadoutStatSnapshot(source);
  if (!current) return { current: previous, delta: null };
  return {
    current,
    delta: compare && previous ? diffLoadoutStats(previous, current) : null,
  };
}

export async function refreshLoadoutViews(
  refreshLoadout: () => Promise<void>,
  refreshGameState: () => Promise<void>,
): Promise<void> {
  await Promise.all([refreshLoadout(), refreshGameState()]);
}

function skillName(id: string): string {
  return V2_SKILLS[id as V2SkillId]?.name ?? id;
}
function skillDesc(id: string): string {
  return V2_SKILLS[id as V2SkillId]?.description ?? "";
}
function goldLabel(value: number): string {
  return `${value.toLocaleString()}G`;
}
export function skillRitualCostLabel(cost: {
  goldCost: number;
  proficiencyCost: number;
}): string {
  return `비용 ${goldLabel(cost.goldCost)} · 숙달 ${cost.proficiencyCost.toLocaleString()}`;
}

export function skillRitualCurrencyPatch(result: {
  gold?: number;
  bankedGold?: number;
  points?: number;
}): Pick<GameResourcePatch, "gold" | "bankedGold"> {
  return {
    gold: typeof result.gold === "number" ? result.gold : undefined,
    bankedGold:
      typeof result.bankedGold === "number" ? result.bankedGold : undefined,
  };
}

export function SkillRitualPowerScopeHelp() {
  return (
    <div className={`${SURFACE_INSET} mt-3 space-y-2 p-3 text-[11px] leading-relaxed`}>
      <div>
        <strong className="text-emerald-700 dark:text-emerald-400">
          강화 적용
        </strong>{" "}
        <span className="text-zinc-600 dark:text-zinc-300">
          직접 피해, 즉시 회복, 보호막의 최종 수치
        </span>
      </div>
      <p className="text-zinc-500 dark:text-zinc-400">
        직접 피해에는 공격력·스탯·HP·스택·조건부 비례 피해가 모두 포함됩니다.
      </p>
      <div>
        <strong className="text-zinc-700 dark:text-zinc-300">
          적용 제외
        </strong>{" "}
        <span className="text-zinc-500 dark:text-zinc-400">
          중독·출혈·화상 지속 피해, 지속 회복, 버프·디버프, MP 회복, HP 소모량
        </span>
      </div>
    </div>
  );
}

function modeLabel(mode: SkillRitualMode): string {
  return mode === "focus" ? "집중 의식" : "위력 의식";
}
function modeBonusLabel(mode: SkillRitualMode, bonus: number): string {
  return mode === "focus" ? `발동확률 +${bonus}%p` : `위력 +${bonus}%`;
}
function ritualBonusFor(mode: SkillRitualMode, level: number): number {
  return mode === "focus"
    ? skillRitualFocusBonusPct(level)
    : skillRitualPowerBonusPct(level);
}

export function SkillRitualResetAction({
  skillName,
  mode,
  level,
  refund,
  busy,
  onConfirm,
}: {
  skillName: string;
  mode: SkillRitualMode;
  level: number;
  refund: { gold: number; proficiency: number };
  busy: boolean;
  onConfirm: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button
        variant="warning"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
      >
        {busy ? "초기화 중…" : "초기화"}
      </Button>
      {confirmOpen ? (
        <SkillRitualResetConfirmDialog
          skillName={skillName}
          mode={mode}
          level={level}
          refund={refund}
          busy={busy}
          onConfirm={onConfirm}
          onClose={() => setConfirmOpen(false)}
        />
      ) : null}
    </>
  );
}

export function SkillRitualResetConfirmDialog({
  skillName,
  mode,
  level,
  refund,
  busy,
  onConfirm,
  onClose,
}: {
  skillName: string;
  mode: SkillRitualMode;
  level: number;
  refund: { gold: number; proficiency: number };
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeIfIdle = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  useEscapeKey(closeIfIdle);
  useModalA11y(panelRef);

  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeIfIdle();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-ritual-reset-confirm-title"
        aria-describedby="skill-ritual-reset-confirm-description"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-md p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl`}
      >
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
          스킬 강화 초기화 확인
        </p>
        <h2
          id="skill-ritual-reset-confirm-title"
          className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100"
        >
          {skillName}의 강화 의식을 초기화할까요?
        </h2>
        <p
          id="skill-ritual-reset-confirm-description"
          className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300"
        >
          현재 적용된 강화 의식과 효과가 사라집니다.
        </p>

        <div className={`${SURFACE_INSET} mt-4 space-y-2 p-3 text-sm`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-500 dark:text-zinc-400">현재 강화</span>
            <strong>{modeLabel(mode)} +{level}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-500 dark:text-zinc-400">환급 골드</span>
            <strong className="tabular-nums">{goldLabel(refund.gold)}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-500 dark:text-zinc-400">환급 숙달</span>
            <strong className="tabular-nums">
              {refund.proficiency.toLocaleString()}
            </strong>
          </div>
        </div>

        <div className={`${SURFACE_ACCENT} mt-4 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200`}>
          누적 비용의 50%만 환급됩니다. 초기화는 되돌릴 수 없습니다.
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" disabled={busy} onClick={closeIfIdle}>
            취소
          </Button>
          <Button
            size="md"
            variant="danger"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "초기화 중…" : "강화 초기화 확정"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SkillLearningCostSummary({
  learnCost,
  spCost,
  learned,
}: {
  learnCost: number;
  spCost: number;
  learned: boolean;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-medium">
      {!learned && (
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          학습 숙달 {learnCost.toLocaleString("ko-KR")}
        </span>
      )}
      <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
        장착 SP {spCost.toLocaleString("ko-KR")}
      </span>
    </div>
  );
}

export function V2SkillLearnView({
  onBack,
  embedded = false,
  section = "all",
}: {
  onBack: () => void;
  // 스킬 허브(탭)에 끼워질 때 — 자체 헤더/페이지 컨테이너 생략(허브가 제공).
  embedded?: boolean;
  // 허브 탭 분리 — "learn"=학습, "loadout"=프리셋+장착, "enhance"=강화 의식, "all"=전부.
  section?: "all" | "learn" | "loadout" | "enhance";
}) {
  const { applyResourcePatch, refreshGameState } = useGameState();
  const [elementalSkills, setElementalSkills] = useState<ElementalRow[]>([]);
  const [loadout, setLoadout] = useState<V2LoadoutData | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | undefined>();
  const [usable, setUsable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useSystemMessageState();
  const [ritualTarget, setRitualTarget] = useState<V2LoadoutSkill | null>(null);
  const [ritualMode, setRitualMode] = useState<SkillRitualMode>("power");
  const [statFeedback, setStatFeedback] = useState<{
    current: LoadoutStatSnapshot | null;
    delta: LoadoutStatDelta | null;
  }>({ current: null, delta: null });
  const statSnapshotRef = useRef<LoadoutStatSnapshot | null>(null);
  const compareNextRefreshRef = useRef(false);

  // 마운트 1회 로드 — setState 동기 호출을 피하려 loading 초기값(true)에서 시작, 완료 시 해제.
  const refresh = useCallback(async () => {
    try {
      const res = await fetchGameState();
      const j = (await res.json().catch(() => null)) as StateShape | null;
      if (j?.ok) {
        setElementalSkills(j.elementalSkills ?? []);
        setLoadout(j.loadout ?? null);
        setCurrentJobId(j.jobsV2?.currentJobId);
        setUsable(j.proficiency?.current?.points ?? 0);
        const nextFeedback = nextLoadoutStatFeedback(
          statSnapshotRef.current,
          j,
          compareNextRefreshRef.current,
        );
        statSnapshotRef.current = nextFeedback.current;
        setStatFeedback(nextFeedback);
      }
    } catch {}
    compareNextRefreshRef.current = false;
    setLoading(false);
  }, []);

  const handleLoadoutChanged = useCallback(async () => {
    compareNextRefreshRef.current = true;
    await refreshLoadoutViews(refresh, refreshGameState);
  }, [refresh, refreshGameState]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 스킬/로드아웃 fetch
    refresh();
  }, [refresh]);

  const learn = useCallback(
    async (skillId: string, cost: number) => {
      setBusy(skillId);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/learn-skill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ skillId }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          points?: number;
          required?: number;
          have?: number;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "insufficient_proficiency"
              ? `숙달 포인트 부족 (필요 ${j.required ?? cost}, 보유 ${j.have ?? usable})`
              : j?.error === "no_class"
                ? "직업이 없어요 (먼저 직업을 선택하세요)"
                : j?.error === "not_in_chain"
                  ? "아직 배울 수 없는 스킬이에요"
                  : (j?.error ?? `http ${res.status}`);
          setMsg(`✗ ${label}`);
          return;
        }
        setMsg(`✓ ${skillName(skillId)} 학습 완료`);
        if (typeof j.points === "number") setUsable(j.points);
        setElementalSkills((prev) =>
          prev.map((s) => (s.skillId === skillId ? { ...s, learned: true } : s)),
        );
        // 새로 배운 스킬이 라이브러리/로드아웃에 반영되도록 상태 재동기화(코어루프 로드아웃 패널).
        refresh();
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [usable, refresh, setMsg],
  );

  const enhanceRows = useMemo(() => {
    const library = loadout?.library ?? [];
    if (library.length > 0) {
      return library.filter((s) => s.ritualEligible);
    }
    return elementalSkills
      .filter((s) => s.learned && s.ritualEligible)
      .map((s) => ({
        skillId: s.skillId,
        name: s.name,
        spCost: 0,
        equipped: false,
        ritualMode: s.ritualMode,
        ritualLevel: s.ritualLevel,
        ritualBonusPct: s.ritualBonusPct,
        ritualPowerBonusPct: s.ritualPowerBonusPct,
        ritualFocusBonusPct: s.ritualFocusBonusPct,
        ritualPowerEligible: s.ritualPowerEligible,
        ritualFocusEligible: s.ritualFocusEligible,
        ritualEligible: s.ritualEligible,
        ritualRefund: s.ritualRefund,
      }));
  }, [elementalSkills, loadout]);

  const openRitual = useCallback((skill: V2LoadoutSkill) => {
    const currentMode = skill.ritualMode ?? null;
    const firstMode: SkillRitualMode =
      currentMode ??
      (skill.ritualPowerEligible
        ? "power"
        : skill.ritualFocusEligible
          ? "focus"
          : "power");
    setRitualTarget(skill);
    setRitualMode(firstMode);
    setMsg(null);
  }, [setMsg]);

  const submitRitual = useCallback(
    async (skillId: string, mode: SkillRitualMode) => {
      setBusy(`ritual:${skillId}`);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/skill-ritual", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ skillId, mode }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          mode?: SkillRitualMode;
          level?: number;
          bonusPct?: number;
          powerBonusPct?: number;
          focusBonusPct?: number;
          points?: number;
          gold?: number;
          bankedGold?: number;
          required?: number;
          have?: number;
          goldCost?: number;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "insufficient_gold"
              ? `골드 부족 (필요 ${goldLabel(j.goldCost ?? 0)})`
              : j?.error === "insufficient_proficiency"
                ? `숙달 포인트 부족 (필요 ${j.required ?? 0}, 보유 ${j.have ?? usable})`
                : j?.error === "not_learned"
                    ? "배운 스킬만 강화할 수 있어요"
                    : j?.error === "not_eligible"
                      ? "강화 의식 대상이 아닌 스킬이에요"
                      : j?.error === "not_focus_eligible"
                        ? "발동 확률이 있는 스킬만 집중 의식을 진행할 수 있어요"
                        : j?.error === "mode_locked"
                          ? `${modeLabel(j.mode ?? "power")}을 초기화한 뒤 다른 의식을 선택할 수 있어요`
                          : j?.error === "max_level"
                            ? "이미 최대 단계예요"
                            : (j?.error ?? `http ${res.status}`);
          setMsg(`✗ ${label}`);
          return;
        }
        if (typeof j.points === "number") setUsable(j.points);
        applyResourcePatch(skillRitualCurrencyPatch(j));
        setRitualTarget(null);
        setMsg(
          `✓ ${skillName(skillId)} ${modeLabel(j.mode ?? mode)} +${j.level ?? 0} 완료 (${modeBonusLabel(j.mode ?? mode, j.bonusPct ?? 0)})`,
        );
        refresh();
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [applyResourcePatch, refresh, usable, setMsg],
  );

  const resetRitual = useCallback(
    async (skillId: string) => {
      setBusy(`ritual-reset:${skillId}`);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/skill-ritual", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ skillId, action: "reset" }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          points?: number;
          gold?: number;
          bankedGold?: number;
          refundedGold?: number;
          refundedProficiency?: number;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "not_enhanced"
              ? "초기화할 의식이 없어요"
              : j?.error === "not_learned"
                ? "배운 스킬만 초기화할 수 있어요"
                : (j?.error ?? `http ${res.status}`);
          setMsg(`✗ ${label}`);
          return;
        }
        if (typeof j.points === "number") setUsable(j.points);
        applyResourcePatch(skillRitualCurrencyPatch(j));
        setRitualTarget(null);
        setMsg(
          `✓ ${skillName(skillId)} 의식 초기화 완료 (${goldLabel(j.refundedGold ?? 0)} · 숙달 ${(j.refundedProficiency ?? 0).toLocaleString()} 환급)`,
        );
        refresh();
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [applyResourcePatch, refresh, setMsg],
  );

  const ritualSkill = ritualTarget
    ? V2_SKILLS[ritualTarget.skillId as V2SkillId]
    : null;
  const ritualLevel = Math.max(
    0,
    Math.floor(ritualTarget?.ritualLevel ?? 0),
  );
  const currentRitualMode = ritualTarget?.ritualMode ?? null;
  const modeLocked =
    currentRitualMode != null && currentRitualMode !== ritualMode;
  const selectedEligible =
    ritualMode === "focus"
      ? Boolean(ritualTarget?.ritualFocusEligible)
      : Boolean(ritualTarget?.ritualPowerEligible);
  const selectedCurrentLevel =
    currentRitualMode === ritualMode ? ritualLevel : 0;
  const selectedNext =
    modeLocked || !selectedEligible
      ? null
      : nextSkillRitualStep(selectedCurrentLevel);
  const currentBonus = ritualBonusFor(ritualMode, selectedCurrentLevel);
  const nextBonus = selectedNext
    ? ritualBonusFor(ritualMode, selectedNext.level)
    : currentBonus;
  const currentRefund =
    ritualTarget?.ritualRefund ?? skillRitualRefund(ritualLevel);
  const baseProcChance =
    typeof ritualSkill?.procChance === "number" ? ritualSkill.procChance : 100;
  const focusCurrentChance = Math.min(100, baseProcChance + currentBonus);
  const focusNextChance = Math.min(100, baseProcChance + nextBonus);
  const displayedNextDelta =
    ritualMode === "focus"
      ? focusNextChance - focusCurrentChance
      : nextBonus - currentBonus;

  const Wrapper = embedded ? "div" : "main";
  return (
    <Wrapper
      className={
        embedded
          ? "space-y-3"
          : "mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100"
      }
    >
      {!embedded && <SubViewHeader title="스킬" onBack={onBack} />}

      {section !== "learn" && section !== "enhance" && !loading && loadout &&
        (section === "loadout" ? (
          <LoadoutStatResponsiveLayout
            current={statFeedback.current}
            delta={statFeedback.delta}
          >
            <V2LoadoutPresetsPanel
              currentEquipped={loadout.equipped}
              spBudget={loadout.spBudget}
              library={loadout.library}
              onApplied={handleLoadoutChanged}
            />
            <V2LoadoutPanel
              loadout={loadout}
              currentJobId={currentJobId}
              onChanged={handleLoadoutChanged}
            />
          </LoadoutStatResponsiveLayout>
        ) : (
          <>
            <V2LoadoutPresetsPanel
              currentEquipped={loadout.equipped}
              spBudget={loadout.spBudget}
              library={loadout.library}
              onApplied={handleLoadoutChanged}
            />
            <V2LoadoutPanel
              loadout={loadout}
              currentJobId={currentJobId}
              onChanged={handleLoadoutChanged}
            />
          </>
        ))}

      {section !== "loadout" &&
        section !== "enhance" &&
        !loading &&
        elementalSkills.length > 0 && (
        <Card padding="md">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">학습</h2>
            <div className="flex gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                숙달 포인트{" "}
                <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
                  {usable}
                </strong>
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {loadout
              ? "학습한 스킬은 라이브러리에 영구 보관됩니다. 「스킬」 탭에서 스킬포인트 예산 안으로 장착하세요."
              : "학습한 스킬은 전투에서 자동 발동합니다. 발동 순서·조건은 스킬 패턴에서 설정하세요."}
          </p>
          <ul className="mt-3 space-y-1.5">
            {elementalSkills.map((s) => {
              const affordable = usable >= s.cost;
              return (
                <li
                  key={s.skillId}
                  className="ui-skill-card flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold">
                        {s.name}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {skillDesc(s.skillId)}
                    </p>
                    <SkillLearningCostSummary
                      learnCost={s.cost}
                      spCost={s.spCost}
                      learned={s.learned}
                    />
                    <SkillEffectChips skillId={s.skillId} />
                  </div>
                  {!s.learned ? (
                    <Button
                      onClick={() => learn(s.skillId, s.cost)}
                      disabled={busy != null || !affordable}
                      loading={busy === s.skillId}
                      loadingLabel={`${s.name} 학습 중`}
                      variant="success"
                      size="xs"
                      className="shrink-0"
                    >
                      학습
                    </Button>
                  ) : (
                    <span className="shrink-0 rounded-md border border-sky-500 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                      보유
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {(section === "enhance" || section === "all") && !loading && (
        <Card padding="md">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">강화 의식</h2>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              숙달 포인트{" "}
              <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
                {usable}
              </strong>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5">
            {enhanceRows.length === 0 ? (
              <li className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                강화 가능한 학습 스킬이 없습니다.
              </li>
            ) : (
              enhanceRows.map((s) => {
                const level = Math.max(0, Math.floor(s.ritualLevel ?? 0));
                const next = nextSkillRitualStep(level);
                const maxed = level >= SKILL_RITUAL_MAX_LEVEL || !next;
                const mode = s.ritualMode ?? null;
                const displayedBonus =
                  mode === "focus"
                    ? (s.ritualFocusBonusPct ?? s.ritualBonusPct ?? 0)
                    : mode === "power"
                      ? (s.ritualPowerBonusPct ?? s.ritualBonusPct ?? 0)
                      : 0;
                return (
                  <li
                    key={s.skillId}
                    className="ui-skill-card flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-semibold">
                          {s.name}
                        </span>
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          {mode
                            ? `${modeLabel(mode)} +${level} · ${modeBonusLabel(mode, displayedBonus)}`
                            : "미강화"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {maxed
                          ? "최대 단계"
                          : `확인창에서 의식 선택 · 다음 +${next.level}: ${goldLabel(next.goldCost)} · 숙달 ${next.proficiencyCost.toLocaleString()}`}
                      </p>
                      <SkillEffectChips skillId={s.skillId} />
                    </div>
                    <Button
                      onClick={() => openRitual(s)}
                      disabled={busy != null}
                      variant={maxed ? "secondary" : "success"}
                      size="xs"
                      className="shrink-0"
                    >
                      {busy === `ritual:${s.skillId}` ? "진행 중…" : "상세"}
                    </Button>
                  </li>
                );
              })
            )}
          </ul>
        </Card>
      )}

      {ritualTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && busy == null) {
              setRitualTarget(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="skill-ritual-title"
            className="w-full max-w-[560px] rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="skill-ritual-title"
                  className="truncate text-base font-semibold"
                >
                  {ritualTarget.name} 강화 의식
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {currentRitualMode
                    ? `${modeLabel(currentRitualMode)} +${ritualLevel} 적용 중`
                    : "아직 의식이 적용되지 않았습니다."}
                </p>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setRitualTarget(null)}
                disabled={busy != null}
              >
                닫기
              </Button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(["power", "focus"] as const).map((mode) => {
                const eligible =
                  mode === "focus"
                    ? Boolean(ritualTarget.ritualFocusEligible)
                    : Boolean(ritualTarget.ritualPowerEligible);
                const locked =
                  currentRitualMode != null && currentRitualMode !== mode;
                const active = ritualMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setRitualMode(mode)}
                    disabled={!eligible || locked || busy != null}
                    className={[
                      "rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      active
                        ? "border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-zinc-800"
                        : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800",
                    ].join(" ")}
                  >
                    <span className="block text-sm font-semibold">
                      {modeLabel(mode)}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                      {mode === "focus"
                        ? "발동 확률이 있는 스킬의 발동률을 올립니다."
                        : "직접 피해·즉시 회복·보호막의 최종 수치를 올립니다."}
                    </span>
                    <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-500">
                      {!eligible
                        ? "이 스킬은 해당 의식을 사용할 수 없습니다."
                        : locked
                          ? "초기화 후 선택 가능"
                          : "선택 가능"}
                    </span>
                  </button>
                );
              })}
            </div>

            {ritualMode === "power" && <SkillRitualPowerScopeHelp />}

            <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{modeLabel(ritualMode)}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {modeLocked
                    ? "다른 의식은 초기화 후 진행 가능"
                    : selectedNext
                      ? (
                          <>
                            +{selectedCurrentLevel} →{" "}
                            <strong className="text-emerald-700 dark:text-emerald-400">
                              +{selectedNext.level}
                            </strong>
                          </>
                        )
                      : "다음 단계 없음"}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-md bg-white px-3 py-2 dark:bg-zinc-900">
                  <div className="text-zinc-500 dark:text-zinc-400">현재</div>
                  <div className="mt-1 font-semibold">
                    {modeBonusLabel(ritualMode, currentBonus)}
                  </div>
                  {ritualMode === "focus" && (
                    <div className="mt-1 text-zinc-500 dark:text-zinc-400">
                      발동률 {baseProcChance}% → {focusCurrentChance}%
                    </div>
                  )}
                </div>
                <div
                  className={[
                    "rounded-md border px-3 py-2",
                    selectedNext
                      ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-zinc-950"
                      : "border-transparent bg-white dark:bg-zinc-900",
                  ].join(" ")}
                >
                  <div
                    className={
                      selectedNext
                        ? "font-medium text-emerald-700 dark:text-emerald-400"
                        : "text-zinc-500 dark:text-zinc-400"
                    }
                  >
                    다음
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-semibold">
                    <span
                      className={
                        selectedNext
                          ? "text-emerald-700 dark:text-emerald-400"
                          : undefined
                      }
                    >
                      {selectedNext
                        ? modeBonusLabel(ritualMode, nextBonus)
                        : "진행 불가"}
                    </span>
                    {selectedNext && displayedNextDelta > 0 && (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        ▲ +{displayedNextDelta}
                        {ritualMode === "focus" ? "%p" : "%"}
                      </span>
                    )}
                  </div>
                  {ritualMode === "focus" && selectedNext && (
                    <div className="mt-1 text-zinc-500 dark:text-zinc-400">
                      발동률 {baseProcChance}% →{" "}
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        {focusNextChance}%
                      </strong>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
                {selectedNext
                  ? skillRitualCostLabel(selectedNext)
                  : modeLocked
                    ? "현재 적용된 의식을 초기화해야 다른 방향을 선택할 수 있습니다."
                    : "최대 단계이거나 조건을 만족하지 않는 의식입니다."}
              </div>
            </div>

            {ritualLevel > 0 && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-zinc-950 dark:text-amber-200">
                초기화하면 현재 의식이 사라지고 누적 비용의 50%를 돌려받습니다. 환급:{" "}
                <strong>{goldLabel(currentRefund.gold)}</strong> · 숙달{" "}
                <strong>{currentRefund.proficiency.toLocaleString()}</strong>
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {ritualLevel > 0 && (
                <SkillRitualResetAction
                  skillName={ritualTarget.name}
                  mode={currentRitualMode ?? ritualMode}
                  level={ritualLevel}
                  refund={currentRefund}
                  busy={busy != null}
                  onConfirm={() => resetRitual(ritualTarget.skillId)}
                />
              )}
              <Button
                variant="success"
                size="sm"
                onClick={() => submitRitual(ritualTarget.skillId, ritualMode)}
                disabled={busy != null || !selectedNext}
              >
                {busy === `ritual:${ritualTarget.skillId}`
                  ? "진행 중…"
                  : selectedNext
                    ? `${modeLabel(ritualMode)} +${selectedNext.level} 진행`
                    : "진행 불가"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <StatusBanner tone={msg.startsWith("✓") ? "success" : "error"}>
          {msg}
        </StatusBanner>
      )}
    </Wrapper>
  );
}
