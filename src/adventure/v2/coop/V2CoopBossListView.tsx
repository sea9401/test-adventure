"use client";

// 협동 보스 목록 — 소환된 보스(인스턴스 단위, 같은 종류 다수 가능) + 소환하기 + 미수령 보상.
// 보스 클릭 → 상세(/battle/coop/[sessionId]). 소환 성공 시 새 보스 상세로 바로 이동.

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { CaretDown, CaretRight, CaretUp } from "@phosphor-icons/react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import {
  COOP_BOSSES,
  COOP_BOSS_KIND_IDS,
  COOP_TIER_LABEL,
  MAX_ACTIVE_PER_KIND,
  coopBossDurationLabel,
  type CoopBossKindId,
} from "@/adventure/data/v2/coopBosses";
import {
  fmtCoopRemain,
  useCoopListState,
} from "@/adventure/v2/coop/useCoopBossState";
import { CoopRewardTable } from "@/adventure/v2/coop/CoopRewardTable";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";

// 코어루프 소환 공개 범위 — 권한자만 무료 공격(소환권이 비용).
const COOP_VIS_OPTIONS: readonly [string, string][] = [
  ["public", "공개"],
  ["guild_only", "길드원만"],
  ["summoner_only", "나만"],
];

export function V2CoopBossListView({
  onOpenSession,
  onBack,
}: {
  onOpenSession: (sessionId: string) => void;
  onBack: () => void;
}) {
  const {
    scrolls,
    sessions,
    claimables,
    busy,
    loaded,
    notice,
    lastReward,
    summon,
    claim,
  } = useCoopListState();
  const [now, setNow] = useState(() => Date.now());
  // 코어루프 소환 공개 범위(flag-on만 사용). 모든 종류 소환에 공통 적용.
  const [visibility, setVisibility] = useState<string>("public");
  // 소환하기 카드의 정보(특성·보상 테이블) 펼침 — kind 단위 토글.
  const [infoOpen, setInfoOpen] = useState<CoopBossKindId | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeCountByKind = new Map<CoopBossKindId, number>();
  for (const s of sessions) {
    activeCountByKind.set(s.kind, (activeCountByKind.get(s.kind) ?? 0) + 1);
  }

  // 소환 후에도 목록에 머문다 — 여러 마리 연속 소환 흐름(이동은 보스 카드 클릭으로).
  const handleSummon = async (kind: CoopBossKindId) => {
    await summon(kind, V2_CORE_LOOP_V2 ? visibility : undefined);
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
        </p>
      </HeaderPanel>

      {/* 코어루프 — 소환 공개 범위(권한자는 무료 공격). flag off 면 미표시(항상 공개). */}
      {V2_CORE_LOOP_V2 && (
        <Card padding="sm">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            소환 공개 범위
          </p>
          <div className="mt-1.5 flex gap-2">
            {COOP_VIS_OPTIONS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                aria-pressed={visibility === v}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  visibility === v
                    ? "border-emerald-500 bg-emerald-100 font-medium text-emerald-900 dark:border-emerald-500 dark:bg-emerald-900 dark:text-emerald-100"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            소환권이 비용이라, 공개 범위 안의 모험가는 무료로 함께 칠 수 있어요.
          </p>
        </Card>
      )}

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

      {/* 소환된 보스 — 인스턴스 단위(같은 종류 여러 마리 가능) */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          소환된 보스{loaded && ` (${sessions.length})`}
        </div>
        {loaded && sessions.length === 0 && (
          <Card padding="md">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              지금 소환된 보스가 없습니다 — 아래에서 소환서를 사용해 깨워
              보세요.
            </p>
          </Card>
        )}
        {sessions.map((s) => {
          const def = COOP_BOSSES[s.kind];
          const hpPct = Math.max(
            0,
            Math.min(100, (s.hp / s.maxHp) * 100),
          );
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenSession(s.id)}
              className="group block w-full text-left"
            >
              <Card
                padding="md"
                className="flex items-center gap-3 border-rose-300 transition-all duration-150 hover:-translate-y-0.5 hover:border-rose-400 hover:shadow-md active:translate-y-0 dark:border-rose-800 dark:hover:border-rose-600"
              >
                <img
                  src={def.base.image}
                  alt={def.name}
                  className="h-14 w-14 shrink-0 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="text-sm font-semibold">
                      {def.name}
                      {s.summonedByName && (
                        <span className="ml-1.5 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                          {s.summonedByName} 님이 소환
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      {fmtCoopRemain(s.expiresAt - now)}
                    </span>
                  </span>
                  <span className="mt-1.5 block space-y-1">
                    <span className="block h-2 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                      <span
                        className="block h-full rounded bg-rose-500 transition-[width]"
                        style={{ width: `${hpPct}%` }}
                      />
                    </span>
                    <span className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>
                        {s.hp.toLocaleString()} / {s.maxHp.toLocaleString()}
                      </span>
                      <span>
                        참전 {s.participantCount}명
                        {s.myDamage > 0 &&
                          ` · 내 기여 ${s.myDamage.toLocaleString()}`}
                        {s.myTier && ` (${COOP_TIER_LABEL[s.myTier]})`}
                      </span>
                    </span>
                  </span>
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
        {!loaded && (
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </p>
        )}
      </div>

      {/* 소환하기 — 종류별(동시 소환 캡까지) */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          소환하기
        </div>
        {COOP_BOSS_KIND_IDS.map((kindId) => {
          const def = COOP_BOSSES[kindId];
          const activeCount = activeCountByKind.get(kindId) ?? 0;
          const capped = activeCount >= MAX_ACTIVE_PER_KIND;
          const short = scrolls < def.scrollCost;
          const open = infoOpen === kindId;
          return (
            <Card key={kindId} padding="md" className="space-y-2">
              <div className="flex items-center gap-3">
                <img
                  src={def.base.image}
                  alt={def.name}
                  className="h-12 w-12 shrink-0 rounded-md border border-zinc-200 object-cover opacity-80 dark:border-zinc-700"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {def.name}
                  </span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                    소환서 {def.scrollCost}장 · {coopBossDurationLabel(def)}
                    {activeCount > 0 && ` · 토벌 중 ${activeCount}마리`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setInfoOpen(open ? null : kindId)}
                  aria-expanded={open}
                  className="flex shrink-0 items-center gap-0.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  정보
                  {open ? <CaretUp size={12} /> : <CaretDown size={12} />}
                </button>
                <button
                  type="button"
                  disabled={busy || !loaded || capped || short}
                  onClick={() => void handleSummon(kindId)}
                  className="shrink-0 rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {capped
                    ? "한도 도달"
                    : short
                      ? `소환서 ${scrolls}/${def.scrollCost}`
                      : "소환"}
                </button>
              </div>
              {open && (
                <div className="space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                  <div className="flex flex-wrap gap-1">
                    {def.traits.map((t) => (
                      <span
                        key={t}
                        className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <CoopRewardTable kind={def} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
