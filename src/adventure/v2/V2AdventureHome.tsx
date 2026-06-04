"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, DoorOpen, MapPin } from "@phosphor-icons/react";
import {
  V2CharacterCard,
  type V2CharacterCardData,
} from "./V2CharacterCard";
import { V2AnnouncementsPanel } from "./V2AnnouncementsPanel";
import { OUTPOSTS, OUTPOST_NPC_TAX_RATE } from "@/adventure/data/v2/outposts";
import type {
  Outpost,
  OutpostType,
  OutpostTier,
} from "@/adventure/data/v2/types";
import type {
  V2EquipInstance,
  V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

// 모험 탭 — 캐릭 카드 + 현 위치 거점 카드 (세부 정보 + 액션).

type OccupationInfo = {
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedByGuildName: string | null;
  occupiedAt: string;
  policy: string;
  taxRate: string;
  nextAttackAt: string;
};

type StateResponse = {
  ok?: boolean;
  character?: V2CharacterCardData;
  guild?: { id: number; name: string } | null;
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
const TIER_LABEL: Record<OutpostTier, string> = {
  1: "마을",
  2: "거점",
  3: "도시",
  4: "왕국",
};
const POLICY_LABEL: Record<string, string> = {
  open: "개방",
  guild_only: "길드 전용",
};

function formatTaxRate(taxRate: string): string {
  // DB 가 NUMERIC 문자열 ("0.10" 등). 정수 % 로 환산.
  const n = Number(taxRate);
  if (!Number.isFinite(n)) return taxRate;
  return `${Math.round(n * 100)}%`;
}

function formatNextAttack(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = t - Date.now();
  if (diff <= 0) return "공격 가능";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}분 후`;
  const h = Math.floor(m / 60);
  return `${h}시간 후`;
}

export function V2AdventureHome({
  currentOutpost,
  onEnterOutpost,
}: {
  currentOutpost: { id: string; name: string } | null;
  onEnterOutpost: (outpost: Outpost) => void;
}) {
  const [state, setState] = useState<StateResponse | null>(null);
  // 모험 탭 간략 카드에 장착 장비를 표시 — me/state 는 장비를 안 담으므로 별도 fetch.
  const [equipped, setEquipped] = useState<
    Partial<Record<V2EquipSlot, string>>
  >({});
  const [owned, setOwned] = useState<V2EquipInstance[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [stateRes, equipRes] = await Promise.all([
        fetch("/api/v2/me/state"),
        // 장비는 부가 표시 — fetch 자체가 실패해도 카드 본체 렌더를 막지 않게 흡수.
        fetch("/api/v2/me/equipment").catch(() => null),
      ]);
      const j = (await stateRes.json().catch(() => null)) as StateResponse | null;
      setState(j ?? { ok: false });
      if (equipRes && equipRes.ok) {
        const ej = (await equipRes.json().catch(() => null)) as {
          owned?: V2EquipInstance[];
          equipped?: Partial<Record<V2EquipSlot, string>>;
        } | null;
        setEquipped(ej?.equipped ?? {});
        setOwned(ej?.owned ?? []);
      }
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

  const occupation = state?.currentOutpost?.occupation ?? null;
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
            showGold={true}
            equipped={equipped}
            owned={owned}
          />
        )}

        <V2AnnouncementsPanel />

        {outpost && (
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
                {TYPE_LABEL[outpost.type]} · {TIER_LABEL[outpost.tier]}
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
              <dt className="text-zinc-500 dark:text-zinc-400">보유</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation
                  ? occupation.occupiedByGuildName
                    ? `${occupation.occupiedByGuildName} 길드`
                    : occupation.occupiedByUserId
                      ? "솔로 점령자"
                      : "—"
                  : "NPC 운영"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">세율</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation
                  ? formatTaxRate(occupation.taxRate)
                  : `${Math.round(OUTPOST_NPC_TAX_RATE * 100)}% (NPC)`}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">정책</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation
                  ? POLICY_LABEL[occupation.policy] ?? occupation.policy
                  : "—"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">다음 공격</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {occupation ? formatNextAttack(occupation.nextAttackAt) : "—"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">보유 골드</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                <span className="tabular-nums">
                  {treasuryGold.toLocaleString()}
                </span>{" "}
                G
              </dd>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onEnterOutpost(outpost)}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                <DoorOpen size={16} weight="fill" />
                거점 진입
              </button>
              {isMember && (
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
                      ? `세금 회수 (본인 +${Math.floor((treasuryGold * 10) / 100).toLocaleString()} G)`
                      : "세금 회수 (금고 비어있음)"}
                </button>
              )}
            </div>
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

      </div>
    </main>
  );
}
