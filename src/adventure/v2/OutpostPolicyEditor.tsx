"use client";

import { useEffect, useState } from "react";

// 거점 정책·세율 편집기 — OutpostView(점령자 본인)와 길드 관리탭(마스터/관리자)이 공유.
// 서버(/api/v2/outpost/policy)가 점령자 본인 또는 점령 길드 마스터/관리자를 허용.

export const POLICY_LABELS: Record<string, string> = {
  open: "자유 입장",
  "guild-only": "자길드만",
};
const POLICY_OPTIONS = ["open", "guild-only"] as const;
// 골드 세율 하한 10%·상한 50%. 점령 거점은 최소 10% 징수(2026-06-22). ⚠️ 서버
//   /api/v2/outpost/policy 의 동명 상수와 동기화 유지.
const TAX_RATE_MIN = 0.1;
const TAX_RATE_MAX = 0.5;
const TAX_PCT_MIN = Math.round(TAX_RATE_MIN * 100);
// 표시·슬라이더용 — 현재 세율 %(레거시 <10% 는 하한으로 끌어올림).
const toTaxPct = (rate: number) => Math.max(TAX_PCT_MIN, Math.round(rate * 100));

export function OutpostPolicyEditor({
  outpostId,
  title = "정책·세율 설정",
  currentPolicy,
  currentTaxRate,
  open,
  onToggle,
  onSaved,
}: {
  outpostId: string;
  title?: string;
  currentPolicy: string;
  currentTaxRate: number;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const [policy, setPolicy] = useState(currentPolicy);
  const [taxPct, setTaxPct] = useState(() => toTaxPct(currentTaxRate));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // props 가 외부에서 갱신되면(다른 탭에서 정책 변경 등) local state 동기화.
  useEffect(() => {
    setPolicy(currentPolicy);
    setTaxPct(toTaxPct(currentTaxRate));
  }, [currentPolicy, currentTaxRate]);

  const dirty =
    policy !== currentPolicy || taxPct !== toTaxPct(currentTaxRate);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/outpost/policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outpostId,
          policy,
          taxRate: taxPct / 100,
        }),
      });
      type PolicyResponse = { ok?: boolean; error?: string };
      let json: PolicyResponse | null = null;
      try {
        json = (await res.json()) as PolicyResponse;
      } catch {
        setMsg(`✗ http ${res.status} (응답 JSON 아님)`);
        return;
      }
      if (json && json.ok) {
        setMsg("✓ 저장됨");
        onSaved();
      } else {
        setMsg(`✗ ${json?.error ?? `http ${res.status}`}`);
      }
    } catch (err) {
      setMsg(`✗ network: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
      <button
        type="button"
        onClick={onToggle}
        className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">{title}</span>
          <span className="text-xs text-zinc-500">{open ? "▼" : "▶"}</span>
        </div>
        <div className="mt-0.5 text-xs text-zinc-500">
          현재: {POLICY_LABELS[currentPolicy] ?? currentPolicy} · 세금{" "}
          {Math.round(currentTaxRate * 100)}%
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              입장 정책
            </label>
            <div className="mt-1 flex flex-col gap-1">
              {POLICY_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name={`policy-${outpostId}`}
                    value={opt}
                    checked={policy === opt}
                    onChange={() => setPolicy(opt)}
                  />
                  <span>
                    {POLICY_LABELS[opt]}
                    {opt !== "open" && (
                      <span className="ml-1 text-zinc-500">
                        (효과는 후속 PR)
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              골드 세금율: {taxPct}% (최소 {TAX_PCT_MIN}% · 최대 {TAX_RATE_MAX * 100}%)
            </label>
            <input
              type="range"
              min={TAX_PCT_MIN}
              max={TAX_RATE_MAX * 100}
              step={1}
              value={taxPct}
              onChange={(e) => setTaxPct(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
            {msg && (
              <span className="font-mono text-xs text-zinc-500">{msg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
