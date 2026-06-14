"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import type { Outpost, OutpostType } from "@/adventure/data/v2/types";
import { OUTPOST_NPC_TAX_RATE } from "@/adventure/data/v2/outposts";
import { evaluateOutpostEntry } from "@/adventure/data/v2/outpostPolicy";
import {
  SIEGE_DAMAGE_PER_WIN,
  siegeWinsToFall,
} from "@/adventure/data/v2/outpostSiege";
import { outpostDefensePower } from "@/adventure/data/v2/outpostDefense";
import { OutpostAttackLog } from "./OutpostAttackLog";
import { ClaimResultCard, type ClaimResult } from "./ClaimResultCard";
import { useGameState } from "./GameStateProvider";

// 라이브 TownScreen 의 메뉴 카드 UI 패턴을 v2 거점에 적용.
// 거점 hub — 진입 시 그 거점에서 할 수 있는 활동 리스트.

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
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
  // 거점 공성(성벽 HP) — 재생 반영 현재값 + 보호막 만료.
  fortHp?: number;
  fortMaxHp?: number;
  protectedUntil?: string;
} | null;

export function OutpostView({
  outpost,
  viewerUserId,
  viewerGuildId,
  occupation,
  treasuryGold = 0,
  onAction,
}: {
  outpost: Outpost;
  viewerUserId: string | null;
  viewerGuildId: number | null;
  occupation: OccupationLite;
  // 거점 금고 잔액 — 점령/함락 시 자동 회수되는 점령 유인(occupations GET 동봉).
  treasuryGold?: number;
  onAction: (action: OutpostAction) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [lastClaimResult, setLastClaimResult] = useState<ClaimResult | null>(
    null,
  );
  // 내 합성 전투력(derivePowerScore) — 수비 전투력 게이트 비교용. state 라우트서 1회 로드.
  // intrusion(침입 상태)도 같은 응답에서 — "이 거점에 침입 중" 배너용.
  const [viewerPower, setViewerPower] = useState<number | null>(null);
  const [intrusionOutpostId, setIntrusionOutpostId] = useState<string | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    fetch("/api/v2/me/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (typeof j?.combat?.power === "number") {
          setViewerPower(j.combat.power);
        }
        setIntrusionOutpostId(
          typeof j?.intrusion?.outpostId === "string"
            ? j.intrusion.outpostId
            : null,
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 거점 수비 전투력 (왕국 중심 5000 → 외곽 1500, 분쟁지대·중립은 0=게이트 없음).
  const defensePower = outpostDefensePower(outpost);

  // 라인업 미설정 경고 — 적대 길드 점령 거점(공성=3:3 토너먼트 가능)에서 내가 2인+ 길드
  // 소속인데 라인업이 없으면, 마스터 단독 출전 폴백(fetchLineupCandidates)을 미리 알린다.
  const enemyGuildSiege =
    !!occupation &&
    occupation.occupiedByGuildId != null &&
    viewerGuildId != null &&
    occupation.occupiedByGuildId !== viewerGuildId;
  const [lineupWarning, setLineupWarning] = useState(false);
  useEffect(() => {
    if (!enemyGuildSiege) return;
    let alive = true;
    fetch("/api/v2/guild/me/lineup")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (j: {
          ok?: boolean;
          members?: unknown[];
          lineup?: string[] | null;
        } | null) => {
          if (!alive || !j?.ok) return;
          const memberCount = j.members?.length ?? 0;
          const lineupCount = j.lineup?.length ?? 0;
          setLineupWarning(memberCount >= 2 && lineupCount < 2);
        },
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enemyGuildSiege]);

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
  // 점령 길드 멤버 — 공격 기록 패널 가시 조건. user 본인 점령이 아니어도
  // 같은 길드 멤버라면 열람 가능. (침입자 토벌은 전투 탭 > 토벌로 이관.)
  const isGuildMember =
    !!occupation &&
    occupation.occupiedByGuildId != null &&
    viewerGuildId === occupation.occupiedByGuildId;
  const canUseBank =
    occupation === null ||
    (viewerGuildId != null && occupation.occupiedByGuildId === viewerGuildId);

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
      if (!raw.ok && raw.error === "not_adjacent") {
        setLastClaimResult({
          ok: false,
          error: "현재 거점 또는 인접 1칸 거점만 공격할 수 있습니다",
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
      <HeaderPanel className="space-y-2">
        <BackButton onClick={() => onAction({ kind: "back" })} />
        <h1 className="text-lg font-bold">{outpost.name}</h1>
        <div className="flex flex-wrap gap-1 text-xs">
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
          {(treasuryGold ?? 0) > 0 && (
            <span className="rounded bg-yellow-400/20 px-2 py-0.5 font-medium tabular-nums text-yellow-700 dark:text-yellow-400">
              금고 {treasuryGold.toLocaleString()} G
            </span>
          )}
          {/* 세율 상시 표기 — 사냥 골드에서 떼어가는 비율. 점령 거점은 점령자 설정값,
              미점령은 NPC 고정 세율(거점 금고 적립). 같은 길드 멤버는 실제론 면제. */}
          <span className="rounded bg-zinc-200 px-2 py-0.5 tabular-nums dark:bg-zinc-800">
            세율{" "}
            {occupation?.occupiedByUserId
              ? Math.round(Number(occupation.taxRate ?? "0") * 100)
              : Math.round(OUTPOST_NPC_TAX_RATE * 100)}
            %
          </span>
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
        {occupation &&
          occupation.fortHp != null &&
          occupation.fortMaxHp != null && (
            <FortBar
              fortHp={occupation.fortHp}
              fortMaxHp={occupation.fortMaxHp}
              protectedUntil={occupation.protectedUntil}
            />
          )}
        {isOwner && occupation?.nextAttackAt && (
          <NextAttackInfo nextAttackAt={occupation.nextAttackAt} />
        )}
      </HeaderPanel>

      <section className="space-y-2">
        <HeaderPanel className="py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            여기서 할 수 있는 것
          </div>
        </HeaderPanel>

        {dungeonDisabled && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ {dungeonDisabled.reason} — 사냥 불가
          </div>
        )}

        {/* 침입자 본인 상태 — 다른 길드 점령 거점에서 사냥한 TTL 내. 점령 길드의
            토벌 대상임을 본인도 알게(전쟁의 "당하는 쪽" 가시화, PR-5). */}
        {intrusionOutpostId === outpost.id && enemyGuildSiege && (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200">
            🗡 이 거점에 침입 중 — 점령 길드가 당신을 토벌할 수 있습니다
          </div>
        )}

        {lineupWarning && !claimDisabled && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ 3:3 라인업 미설정 — 공성 시 마스터 혼자 출전합니다. 길드 탭
            길드원에서 라인업을 설정하세요.
          </div>
        )}
        <ActionCard
          title={
            claimDisabled
              ? "점령 시도"
              : occupation
                ? "공성 시도 (PvP 결투)"
                : "점령 시도 (NPC 일기토)"
          }
          subtitle={
            claimDisabled?.reason ??
            (occupation
              ? "점령자와 1대1 결투 — 승리 시 성벽을 깎고, 0이 되면 함락 (스태미너 소모)."
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

        {canUseBank && <BankPanel />}

        {/* 정책·세율 설정은 길드 탭 > 관리로 이관 (#689 OutpostPolicyEditor). */}

        {/* 침입자 토벌은 전투 탭 > 토벌(V2SubjugationView)로 이관. */}

        {/* 보유 거점 공격 기록 — 점령자 본인(솔로 포함) 또는 점령 길드 멤버만.
            서버(attacks GET)도 같은 게이트로 한 번 더 차단. */}
        {(isOwner || isGuildMember) && (
          <OutpostAttackLog outpostId={outpost.id} />
        )}
      </section>
    </main>
  );
}

type BankAction = "deposit" | "withdraw";

type BankResult =
  | {
      ok: true;
      action: BankAction;
      moved: number;
      gold: number;
      bankedGold: number;
    }
  | { ok: false; error?: string };

const BANK_ERROR_TEXT: Record<string, string> = {
  unsafe_location: "안전한 곳에서만 이용할 수 있습니다",
  insufficient_gold: "보유 골드가 부족합니다",
  insufficient_banked: "은행 잔액이 부족합니다",
  bad_amount: "금액을 확인해 주세요",
  bad_action: "알 수 없는 오류입니다",
};

function BankPanel() {
  const { gold, bankedGold, setGold, setBankedGold } = useGameState();
  const [amountText, setAmountText] = useState("");
  const [busyAction, setBusyAction] = useState<BankAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const amount = Math.max(0, Math.floor(Number(amountText)));
  const canSubmit = amount > 0 && busyAction === null;

  function fillAll(action: BankAction) {
    const max = action === "deposit" ? gold : bankedGold;
    setAmountText(max > 0 ? String(max) : "");
    setMessage(null);
  }

  async function submit(action: BankAction) {
    if (!canSubmit) {
      setMessage("금액을 확인해 주세요");
      return;
    }
    setBusyAction(action);
    setMessage(null);
    try {
      const res = await fetch("/api/v2/me/bank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, amount }),
      });
      const j = (await res.json().catch(() => null)) as BankResult | null;
      if (!j?.ok) {
        setMessage(BANK_ERROR_TEXT[j?.error ?? ""] ?? "알 수 없는 오류입니다");
        return;
      }
      setGold(j.gold);
      setBankedGold(j.bankedGold);
      setAmountText("");
      setMessage(
        `${action === "deposit" ? "입금" : "출금"} ${j.moved.toLocaleString()}G 완료`,
      );
    } catch (err) {
      setMessage(`네트워크 오류: ${(err as Error).message}`);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-zinc-800 dark:text-zinc-100">은행</div>
        <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span>보유 골드</span>
          <span className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
            {gold.toLocaleString()}G
          </span>
          <span>은행 잔액</span>
          <span className="text-right font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
            {bankedGold.toLocaleString()}G
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={amountText}
          onChange={(e) => {
            setAmountText(e.target.value);
            setMessage(null);
          }}
          placeholder="금액"
          className="min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums text-zinc-900 outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={() => fillAll("deposit")}
          disabled={busyAction !== null || gold <= 0}
          className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          전액
        </button>
        <button
          type="button"
          onClick={() => fillAll("withdraw")}
          disabled={busyAction !== null || bankedGold <= 0}
          className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          전액
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => submit("deposit")}
          disabled={!canSubmit}
          className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "deposit" ? "처리 중…" : "입금"}
        </button>
        <button
          type="button"
          onClick={() => submit("withdraw")}
          disabled={!canSubmit}
          className="rounded-md border border-sky-600 bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "withdraw" ? "처리 중…" : "출금"}
        </button>
      </div>
      {message && (
        <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {message}
        </div>
      )}
    </div>
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
  // 함락 직후 보호막 — 재공성 불가(핑퐁 방지).
  if (
    occupation?.protectedUntil &&
    new Date(occupation.protectedUntil).getTime() > Date.now()
  ) {
    return { reason: "함락 직후 보호막 — 잠시 후 공성 가능" };
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

// 성벽 HP 바 — 점령된 거점의 공성 진행도. 0 이 되면 함락. 보호막 활성 시 배지 표시.
function FortBar({
  fortHp,
  fortMaxHp,
  protectedUntil,
}: {
  fortHp: number;
  fortMaxHp: number;
  protectedUntil?: string;
}) {
  // 마운트 시각 기준(보호막은 시간 단위라 라이브 틱 불요) — 렌더 중 Date.now() 직접 호출 회피.
  const [nowMs] = useState(() => Date.now());
  const pct = Math.max(0, Math.min(100, Math.round((fortHp / fortMaxHp) * 100)));
  const protectedMsLeft = protectedUntil
    ? new Date(protectedUntil).getTime() - nowMs
    : 0;
  const isProtected = protectedMsLeft > 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
        <span>
          성벽 <strong className="tabular-nums">{fortHp}</strong> / {fortMaxHp}
        </span>
        {isProtected && (
          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-600 dark:text-sky-400">
            보호막 ~{Math.ceil(protectedMsLeft / 3_600_000)}시간
          </span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-amber-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* 공성 메커니즘 명문화 — 1승당 데미지와 함락까지 남은 승수(재생 무시 근사). */}
      <div className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
        공성 1승당 −{SIEGE_DAMAGE_PER_WIN} · 약 {siegeWinsToFall(fortHp)}
        승이면 함락
      </div>
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
