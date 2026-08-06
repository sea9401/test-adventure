"use client";

// 협동 보스 목록 — 소환된 보스(인스턴스 단위, 같은 종류 다수 가능) + 소환하기 + 미수령 보상.
// 보스 클릭 → 상세(/battle/coop/[sessionId]). 소환 성공 시 새 보스 상세로 바로 이동.

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { CaretDown, CaretRight, CaretUp } from "@phosphor-icons/react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import {
  COOP_BOSSES,
  COOP_TIER_LABEL,
  COOP_VISIBILITY_OPTIONS,
  MAX_ACTIVE_PER_KIND,
  SCROLL_SUMMONABLE_COOP_BOSS_KIND_IDS,
  coopBossDurationLabel,
  type CoopBossKindId,
} from "@/adventure/data/v2/coopBosses";
import {
  fmtCoopRemain,
  type CoopSessionSummary,
  useCoopListState,
} from "@/adventure/v2/coop/useCoopBossState";
import { CoopRewardTable } from "@/adventure/v2/coop/CoopRewardTable";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { V2CoopTabs } from "@/adventure/v2/coop/V2CoopTabs";
import {
  COOP_LIST_VISIBILITY_LABEL,
  coopSessionListSections,
} from "@/adventure/v2/coop/coopListSections";

// 소환 공개 범위 선택지는 coopBosses.COOP_VISIBILITY_OPTIONS(상세 변경 UI 와 공용).

type CoopBossSummonVariant = {
  kind: CoopBossKindId;
  label: string;
};

type CoopBossSummonGroup = {
  id: string;
  baseKind: CoopBossKindId;
  variants: readonly CoopBossSummonVariant[];
};

const SANGOON_KIND_IDS = new Set<CoopBossKindId>([
  "mountain_chief",
  "mountain_chief_hard",
]);

const COOP_SUMMON_GROUPS: readonly CoopBossSummonGroup[] = [
  {
    id: "mountain_chief",
    baseKind: "mountain_chief",
    variants: [
      { kind: "mountain_chief", label: "NORMAL" },
      { kind: "mountain_chief_hard", label: "HARD" },
    ],
  },
  ...SCROLL_SUMMONABLE_COOP_BOSS_KIND_IDS.filter(
    (kindId) => !SANGOON_KIND_IDS.has(kindId),
  ).map((kindId) => ({
      id: kindId,
      baseKind: kindId,
      variants: [{ kind: kindId, label: "NORMAL" }],
    })),
];

function coopBossListName(kindId: CoopBossKindId): string {
  return kindId === "mountain_chief_hard"
    ? COOP_BOSSES.mountain_chief.name
    : COOP_BOSSES[kindId].name;
}

function coopBossDifficultyBadge(kindId: CoopBossKindId): string | null {
  if (!SANGOON_KIND_IDS.has(kindId)) return null;
  return COOP_BOSSES[kindId].difficulty === "hard" ? "HARD" : "NORMAL";
}

