"use client";

import { useEffect, useState } from "react";
import type { Outpost, OutpostType, OutpostTier } from "@/adventure/data/v2/types";
import type { StaminaState } from "./stamina";

// 라이브 TownScreen 의 메뉴 카드 UI 패턴을 v2 거점에 적용.
// 거점 hub — 진입 시 그 거점에서 할 수 있는 활동 리스트.

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
};
const TIER_LABEL: Record<OutpostTier, string> = {
  1: "마을",
  2: "거점",
  3: "도시",
  4: "왕국",
};

export type OutpostAction =
  | { kind: "back" }
  | { kind: "enter-dungeon" }
  | { kind: "claimed" };

type OccupationLite = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  policy?: string;
  taxRate?: string;
} | null;

const POLICY_LABELS: Record<string, string> = {
  open: "자유 입장",
  alliance: "동맹만",
  "guild-only": "자길드만",
};
const POLICY_OPTIONS = ["open", "alliance", "guild-only"] as const;
const TAX_RATE_MAX = 0.5;

type ClaimResponse = {
  ok?: boolean;
  error?: string;
  won?: boolean;
  raceLost?: boolean;
  championName?: string;
  turns?: number;
  stamina?: StaminaState;
  hpBefore?: number;
  hpAfter?: number;
  maxHp?: number;
  requiredStamina?: number;
};

