"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { V2_LEVEL_CAP } from "@/adventure/data/v2/coreLoopConfig";
import { V2_STAT_LABELS, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";

// 직업 시스템 v2(V2_JOB_SYSTEM_V2) flag-on 전직 화면 — 점진 공개(progressive disclosure).
// 옛 4직군×3계파 스탯게이트 격자(V2JobTree) 대체. 해금된 직업만 actionable 카드로 보이고,
// 잠긴 상위 직업은 부모 cumLevel 힌트만 흐리게 노출. 해금 = 서버 jobsV2(카탈로그 cumLevel 게이트).

export type JobLadderEntry = {
  id: string;
  name: string;
  tier: number;
  jobBonus: Partial<Record<V2StatKey, number>>;
  unlocked: boolean;
  lockHint: { parentName: string; need: number; have: number } | null;
};

type Pending = { id: string; name: string };

export function V2JobLadder({
  level,
  classDisplayName,
  currentJobId,
  atLevelCap,
  jobs,
  onChanged,
}: {
  level: number;
  classDisplayName: string;
  currentJobId: string;
  atLevelCap: boolean;
  jobs: JobLadderEntry[];
  onChanged: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function confirmReJob() {
    if (!pending) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/advance-class", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetJobId: pending.id }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        required?: number;
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "level_too_low"
            ? `Lv${j.required ?? V2_LEVEL_CAP} 도달 후 전직할 수 있어요`
            : j?.error === "job_locked"
              ? "아직 해금되지 않은 직업이에요"
              : j?.error === "bad_target"
                ? "선택할 수 없는 직업이에요"
                : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
        return;
      }
      setMsg(`✓ ${pending.name}(으)로 전직 완료. 레벨 1로 돌아왔어요`);
      setPending(null);
      await onChanged();
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const baseJobs = jobs.filter((j) => j.tier === 1);
  const advJobs = jobs.filter((j) => j.tier === 2);
  // 점진 공개 — 잠긴 상위는 "한 단계 앞"만(힌트 있는 것) 흐리게. 그 외 잠김은 숨김.
  const advVisible = advJobs.filter((j) => j.unlocked || j.lockHint);
  // 현재 직업 이름 — 상위 직업이면 카탈로그 이름(jobs)에서, 모험가/없으면 서버 라벨 폴백.
  const currentName =
    jobs.find((j) => j.id === currentJobId)?.name ?? classDisplayName;

  return (
    <div className="space-y-3">
      {/* 현재 직업 + 전직 안내 */}
      <Card padding="md">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">현재 {currentName}</h2>
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
            ? "해금된 직업으로 전직할 수 있어요. 전직하면 레벨이 1로 돌아가고 다시 성장합니다."
            : `Lv ${V2_LEVEL_CAP}에 도달하면 전직할 수 있어요. 누적 레벨을 쌓으면 상위 직업이 해금됩니다.`}
        </p>
      </Card>

      {/* 기본 직업 */}
      <Card padding="md" className="space-y-2">
        <h3 className="text-sm font-semibold">기본 직업</h3>
        <ul className="space-y-1.5">
          {baseJobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              isCurrent={job.id === currentJobId}
              atLevelCap={atLevelCap}
              onPick={() => setPending({ id: job.id, name: job.name })}
            />
          ))}
        </ul>
      </Card>

      {/* 상위 직업 */}
      {advVisible.length > 0 && (
        <Card padding="md" className="space-y-2">
          <h3 className="text-sm font-semibold">상위 직업</h3>
          <ul className="space-y-1.5">
            {advVisible.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                isCurrent={job.id === currentJobId}
                atLevelCap={atLevelCap}
                onPick={() => setPending({ id: job.id, name: job.name })}
              />
            ))}
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

      {/* 전직 확인 모달 — 레벨 1 리셋은 되돌릴 수 없어 명시 확인. */}
      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
              {pending.name}(으)로 전직
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              전직하면 레벨이 1로 돌아가고 스탯이 다시 자라기 시작해요. 누적
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
                {busy ? "전직 중…" : "전직 (Lv 1로 초기화)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function JobRow({
  job,
  isCurrent,
  atLevelCap,
  onPick,
}: {
  job: JobLadderEntry;
  isCurrent: boolean;
  atLevelCap: boolean;
  onPick: () => void;
}) {
  const actionable = job.unlocked && !isCurrent;
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${
        job.unlocked
          ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
          : "border-zinc-200 bg-zinc-50/40 opacity-70 dark:border-zinc-800 dark:bg-zinc-900/40"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{job.name}</span>
          {isCurrent && (
            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              현재 직업
            </span>
          )}
        </div>
        <BonusChips bonus={job.jobBonus} />
        {!job.unlocked && job.lockHint && (
          <span className="text-[11px] tabular-nums text-rose-600 dark:text-rose-400">
            {job.lockHint.parentName} 누적 Lv {job.lockHint.have}/
            {job.lockHint.need}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isCurrent ? null : !job.unlocked ? (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
            잠김
          </span>
        ) : (
          <button
            type="button"
            onClick={onPick}
            disabled={!atLevelCap || !actionable}
            className="rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400 disabled:hover:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-950 dark:disabled:border-zinc-700 dark:disabled:text-zinc-600"
          >
            전직
          </button>
        )}
      </div>
    </li>
  );
}

// 직업 보너스 칩 — "힘 +25" 식. 플랫 스탯만(% 패시브 아님).
function BonusChips({ bonus }: { bonus: Partial<Record<V2StatKey, number>> }) {
  const entries = Object.entries(bonus) as [V2StatKey, number][];
  if (entries.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
      {entries.map(([k, v]) => (
        <span key={k}>
          {V2_STAT_LABELS[k]} +{v}
        </span>
      ))}
    </span>
  );
}
