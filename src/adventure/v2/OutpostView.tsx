"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import type { Outpost, OutpostType, OutpostTier } from "@/adventure/data/v2/types";
import { evaluateOutpostEntry } from "@/adventure/data/v2/outpostPolicy";
import { outpostDefensePower } from "@/adventure/data/v2/outpostDefense";
import { IntruderPanel } from "./IntruderPanel";
import type { StaminaState } from "./stamina";
import { ClaimResultCard, type ClaimResult } from "./ClaimResultCard";

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

// 던전 입장은 전투 탭으로 이동 (V2BattleHome) — OutpostView 에서는 outpost 자체
// 활동(claim/harvest/policy/병사 모집 등) 만.
export type OutpostAction =
  | { kind: "back" }
  | { kind: "claimed" };

type OccupationLite = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  policy?: string;
  taxRate?: string;
  nextAttackAt?: string;
} | null;

const POLICY_LABELS: Record<string, string> = {
  open: "자유 입장",
  "guild-only": "자길드만",
};
const POLICY_OPTIONS = ["open", "guild-only"] as const;
const TAX_RATE_MAX = 0.5;

type TournamentSummary = {
  matches: {
    attackerName: string;
    defenderName: string;
    winnerSide: "attacker" | "defender";
    turns: number;
  }[];
  attackerLineupCount: number;
  defenderLineupCount: number;
};

type ClaimResponse = {
  ok?: boolean;
  error?: string;
  won?: boolean;
  raceLost?: boolean;
  pvp?: boolean;
  championName?: string;
  turns?: number;
  stamina?: StaminaState;
  hpBefore?: number;
  hpAfter?: number;
  maxHp?: number;
  requiredStamina?: number;
  tournament?: TournamentSummary | null;
};

