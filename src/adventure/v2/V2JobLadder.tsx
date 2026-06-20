"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { V2_LEVEL_CAP } from "@/adventure/data/v2/coreLoopConfig";

// 직업 시스템 v2 전직 화면(cumLevel 점진 공개).
// 해금(cumLevel 조건 충족)된 직업만 한 목록에 나열한다 — 잠긴 직업은 숨김(조건 달성 시 등장).
// 기본/상위 구분 없이 한곳에. 스킬·패시브는 스킬 화면에서 학습·장착(여긴 직업명+해금조건만).

export type JobLadderEntry = {
  id: string;
  name: string;
  tier: number;
  // 해금 조건(공유용 표기). 예: "Lv 50 달성" / "견습 병사 누적 Lv 100".
  condition: string;
  // 직업 내장 스탯 보너스(현재 직업일 때 적용) 표기. 예: "활력 +12 · 힘 +6". 없으면 빈 문자열.
  bonus?: string;
};

type Pending = { id: string; name: string; current: boolean };

export function V2JobLadder({
  level,
  currentJobName,
  currentJobId,
  atLevelCap,
  jobs,
  onChanged,
}: {
  level: number;
  // 현재 직업 표시명 — 서버가 전체 카탈로그 기준으로 산출(필터된 목록과 무관, 모험가 폴백 포함).
  currentJobName: string;
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
      setMsg(
        pending.current
          ? `✓ ${pending.name} 재전직 완료. 레벨 1로 돌아왔어요`
          : `✓ ${pending.name}(으)로 전직 완료. 레벨 1로 돌아왔어요`,
      );
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
      {/* 현재 직업 + 전직 안내 */}
      <Card padding="md">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">현재 {currentJobName}</h2>
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
            : `Lv ${V2_LEVEL_CAP}에 도달하면 전직할 수 있어요. 누적 레벨을 쌓으면 새 직업이 해금됩니다.`}
        </p>
      </Card>

      {/* 전직 가능 직업 — 해금된 것만 한 목록(기본/상위 구분 없음). 잠긴 직업은 숨김. */}
      <Card padding="md" className="space-y-2">
        <h3 className="text-sm font-semibold">전직 가능 직업</h3>
        {jobs.length > 0 ? (
          <ul className="space-y-1.5">
            {jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                isCurrent={job.id === currentJobId}
                atLevelCap={atLevelCap}
                onPick={() =>
                  setPending({
                    id: job.id,
                    name: job.name,
                    current: job.id === currentJobId,
                  })
                }
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            아직 전직 가능한 직업이 없어요. 누적 레벨을 더 쌓아 보세요.
          </p>
        )}
      </Card>

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
              {pending.current
                ? `${pending.name} 재전직`
                : `${pending.name}(으)로 전직`}
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {pending.current
                ? "같은 직업으로 재전직해요. 레벨이 1로 돌아가고 스탯이 다시 자라기 시작하지만, 누적 성장(한계치)은 그대로 유지됩니다."
                : "전직하면 레벨이 1로 돌아가고 스탯이 다시 자라기 시작해요. 누적 성장(한계치)은 그대로 유지됩니다."}
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
                {busy
                  ? pending.current
                    ? "재전직 중…"
                    : "전직 중…"
                  : pending.current
                    ? "재전직 (Lv 1로 초기화)"
                    : "전직 (Lv 1로 초기화)"}
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
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{job.name}</span>
          {isCurrent && (
            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              현재 직업
            </span>
          )}
        </div>
        {job.bonus && (
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            직업 보너스 · {job.bonus}
          </span>
        )}
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          해금 조건 · {job.condition}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* 현재 직업도 동일 직업 재전직(레벨1 리셋·누적 성장 유지) 허용 — 환생 루프. */}
        <button
          type="button"
          onClick={onPick}
          disabled={!atLevelCap}
          className="rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400 disabled:hover:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-950 dark:disabled:border-zinc-700 dark:disabled:text-zinc-600"
        >
          {isCurrent ? "재전직" : "전직"}
        </button>
      </div>
    </li>
  );
}
