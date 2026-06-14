"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import {
  JOB_GROUP_STAT_GATE,
  SPEC_STAT_GATE,
  V2_LEVEL_CAP,
  type StatGate,
} from "@/adventure/data/v2/coreLoopConfig";
import {
  V2_CLASS_DEFS,
  V2_SELECTABLE_CLASSES,
  type V2Class,
} from "@/adventure/data/v2/classes";
import { V2_JOB_SPECS } from "@/adventure/data/v2/v2JobSpecs";
import { V2_STAT_LABELS, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";

// 코어루프(V2_CORE_LOOP_V2) flag-on 직업 트리 + 재전직.
// 모험가(none) → 4직군(주스탯 게이트) → 12계파(복합 스탯 게이트). 해금은 효과 스탯(총합)으로
// 판정(서버 jobUnlock 과 동일). Lv50 도달 시 해금된 직군/계파로 재전직(레벨 1 리셋, cumLevel 보존).

type ReJobTarget = {
  targetClass: V2Class;
  targetSpec: string | null;
  label: string;
};

export function V2JobTree({
  currentClass,
  currentSpec,
  level,
  totalStats,
  unlockedGroups,
  unlockedSpecs,
  classDisplayName,
  onChanged,
}: {
  currentClass: V2Class;
  currentSpec: string | null;
  level: number;
  totalStats: Partial<Record<V2StatKey, number>>;
  unlockedGroups: string[];
  unlockedSpecs: string[];
  classDisplayName: string;
  onChanged: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<ReJobTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const atLevelCap = level >= V2_LEVEL_CAP;
  const unlockedGroupSet = new Set(unlockedGroups);
  const unlockedSpecSet = new Set(unlockedSpecs);

  async function confirmReJob() {
    if (!pending) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/advance-class", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetClass: pending.targetClass,
          ...(pending.targetSpec ? { targetSpec: pending.targetSpec } : {}),
        }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        required?: number;
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "level_too_low"
            ? `Lv${j.required ?? V2_LEVEL_CAP} 도달 후 재전직할 수 있어요`
            : j?.error === "job_locked"
              ? "아직 해금되지 않은 직군이에요"
              : j?.error === "spec_locked"
                ? "아직 해금되지 않은 계파예요"
                : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
        return;
      }
      setMsg(`✓ ${pending.label}(으)로 재전직 완료 — 레벨 1로 돌아왔어요`);
      setPending(null);
      await onChanged();
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* 현재 직업 + 재전직 안내 */}
      <Card padding="md">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            현재 {classDisplayName}
            {currentSpec && SPEC_STAT_GATE[currentSpec] && (
              <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                · {specName(currentSpec)}
              </span>
            )}
          </h2>
          <span
            className={`text-xs tabular-nums ${
              atLevelCap
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            Lv {level} / {V2_LEVEL_CAP}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {atLevelCap
            ? "해금된 직군이나 계파로 재전직할 수 있어요. 재전직하면 레벨이 1로 돌아가고 다시 성장합니다."
            : `Lv ${V2_LEVEL_CAP}에 도달하면 다른 직업으로 재전직할 수 있어요. 스탯을 키우면 새 직군과 계파가 해금됩니다.`}
        </p>
      </Card>

      {/* 4직군 × 3계파 트리 */}
      {V2_SELECTABLE_CLASSES.map((group) => {
        const groupUnlocked = unlockedGroupSet.has(group);
        const isCurrentGroup = currentClass === group;
        const specs = V2_JOB_SPECS[group] ?? [];
        return (
          <Card key={group} padding="md" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">
                  {V2_CLASS_DEFS[group].name}
                </h3>
                {isCurrentGroup && <CurrentBadge label="현재 직군" />}
                <GateReq gate={JOB_GROUP_STAT_GATE[group]} stats={totalStats} />
              </div>
              <ReJobButton
                unlocked={groupUnlocked}
                atLevelCap={atLevelCap}
                isCurrent={isCurrentGroup && !currentSpec}
                // 계파를 가진 캐릭이 직군 base 로 돌아가는 경우 — 계파 해제임을 명시.
                note={isCurrentGroup && currentSpec ? "계파 해제" : undefined}
                onClick={() =>
                  setPending({
                    targetClass: group,
                    targetSpec: null,
                    label: V2_CLASS_DEFS[group].name,
                  })
                }
              />
            </div>
            <ul className="space-y-1.5">
              {specs.map((spec) => {
                const specUnlocked =
                  groupUnlocked && unlockedSpecSet.has(spec.id);
                const isCurrentSpec = currentSpec === spec.id;
                return (
                  <li
                    key={spec.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                      specUnlocked
                        ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                        : "border-zinc-200 bg-zinc-50/40 opacity-70 dark:border-zinc-800 dark:bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-sm font-medium">{spec.name}</span>
                      {isCurrentSpec && <CurrentBadge label="현재 계파" />}
                      <GateReq
                        gate={SPEC_STAT_GATE[spec.id]}
                        stats={totalStats}
                      />
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {/* 계파 게이트는 충족했는데 부모 직군이 잠긴 경우 — 직군 요건을 안내(혼란 방지). */}
                      {!groupUnlocked && unlockedSpecSet.has(spec.id) && (
                        <GateReq
                          gate={JOB_GROUP_STAT_GATE[group]}
                          stats={totalStats}
                        />
                      )}
                      <ReJobButton
                        unlocked={specUnlocked}
                        atLevelCap={atLevelCap}
                        isCurrent={isCurrentSpec}
                        lockedLabel={
                          !groupUnlocked && unlockedSpecSet.has(spec.id)
                            ? "직군 미해금"
                            : "잠김"
                        }
                        onClick={() =>
                          setPending({
                            targetClass: group,
                            targetSpec: spec.id,
                            label: spec.name,
                          })
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

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

      {/* 재전직 확인 모달 — 레벨 1 리셋은 되돌릴 수 없어 명시 확인. */}
      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
              {pending.label}(으)로 재전직
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              재전직하면 레벨이 1로 돌아가고 스탯이 다시 자라기 시작해요. 누적
              성장(한계치)은 그대로 유지됩니다.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={busy}
                className="flex-1 rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmReJob}
                disabled={busy}
                className="flex-1 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "재전직 중…" : "재전직 (Lv 1로 초기화)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function specName(specId: string): string {
  for (const specs of Object.values(V2_JOB_SPECS)) {
    const found = specs.find((s) => s.id === specId);
    if (found) return found.name;
  }
  return specId;
}

function CurrentBadge({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
      {label}
    </span>
  );
}

// 게이트 요건 — 각 스탯 "현재/필요". 미충족은 rose, 충족은 zinc/emerald.
function GateReq({
  gate,
  stats,
}: {
  gate: StatGate;
  stats: Partial<Record<V2StatKey, number>>;
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums">
      {Object.entries(gate).map(([k, min]) => {
        const cur = stats[k as V2StatKey] ?? 0;
        const met = cur >= (min ?? 0);
        return (
          <span
            key={k}
            className={
              met
                ? "text-zinc-500 dark:text-zinc-400"
                : "font-medium text-rose-600 dark:text-rose-400"
            }
          >
            {V2_STAT_LABELS[k as V2StatKey]} {cur}/{min}
          </span>
        );
      })}
    </span>
  );
}

function ReJobButton({
  unlocked,
  atLevelCap,
  isCurrent,
  lockedLabel = "잠김",
  note,
  onClick,
}: {
  unlocked: boolean;
  atLevelCap: boolean;
  isCurrent: boolean;
  lockedLabel?: string;
  note?: string;
  onClick: () => void;
}) {
  if (isCurrent) return null;
  if (!unlocked) {
    return (
      <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-600">
        {lockedLabel}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {note && (
        <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
          {note}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={!atLevelCap}
        className="rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400 disabled:hover:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-950 dark:disabled:border-zinc-700 dark:disabled:text-zinc-600"
      >
        재전직
      </button>
    </span>
  );
}
