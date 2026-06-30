"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, MapPin } from "@phosphor-icons/react";
import {
  V2CharacterCard,
  type V2CharacterCardData,
} from "./V2CharacterCard";
import { V2AnnouncementsPanel } from "./V2AnnouncementsPanel";
import { GuideQuestBanner } from "./GuideQuestBanner";
import {
  OUTPOSTS,
  OUTPOST_NPC_TAX_RATE,
  treasuryShares,
} from "@/adventure/data/v2/outposts";
import type { OutpostType } from "@/adventure/data/v2/types";
import { effectiveLevelCap } from "@/adventure/data/v2/proficiency";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";
import {
  TILE_TIER_LABEL,
  tileSettlementName,
  type TileSettlementTier,
} from "@/adventure/data/v2/tileConfig";
import { standingTileLocation } from "./currentLocation";
import type { TileSettlement } from "./GameStateProvider";

// 모험 탭 — 캐릭 카드 + 현 위치 거점 카드 (세부 정보 + 액션).

type OccupationInfo = {
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedByGuildName: string | null;
  occupiedAt: string;
  policy: string;
  taxRate: string;
  nextAttackAt: string;
  lordName: string | null;
};

type StateResponse = {
  ok?: boolean;
  character?: V2CharacterCardData;
  guild?: { id: number; name: string } | null;
  proficiency?: {
    groups?: Record<string, { tier?: number }>;
    current?: { group?: string };
  };
  currentOutpost?: {
    id: string;
    name: string;
    occupation: OccupationInfo | null;
    treasuryGold?: number;
  } | null;
};

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
};
// 거점 카드 "정책" 행 = 통행 정책 표기. open = 누구나 입장 가능(자유 통행).
const POLICY_LABEL: Record<string, string> = {
  open: "자유 통행",
  guild_only: "길드 전용",
};

function formatTaxRate(taxRate: string): string {
  // DB 가 NUMERIC 문자열 ("0.10" 등). 정수 % 로 환산.
  const n = Number(taxRate);
  if (!Number.isFinite(n)) return taxRate;
  return `${Math.round(n * 100)}%`;
}