export function OutpostView({
  outpost,
  viewerUserId,
  occupation,
  onAction,
}: {
  outpost: Outpost;
  viewerUserId: string | null;
  occupation: OccupationLite;
  onAction: (action: OutpostAction) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [lastClaim, setLastClaim] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  const claimDisabled = computeClaimDisabled(outpost, occupation, viewerUserId);
  const isOwner =
    !!occupation &&
    !!viewerUserId &&
    occupation.occupiedByUserId === viewerUserId;

  async function attemptClaim() {
    setBusy(true);
    setLastClaim(null);
    try {
      const res = await fetch("/api/v2/outpost/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outpostId: outpost.id }),
      });
      let json: ClaimResponse | null = null;
      try {
        json = (await res.json()) as ClaimResponse;
      } catch {
        setLastClaim(`✗ http ${res.status} (응답 JSON 아님)`);
        return;
      }
      if (!json) {
        setLastClaim(`✗ http ${res.status} (빈 응답)`);
        return;
      }
      if (json.ok && json.won && !json.raceLost) {
        setLastClaim(
          `✓ ${json.championName} 격파 (${json.turns}턴) — 점령 성공!`,
        );
        onAction({ kind: "claimed" });
      } else if (json.ok && json.won && json.raceLost) {
        setLastClaim(
          `△ ${json.championName} 격파 (${json.turns}턴) — 다른 세력이 먼저 점령. 스태미너만 차감.`,
        );
        onAction({ kind: "claimed" });
      } else if (json.ok && !json.won) {
        setLastClaim(
          `✗ ${json.championName} 패배 (${json.turns}턴) — 점령 실패. 스태미너만 차감됨.`,
        );
      } else {
        const need =
          json.error === "out_of_stamina" && json.requiredStamina
            ? ` (필요 ${json.requiredStamina})`
            : "";
        setLastClaim(`✗ ${json.error ?? "unknown"}${need}`);
      }
    } catch (err) {
      setLastClaim(`✗ network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => onAction({ kind: "back" })}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 대륙 지도로
        </button>
        <h1 className="text-lg font-bold">{outpost.name}</h1>
        <div className="flex flex-wrap gap-1 text-xs">
          <span className="rounded bg-zinc-200 px-2 py-0.5 dark:bg-zinc-800">
            {TIER_LABEL[outpost.tier]}
          </span>
          <span className="rounded bg-zinc-200 px-2 py-0.5 dark:bg-zinc-800">
            {TYPE_LABEL[outpost.type]}
          </span>
          {outpost.neutral && (
            <span className="rounded bg-yellow-400 px-2 py-0.5 text-yellow-900">
              절대 중립
            </span>
          )}
          {occupation &&
            viewerUserId &&
            occupation.occupiedByUserId === viewerUserId && (
              <span className="rounded bg-emerald-500 px-2 py-0.5 text-white">
                내 점령
              </span>
            )}
          {occupation &&
            occupation.occupiedByUserId !== null &&
            occupation.occupiedByUserId !== viewerUserId && (
              <span className="rounded bg-red-500 px-2 py-0.5 text-white">
                적대 점령
              </span>
            )}
        </div>
        {outpost.description && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {outpost.description}
          </p>
        )}
      </header>

      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          여기서 할 수 있는 것
        </div>

        <ActionCard
          title="던전 입장"
          subtitle="5층 던전에서 사냥. 스태미너 소모."
          onClick={() => onAction({ kind: "enter-dungeon" })}
        />

        <ActionCard
          title={claimDisabled ? "점령 시도" : "점령 시도 (일기토)"}
          subtitle={
            claimDisabled?.reason ??
            `이 거점의 NPC 영웅과 1대1 결투. 승리 시 점령. (스태미너 소모)`
          }
          onClick={attemptClaim}
          disabled={!!claimDisabled || busy}
          loading={busy}
        />

        {lastClaim && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-mono dark:border-zinc-800 dark:bg-zinc-900/50">
            {lastClaim}
          </div>
        )}

        {isOwner && occupation && (
          <PolicyEditor
            outpost={outpost}
            currentPolicy={occupation.policy ?? "open"}
            currentTaxRate={Number(occupation.taxRate ?? "0")}
            open={policyOpen}
            onToggle={() => setPolicyOpen((v) => !v)}
            onSaved={() => onAction({ kind: "claimed" })}
          />
        )}

        {outpost.type === "village" && (
          <ActionCard
            title="상점"
            subtitle="아이템 거래."
            disabled={{ reason: "곧 공개" }}
          />
        )}
        {outpost.type === "fort" && (
          <ActionCard
            title="병사 모집"
            subtitle="자길드 점령 시 가능."
            disabled={{ reason: "곧 공개" }}
          />
        )}
        {outpost.type === "mine" && isOwner && (
          <MineHarvestCard outpost={outpost} tier={outpost.tier} />
        )}
        {outpost.type === "mine" && !isOwner && (
          <ActionCard
            title="자원 산출"
            subtitle="점령자만 수확 가능."
            disabled={{ reason: "점령자 전용" }}
          />
        )}
      </section>
    </main>
  );
}

function computeClaimDisabled(
  outpost: Outpost,
  occupation: OccupationLite,
  viewerUserId: string | null,
): { reason: string } | null {
  if (outpost.neutral) return { reason: "절대 중립 거점 (점령 불가)" };
  if (!occupation) return null; // 비점령 — 시도 가능
  if (viewerUserId && occupation.occupiedByUserId === viewerUserId) {
    return { reason: "이미 내 점령지" };
  }
  return { reason: "다른 세력이 점령 중 (PvP 후속 PR)" };
}

function MineHarvestCard({
  outpost,
  tier,
}: {
  outpost: Outpost;
  tier: OutpostTier;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function harvest() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/outpost/harvest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outpostId: outpost.id }),
      });
      type HarvestResponse = {
        ok?: boolean;
        error?: string;
        gained?: number;
        effectiveHours?: number;
        resources?: { stone: number };
      };
      let json: HarvestResponse | null = null;
      try {
        json = (await res.json()) as HarvestResponse;
      } catch {
        setMsg(`✗ http ${res.status} (응답 JSON 아님)`);
        return;
      }
      if (json && json.ok) {
        if ((json.gained ?? 0) > 0) {
          setMsg(
            `✓ 광물 +${json.gained} (${(json.effectiveHours ?? 0).toFixed(1)}시간치) · 누적 ${json.resources?.stone}`,
          );
        } else {
          setMsg(
            `△ 아직 산출량 없음 (누적 시간 부족) · 보유 ${json.resources?.stone ?? 0}`,
          );
        }
      } else {
        setMsg(`✗ ${json?.error ?? `http ${res.status}`}`);
      }
    } catch (err) {
      setMsg(`✗ network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50">
      <button
        type="button"
        onClick={harvest}
        disabled={busy}
        className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800"
      >
        <div className="font-medium">
          광물 수확
          {busy && <span className="ml-2 text-xs text-zinc-500">…</span>}
        </div>
        <div className="mt-0.5 text-xs text-zinc-500">
          tier {tier} 광산 — 시간당 산출 (최대 24시간 누적). 클릭 시 즉시 수확.
        </div>
      </button>
      {msg && (
        <div className="border-t border-zinc-200 px-3 py-2 text-xs font-mono dark:border-zinc-800">
          {msg}
        </div>
      )}
    </div>
  );
}

function PolicyEditor({
  outpost,
  currentPolicy,
  currentTaxRate,
  open,
  onToggle,
  onSaved,
}: {
  outpost: Outpost;
  currentPolicy: string;
  currentTaxRate: number;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const [policy, setPolicy] = useState(currentPolicy);
  const [taxPct, setTaxPct] = useState(() =>
    Math.round(currentTaxRate * 100),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // props 가 외부에서 갱신되면(다른 탭에서 정책 변경 등) local state 동기화.
  useEffect(() => {
    setPolicy(currentPolicy);
    setTaxPct(Math.round(currentTaxRate * 100));
  }, [currentPolicy, currentTaxRate]);

  const dirty =
    policy !== currentPolicy ||
    taxPct !== Math.round(currentTaxRate * 100);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/outpost/policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outpostId: outpost.id,
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
    <div className="rounded-md border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50">
      <button
        type="button"
        onClick={onToggle}
        className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">정책·세율 설정 (점령자)</span>
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
                <label
                  key={opt}
                  className="flex items-center gap-2 text-xs"
                >
                  <input
                    type="radio"
                    name={`policy-${outpost.id}`}
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
              골드 세금율: {taxPct}% (최대 {TAX_RATE_MAX * 100}%)
            </label>
            <input
              type="range"
              min={0}
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
              <span className="text-xs text-zinc-500 font-mono">{msg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionCard({
  title,
  subtitle,
  onClick,
  disabled,
  loading,
}: {
  title: string;
  subtitle: string;
  onClick?: () => void;
  disabled?: { reason: string } | boolean;
  loading?: boolean;
}) {
  const isDisabled = !!disabled;
  const reason = typeof disabled === "object" ? disabled.reason : null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className="block w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:bg-zinc-800 dark:disabled:hover:bg-zinc-900/50"
    >
      <div className="font-medium">
        {title}
        {loading && <span className="ml-2 text-xs text-zinc-500">…</span>}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{reason ?? subtitle}</div>
    </button>
  );
}
