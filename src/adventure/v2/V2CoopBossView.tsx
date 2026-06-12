"use client";

// 협동 보스 — 소환서로 소환하는 공유 HP 월드 보스 패널.
// 루프: 사냥에서 소환서 수집 → 소환 → 모두가 공격(스태미너+쿨다운) → 처치 시 기여 티어 보상 수령.
// 서버 권위(GET /api/v2/coop 폴링) — 이 화면은 표시·intent 만.

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { StaminaState } from "@/adventure/v2/stamina";
import type { HpBarState } from "@/adventure/v2/HpBar";
import {
  COOP_ATTACK_COOLDOWN_MS,
  COOP_ATTACK_STAMINA_COST,
  COOP_BOSSES,
  COOP_TIER_LABEL,
  type CoopBossKindId,
  type CoopRewardTier,
} from "@/adventure/data/v2/coopBosses";
import type { Gender } from "@/adventure/profile/avatars";

const POLL_MS = 20_000;

type BossState = {
  kind: CoopBossKindId;
  session: { id: string; hp: number; maxHp: number; expiresAt: number } | null;
  myDamage: number;
  myAttackCount: number;
  myLastAttackAt: number | null;
  myTier: CoopRewardTier | null;
  top: { name: string; damage: number; attackCount: number }[];
  recentAttacks: {
    name: string;
    damageDealt: number;
    diedEarly: boolean;
    at: number;
  }[];
};

type Claimable = {
  sessionId: string;
  kind: CoopBossKindId;
  myDamage: number;
  tier: CoopRewardTier | null;
  defeatedAt: number;
};

type CoopGetResponse = {
  ok?: boolean;
  scrolls?: number;
  bosses?: BossState[];
  claimables?: Claimable[];
};

type AttackResult = {
  kind: CoopBossKindId;
  damageDealt: number;
  damageTaken: number;
  diedEarly: boolean;
  turns: number;
  bossHp: number;
  bossMaxHp: number;
  defeated: boolean;
  myDamage: number;
  myTier: CoopRewardTier | null;
  hpAfter: number;
  maxHp: number;
  hpCharges?: number;
  mpCharges?: number;
  replay?: ReplayPayload;
};

type ClaimReward = {
  tier: CoopRewardTier;
  gold: number;
  uniqueId: string | null;
  titleId: string;
  titleNew: boolean;
};

function fmtRemain(ms: number): string {
  if (ms <= 0) return "만료";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${Math.max(1, m)}분 남음`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분 남음`;
}

