"use client";

// 협동 보스 상세 — 보스 한 마리의 토벌 화면.
// 구조(옛 레이드 화면의 v2 이식): 보스 일러스트·이름·HP 숫자/바·플레이버 → 공격 버튼 →
// 참전자 명단(내 줄 강조) → 최근 공격 → 내 공격 다시보기. 잠든 보스면 소환 화면.

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import type { StaminaState } from "@/adventure/v2/stamina";
import type { HpBarState } from "@/adventure/v2/HpBar";
import {
  COOP_ATTACK_COOLDOWN_MS,
  COOP_ATTACK_STAMINA_COST,
  COOP_BOSSES,
  COOP_TIER_LABEL,
  type CoopBossKindId,
} from "@/adventure/data/v2/coopBosses";
import {
  fmtCoopRemain,
  useCoopBossState,
} from "@/adventure/v2/coop/useCoopBossState";
import type { Gender } from "@/adventure/profile/avatars";

export function V2CoopBossDetailView({
  kind,
  playerName,
  playerGender,
  playerSubtitle,
  stamina,
  setStamina,
  setHp,
  onBack,
}: {
  kind: CoopBossKindId;
  playerName: string;
  playerGender: Gender;
  playerSubtitle?: string;
  stamina: StaminaState;
  setStamina: (s: StaminaState) => void;
  setHp?: (s: HpBarState) => void;
  onBack: () => void;
}) {
  const def = COOP_BOSSES[kind];
  const {
    scrolls,
    bosses,
    busy,
    loaded,
    notice,
    lastAttack,
    summon,
    attack,
  } = useCoopBossState({
    setStamina,
    onHpAfterAttack: (r) => {
       
      setHp?.({ hp: r.hpAfter, maxHp: r.maxHp, anchorMs: Date.now() });
    },
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const b = bosses.find((x) => x.kind === kind) ?? null;
  const active = b?.session ?? null;
  const hpPct = active
    ? Math.max(0, Math.min(100, (active.hp / active.maxHp) * 100))
    : 0;
  const cooldownLeft =
    b?.myLastAttackAt != null
      ? b.myLastAttackAt + COOP_ATTACK_COOLDOWN_MS - now
      : 0;
  const onCooldown = active != null && cooldownLeft > 0;
  const lowStamina = stamina.current < COOP_ATTACK_STAMINA_COST;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel className="space-y-2">
        <div className="flex items-center justify-between">
          <BackButton onClick={onBack} />
          {active && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {fmtCoopRemain(active.expiresAt - now)}
            </span>
          )}
        </div>
      </HeaderPanel>

      {/* 보스 헤더 — 일러스트·이름·HP·플레이버 */}
      <Card padding="md" className="space-y-3 text-center">
        <img
          src={def.base.image}
          alt={def.name}
          className={`mx-auto h-28 w-28 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700 ${
            active ? "" : "opacity-50 grayscale"
          }`}
        />
        <div>
          <h1 className="text-lg font-bold">{def.name}</h1>
          {active ? (
            <p className="mt-0.5 font-mono text-sm text-zinc-600 dark:text-zinc-300">
              {active.hp.toLocaleString()} / {active.maxHp.toLocaleString()}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              잠들어 있다
            </p>
          )}
        </div>
        {active && (
          <div className="h-3 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded bg-rose-500 transition-[width]"
              style={{ width: `${hpPct}%` }}
            />
          </div>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{def.desc}</p>

        {active ? (
          <button
            type="button"
            disabled={busy || onCooldown || lowStamina}
            onClick={() => void attack(kind)}
            className="mx-auto w-full max-w-xs rounded-md border border-rose-600 bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy
              ? "전투 중…"
              : onCooldown
                ? `재공격 ${Math.ceil(cooldownLeft / 1000)}초 후`
                : lowStamina
                  ? `스태미너 부족 (${COOP_ATTACK_STAMINA_COST} 필요)`
                  : `공격 (스태미너 ${COOP_ATTACK_STAMINA_COST})`}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !loaded || scrolls < def.scrollCost}
            onClick={() => void summon(kind)}
            className="mx-auto w-full max-w-xs rounded-md border border-amber-600 bg-amber-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {!loaded
              ? "불러오는 중…"
              : scrolls < def.scrollCost
                ? `소환서 부족 (${scrolls}/${def.scrollCost})`
                : `소환 (소환서 ${def.scrollCost}장)`}
          </button>
        )}
        {active && b && b.myDamage > 0 && (
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            내 누적 {b.myDamage.toLocaleString()} ({b.myAttackCount}회)
            {b.myTier && (
              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {COOP_TIER_LABEL[b.myTier]}
              </span>
            )}
          </p>
        )}
      </Card>

      {notice && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {notice}
        </div>
      )}

      {/* 내 공격 결과 — 요약 + 전투 다시보기 */}
      {lastAttack && lastAttack.kind === kind && (
        <Card padding="md" className="space-y-2">
          <div className="text-sm font-semibold">
            ⚔{" "}
            <span className="text-rose-600 dark:text-rose-400">
              {lastAttack.damageDealt.toLocaleString()}
            </span>{" "}
            데미지 ({lastAttack.turns}턴{lastAttack.diedEarly && " · 쓰러짐"}
            {lastAttack.defeated && " · 처치 확정타!"})
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

      {/* 참전자 명단 — 데미지 내림차순, 내 줄 강조 */}
      {active && b && b.top.length > 0 && (
        <Card padding="md" className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">참전자</span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {b.participantCount}명
            </span>
          </div>
          <div className="space-y-0.5">
            {b.top.map((t, i) => (
              <div
                key={`${t.name}-${i}`}
                className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
                  t.isMe
                    ? "bg-amber-50 font-medium dark:bg-amber-950/40"
                    : i % 2 === 1
                      ? "bg-zinc-50 dark:bg-zinc-900/60"
                      : ""
                }`}
              >
                <span className="min-w-0 truncate">
                  <span className="mr-1.5 inline-block w-6 text-right text-xs text-zinc-400">
                    {i + 1}
                  </span>
                  {t.name}
                  {t.isMe && (
                    <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                      나
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                  {t.damage.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 최근 공격 활동 */}
      {active && b && b.recentAttacks.length > 0 && (
        <Card padding="md" className="space-y-1">
          <div className="text-sm font-semibold">최근 공격</div>
          {b.recentAttacks.map((a, i) => (
            <div
              key={`${a.at}-${i}`}
              className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400"
            >
              <span className="truncate">
                {a.name}
                {a.diedEarly && " 💀"}
              </span>
              <span className="shrink-0 font-mono">
                -{a.damageDealt.toLocaleString()}
              </span>
            </div>
          ))}
        </Card>
      )}
    </main>
  );
}
