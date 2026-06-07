"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  V2_SKILLS,
  describeV2Skill,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { v2SkillMpCost } from "@/adventure/v2/combat/combatShared";
import { V2SpecPanel, type V2SpecState } from "./V2SpecPanel";

// v2 학습 — 전문화 선택/패시브 픽(V2SpecPanel) + 숙달 포인트로 공용·전문화 스킬을 습득한다.
// 캐릭터 탭 "스킬" 항목(/character/skills). 옛 "훈련장"(마을 탭) 대체 — 대련(허수아비)은
// 전투 탭(/battle/sparring)으로 분리.

type ElementalRow = {
  skillId: string;
  name: string;
  cost: number;
  learned: boolean;
  equipped: boolean;
};

type StateShape = {
  ok?: boolean;
  elementalSkills?: ElementalRow[];
  skillSlots?: number;
  proficiency?: { current?: { points: number } };
  spec?: V2SpecState;
};

function skillName(id: string): string {
  return V2_SKILLS[id as V2SkillId]?.name ?? id;
}
function skillDesc(id: string): string {
  return V2_SKILLS[id as V2SkillId]?.description ?? "";
}

// 스킬 상세 옵션 칩 — 피해/회복/버프/디버프/DoT + MP·쿨다운·속성.
function SkillDetailChips({ skillId }: { skillId: string }) {
  const def = V2_SKILLS[skillId as V2SkillId];
  if (!def) return null;
  // 실효 MP — 시그니처는 카탈로그 0(센티넬), 엔진이 차수별 산정. 그 값을 표기.
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

export function V2SkillLearnView({
  onBack,
}: {
  onBack: () => void;
}) {
  const [specState, setSpecState] = useState<V2SpecState | null>(null);
  const [elementalSkills, setElementalSkills] = useState<ElementalRow[]>([]);
  const [usable, setUsable] = useState(0);
  const [slots, setSlots] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 마운트 1회 로드 — setState 동기 호출을 피하려 loading 초기값(true)에서 시작, 완료 시 해제.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      const j = (await res.json().catch(() => null)) as StateShape | null;
      if (j?.ok) {
        setSpecState(j.spec ?? null);
        setElementalSkills(j.elementalSkills ?? []);
        setUsable(j.proficiency?.current?.points ?? 0);
        setSlots(j.skillSlots ?? 0);
      }
    } catch {}
    setLoading(false);
  }, []);

  const equippedCount = elementalSkills.filter((s) => s.equipped).length;

  useEffect(() => {
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
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [usable],
  );

  const equipSkill = useCallback(
    async (skillId: string, equip: boolean) => {
      setBusy(skillId);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/equip-skill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ skillId, equip }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          equipped?: string[];
          slots?: number;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "slots_full"
              ? `장착 슬롯이 가득 찼어요 (${j.slots ?? slots}칸). 먼저 해제하세요`
              : j?.error === "not_learned"
                ? "먼저 학습해야 장착할 수 있어요"
                : (j?.error ?? `http ${res.status}`);
          setMsg(`✗ ${label}`);
          return;
        }
        setMsg(`✓ ${skillName(skillId)} ${equip ? "장착" : "해제"}`);
        const eqSet = new Set(j.equipped ?? []);
        setElementalSkills((prev) =>
          prev.map((s) => ({ ...s, equipped: eqSet.has(s.skillId) })),
        );
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [slots],
  );

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="스킬" onBack={onBack} />

      {specState && specState.specs.length > 0 && (
        <V2SpecPanel spec={specState} onChanged={refresh} />
      )}

      {!loading && elementalSkills.length > 0 && (
        <Card padding="md">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">스킬</h2>
            <div className="flex gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                숙달 포인트{" "}
                <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
                  {usable}
                </strong>
              </span>
              <span>
                장착{" "}
                <strong className="tabular-nums text-sky-600 dark:text-sky-400">
                  {equippedCount}/{slots}
                </strong>
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            장착한 스킬만 전투에서 자동 발동하며, 슬롯은 레벨에 비례해 늘어납니다.
          </p>
          <ul className="mt-3 space-y-1.5">
            {elementalSkills.map((s) => {
              const affordable = usable >= s.cost;
              return (
                <li
                  key={s.skillId}
                  className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
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
                    <SkillDetailChips skillId={s.skillId} />
                  </div>
                  {!s.learned ? (
                    <button
                      type="button"
                      onClick={() => learn(s.skillId, s.cost)}
                      disabled={busy != null || !affordable}
                      className="shrink-0 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === s.skillId ? "학습 중…" : `학습 (${s.cost})`}
                    </button>
                  ) : s.equipped ? (
                    <button
                      type="button"
                      onClick={() => equipSkill(s.skillId, false)}
                      disabled={busy != null}
                      className="shrink-0 rounded-md border border-sky-500 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-500/25 disabled:opacity-50 dark:text-sky-300"
                    >
                      {busy === s.skillId ? "…" : "장착 해제"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => equipSkill(s.skillId, true)}
                      disabled={busy != null || equippedCount >= slots}
                      className="shrink-0 rounded-md border border-zinc-400 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {busy === s.skillId ? "…" : "장착"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {msg && (
        <div
          className={`rounded-md border px-3 py-1.5 text-xs ${
            msg.startsWith("✓")
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
          }`}
        >
          {msg}
        </div>
      )}
    </main>
  );
}
