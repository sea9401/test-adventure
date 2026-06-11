"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CastleTurret, Coins, Flag, ShieldWarning } from "@phosphor-icons/react";
import { BackButton } from "@/components/ui/BackButton";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";
import { siegeWinsToFall } from "@/adventure/data/v2/outpostSiege";

// 전쟁 — 전쟁 허브(탭: 전황 / 지도). docs/v2-war-visibility-plan.md PR-2 의 전황 화면을
// 허브로 승격(2026-06-11).
// 전황 탭: ① 교전 중 거점 ② 노다지 ③ 최근 점령 ④ 내 길드 거점 — "현재 상태" 스냅샷.
// 지도 탭: 현 위치 2홉 이내만 보이는 작전 지도 — page 가 mapSlot 으로 주입
//   (ContinentMap visibleIds 국지 모드, 데이터는 GameStateProvider).

type SiegeEntry = {
  outpostId: string;
  ownerLabel: string;
  fortHp: number;
  fortMaxHp: number;
  protectedUntil: string;
  recentAttacks: Array<{
    attackerName: string;
    attackerGuildName: string | null;
    won: boolean;
    at: string;
  }>;
};

type CaptureEntry = { outpostId: string; ownerLabel: string; at: string };

type TreasureEntry = { outpostId: string; gold: number };

type MyGuildEntry = {
  guildId: number;
  outposts: Array<{
    outpostId: string;
    fortHp: number;
    fortMaxHp: number;
    underAttack: boolean;
    intruderCount: number;
  }>;
};

type OverviewResponse = {
  ok?: boolean;
  sieges?: SiegeEntry[];
  recentCaptures?: CaptureEntry[];
  treasures?: TreasureEntry[];
  myGuild?: MyGuildEntry | null;
};

