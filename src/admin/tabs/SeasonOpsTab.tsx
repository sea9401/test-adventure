"use client";

import { useState } from "react";
import { useAdmin } from "../AdminContext";
import { Button } from "../ui/Field";
import { DangerAction } from "../ui/DangerAction";

// 시즌 수동 트리거 — cron(주 1회)을 기다리지 않고 롤오버/보상 지급을 즉시 실행.
// 모든 op 는 cron 과 동일한 헬퍼라 멱등(중복 클릭/cron 과 겹쳐도 두 번 지급 안 됨).
type SeasonOp =
  | "war-rollover"
  | "pvp-rollover"
  | "pvp-rewards"
  | "fishing-rewards"
  | "treasure-rewards";

type OpDef = {
  op: SeasonOp;
  label: string;
  description: string;
  // danger=true 면 2단계 확인(상태 변경). false 면 멱등·안전이라 단일 버튼.
  danger: boolean;
  confirmText?: string;
};

const OPS: OpDef[] = [
  {
    op: "war-rollover",
    label: "전쟁 시즌 롤오버",
    description:
      "활성 쟁탈 거점의 점령을 중립으로 리셋합니다(점령 row 삭제). 시즌 점수 원장과 거점 금고는 건드리지 않습니다. 새 시즌 경계 이후 점령은 유지(경계-인식형). 멱등 — 중복 실행해도 안전.",
    danger: true,
    confirmText: "WAR ROLLOVER",
  },
  {
    op: "pvp-rollover",
    label: "아레나 시즌 롤오버",
    description:
      "만료된 아레나(PvP) 시즌을 닫고 이번 주 시즌을 생성합니다. 보상 지급은 별도(아래). 멱등.",
    danger: true,
    confirmText: "PVP ROLLOVER",
  },
  {
    op: "pvp-rewards",
    label: "아레나 시즌 보상 지급",
    description:
      "닫힌 아레나 시즌 중 아직 보상 미지급인 것에 순위별 투기장 코인을 지급합니다. rewardsGrantedAt 으로 시즌당 1회 멱등 — 중복 클릭/cron 과 겹쳐도 두 번 지급되지 않습니다.",
    danger: false,
  },
  {
    op: "fishing-rewards",
    label: "낚시 시즌 보상 지급",
    description:
      "끝난 낚시 시즌 중 미지급 보상을 종별 순위 코인으로 지급합니다. 시즌당 1회 멱등.",
    danger: false,
  },
  {
    op: "treasure-rewards",
    label: "보물 시즌 보상 지급",
    description:
      "끝난 보물 시즌 중 미지급 보상을 순위 발굴 코인으로 지급합니다. 시즌당 1회 멱등.",
    danger: false,
  },
];

function formatSummary(op: SeasonOp, s: Record<string, unknown>): string {
  const n = (k: string) => (typeof s[k] === "number" ? (s[k] as number) : 0);
  switch (op) {
    case "war-rollover":
      return `중립화 ${n("reset")} · 유지 ${n("keptNewSeason")} · 이미중립 ${n("alreadyNeutral")} · 오류 ${n("errored")}`;
    case "pvp-rollover":
      return `닫은 시즌 ${n("closed")} · 현재 시즌 ${s.currentSeasonId ?? "?"}`;
    case "pvp-rewards":
    case "fishing-rewards":
    case "treasure-rewards":
      return `처리 시즌 ${n("seasonsProcessed")} · 지급 ${n("granted")}`;
  }
}

export function SeasonOpsTab() {
  const { readOnly, showToast } = useAdmin();
  const [running, setRunning] = useState<SeasonOp | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const runOp = async (op: SeasonOp) => {
    if (readOnly) {
      showToast("보기 전용 모드 — 변경 불가");
      return;
    }
    setRunning(op);
    try {
      const r = await fetch("/api/admin/season-ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        summary?: Record<string, unknown>;
        error?: string;
      };
      if (!r.ok || !j.ok) {
        const msg = j.error ?? `HTTP ${r.status}`;
        setResults((p) => ({ ...p, [op]: `실패: ${msg}` }));
        showToast(`${op} 실패: ${msg}`);
        return;
      }
      const text = formatSummary(op, j.summary ?? {});
      const stamped = `${text} — ${new Date().toLocaleTimeString("ko-KR")}`;
      setResults((p) => ({ ...p, [op]: stamped }));
      showToast(`완료 — ${text}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      setResults((p) => ({ ...p, [op]: `실패: ${msg}` }));
      showToast(`${op} 실패: ${msg}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold">시즌 수동 트리거</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          주간 cron 을 기다리지 않고 시즌 롤오버·보상 지급을 즉시 실행합니다(cron 누락·
          긴급 운영 대비). 모든 작업은 cron 과 동일한 로직이며 <strong>멱등</strong> —
          중복 클릭하거나 cron 과 겹쳐도 보상이 두 번 지급되지 않습니다.
        </p>
      </div>

      {OPS.map((def) => (
        <div
          key={def.op}
          className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold">{def.label}</h4>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {def.description}
              </p>
            </div>
            <div className="shrink-0">
              {def.danger ? (
                <DangerAction
                  trigger={running === def.op ? "실행 중…" : "실행"}
                  title={def.label}
                  description={def.description}
                  confirmText={def.confirmText ?? "CONFIRM"}
                  disabled={readOnly || running !== null}
                  onConfirm={() => void runOp(def.op)}
                />
              ) : (
                <Button
                  variant="primary"
                  disabled={readOnly || running !== null}
                  onClick={() => void runOp(def.op)}
                >
                  {running === def.op ? "실행 중…" : "실행"}
                </Button>
              )}
            </div>
          </div>
          {results[def.op] ? (
            <p className="mt-2 rounded bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {results[def.op]}
            </p>
          ) : null}
        </div>
      ))}

      {readOnly && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          보기 전용 모드 — 상단에서 편집 가능으로 전환해야 동작합니다.
        </p>
      )}
    </section>
  );
}
