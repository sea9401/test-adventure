"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameState } from "./GameStateProvider";
import { Tooltip } from "@/components/ui/Tooltip";
import { terrainTraitOf } from "@/adventure/data/v2/outposts";
import {
  VILLAGE_TIER_NAME,
  TERRAIN_TRAIT_NAME,
  PRODUCTION_KIND_NAME,
  PRODUCTION_KINDS,
  TRAIT_BONUS_KIND,
  TRAIT_BONUS_PCT,
  UPGRADE_COST,
  VILLAGE_NAME_MAX,
  nextTier,
  terrainTraitDesc,
  type VillageTier,
  type ProductionKind,
  type TerrainTrait,
} from "@/adventure/data/v2/settlement";

// 길드 마을 패널 — 점령 거점 상세(OutpostView, isOwner) 에 노출.
//   건설 = 이름 + 특화 생산 종류(작물/광물/물고기)를 함께 정함(종류는 영구). 슬롯은 그 종류만
//   생산 — 슬롯마다 고르지 않는다. GET /api/v2/outpost/village 로 마을+재화 로드.

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
  productionKind: ProductionKind | null;
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
  // 거점 표시 이름(헤더·지도)은 GameState occupations.villageName 에서 옴 — 건설/개명 후
  //   동기화해야 같은 화면 헤더가 즉시 새 이름으로 갱신된다.
  const { refreshOccupations } = useGameState();
  const [village, setVillage] = useState<Village | null>(null);
  const [resources, setResources] = useState<Resources>({});
  const [exists, setExists] = useState<boolean | null>(null); // null=로딩
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [buildName, setBuildName] = useState(""); // 건설 폼 이름 입력
  const [buildKind, setBuildKind] = useState<ProductionKind | null>(null); // 특화 선택
  const [renaming, setRenaming] = useState(false); // 이름 변경 폼 토글
  const [renameName, setRenameName] = useState(""); // 이름 변경 입력
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
    async (path: string, body: Record<string, unknown>, syncName = false) => {
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
        } else if (syncName) {
          // 건설/개명 = 거점 표시 이름 변경 → GameState occupations 동기화(헤더·지도).
          void refreshOccupations();
        }
      } catch {
        setErr("network");
      } finally {
        setBusy(false);
        await load();
      }
    },
    [busy, outpostId, load, refreshOccupations],
  );

  // 슬롯 인덱스별 현재 작업 맵.
  const jobBySlot = useMemo(() => {
    const m = new Map<number, SlotState>();
    for (const s of village?.slots ?? []) m.set(s.slot, s);
    return m;
  }, [village]);

  // 거점 지형 특성 — 마을 있으면 GET 값, 없으면(빈 공터) id 로 파생.
  const trait: TerrainTrait = village?.trait ?? terrainTraitOf(outpostId);
  // 건설됨 = 이름 + 특화 종류 둘 다. 이름만 있고 종류 없는 옛 마을은 특화 선택 단계.
  const named = !!village && village.name != null;
  const built = named && village!.productionKind != null;
  // 업그레이드 가능 여부(클라 표시용 — 서버가 권위).
  const next = village ? nextTier(village.tier) : null;
  const upgradeCost = village ? (UPGRADE_COST[village.tier] ?? {}) : {};
  const canAfford =
    !!next &&
    PRODUCTION_KINDS.every((k) => (resources[k] ?? 0) >= (upgradeCost[k] ?? 0));

  if (exists === null) {
    return (
      <section className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        마을 정보 불러오는 중…
      </section>
    );
  }

  return (
    <section className="space-y-2 rounded-md border border-amber-300 bg-amber-50/40 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
      {/* 헤더 — 이름 · 단계 · 특화 + (건설된 마을) 이름 변경 + 지형 배지 */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          🏡 {named && village ? village.name : "빈 공터"}
          {built && village ? (
            <span className="font-normal text-zinc-600 dark:text-zinc-300">
              {" · "}
              {VILLAGE_TIER_NAME[village.tier]} ·{" "}
              {PRODUCTION_KIND_NAME[village.productionKind!]} 특화
            </span>
          ) : null}
          {named && village && !renaming && (
            <button
              type="button"
              onClick={() => {
                setRenameName(village.name ?? "");
                setErr(null);
                setRenaming(true);
              }}
              className="ml-1.5 rounded px-1 text-[11px] font-normal text-amber-700 hover:bg-amber-200/60 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              이름 변경
            </button>
          )}
        </h3>
        <Tooltip
          content={`${TERRAIN_TRAIT_NAME[trait]} — ${terrainTraitDesc(trait)}`}
          align="end"
          className="shrink-0"
          triggerClassName="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
        >
          {TERRAIN_TRAIT_NAME[trait]}
          {TRAIT_BONUS_KIND[trait] && (
            <>
              {" "}
              {PRODUCTION_KIND_NAME[TRAIT_BONUS_KIND[trait]!]} +{TRAIT_BONUS_PCT}%
            </>
          )}
        </Tooltip>
      </div>

      {/* 이름 변경 폼 — 명명된 마을만. */}
      {named && village && renaming && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            maxLength={VILLAGE_NAME_MAX}
            placeholder="새 마을 이름"
            disabled={busy}
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            disabled={busy || renameName.trim().length === 0}
            onClick={() => {
              void act("rename", { name: renameName.trim() }, true);
              setRenaming(false);
            }}
            className="shrink-0 rounded-md border border-amber-600 bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            저장
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRenaming(false)}
            className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            취소
          </button>
        </div>
      )}

      {!named ? (
        // 빈 공터 — 이름 + 특화 종류를 함께 정해 마을을 세운다.
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            점령한 빈 공터예요. 이름과 키울 것을 정해 마을을 세우세요.
          </p>
          <input
            type="text"
            value={buildName}
            onChange={(e) => setBuildName(e.target.value)}
            maxLength={VILLAGE_NAME_MAX}
            placeholder="마을 이름"
            disabled={busy}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <div>
            <div className="mb-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              무엇을 키울까요?{" "}
              <span className="text-zinc-400 dark:text-zinc-500">
                (한번 정하면 바꿀 수 없어요)
              </span>
            </div>
            <KindChoice
              trait={trait}
              selected={buildKind}
              onSelect={setBuildKind}
              disabled={busy}
            />
          </div>
          <button
            type="button"
            disabled={busy || buildName.trim().length === 0 || buildKind == null}
            onClick={() =>
              void act(
                "build",
                { name: buildName.trim(), kind: buildKind },
                true,
              )
            }
            className="w-full rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            마을 건설
          </button>
        </div>
      ) : !built ? (
        // 이름은 있는데 특화 미선택(옛 마을) — 종류만 정한다.
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            이 마을의 특화를 정하세요.{" "}
            <span className="text-zinc-400 dark:text-zinc-500">
              (한번 정하면 바꿀 수 없어요)
            </span>
          </p>
          <KindChoice
            trait={trait}
            selected={buildKind}
            onSelect={setBuildKind}
            disabled={busy}
          />
          <button
            type="button"
            disabled={busy || buildKind == null}
            onClick={() =>
              void act("build", { name: village!.name, kind: buildKind }, true)
            }
            className="w-full rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            특화 선택
          </button>
        </div>
      ) : (
        <>
          {/* 길드 재화 풀 */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
            {PRODUCTION_KINDS.map((k) => (
              <span key={k} className="tabular-nums">
                {PRODUCTION_KIND_NAME[k]} {resources[k] ?? 0}
              </span>
            ))}
          </div>

          {/* 슬롯 — 모두 마을 특화 종류를 생산. 빈 슬롯은 생산 시작, 완료는 수확. */}
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
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {slot + 1}번 슬롯 · 비어 있음
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act("produce", { slot })}
                        className="shrink-0 rounded-md border border-amber-600 bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {PRODUCTION_KIND_NAME[village.productionKind!]} 생산
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-xs">
                        <span className="font-medium">
                          {PRODUCTION_KIND_NAME[job.kind]}
                        </span>
                        <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                          {ready
                            ? "· 수확 가능"
                            : `· ${fmtRemaining(remaining)} 남음`}
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
                  : err === "not_built"
                    ? "먼저 마을을 건설해야 해요."
                    : err === "already_built"
                      ? "이미 세워진 마을이에요."
                      : err === "invalid_name"
                        ? "이름은 1~16자로 지어주세요."
                        : err === "invalid_kind"
                          ? "생산 종류를 골라주세요."
                          : `오류: ${err}`}
        </div>
      )}
    </section>
  );
}

// 특화 생산 종류 선택 — 작물/광물/물고기 토글. 지형 일치 종류엔 +보너스 표시(좋은 선택 유도).
function KindChoice({
  trait,
  selected,
  onSelect,
  disabled,
}: {
  trait: TerrainTrait;
  selected: ProductionKind | null;
  onSelect: (kind: ProductionKind) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRODUCTION_KINDS.map((k) => {
        const bonus = TRAIT_BONUS_KIND[trait] === k;
        const sel = selected === k;
        return (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(k)}
            className={
              "rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 " +
              (sel
                ? "border-amber-600 bg-amber-600 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800")
            }
          >
            {PRODUCTION_KIND_NAME[k]}
            {bonus ? (
              <span className={sel ? "text-amber-100" : "text-emerald-600 dark:text-emerald-400"}>
                {" "}
                +{TRAIT_BONUS_PCT}%
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
