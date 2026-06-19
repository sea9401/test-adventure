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
  slotUnlockCost,
  terrainTraitDesc,
  type VillageTier,
  type ProductionKind,
  type TerrainTrait,
} from "@/adventure/data/v2/settlement";

// 길드 마을 패널 — 점령 거점 상세(OutpostView)에 노출. mode 로 두 화면을 분리:
//   - produce(생산 탭, 길드원 전원): 슬롯 판(2×2 마을 / 3×3 도시) 그리드에서 생산 시작·수확.
//   - manage(관리 탭, 마스터/부마스터): 마을 건설·이름 변경·칸 해금·단계 업그레이드.
//   판은 건설 직후 1칸만 열려 있고 나머지는 재화로 한 칸씩 해금(관리 탭). 단계 업그레이드가 판 확장.

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
  unlockedSlots: number;
  maxSlots: number;
  gridCols: number;
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

function costLabel(cost: Resources): string {
  return PRODUCTION_KINDS.filter((k) => (cost[k] ?? 0) > 0)
    .map((k) => `${PRODUCTION_KIND_NAME[k]} ${cost[k]}`)
    .join(" · ");
}

export function V2VillagePanel({
  outpostId,
  mode = "produce",
}: {
  outpostId: string;
  mode?: "produce" | "manage";
}) {
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

  if (exists === null) {
    return (
      <section className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        마을 정보 불러오는 중…
      </section>
    );
  }

  // 슬롯 판 그리드 — interactive(생산 탭)면 빈 칸=생산 시작·완료 칸=수확 버튼, 아니면(관리 탭) 상태만.
  function renderGrid(interactive: boolean) {
    if (!village || !built) return null;
    return (
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${village.gridCols}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: village.maxSlots }, (_, slot) => {
          const locked = slot >= village.unlockedSlots;
          const job = jobBySlot.get(slot);
          const readyAt = job ? loadedAt + job.remainingMs : 0;
          const remaining = job ? Math.max(0, readyAt - now) : 0;
          const ready = job ? remaining <= 0 : false;
          const base =
            "flex aspect-square flex-col items-center justify-center rounded-md border px-1 text-center";
          if (locked) {
            return (
              <div
                key={slot}
                className={`${base} border-dashed border-zinc-300 bg-zinc-100/60 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-600`}
              >
                <span className="text-base leading-none">🔒</span>
                <span className="mt-1 text-[10px]">잠김</span>
              </div>
            );
          }
          if (job) {
            if (ready && interactive) {
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={busy}
                  onClick={() => void act("harvest", { slot })}
                  className={`${base} border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300`}
                >
                  <span className="text-[11px] font-medium">
                    {PRODUCTION_KIND_NAME[job.kind]}
                  </span>
                  <span className="mt-0.5 text-[10px] font-semibold">수확 ✓</span>
                </button>
              );
            }
            return (
              <div
                key={slot}
                className={`${base} border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300`}
              >
                <span className="text-[11px] font-medium">
                  {PRODUCTION_KIND_NAME[job.kind]}
                </span>
                <span className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {ready ? "수확 가능" : fmtRemaining(remaining)}
                </span>
              </div>
            );
          }
          // 빈 칸(해금됨).
          if (interactive) {
            return (
              <button
                key={slot}
                type="button"
                disabled={busy}
                onClick={() => void act("produce", { slot })}
                className={`${base} border-amber-300 bg-white text-amber-700 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-950/30`}
              >
                <span className="text-base leading-none">＋</span>
                <span className="mt-1 text-[10px]">
                  {PRODUCTION_KIND_NAME[village.productionKind!]} 생산
                </span>
              </button>
            );
          }
          return (
            <div
              key={slot}
              className={`${base} border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600`}
            >
              <span className="text-[10px]">비어 있음</span>
            </div>
          );
        })}
      </div>
    );
  }

  const header = (
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
  );

  const resourcePool = (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
      {PRODUCTION_KINDS.map((k) => (
        <span key={k} className="tabular-nums">
          {PRODUCTION_KIND_NAME[k]} {resources[k] ?? 0}
        </span>
      ))}
    </div>
  );

  const errBox = err ? (
    <div className="text-xs text-rose-600 dark:text-rose-400">
      {ERR_MESSAGES[err] ?? `오류: ${err}`}
    </div>
  ) : null;

  // ── 생산 탭 ── 슬롯 판 그리드(전원). 미건설이면 관리 탭 안내. ─────────────────
  if (mode === "produce") {
    return (
      <section className="space-y-2 rounded-md border border-amber-300 bg-amber-50/40 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
        {header}
        {!built ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            아직 마을이 없어요. 관리 탭에서 마을을 건설하면 이곳에서 생산할 수
            있어요.
          </p>
        ) : (
          <>
            {resourcePool}
            {renderGrid(true)}
          </>
        )}
        {errBox}
      </section>
    );
  }

  // ── 관리 탭 ── 건설·이름 변경·칸 해금·단계 업그레이드(마스터/부마스터). ──────────
  const next = village ? nextTier(village.tier) : null;
  const upgradeCost = village ? (UPGRADE_COST[village.tier] ?? {}) : {};
  const atMaxSlots = !!village && village.unlockedSlots >= village.maxSlots;
  const needSlots = !!village && !atMaxSlots; // 단계 업그레이드 전 판을 다 채워야
  const canAffordUpgrade =
    !!next &&
    !needSlots &&
    PRODUCTION_KINDS.every((k) => (resources[k] ?? 0) >= (upgradeCost[k] ?? 0));
  const unlockCost =
    built && village?.productionKind
      ? slotUnlockCost(village.productionKind, village.unlockedSlots)
      : {};
  const canAffordUnlock =
    !!village?.productionKind &&
    !atMaxSlots &&
    (resources[village.productionKind] ?? 0) >=
      (unlockCost[village.productionKind] ?? 0);

  return (
    <section className="space-y-2 rounded-md border border-amber-300 bg-amber-50/40 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
      {header}
      {named && village && (
        <button
          type="button"
          onClick={() => {
            setRenameName(village.name ?? "");
            setErr(null);
            setRenaming((v) => !v);
          }}
          className="rounded px-1 text-[11px] font-normal text-amber-700 hover:bg-amber-200/60 dark:text-amber-300 dark:hover:bg-amber-900/40"
        >
          이름 변경
        </button>
      )}

      {/* 이름 변경 폼 */}
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
          {resourcePool}
          {/* 슬롯 판 미리보기(읽기 전용) — 잠김/해금 시각화. */}
          {renderGrid(false)}

          {/* 칸 해금 */}
          <div className="space-y-1">
            <div className="text-xs text-zinc-600 dark:text-zinc-300">
              해금된 칸{" "}
              <span className="font-medium tabular-nums">
                {village!.unlockedSlots} / {village!.maxSlots}
              </span>
            </div>
            {atMaxSlots ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                이 단계의 판을 모두 열었어요. 다음 단계로 업그레이드하면 판이
                넓어져요.
              </p>
            ) : (
              <button
                type="button"
                disabled={busy || !canAffordUnlock}
                onClick={() => void act("unlock-slot", {})}
                className="w-full rounded-md border border-amber-600 bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                칸 해금 · {costLabel(unlockCost)}
              </button>
            )}
          </div>

          {/* 단계 업그레이드 */}
          {next && (
            <div className="space-y-1 border-t border-amber-200 pt-2 dark:border-amber-900/40">
              <button
                type="button"
                disabled={busy || !canAffordUpgrade}
                onClick={() => void act("upgrade", {})}
                className="w-full rounded-md border border-amber-700 bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {VILLAGE_TIER_NAME[next]}(으)로 업그레이드 ·{" "}
                {costLabel(upgradeCost)}
              </button>
              {needSlots && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  먼저 이 단계의 칸을 모두 해금해야 업그레이드할 수 있어요.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {errBox}
    </section>
  );
}

const ERR_MESSAGES: Record<string, string> = {
  slot_busy: "이미 작업 중인 칸이에요.",
  not_ready: "아직 수확할 수 없어요.",
  insufficient: "재화가 부족해요.",
  not_owner: "이 거점의 점령 길드만 관리할 수 있어요.",
  not_authorized: "길드 마스터·부마스터만 관리할 수 있어요.",
  not_built: "먼저 마을을 건설해야 해요.",
  already_built: "이미 세워진 마을이에요.",
  invalid_name: "이름은 1~16자로 지어주세요.",
  invalid_kind: "생산 종류를 골라주세요.",
  need_slots: "먼저 이 단계의 칸을 모두 해금해야 해요.",
  at_max: "판이 가득 찼어요 — 다음 단계로 업그레이드하세요.",
  max_tier: "이미 최고 단계예요.",
};

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
              <span
                className={
                  sel
                    ? "text-amber-100"
                    : "text-emerald-600 dark:text-emerald-400"
                }
              >
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
