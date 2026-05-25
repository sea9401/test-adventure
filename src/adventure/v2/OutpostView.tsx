"use client";

import { useEffect, useState } from "react";
import type { Outpost, OutpostType, OutpostTier } from "@/adventure/data/v2/types";
import { evaluateOutpostEntry } from "@/adventure/data/v2/outpostPolicy";
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

export type OutpostAction =
  | { kind: "back" }
  | { kind: "enter-dungeon" }
  | { kind: "claimed" }
  | { kind: "harvested" };

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

type TroopBattleSummary = {
  duelWonByAttacker?: boolean;
  attackerPower: number;
  defenderPower: number;
  attackerCasualties: number;
  defenderCasualties: number;
  plunderStone: number;
};

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
  troopBattle?: TroopBattleSummary | null;
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
  const [useScroll, setUseScroll] = useState(false);

  const claimDisabled = computeClaimDisabled(outpost, occupation, viewerUserId);
  const isOwner =
    !!occupation &&
    !!viewerUserId &&
    occupation.occupiedByUserId === viewerUserId;
  // PvP claim 일 때만 주문서 의미 — 점령자 있고 자기 점령 아님.
  const pvpTarget = !!occupation && !isOwner;
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
        body: JSON.stringify({ outpostId: outpost.id, useScroll }),
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
      setLastClaimResult(json);
      // 점령 성공/raceLost/troopBattle 변동 → 자원/점령 상태 refresh.
      if (json.ok && (json.won || json.troopBattle)) {
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
        {isOwner && occupation?.nextAttackAt && (
          <NextAttackInfo nextAttackAt={occupation.nextAttackAt} />
        )}
      </header>

      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          여기서 할 수 있는 것
        </div>

        <ActionCard
          title="던전 입장"
          subtitle={
            dungeonDisabled?.reason ?? "5층 던전에서 사냥. 스태미너 소모."
          }
          onClick={() => onAction({ kind: "enter-dungeon" })}
          disabled={dungeonDisabled ?? undefined}
        />

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

        {pvpTarget && !claimDisabled && (
          <label className="flex items-center gap-2 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={useScroll}
              onChange={(e) => setUseScroll(e.target.checked)}
              disabled={busy}
            />
            주문서 1 사용 (본 전쟁 power +20%)
          </label>
        )}

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

        {outpost.type === "fort" && isOwner && (
          <SoldierRecruitCard
            onRecruited={() => onAction({ kind: "harvested" })}
          />
        )}
        {outpost.type === "fort" && !isOwner && (
          <ActionCard
            title="병사 모집"
            subtitle="점령자 전용 (요새 거점)."
            disabled={{ reason: "점령자 전용" }}
          />
        )}
        {(outpost.type === "mine" ||
          outpost.type === "village" ||
          outpost.type === "tower") &&
          isOwner && (
            <MineHarvestCard
              outpost={outpost}
              tier={outpost.tier}
              outpostType={outpost.type}
              onHarvested={() => onAction({ kind: "harvested" })}
            />
          )}
        {(outpost.type === "mine" ||
          outpost.type === "village" ||
          outpost.type === "tower") &&
          !isOwner && (
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
  if (!occupation) return null; // 비점령 — NPC 일기토 시도 가능
  if (viewerUserId && occupation.occupiedByUserId === viewerUserId) {
    return { reason: "이미 내 점령지" };
  }
  return null; // 다른 세력 점령 — PvP 결투 시도 가능
}

function SoldierRecruitCard({
  onRecruited,
}: {
  onRecruited: () => void;
}) {
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const COST_PER = 10;

  async function recruit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/soldiers/recruit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count }),
      });
      type RecruitResponse = {
        ok?: boolean;
        error?: string;
        recruited?: number;
        cost?: number;
        have?: number;
        need?: number;
        max?: number;
        resources?: { stone: number; soldiers: number };
      };
      let json: RecruitResponse | null = null;
      try {
        json = (await res.json()) as RecruitResponse;
      } catch {
        setMsg(`✗ http ${res.status} (응답 JSON 아님)`);
        return;
      }
      if (json && json.ok) {
        setMsg(
          `✓ 병사 +${json.recruited} (광물 ${json.cost} 소모) · 누적 병사 ${json.resources?.soldiers}`,
        );
        onRecruited();
      } else if (json?.error === "not_enough_stone") {
        setMsg(
          `✗ 광물 부족 — ${json.have ?? 0} / 필요 ${json.need ?? 0}`,
        );
      } else if (json?.error === "soldier_cap") {
        setMsg(`✗ 누적 한도 — ${json.have ?? 0} / 최대 ${json.max ?? 0}`);
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
      <div className="px-3 py-2 text-sm">
        <div className="font-medium">병사 모집</div>
        <div className="mt-0.5 text-xs text-zinc-500">
          1 병사 = {COST_PER} 광물 · 영웅 전투(claim·PvP·NPC 공격) 시 stat 보정
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <input
          type="number"
          min={1}
          max={1000}
          step={1}
          value={count}
          onChange={(e) =>
            setCount(
              Math.max(
                1,
                Math.min(1000, Math.floor(Number(e.target.value) || 0)),
              ),
            )
          }
          className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        <span className="text-xs text-zinc-500">
          명 (광물 {count * COST_PER} 필요)
        </span>
        <button
          type="button"
          onClick={recruit}
          disabled={busy}
          className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "모집 중…" : "모집"}
        </button>
      </div>
      {msg && (
        <div className="border-t border-zinc-200 px-3 py-1 text-xs font-mono dark:border-zinc-800">
          {msg}
        </div>
      )}
    </div>
  );
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

function MineHarvestCard({
  outpost,
  tier,
  outpostType,
  onHarvested,
}: {
  outpost: Outpost;
  tier: OutpostTier;
  outpostType: OutpostType;
  onHarvested: () => void;
}) {
  const typeLabel =
    outpostType === "village"
      ? "마을 (보조)"
      : outpostType === "tower"
        ? "마탑 (주문서)"
        : "광산";
  const resourceLabel = outpostType === "tower" ? "주문서" : "광물";
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
        gainedKind?: "stone" | "scrolls";
        effectiveHours?: number;
        resources?: { stone: number; soldiers: number; scrolls: number };
      };
      let json: HarvestResponse | null = null;
      try {
        json = (await res.json()) as HarvestResponse;
      } catch {
        setMsg(`✗ http ${res.status} (응답 JSON 아님)`);
        return;
      }
      if (json && json.ok) {
        const cumulative =
          json.gainedKind === "scrolls"
            ? json.resources?.scrolls
            : json.resources?.stone;
        if ((json.gained ?? 0) > 0) {
          setMsg(
            `✓ ${resourceLabel} +${json.gained} (${(json.effectiveHours ?? 0).toFixed(1)}시간치) · 누적 ${cumulative}`,
          );
        } else {
          setMsg(
            `△ 아직 산출량 없음 (누적 시간 부족) · 보유 ${cumulative ?? 0}`,
          );
        }
        // 성공 응답이면 (gained=0 포함) sticky bar 동기화 — 다른 탭에서 변경된 자원도 반영.
        onHarvested();
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
          tier {tier} {typeLabel} — 시간당 산출 (최대 24시간 누적). 클릭 시 즉시 수확.
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