export function OutpostView({
  outpost,
  viewerUserId,
  viewerGuildId,
  occupation,
  onAction,
}: {
  outpost: Outpost;
  viewerUserId: string | null;
  viewerGuildId: number | null;
  occupation: OccupationLite;
  onAction: (action: OutpostAction) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [lastClaimResult, setLastClaimResult] = useState<ClaimResult | null>(
    null,
  );
  const [policyOpen, setPolicyOpen] = useState(false);
  // 내 합성 전투력(derivePowerScore) — 수비 전투력 게이트 비교용. state 라우트서 1회 로드.
  const [viewerPower, setViewerPower] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/v2/me/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && typeof j?.combat?.power === "number") {
          setViewerPower(j.combat.power);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 거점 수비 전투력 (왕국 중심 5000 → 외곽 1500, 분쟁지대·중립은 0=게이트 없음).
  const defensePower = outpostDefensePower(outpost);

  const claimDisabled = computeClaimDisabled(
    outpost,
    occupation,
    viewerUserId,
    defensePower,
    viewerPower,
  );
  const isOwner =
    !!occupation &&
    !!viewerUserId &&
    occupation.occupiedByUserId === viewerUserId;
  // 점령 길드 멤버 — 침입자 토벌 패널 가시 조건. user 본인 점령이 아니어도
  // 같은 길드 멤버라면 토벌 가능.
  const isGuildMember =
    !!occupation &&
    occupation.occupiedByGuildId != null &&
    viewerGuildId === occupation.occupiedByGuildId;

  // 정책 게이트 — guild-only 거점에 다른 길드가 들어가려는 경우 던전 입장 막음.
  const entryDecision = occupation
    ? evaluateOutpostEntry({
        policy: occupation.policy ?? "open",
        occupiedByGuildId: occupation.occupiedByGuildId,
        viewerGuildId,
      })
    : { allowed: true as const, charge: "none" as const };
  const dungeonDisabled: { reason: string } | null = entryDecision.allowed
    ? null
    : { reason: "점령 길드가 자길드 멤버에게만 개방 중" };

  async function attemptClaim() {
    setBusy(true);
    setLastClaimResult(null);
    try {
      const res = await fetch("/api/v2/outpost/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outpostId: outpost.id }),
      });
      let json: ClaimResult | null = null;
      try {
        json = (await res.json()) as ClaimResult;
      } catch {
        setLastClaimResult({
          ok: false,
          error: `http ${res.status} (응답 JSON 아님)`,
        });
        return;
      }
      if (!json) {
        setLastClaimResult({
          ok: false,
          error: `http ${res.status} (빈 응답)`,
        });
        return;
      }
      // 수비 전투력 부족 — 필요/현재 전투력으로 친절한 메시지 (서버가 race 등으로 막은 경우).
      const raw = json as ClaimResult & {
        requiredPower?: number;
        playerPower?: number;
      };
      if (!raw.ok && raw.error === "insufficient_power") {
        setLastClaimResult({
          ok: false,
          error: `수비 전투력 ${(raw.requiredPower ?? 0).toLocaleString()} 필요 — 내 전투력 ${(raw.playerPower ?? 0).toLocaleString()}`,
        });
        return;
      }
      setLastClaimResult(json);
      // 점령 성공 또는 PvP 패배(자원/점령 변동 가능) → refresh.
      if (json.ok && (json.won || json.pvp)) {
        onAction({ kind: "claimed" });
      }
    } catch (err) {
      setLastClaimResult({
        ok: false,
        error: `network: ${(err as Error).message}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <BackButton onClick={() => onAction({ kind: "back" })} />
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
        {defensePower > 0 && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            수비 전투력{" "}
            <strong className="tabular-nums">
              {defensePower.toLocaleString()}
            </strong>
            {viewerPower != null && (
              <span
                className={
                  "ml-1 " +
                  (viewerPower < defensePower
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400")
                }
              >
                · 내 전투력{" "}
                <span className="tabular-nums">
                  {viewerPower.toLocaleString()}
                </span>
              </span>
            )}
          </p>
        )}
        {isOwner && occupation?.nextAttackAt && (
          <NextAttackInfo nextAttackAt={occupation.nextAttackAt} />
        )}
      </header>

      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          여기서 할 수 있는 것
        </div>

        {dungeonDisabled && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ {dungeonDisabled.reason} — 사냥 불가
          </div>
        )}

        <ActionCard
          title={
            claimDisabled
              ? "점령 시도"
              : occupation
                ? "점령 시도 (PvP 결투)"
                : "점령 시도 (NPC 일기토)"
          }
          subtitle={
            claimDisabled?.reason ??
            (occupation
              ? "점령자 영웅과 1대1 결투. 승리 시 점령권 이전 (스태미너 소모)."
              : "거점 NPC 영웅과 1대1 결투. 승리 시 점령 (스태미너 소모).")
          }
          onClick={attemptClaim}
          disabled={!!claimDisabled || busy}
          loading={busy}
        />

        {lastClaimResult && (
          <ClaimResultCard
            result={lastClaimResult}
            outpostName={outpost.name}
            onClose={() => setLastClaimResult(null)}
          />
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

        {isGuildMember && <IntruderPanel outpostId={outpost.id} />}
      </section>
    </main>
  );
}

function computeClaimDisabled(
  outpost: Outpost,
  occupation: OccupationLite,
  viewerUserId: string | null,
  defensePower: number,
  viewerPower: number | null,
): { reason: string } | null {
  if (outpost.neutral) return { reason: "절대 중립 거점 (점령 불가)" };
  if (
    occupation &&
    viewerUserId &&
    occupation.occupiedByUserId === viewerUserId
  ) {
    return { reason: "이미 내 점령지" };
  }
  // 수비 전투력 게이트 — 내 전투력이 거점 수비 전투력에 못 미치면 시도 불가.
  // viewerPower 로딩 전(null)엔 막지 않는다(서버가 권위로 한 번 더 차단).
  if (defensePower > 0 && viewerPower != null && viewerPower < defensePower) {
    return {
      reason: `수비 전투력 ${defensePower.toLocaleString()} 필요 (내 전투력 ${viewerPower.toLocaleString()})`,
    };
  }
  return null; // 비점령(NPC 일기토) 또는 다른 세력 점령(PvP 결투) 시도 가능
}

function NextAttackInfo({ nextAttackAt }: { nextAttackAt: string }) {
  const targetMs = new Date(nextAttackAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const diffMs = targetMs - now;
  const overdue = diffMs <= 0;
  const totalMin = Math.max(0, Math.floor(diffMs / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  return (
    <div className="rounded border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-zinc-500">다음 NPC 공격: </span>
      <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
        {overdue ? "곧 (cron 처리 대기)" : `${h}시간 ${m}분 후`}
      </span>
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
    <div className="rounded-md border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
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
      className="block w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:disabled:hover:bg-zinc-900/50"
    >
      <div className="font-medium">
        {title}
        {loading && <span className="ml-2 text-xs text-zinc-500">…</span>}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{reason ?? subtitle}</div>
    </button>
  );
}