export function V2AdventureHome({
  currentOutpost,
  tilePos,
  tileSettlements,
}: {
  currentOutpost: { id: string; name: string } | null;
  // 서 있는 타일(자유 타일 지도). currentOutpost 는 사냥 base 로 리베라에 고정되므로,
  //   "현 위치" 카드는 tilePos 로 판정해야 빈 땅에서 리베라가 박혀 보이는 버그를 막는다.
  tilePos: { col: number; row: number } | null;
  tileSettlements: TileSettlement[];
}) {
  const [state, setState] = useState<StateResponse | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const stateRes = await fetch("/api/v2/me/state");
      const j = (await stateRes.json().catch(() => null)) as StateResponse | null;
      setState(j ?? { ok: false });
    } catch {
      setState({ ok: false });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 state 시드)
    refresh();
  }, [refresh]);

  const outpost = useMemo(
    () =>
      currentOutpost
        ? OUTPOSTS.find((o) => o.id === currentOutpost.id) ?? null
        : null,
    [currentOutpost],
  );

  // 서 있는 타일 분류 — 거점 칸(리베라)/보드 밖이면 거점 요약 카드, 개척 정착지면 정착지
  //   요약, 빈 땅이면 빈 땅 안내. (currentOutpost 고정 = 리베라 박힘 버그 방지)
  const loc = useMemo(
    () => standingTileLocation({ tilePos, tileSettlements }),
    [tilePos, tileSettlements],
  );
  const onOutpostTile = loc.kind === "outpost" || loc.kind === "offboard";

  const occupation = state?.currentOutpost?.occupation ?? null;
  const currentGroup = state?.proficiency?.current?.group ?? "none";
  const currentTier =
    currentGroup === "none"
      ? null
      : (state?.proficiency?.groups?.[currentGroup]?.tier ?? 1);
  const levelCap = currentTier == null ? null : effectiveLevelCap(currentTier);
  const treasuryGold = state?.currentOutpost?.treasuryGold ?? 0;
  const viewerGuildId = state?.guild?.id ?? null;
  // 점령 길드원인지 — 세금 회수 권한 판정.
  const isMember =
    viewerGuildId != null &&
    occupation?.occupiedByGuildId != null &&
    viewerGuildId === occupation.occupiedByGuildId;
  const canClaim = isMember && treasuryGold > 0;

  const handleClaim = useCallback(async () => {
    if (!outpost || !canClaim) return;
    setClaiming(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/outpost/treasury/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outpostId: outpost.id }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        total?: number;
        claimerShare?: number;
        guildShare?: number;
      } | null;
      if (!j?.ok) {
        setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
        return;
      }
      setMsg(
        `✓ ${j.total ?? 0} G 회수 — 본인 +${j.claimerShare ?? 0} · 길드 +${j.guildShare ?? 0}`,
      );
      await refresh();
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setClaiming(false);
    }
  }, [outpost, canClaim, refresh]);

  return (
    <main className="text-zinc-900 dark:text-zinc-100">
      <div className="mx-auto max-w-[720px] space-y-4 p-6">
        {state?.character && (
          <V2CharacterCard
            character={state.character}
            guild={state.guild ?? null}
            levelCap={levelCap}
            showGold={true}
          />
        )}

        <GuideQuestBanner />

        <V2AnnouncementsPanel />

        {onOutpostTile && outpost && (
          <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-baseline gap-2">
              <MapPin
                size={16}
                weight="fill"
                className="shrink-0 text-emerald-500"
              />
              <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
                {outpost.name}
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {TYPE_LABEL[outpost.type]}
              </span>
              {outpost.neutral && (
                <span className="rounded bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  중립
                </span>
              )}
            </div>
            {outpost.description && (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {outpost.description}
              </p>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-zinc-500 dark:text-zinc-400">소속</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation?.occupiedByGuildName
                  ? `${occupation.occupiedByGuildName} 길드`
                  : occupation?.occupiedByUserId
                    ? "솔로 점령자"
                    : "무소속"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">세율</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation
                  ? formatTaxRate(occupation.taxRate)
                  : `${Math.round(OUTPOST_NPC_TAX_RATE * 100)}%`}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">정책</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation
                  ? POLICY_LABEL[occupation.policy] ?? occupation.policy
                  : "자유 통행"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">영주</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation?.lordName ?? "—"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">보유 골드</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                <span className="tabular-nums">
                  {treasuryGold.toLocaleString()}
                </span>{" "}
                G
              </dd>
            </dl>
            {/* 레거시 수동 금고 회수 — 정착지 전쟁 on 이면 영주 수확으로 일원화(숨김). */}
            {isMember && !V2_SETTLEMENT_WARFARE && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={claiming || !canClaim}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Coins size={14} weight="fill" />
                  {claiming
                    ? "회수 중…"
                    : treasuryGold > 0
                      ? `세금 회수 (본인 +${treasuryShares(treasuryGold).claimerShare.toLocaleString()} G)`
                      : "세금 회수 (금고 비어있음)"}
                </button>
              </div>
            )}
            {msg && (
              <p
                className={`mt-2 text-xs ${
                  msg.startsWith("✓")
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {msg}
              </p>
            )}
          </section>
        )}

        {/* 개척 정착지 칸 — 정착지 요약(상세 관리는 지도/거점 화면). */}
        {!onOutpostTile && loc.kind === "settlement" && (
          <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-baseline gap-2">
              <MapPin
                size={16}
                weight="fill"
                className="shrink-0 text-emerald-500"
              />
              <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
                {loc.settlement.name?.trim() ||
                  tileSettlementName(loc.settlement.col, loc.settlement.row)}
              </h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {TILE_TIER_LABEL[loc.settlement.tier as TileSettlementTier] ??
                  "정착지"}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-zinc-500 dark:text-zinc-400">소속</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {loc.settlement.guildName
                  ? `${loc.settlement.guildName} 길드`
                  : "솔로 개척자"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">세율</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {loc.settlement.taxRate != null
                  ? formatTaxRate(loc.settlement.taxRate)
                  : "—"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">정책</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {loc.settlement.policy != null
                  ? (POLICY_LABEL[loc.settlement.policy] ?? loc.settlement.policy)
                  : "—"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">영주</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {loc.settlement.lordName ?? "—"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">보유 골드</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                <span className="tabular-nums">
                  {(loc.settlement.treasuryGold ?? 0).toLocaleString()}
                </span>{" "}
                G
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">위치</dt>
              <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">
                ({loc.settlement.col}, {loc.settlement.row})
              </dd>
            </dl>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              상세 관리는 지도·거점 화면에서.
            </p>
          </section>
        )}

        {/* 빈 땅 칸 — 정착지가 없으니 거점 정보 대신 안내. */}
        {!onOutpostTile && loc.kind === "empty" && (
          <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-baseline gap-2">
              <MapPin
                size={16}
                weight="fill"
                className="shrink-0 text-zinc-400 dark:text-zinc-500"
              />
              <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
                빈 땅 ({loc.col}, {loc.row})
              </h2>
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              정착지가 없는 빈 땅입니다. 지도에서 다른 칸으로 이동하거나
              개척마을을 세울 수 있어요.
            </p>
          </section>
        )}

      </div>
    </main>
  );
}