export function V2CoopBossView({
  playerName,
  playerGender,
  playerSubtitle,
  stamina,
  setStamina,
  setHp,
  onBack,
}: {
  playerName: string;
  playerGender: Gender;
  playerSubtitle?: string;
  stamina: StaminaState;
  setStamina: (s: StaminaState) => void;
  setHp?: (s: HpBarState) => void;
  onBack: () => void;
}) {
  const [scrolls, setScrolls] = useState(0);
  const [bosses, setBosses] = useState<BossState[]>([]);
  const [claimables, setClaimables] = useState<Claimable[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastAttack, setLastAttack] = useState<AttackResult | null>(null);
  const [lastReward, setLastReward] = useState<ClaimReward | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 공격 응답의 최종 HP 로 전역 HP 갱신 — anchor = 응답 수신 시각(V2DungeonFloorView 패턴).
  const recordHp = (r: { hpAfter: number; maxHp: number }) => {
    // eslint-disable-next-line react-hooks/purity -- 이벤트 핸들러에서만 호출(렌더 아님)
    setHp?.({ hp: r.hpAfter, maxHp: r.maxHp, anchorMs: Date.now() });
  };

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/coop");
      if (!res.ok) return;
      const j = (await res.json()) as CoopGetResponse;
      if (j.ok) {
        setScrolls(j.scrolls ?? 0);
        setBosses(j.bosses ?? []);
        setClaimables(j.claimables ?? []);
        setLoaded(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh 는 async(fetch 후 set)
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const summon = async (kind: CoopBossKindId) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/coop/summon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        have?: number;
        need?: number;
      };
      if (!j.ok) {
        setNotice(
          j.error === "not_enough_scrolls"
            ? `소환서가 부족합니다 (보유 ${j.have ?? 0} / 필요 ${j.need ?? "?"})`
            : j.error === "already_active"
              ? "이미 이 보스가 소환되어 있습니다."
              : `소환 실패 (${j.error ?? "unknown"})`,
        );
      } else {
        setNotice(`${COOP_BOSSES[kind].name} 소환! 모두가 공격할 수 있습니다.`);
      }
    } catch {
      setNotice("네트워크 오류 — 잠시 후 다시 시도하세요.");
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const attack = async (kind: CoopBossKindId) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setLastAttack(null);
    try {
      const res = await fetch("/api/v2/coop/attack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        stamina?: StaminaState;
        retryAfterMs?: number;
        result?: AttackResult;
      };
      if (j.stamina) setStamina(j.stamina);
      if (j.ok && j.result) {
        setLastAttack(j.result);
        recordHp(j.result);
      } else {
        setNotice(
          j.error === "cooldown"
            ? `재공격 대기 중 — ${Math.ceil((j.retryAfterMs ?? 0) / 1000)}초 후 가능`
            : j.error === "out_of_stamina"
              ? `스태미너 부족 (${COOP_ATTACK_STAMINA_COST} 필요)`
              : j.error === "hp_zero"
                ? "체력이 부족합니다 — 회복 후 다시 시도하세요."
                : j.error === "no_active_boss"
                  ? "소환된 보스가 없습니다."
                  : j.error === "already_defeated"
                    ? "이미 처치된 보스입니다."
                    : `공격 실패 (${j.error ?? "unknown"})`,
        );
      }
    } catch {
      setNotice("네트워크 오류 — 잠시 후 다시 시도하세요.");
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const claim = async (sessionId: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/coop/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        reward?: ClaimReward | null;
      };
      if (j.ok && j.reward) setLastReward(j.reward);
      else if (!j.ok) {
        setNotice(
          j.error === "below_bronze"
            ? "기여도가 보상 기준(BRONZE)에 못 미쳤습니다."
            : `수령 실패 (${j.error ?? "unknown"})`,
        );
      }
    } catch {
      setNotice("네트워크 오류 — 잠시 후 다시 시도하세요.");
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel className="space-y-2">
        <BackButton onClick={onBack} />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-bold">협동 보스</h1>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            보스 소환서 {scrolls}장 보유
          </span>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          사냥에서 모은 소환서로 보스를 소환하면 모든 모험가가 함께 토벌합니다.
          누적 기여도에 따라 처치 보상이 달라집니다.
        </p>
      </HeaderPanel>

      {notice && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {notice}
        </div>
      )}

      {/* 미수령 보상 */}
      {claimables.length > 0 && (
        <Card padding="md" className="space-y-2">
          <div className="text-sm font-semibold">미수령 토벌 보상</div>
          {claimables.map((c) => (
            <div
              key={c.sessionId}
              className="flex items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 dark:border-emerald-700 dark:bg-emerald-950/40"
            >
              <span className="min-w-0 text-sm">
                <span className="font-medium">
                  {COOP_BOSSES[c.kind].name}
                </span>{" "}
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  내 기여 {c.myDamage.toLocaleString()} ·{" "}
                  {c.tier ? COOP_TIER_LABEL[c.tier] : "기준 미달"}
                </span>
              </span>
              <button
                type="button"
                disabled={busy || !c.tier}
                onClick={() => void claim(c.sessionId)}
                className="shrink-0 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {c.tier ? "보상 수령" : "기준 미달"}
              </button>
            </div>
          ))}
        </Card>
      )}

      {/* 수령 결과 */}
      {lastReward && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-800/60 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            🏆 {COOP_TIER_LABEL[lastReward.tier]} 보상 — 골드 +
            {lastReward.gold.toLocaleString()}
            {lastReward.uniqueId && " · 보스 유니크 획득!"}
            {lastReward.titleNew && " · 칭호 획득!"}
          </p>
          <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
            장비는 인벤토리, 칭호는 도감에서 확인할 수 있어요.
          </p>
        </div>
      )}

      {/* 보스 카드 3종 */}
      {bosses.map((b) => {
        const def = COOP_BOSSES[b.kind];
        const active = b.session;
        const hpPct = active
          ? Math.max(0, Math.min(100, (active.hp / active.maxHp) * 100))
          : 0;
        const cooldownLeft =
          b.myLastAttackAt != null
            ? b.myLastAttackAt + COOP_ATTACK_COOLDOWN_MS - now
            : 0;
        const onCooldown = active != null && cooldownLeft > 0;
        const lowStamina = stamina.current < COOP_ATTACK_STAMINA_COST;
        return (
          <Card key={b.kind} padding="md" className="space-y-3">
            <div className="flex items-center gap-3">
              <img
                src={def.base.image}
                alt={def.name}
                className="h-14 w-14 shrink-0 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <span className="text-sm font-semibold">{def.name}</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    소환서 {def.scrollCost}장
                  </span>
                </div>
                {active ? (
                  <div className="mt-1 space-y-1">
                    <div className="h-2.5 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className="h-full rounded bg-rose-500 transition-[width]"
                        style={{ width: `${hpPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>
                        {active.hp.toLocaleString()} /{" "}
                        {active.maxHp.toLocaleString()}
                      </span>
                      <span>{fmtRemain(active.expiresAt - now)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    잠들어 있다 — 소환서 {def.scrollCost}장으로 깨울 수 있다.
                  </p>
                )}
              </div>
            </div>

            {active ? (
              <>
                <button
                  type="button"
                  disabled={busy || onCooldown || lowStamina}
                  onClick={() => void attack(b.kind)}
                  className="w-full rounded-md border border-rose-600 bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {busy
                    ? "전투 중…"
                    : onCooldown
                      ? `재공격 ${Math.ceil(cooldownLeft / 1000)}초 후`
                      : lowStamina
                        ? `스태미너 부족 (${COOP_ATTACK_STAMINA_COST} 필요)`
                        : `공격 (스태미너 ${COOP_ATTACK_STAMINA_COST})`}
                </button>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  내 누적 {b.myDamage.toLocaleString()} ({b.myAttackCount}회)
                  {b.myTier && (
                    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      {COOP_TIER_LABEL[b.myTier]}
                    </span>
                  )}
                </div>
                {b.top.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      기여 순위
                    </div>
                    {b.top.map((t, i) => (
                      <div
                        key={`${t.name}-${i}`}
                        className="flex justify-between text-xs text-zinc-600 dark:text-zinc-300"
                      >
                        <span className="truncate">
                          {i + 1}위 {t.name}
                        </span>
                        <span className="shrink-0">
                          {t.damage.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {b.recentAttacks.length > 0 && (
                  <div className="space-y-0.5 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      최근 공격
                    </div>
                    {b.recentAttacks.map((a, i) => (
                      <div
                        key={`${a.at}-${i}`}
                        className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400"
                      >
                        <span className="truncate">
                          {a.name}
                          {a.diedEarly && " 💀"}
                        </span>
                        <span className="shrink-0">
                          -{a.damageDealt.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                disabled={busy || scrolls < def.scrollCost}
                onClick={() => void summon(b.kind)}
                className="w-full rounded-md border border-amber-600 bg-amber-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {scrolls < def.scrollCost
                  ? `소환서 부족 (${scrolls}/${def.scrollCost})`
                  : `소환 (소환서 ${def.scrollCost}장)`}
              </button>
            )}
          </Card>
        );
      })}

      {!loaded && (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </p>
      )}

      {/* 내 공격 결과 — 요약 + 전투 다시보기 */}
      {lastAttack && (
        <Card padding="md" className="space-y-2">
          <div className="text-sm font-semibold">
            ⚔ {COOP_BOSSES[lastAttack.kind].name}에게{" "}
            <span className="text-rose-600 dark:text-rose-400">
              {lastAttack.damageDealt.toLocaleString()}
            </span>{" "}
            데미지 ({lastAttack.turns}턴
            {lastAttack.diedEarly && " · 쓰러짐"}
            {lastAttack.defeated && " · 처치 확정타!"})
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            내 누적 {lastAttack.myDamage.toLocaleString()} /{" "}
            {lastAttack.bossMaxHp.toLocaleString()}
            {lastAttack.myTier && ` · ${COOP_TIER_LABEL[lastAttack.myTier]}`}
          </div>
          {lastAttack.replay && (
            <ReplayBattleScene
              payload={lastAttack.replay}
              playerName={playerName}
              gender={playerGender}
              exp={0}
              maxExp={1}
              hpCharges={lastAttack.hpCharges}
              mpCharges={lastAttack.mpCharges}
              playerSubtitle={playerSubtitle}
            />
          )}
        </Card>
      )}
    </main>
  );
}
