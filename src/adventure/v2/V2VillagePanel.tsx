"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  VILLAGE_TIER_NAME,
  TERRAIN_TRAIT_NAME,
  PRODUCTION_KIND_NAME,
  PRODUCTION_KINDS,
  TRAIT_BONUS_KIND,
  TRAIT_BONUS_PCT,
  UPGRADE_COST,
  nextTier,
  type VillageTier,
  type ProductionKind,
  type TerrainTrait,
} from "@/adventure/data/v2/settlement";

// 길드 마을 생산 패널 — 점령 거점 상세(OutpostView, isOwner) 에 노출.
//   GET /api/v2/outpost/village 로 내 길드 마을+재화 로드 → 이 거점 마을의 슬롯 생산/수확/업그레이드.
//   슬롯 = 빈 칸(생산 종류 선택해 시작) / 진행 중(수확창 카운트다운) / 완료(수확). 재화는 길드 공용.

type SlotState = {
  slot: number;
  kind: ProductionKind;
  startedAt: number;
  remainingMs: number;
  ready: boolean;
};
type Village = {
  outpostId: string;
  name: string | null;
  tier: VillageTier;
  trait: TerrainTrait;
  slotCount: number;
  slots: SlotState[];
};
type Resources = Partial<Record<ProductionKind, number>>;

function fmtRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${sec}초`;
  return `${sec}초`;
}

export function V2VillagePanel({ outpostId }: { outpostId: string }) {
  const [village, setVillage] = useState<Village | null>(null);
  const [resources, setResources] = useState<Resources>({});
  const [exists, setExists] = useState<boolean | null>(null); // null=로딩
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 카운트다운용 — 로드 시각 기준 readyAt 환산 + 1초 틱.
  const [loadedAt, setLoadedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v2/outpost/village");
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        villages?: Village[];
        resources?: Resources;
      } | null;
      if (j?.ok) {
        const v = (j.villages ?? []).find((x) => x.outpostId === outpostId);
        setVillage(v ?? null);
        setExists(!!v);
        setResources(j.resources ?? {});
        setLoadedAt(Date.now());
      }
    } catch {
      // 무시 — 패널은 비치명
    }
  }, [outpostId]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      okMsg?: string,
    ) => {
      if (busy) return;
      setBusy(true);
      setErr(null);
      try {
        const r = await fetch(`/api/v2/outpost/village/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outpostId, ...body }),
        });
        const j = (await r.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (!r.ok || !j?.ok) {
          setErr(j?.error ?? "실패");
        }
      } catch {
        setErr("network");
      } finally {
        setBusy(false);
        await load();
      }
      void okMsg;
    },
    [busy, outpostId, load],
  );

  // 슬롯 인덱스별 현재 작업 맵.
  const jobBySlot = useMemo(() => {
    const m = new Map<number, SlotState>();
    for (const s of village?.slots ?? []) m.set(s.slot, s);
    return m;
  }, [village]);

  // 업그레이드 가능 여부(클라 표시용 — 서버가 권위).
  const next = village ? nextTier(village.tier) : null;
  const upgradeCost = village ? (UPGRADE_COST[village.tier] ?? {}) : {};
  const canAfford =
    !!next &&
    PRODUCTION_KINDS.every(
      (k) => (resources[k] ?? 0) >= (upgradeCost[k] ?? 0),
    );

  if (exists === null) {
    return (
      <section className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        마을 정보 불러오는 중…
      </section>
    );
  }

  return (
    <section className="space-y-2 rounded-md border border-amber-300 bg-amber-50/40 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          🏡 마을{" "}
          {village ? (
            <span className="text-zinc-600 dark:text-zinc-300">
              · {VILLAGE_TIER_NAME[village.tier]}
            </span>
          ) : null}
        </h3>
        {village && (
          <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
            {TERRAIN_TRAIT_NAME[village.trait]}
            {TRAIT_BONUS_KIND[village.trait] && (
              <>
                {" "}
                {PRODUCTION_KIND_NAME[TRAIT_BONUS_KIND[village.trait]!]} +
                {TRAIT_BONUS_PCT}%
              </>
            )}
          </span>
        )}
      </div>

      {/* 길드 재화 풀 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
        {PRODUCTION_KINDS.map((k) => (
          <span key={k} className="tabular-nums">
            {PRODUCTION_KIND_NAME[k]} {resources[k] ?? 0}
          </span>
        ))}
      </div>

      {!village ? (
        // 마을 미건설 — 빈 슬롯 1개로 첫 생산 시 자동 발생(PR-2 lazy). slot 0 에 종류 선택.
        <div className="space-y-1.5">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            아직 비어 있는 땅이에요. 생산을 시작하면 마을이 세워집니다.
          </div>
          <KindPicker
            disabled={busy}
            onPick={(kind) => void act("produce", { slot: 0, kind })}
          />
        </div>
      ) : (
        <>
          {/* 슬롯 목록 */}
          <ul className="space-y-1.5">
            {Array.from({ length: village.slotCount }, (_, slot) => {
              const job = jobBySlot.get(slot);
              const readyAt = job ? loadedAt + job.remainingMs : 0;
              const remaining = job ? Math.max(0, readyAt - now) : 0;
              const ready = job ? remaining <= 0 : false;
              return (
                <li
                  key={slot}
                  className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {!job ? (
                    <KindPicker
                      label={`${slot + 1}번 슬롯 비어 있음`}
                      disabled={busy}
                      onPick={(kind) => void act("produce", { slot, kind })}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-xs">
                        <span className="font-medium">
                          {PRODUCTION_KIND_NAME[job.kind]}
                        </span>
                        <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                          {ready ? "· 수확 가능" : `· ${fmtRemaining(remaining)} 남음`}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={busy || !ready}
                        onClick={() => void act("harvest", { slot })}
                        className="shrink-0 rounded-md border border-emerald-600 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        수확
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* 업그레이드 */}
          {next && (
            <button
              type="button"
              disabled={busy || !canAfford}
              onClick={() => void act("upgrade", {})}
              className="w-full rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {VILLAGE_TIER_NAME[next]}(으)로 업그레이드 ·{" "}
              {PRODUCTION_KINDS.filter((k) => (upgradeCost[k] ?? 0) > 0)
                .map((k) => `${PRODUCTION_KIND_NAME[k]} ${upgradeCost[k]}`)
                .join(" · ")}
            </button>
          )}
        </>
      )}

      {err && (
        <div className="text-xs text-rose-600 dark:text-rose-400">
          {err === "slot_busy"
            ? "이미 작업 중인 슬롯이에요."
            : err === "not_ready"
              ? "아직 수확할 수 없어요."
              : err === "insufficient"
                ? "재화가 부족해요."
                : err === "not_owner"
                  ? "이 거점의 점령 길드만 관리할 수 있어요."
                  : `오류: ${err}`}
        </div>
      )}
    </section>
  );
}

function KindPicker({
  label,
  disabled,
  onPick,
}: {
  label?: string;
  disabled?: boolean;
  onPick: (kind: ProductionKind) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label && (
        <span className="mr-1 text-xs text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
      )}
      {PRODUCTION_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          onClick={() => onPick(k)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {PRODUCTION_KIND_NAME[k]} 생산
        </button>
      ))}
    </div>
  );
}