function outpostName(id: string): string {
  return OUTPOST_BY_ID.get(id)?.name ?? id;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}일 전`;
  if (h >= 1) return `${h}시간 전`;
  const m = Math.max(1, Math.floor(ms / 60_000));
  return `${m}분 전`;
}

function FortMiniBar({ fortHp, fortMaxHp }: { fortHp: number; fortMaxHp: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((fortHp / fortMaxHp) * 100)));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
      <div
        className="h-full rounded-full bg-amber-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type WarTab = "status" | "map";

export function V2WarView({
  onBack,
  onOpenOutpost,
  mapSlot,
}: {
  onBack: () => void;
  onOpenOutpost: (outpostId: string) => void;
  // 지도 탭 내용 — page 가 ContinentMap(국지 모드)을 주입. 미지정이면 지도 탭 숨김.
  mapSlot?: ReactNode;
}) {
  const [tab, setTab] = useState<WarTab>("status");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/v2/war/overview");
        const json = (await res.json()) as OverviewResponse;
        if (!alive) return;
        if (json.ok) setData(json);
        else setError("전황을 불러오지 못했습니다");
      } catch {
        if (alive) setError("전황을 불러오지 못했습니다");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const sieges = data?.sieges ?? [];
  const captures = data?.recentCaptures ?? [];
  const treasures = data?.treasures ?? [];
  const myGuild = data?.myGuild ?? null;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel className="space-y-2">
        <BackButton onClick={onBack} />
        <h1 className="text-lg font-bold">전쟁</h1>
        {mapSlot && (
          <TabBar
            tabs={[
              { key: "status", label: "전황" },
              { key: "map", label: "지도" },
            ]}
            active={tab}
            onChange={(t) => setTab(t)}
            ariaLabel="전쟁 탭"
          />
        )}
      </HeaderPanel>

      {tab === "map" && mapSlot}

      {tab === "status" && error && (
        <p className="text-center text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      {tab === "status" && !data && !error && (
        <p className="text-center text-sm text-zinc-500">불러오는 중…</p>
      )}

      {tab === "status" && data && (
        <>
          {/* 내 길드 거점 — 위협 먼저. 길드 소속 + 점령 거점 있을 때만 섹션 표시. */}
          {myGuild && myGuild.outposts.length > 0 && (
            <section className="space-y-2">
              <HeaderPanel className="py-3">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <ShieldWarning size={14} weight="duotone" />내 길드 거점
                </div>
              </HeaderPanel>
              {myGuild.outposts.map((o) => (
                <Card key={o.outpostId} padding="sm">
                  <button
                    type="button"
                    onClick={() => onOpenOutpost(o.outpostId)}
                    className="block w-full space-y-1.5 text-left"
                  >
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">
                        {outpostName(o.outpostId)}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs">
                        {o.underAttack && (
                          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-600 dark:text-rose-400">
                            피습 중
                          </span>
                        )}
                        {o.intruderCount > 0 && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">
                            침입자 {o.intruderCount}
                          </span>
                        )}
                        <span className="tabular-nums text-zinc-500">
                          성벽 {o.fortHp}/{o.fortMaxHp}
                        </span>
                      </span>
                    </div>
                    <FortMiniBar fortHp={o.fortHp} fortMaxHp={o.fortMaxHp} />
                  </button>
                </Card>
              ))}
            </section>
          )}

          {/* 교전 중 거점 — 성벽 깎였거나 최근 공성 시도가 있는 곳. */}
          <section className="space-y-2">
            <HeaderPanel className="py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <CastleTurret size={14} weight="duotone" />
                교전 중인 거점
              </div>
            </HeaderPanel>
            {sieges.length === 0 && (
              <p className="rounded-md border border-zinc-200 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-800">
                지금 교전 중인 거점이 없습니다
              </p>
            )}
            {sieges.map((s) => (
              <Card key={s.outpostId} padding="sm">
                <button
                  type="button"
                  onClick={() => onOpenOutpost(s.outpostId)}
                  className="block w-full space-y-1.5 text-left"
                >
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">
                      {outpostName(s.outpostId)}
                    </span>
                    <span className="text-xs text-zinc-500">{s.ownerLabel}</span>
                  </div>
                  <FortMiniBar fortHp={s.fortHp} fortMaxHp={s.fortMaxHp} />
                  <div className="flex items-baseline justify-between text-[11px] text-zinc-500">
                    <span className="tabular-nums">
                      성벽 {s.fortHp}/{s.fortMaxHp} · 약{" "}
                      {siegeWinsToFall(s.fortHp)}승이면 함락
                    </span>
                  </div>
                  {s.recentAttacks.length > 0 && (
                    <ul className="space-y-0.5 border-t border-zinc-200 pt-1.5 text-[11px] text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                      {s.recentAttacks.map((a, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="truncate">
                            {a.attackerName}의 공성{" "}
                            <span
                              className={
                                a.won
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-emerald-600 dark:text-emerald-400"
                              }
                            >
                              {a.won ? "성공" : "격퇴"}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {timeAgo(a.at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              </Card>
            ))}
          </section>

          {/* 노다지 거점 — 금고 쌓인 미점령 거점(점령 시 자동 회수). */}
          {treasures.length > 0 && (
            <section className="space-y-2">
              <HeaderPanel className="py-3">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <Coins size={14} weight="duotone" />
                  노다지 거점
                </div>
              </HeaderPanel>
              <Card padding="sm">
                <ul className="space-y-1 text-xs">
                  {treasures.map((t) => (
                    <li
                      key={t.outpostId}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenOutpost(t.outpostId)}
                        className="truncate text-left font-medium hover:underline"
                      >
                        {outpostName(t.outpostId)}
                      </button>
                      <span className="shrink-0 tabular-nums text-yellow-600 dark:text-yellow-400">
                        금고 {t.gold.toLocaleString()} G
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[10px] text-zinc-500">
                  미점령 거점의 NPC 세금 적립분 — 점령하면 자동 획득
                </p>
              </Card>
            </section>
          )}

          {/* 최근 점령/함락. */}
          <section className="space-y-2">
            <HeaderPanel className="py-3">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                <Flag size={14} weight="duotone" />
                최근 점령
              </div>
            </HeaderPanel>
            {captures.length === 0 && (
              <p className="rounded-md border border-zinc-200 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-800">
                최근 점령된 거점이 없습니다
              </p>
            )}
            {captures.length > 0 && (
              <Card padding="sm">
                <ul className="space-y-1 text-xs">
                  {captures.map((c) => (
                    <li
                      key={c.outpostId}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenOutpost(c.outpostId)}
                        className="truncate text-left hover:underline"
                      >
                        <span className="font-medium">
                          {outpostName(c.outpostId)}
                        </span>{" "}
                        <span className="text-zinc-500">
                          ← {c.ownerLabel}
                        </span>
                      </button>
                      <span className="shrink-0 tabular-nums text-zinc-500">
                        {timeAgo(c.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}
    </main>
  );
}
