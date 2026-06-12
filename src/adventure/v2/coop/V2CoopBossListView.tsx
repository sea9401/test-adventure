"use client";

// 협동 보스 목록 — 소환된 보스 현황 한눈에 + 보스 클릭 → 상세(/battle/coop/[kind]).
// 소환/공격은 상세 화면에서 — 목록은 현황·미수령 보상만.

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import type { StaminaState } from "@/adventure/v2/stamina";
import {
  COOP_BOSSES,
  COOP_TIER_LABEL,
} from "@/adventure/data/v2/coopBosses";
import type { CoopBossKindId } from "@/adventure/data/v2/coopBosses";
import {
  fmtCoopRemain,
  useCoopBossState,
} from "@/adventure/v2/coop/useCoopBossState";

export function V2CoopBossListView({
  setStamina,
  onOpenBoss,
  onBack,
}: {
  setStamina: (s: StaminaState) => void;
  onOpenBoss: (kind: CoopBossKindId) => void;
  onBack: () => void;
}) {
  const {
    scrolls,
    bosses,
    claimables,
    busy,
    loaded,
    notice,
    lastReward,
    claim,
  } = useCoopBossState({ setStamina });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
        </p>
      </HeaderPanel>

      {notice && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {notice}
        </div>
      )}

      {/* 미수령 토벌 보상 */}
      {claimables.length > 0 && (
        <Card padding="md" className="space-y-2">
          <div className="text-sm font-semibold">미수령 토벌 보상</div>
          {claimables.map((c) => (
            <div
              key={c.sessionId}
              className="flex items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 dark:border-emerald-700 dark:bg-emerald-950/40"
            >
              <span className="min-w-0 text-sm">
                <span className="font-medium">{COOP_BOSSES[c.kind].name}</span>{" "}
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

      {/* 보스 목록 — 클릭 → 상세 */}
      <div className="space-y-2">
        {bosses.map((b) => {
          const def = COOP_BOSSES[b.kind];
          const active = b.session;
          const hpPct = active
            ? Math.max(0, Math.min(100, (active.hp / active.maxHp) * 100))
            : 0;
          return (
            <button
              key={b.kind}
              type="button"
              onClick={() => onOpenBoss(b.kind)}
              className="group block w-full text-left"
            >
              <Card
                padding="md"
                className={`flex items-center gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${
                  active
                    ? "border-rose-300 hover:border-rose-400 dark:border-rose-800 dark:hover:border-rose-600"
                    : "hover:border-zinc-300 dark:hover:border-zinc-600"
                }`}
              >
                <img
                  src={def.base.image}
                  alt={def.name}
                  className={`h-14 w-14 shrink-0 rounded-md border border-zinc-200 object-cover dark:border-zinc-700 ${
                    active ? "" : "opacity-50 grayscale"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="text-sm font-semibold">{def.name}</span>
                    {active ? (
                      <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                        토벌 중 · {fmtCoopRemain(active.expiresAt - now)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        소환서 {def.scrollCost}장
                      </span>
                    )}
                  </span>
                  {active ? (
                    <span className="mt-1.5 block space-y-1">
                      <span className="block h-2 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                        <span
                          className="block h-full rounded bg-rose-500 transition-[width]"
                          style={{ width: `${hpPct}%` }}
                        />
                      </span>
                      <span className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                        <span>
                          {active.hp.toLocaleString()} /{" "}
                          {active.maxHp.toLocaleString()}
                        </span>
                        <span>
                          참전 {b.participantCount}명
                          {b.myDamage > 0 &&
                            ` · 내 기여 ${b.myDamage.toLocaleString()}`}
                          {b.myTier && ` (${COOP_TIER_LABEL[b.myTier]})`}
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                      잠들어 있다
                      {scrolls >= def.scrollCost
                        ? " — 소환 가능"
                        : ` — 소환서 ${scrolls}/${def.scrollCost}`}
                    </span>
                  )}
                </span>
                <CaretRight
                  size={16}
                  weight="bold"
                  className="shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
                />
              </Card>
            </button>
          );
        })}
      </div>

      {!loaded && (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </p>
      )}
    </main>
  );
}