function CoopSessionCard({
  session,
  now,
  onOpenSession,
}: {
  session: CoopSessionSummary;
  now: number;
  onOpenSession: (sessionId: string) => void;
}) {
  const def = COOP_BOSSES[session.kind];
  const displayName = coopBossListName(session.kind);
  const difficultyBadge = coopBossDifficultyBadge(session.kind);
  const hpPct = Math.max(
    0,
    Math.min(100, (session.hp / session.maxHp) * 100),
  );
  const bossMpMax = Math.max(0, session.bossMaxMp);
  const bossMp = Math.max(0, Math.min(bossMpMax, session.bossMp));
  const mpPct = bossMpMax > 0 ? (bossMp / bossMpMax) * 100 : 0;
  const visibilityLabel = COOP_LIST_VISIBILITY_LABEL[session.visibility];
  const visibilityClass =
    session.visibility === "summoner_only"
      ? "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
      : session.visibility === "guild_only"
        ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300"
        : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";

  return (
    <button
      type="button"
      onClick={() => onOpenSession(session.id)}
      className="group block w-full text-left"
    >
      <Card
        padding="md"
        className="ui-coop-card ui-lift-card is-active flex items-center gap-3 border-rose-300 transition-all duration-150 hover:-translate-y-0.5 hover:border-rose-400 hover:shadow-md active:translate-y-0 dark:border-rose-800 dark:hover:border-rose-600"
      >
        <img
          src={def.base.image}
          alt={displayName}
          className="ui-boss-portrait h-14 w-14 shrink-0 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-1">
            <span className="text-sm font-semibold">
              {displayName}
              {difficultyBadge && (
                <span className="ml-1.5 rounded border border-rose-300 px-1 py-0.5 align-middle text-[10px] font-semibold text-rose-700 dark:border-rose-800 dark:text-rose-300">
                  {difficultyBadge}
                </span>
              )}
              <span
                className={`ml-1.5 rounded border px-1.5 py-0.5 align-middle text-[10px] font-semibold ${visibilityClass}`}
              >
                {visibilityLabel}
              </span>
              {session.isOwner && (
                <span className="ml-1.5 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  내 소환
                </span>
              )}
              {session.summonedByName && (
                <span className="ml-1.5 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                  {session.summonedByName} 님이 소환
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
              {fmtCoopRemain(session.expiresAt - now)}
            </span>
          </span>
          <span className="mt-1.5 block space-y-1">
            <span className="war-meter-track block h-2 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
              <span
                className="war-meter-fill block h-full rounded bg-rose-500 transition-[width]"
                style={{ width: `${hpPct}%` }}
              />
            </span>
            {bossMpMax > 0 && (
              <span className="block space-y-0.5">
                <span className="block h-1.5 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                  <span
                    className={`block h-full rounded transition-[width] ${
                      bossMp === 0 ? "bg-zinc-400" : "bg-sky-500"
                    }`}
                    style={{ width: `${mpPct}%` }}
                  />
                </span>
                <span className="flex justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
                  <span>MP {bossMp.toLocaleString()}</span>
                  {bossMp === 0 && <span>탈진</span>}
                </span>
              </span>
            )}
            <span className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>
                {session.hp.toLocaleString()} / {session.maxHp.toLocaleString()}
              </span>
              <span>
                참전 {session.participantCount}명
                {session.myDamage > 0 &&
                  ` · 내 기여 ${session.myDamage.toLocaleString()}`}
                {session.myTier && ` (${COOP_TIER_LABEL[session.myTier]})`}
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
}

export function V2CoopBossListView({
  onOpenSession,
  onOpenShop,
  onBack,
}: {
  onOpenSession: (sessionId: string) => void;
  onOpenShop?: () => void;
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
  // 소환하기 카드의 정보(특성·보상 테이블) 펼침 — UI 그룹 단위 토글.
  const [infoOpen, setInfoOpen] = useState<string | null>(null);
  const [selectedKindByGroup, setSelectedKindByGroup] = useState<
    Record<string, CoopBossKindId>
  >({
    mountain_chief: "mountain_chief",
  });
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeCountByKind = new Map<CoopBossKindId, number>();
  for (const s of sessions) {
    activeCountByKind.set(s.kind, (activeCountByKind.get(s.kind) ?? 0) + 1);
  }
  const sessionSections = coopSessionListSections(sessions);

  // 소환 후에도 목록에 머문다 — 여러 마리 연속 소환 흐름(이동은 보스 카드 클릭으로).
  const handleSummon = async (kind: CoopBossKindId) => {
    await summon(kind, V2_CORE_LOOP_V2 ? visibility : undefined);
  };

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="협동 보스" onBack={onBack} />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        사냥에서 모은 소환서로 보스를 소환하면 모든 모험가가 함께 토벌합니다.
      </p>

      <V2CoopTabs active="bosses" onOpenShop={onOpenShop} />

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
                <span className="font-medium">{coopBossListName(c.kind)}</span>
                {coopBossDifficultyBadge(c.kind) && (
                  <span className="ml-1 rounded border border-emerald-400 px-1 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
                    {coopBossDifficultyBadge(c.kind)}
                  </span>
                )}{" "}
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  내 기여 {c.myDamage.toLocaleString()} ·{" "}
                  {c.tier ? COOP_TIER_LABEL[c.tier] : "기준 미달"}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void claim(c.sessionId)}
                className="shrink-0 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {c.tier ? "보상 수령" : "확인"}
              </button>
            </div>
          ))}
        </Card>
      )}

      {lastReward && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-800/60 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            {COOP_TIER_LABEL[lastReward.tier]} 보상 획득!
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-emerald-700 dark:text-emerald-400">
            {lastReward.coopCoin != null && lastReward.coopCoin > 0 && (
              <li>협동 주화 ×{lastReward.coopCoin}</li>
            )}
            {lastReward.bossMaterialCount != null &&
              lastReward.bossMaterialCount > 0 && (
                <li>
                  {lastReward.bossMaterialName ?? "보스 재료"} ×
                  {lastReward.bossMaterialCount}
                </li>
              )}
            {lastReward.equipmentBoxName && (
              <li>{lastReward.equipmentBoxName} — 소모품 탭에서 사용</li>
            )}
            {lastReward.uniqueId && (
              <li>
                보스 유니크{" "}
                <span className="font-semibold">{lastReward.uniqueName}</span>{" "}
                — 인벤토리에서 확인
              </li>
            )}
            {lastReward.spFruitCount > 0 && (
              <li>
                {lastReward.spFruitName ?? "SP 열매"} ×
                {lastReward.spFruitCount} — 소모품 탭에서 사용 시 SP 최대치 ↑
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 소환된 보스 — 인스턴스 단위(같은 종류 여러 마리 가능) */}
      <div className="space-y-3">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          진행 중인 협동 보스{loaded && ` (${sessions.length})`}
        </div>
        {loaded && sessions.length === 0 && (
          <Card padding="md">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              지금 진행 중인 보스가 없습니다. 아래의 새 보스 소환에서
              소환서를 사용할 수 있습니다.
            </p>
          </Card>
        )}
        {loaded &&
          sessions.length > 0 &&
          sessionSections.map((section) => (
            <section key={section.id} className="space-y-1.5">
              <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {section.title}
                    <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      {section.sessions.length}
                    </span>
                  </h2>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {section.description}
                  </p>
                </div>
              </div>
              {section.sessions.length === 0 ? (
                <Card padding="sm">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {section.emptyLabel}
                  </p>
                </Card>
              ) : (
                <div className="space-y-1.5">
                  {section.sessions.map((session) => (
                    <CoopSessionCard
                      key={session.id}
                      session={session}
                      now={now}
                      onOpenSession={onOpenSession}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        {!loaded && (
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </p>
        )}
      </div>

      {/* 소환하기 — 보스별 카드, 난이도 변형은 카드 안에서 선택 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              새 보스 소환
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              소환 설정을 선택한 뒤 원하는 보스의 소환 버튼을 누르세요.
            </p>
          </div>
          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            보스 소환서 {scrolls.toLocaleString()}장 보유
          </span>
        </div>

        {/* 코어루프 — 아래 소환 버튼에 적용되는 공개 범위. flag off 면 항상 공개. */}
        {V2_CORE_LOOP_V2 && (
          <Card padding="sm" className="border-amber-200 dark:border-amber-900/70">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
              소환 후 공개 범위
            </p>
            <div className="mt-1.5 flex gap-2">
              {COOP_VISIBILITY_OPTIONS.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  aria-pressed={visibility === v}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    visibility === v
                      ? "border-emerald-500 bg-emerald-100 font-medium text-emerald-900 dark:border-emerald-500 dark:bg-emerald-900 dark:text-emerald-100"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              이 설정은 아래에서 새로 소환하는 보스에 적용됩니다. 공개 범위 안의
              모험가는 무료로 함께 공격할 수 있습니다.
            </p>
          </Card>
        )}

        {COOP_SUMMON_GROUPS.map((group) => {
          const selectedKind =
            selectedKindByGroup[group.id] ?? group.variants[0]?.kind;
          const def = COOP_BOSSES[selectedKind];
          const baseDef = COOP_BOSSES[group.baseKind];
          const selectedActiveCount = activeCountByKind.get(selectedKind) ?? 0;
          const activeLabel = group.variants
            .map((variant) => {
              const count = activeCountByKind.get(variant.kind) ?? 0;
              return count > 0 ? `${variant.label} ${count}마리` : null;
            })
            .filter(Boolean)
            .join(" · ");
          const capped = selectedActiveCount >= MAX_ACTIVE_PER_KIND;
          const short = scrolls < def.scrollCost;
          const open = infoOpen === group.id;
          return (
            <Card key={group.id} padding="md" className="ui-coop-card space-y-2">
              <div className="flex items-center gap-3">
                <img
                  src={baseDef.base.image}
                  alt={baseDef.name}
                  className="ui-boss-portrait h-12 w-12 shrink-0 rounded-md border border-zinc-200 object-cover opacity-80 dark:border-zinc-700"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {baseDef.name}
                  </span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                    소환서 {def.scrollCost}장 · {coopBossDurationLabel(def)}
                    {activeLabel && ` · 토벌 중 ${activeLabel}`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setInfoOpen(open ? null : group.id)}
                  aria-expanded={open}
                  className="flex shrink-0 items-center gap-0.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  정보
                  {open ? <CaretUp size={12} /> : <CaretDown size={12} />}
                </button>
                <button
                  type="button"
                  disabled={busy || !loaded || capped || short}
                  onClick={() => void handleSummon(selectedKind)}
                  className="shrink-0 rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {capped
                    ? "한도 도달"
                    : short
                      ? `소환서 ${scrolls}/${def.scrollCost}`
                      : "소환"}
                </button>
              </div>
              {group.variants.length > 1 && (
                <div className="grid grid-cols-2 gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-900">
                  {group.variants.map((variant) => {
                    const selected = selectedKind === variant.kind;
                    return (
                      <button
                        key={variant.kind}
                        type="button"
                        onClick={() =>
                          setSelectedKindByGroup((prev) => ({
                            ...prev,
                            [group.id]: variant.kind,
                          }))
                        }
                        aria-pressed={selected}
                        className={`rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                          selected
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                            : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {variant.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="ui-expand-grid" data-open={open} aria-hidden={!open}>
                <div className="ui-expand-content">
                  <div className="space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
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
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
