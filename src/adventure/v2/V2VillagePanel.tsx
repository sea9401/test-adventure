"use client";

import { useCallback, useEffect, useState } from "react";
import { useGameState } from "./GameStateProvider";
import { Tooltip } from "@/components/ui/Tooltip";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { terrainTraitOf } from "@/adventure/data/v2/outposts";
import {
  isTileOutpostId,
  parseTileOutpostId,
} from "@/adventure/data/v2/tileWarfare";
import {
  scaledTileGoldCost,
  scaledTileResourceCost,
  tileSlotUnlockGoldCost,
} from "@/adventure/data/v2/tileConfig";
import {
  VILLAGE_TIER_NAME,
  TERRAIN_TRAIT_NAME,
  PRODUCTION_KIND_NAME,
  PRODUCTION_KIND_ICON,
  PRODUCTION_KINDS,
  TRAIT_BONUS_KIND,
  TRAIT_BONUS_PCT,
  UPGRADE_COST,
  VILLAGE_NAME_MAX,
  VILLAGE_BUILD_GOLD_COST,
  GRID_DISPLAY_COLS,
  GRID_DISPLAY_SLOTS,
  nextTier,
  slotUnlockGoldCost,
  terrainTraitDesc,
  type VillageTier,
  type ProductionKind,
  type TerrainTrait,
} from "@/adventure/data/v2/settlement";
import {
  SETTLEMENT_MATERIAL_ID,
  SETTLEMENT_MATERIALS,
} from "@/adventure/data/v2/settlementMaterials";

// 길드 마을 패널 — 점령 거점 상세(OutpostView)에 노출. mode 로 두 화면을 분리:
//   - produce(탭, 길드원 전원): 정착지 재화 풀 + 재료 기부 + 슬롯 판(자리표시) 보기.
//   - manage(관리 탭, 마스터/부마스터): 마을 건설(이름)·이름 변경·칸 해금(골드)·단계 업그레이드.
//   [PR-3] 슬롯 생산 폐지 — 슬롯은 "미래 영지 건물" 자리표시. crop/ore 는 사냥 드랍→기부+업글로만.

type Village = {
  outpostId: string;
  name: string | null;
  tier: VillageTier;
  trait: TerrainTrait;
  unlockedSlots: number;
  maxSlots: number; // 이 단계 해금 상한(마을 2·도시 3·대도시 4). 화면 판은 2×2(4).
};
type Resources = Partial<Record<ProductionKind, number>>;

// 큰 골드는 만 단위로 — 50,000,000 → "5,000만".
function fmtGold(n: number): string {
  if (n >= 10000) return `${Math.floor(n / 10000).toLocaleString()}만`;
  return n.toLocaleString();
}

function costLabel(cost: Resources): string {
  return PRODUCTION_KINDS.filter((k) => (cost[k] ?? 0) > 0)
    .map((k) => `${PRODUCTION_KIND_ICON[k]} ${PRODUCTION_KIND_NAME[k]} ${cost[k]}`)
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
  // 타일 개척마을 — 이름은 개척(found) 때 한 번만 정한다. 건설 시 이름 재입력 없음·개명 없음(불변).
  //   카탈로그 거점은 종전대로 건설 시 이름 입력 + 개명 가능.
  const isTile = isTileOutpostId(outpostId);
  const [village, setVillage] = useState<Village | null>(null);
  const [resources, setResources] = useState<Resources>({});
  const [gold, setGold] = useState(0); // 길드 금고 골드(칸 해금 비용)
  const [exists, setExists] = useState<boolean | null>(null); // null=로딩
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [buildName, setBuildName] = useState(""); // 건설 폼 이름 입력
  const [renaming, setRenaming] = useState(false); // 이름 변경 폼 토글
  const [renameName, setRenameName] = useState(""); // 이름 변경 입력
  // 재료 기부 — 개인 인벤(통나무/철광석) → 정착지 풀(crop/ore). 길드원 전원 가능.
  const [inv, setInv] = useState<Record<string, number>>({}); // 개인 보유 재료
  const [donateOpen, setDonateOpen] = useState(false);
  const [donateTimber, setDonateTimber] = useState("");
  const [donateIronOre, setDonateIronOre] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(
        isTileOutpostId(outpostId)
          ? `/api/v2/outpost/village?outpostId=${encodeURIComponent(outpostId)}`
          : "/api/v2/outpost/village",
      );
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        villages?: Village[];
        resources?: Resources;
        gold?: number;
      } | null;
      if (j?.ok) {
        const v = (j.villages ?? []).find((x) => x.outpostId === outpostId);
        setVillage(v ?? null);
        setExists(!!v);
        setResources(j.resources ?? {});
        setGold(j.gold ?? 0);
      }
    } catch {
      // 무시 — 패널은 비치명
    }
  }, [outpostId]);
  useEffect(() => {
    void load();
  }, [load]);

  // 개인 보유 재료(통나무/철광석) — 기부 폼의 보유량/상한 표시용.
  const loadInv = useCallback(async () => {
    try {
      const r = await fetch("/api/v2/me/inventory");
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        materials?: Record<string, number>;
      } | null;
      if (j?.ok) setInv(j.materials ?? {});
    } catch {
      // 무시 — 기부는 비치명
    }
  }, []);
  useEffect(() => {
    void loadInv();
  }, [loadInv]);

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

  // 재료 기부 제출 — 0 초과 입력만 추려 donate 호출 후 보유/풀 갱신.
  const submitDonate = useCallback(async () => {
    const t = Math.floor(Number(donateTimber) || 0);
    const o = Math.floor(Number(donateIronOre) || 0);
    const donations: Record<string, number> = {};
    if (t > 0) donations[SETTLEMENT_MATERIAL_ID.timber] = t;
    if (o > 0) donations[SETTLEMENT_MATERIAL_ID.ironOre] = o;
    if (Object.keys(donations).length === 0) return;
    await act("donate", { donations });
    setDonateTimber("");
    setDonateIronOre("");
    setDonateOpen(false);
    await loadInv();
  }, [donateTimber, donateIronOre, act, loadInv]);

  // 거점 지형 특성 — 마을 있으면 GET 값, 없으면(빈 공터) id 로 파생.
  const trait: TerrainTrait = village?.trait ?? terrainTraitOf(outpostId);
  // 골드 출처 표기 — 타일 정착지는 길드 금고(길드 타일) 또는 본인 골드(솔로)라 중립 "보유"로.
  const goldNoun = isTileOutpostId(outpostId) ? "보유" : "길드 금고";
  // 건설됨 = 이름.
  const built = !!village && village.name != null;

  if (exists === null) {
    return (
      <section className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        마을 정보 불러오는 중…
      </section>
    );
  }

  // 슬롯 판 그리드 — [PR-3] 생산 폐지. 칸 상태만: 상위단계 필요(흐림)·잠김(🔒)·해금=자리표시(건물 예정).
  function renderGrid() {
    if (!village || !built) return null;
    return (
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${GRID_DISPLAY_COLS}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: GRID_DISPLAY_SLOTS }, (_, slot) => {
          // 판은 2×2. 이 단계 상한(maxSlots) 너머 = 상위 단계 필요(tierLocked, 흐리게).
          //   그 안에서 아직 안 연 칸 = 지금 해금 가능(locked, 🔒). 해금된 칸 = 자리표시.
          const tierLocked = slot >= village.maxSlots;
          const locked = !tierLocked && slot >= village.unlockedSlots;
          const base =
            "flex aspect-square flex-col items-center justify-center rounded-md border px-1 text-center";
          if (tierLocked) {
            return (
              <div
                key={slot}
                className={`${base} border-dashed border-zinc-200 bg-zinc-50 text-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-700`}
                title="다음 단계로 업그레이드하면 열 수 있어요"
              >
                <span className="text-xs leading-none">·</span>
              </div>
            );
          }
          if (locked) {
            return (
              <div
                key={slot}
                className={`${base} border-dashed border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500`}
              >
                <span className="text-base leading-none">🔒</span>
                <span className="mt-1 text-[10px]">잠김</span>
              </div>
            );
          }
          // 해금된 칸 — 자리표시(미래 영지 건물용·현재 비어 있음).
          return (
            <div
              key={slot}
              title="미래 영지 건물용 자리 (준비 중)"
              className={`${base} border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500`}
            >
              <span className="text-base leading-none opacity-60">🏗️</span>
              <span className="mt-0.5 text-[10px]">건물 예정</span>
            </div>
          );
        })}
      </div>
    );
  }

  const header = (
    <div className="flex items-start justify-between gap-2">
      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        🏡 {village?.name ?? "빈 공터"}
        {built && village ? (
          <span className="font-normal text-zinc-600 dark:text-zinc-300">
            {" · "}
            {VILLAGE_TIER_NAME[village.tier]}
          </span>
        ) : null}
      </h3>
      <Tooltip
        content={`${TERRAIN_TRAIT_NAME[trait]} — ${terrainTraitDesc(trait)}`}
        align="end"
        className="shrink-0"
        triggerClassName="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
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
          {PRODUCTION_KIND_ICON[k]} {PRODUCTION_KIND_NAME[k]} {resources[k] ?? 0}
        </span>
      ))}
    </div>
  );

  // ── 재료 기부 ── 개인 인벤(통나무/철광석)을 정착지 풀(crop/ore)에 적립. 길드원 전원. ──────
  const ownTimber = inv[SETTLEMENT_MATERIAL_ID.timber] ?? 0;
  const ownIronOre = inv[SETTLEMENT_MATERIAL_ID.ironOre] ?? 0;
  const dT = Math.floor(Number(donateTimber) || 0);
  const dO = Math.floor(Number(donateIronOre) || 0);
  const donateValid =
    (dT > 0 || dO > 0) && dT <= ownTimber && dO <= ownIronOre;
  const donateRows = [
    {
      id: SETTLEMENT_MATERIAL_ID.timber,
      label: SETTLEMENT_MATERIALS[SETTLEMENT_MATERIAL_ID.timber].name,
      own: ownTimber,
      val: donateTimber,
      set: setDonateTimber,
    },
    {
      id: SETTLEMENT_MATERIAL_ID.ironOre,
      label: SETTLEMENT_MATERIALS[SETTLEMENT_MATERIAL_ID.ironOre].name,
      own: ownIronOre,
      val: donateIronOre,
      set: setDonateIronOre,
    },
  ];
  const donateBox = built ? (
    <div className="text-xs">
      {!donateOpen ? (
        <button
          type="button"
          onClick={() => setDonateOpen(true)}
          disabled={busy}
          className="rounded bg-zinc-200 px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
        >
          재료 기부
        </button>
      ) : (
        <div className="space-y-1.5 rounded border border-zinc-200 p-2 dark:border-zinc-700">
          <p className="text-zinc-500 dark:text-zinc-400">
            개인 인벤의 재료를 정착지 발전에 기부합니다.
          </p>
          {donateRows.map((row) => (
            <label key={row.id} className="flex items-center gap-2">
              <span className="w-12 shrink-0">{row.label}</span>
              <input
                type="number"
                min={0}
                max={row.own}
                value={row.val}
                onChange={(e) => row.set(e.target.value)}
                className="w-20 rounded border border-zinc-300 bg-white px-1.5 py-0.5 tabular-nums dark:border-zinc-600 dark:bg-zinc-800"
              />
              <span className="text-zinc-400">보유 {row.own}</span>
            </label>
          ))}
          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              onClick={submitDonate}
              disabled={busy || !donateValid}
              className="rounded bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              기부하기
            </button>
            <button
              type="button"
              onClick={() => {
                setDonateOpen(false);
                setDonateTimber("");
                setDonateIronOre("");
              }}
              disabled={busy}
              className="rounded px-2 py-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const errBox = err ? (
    <div className="text-xs text-rose-600 dark:text-rose-400">
      {ERR_MESSAGES[err] ?? `오류: ${err}`}
    </div>
  ) : null;

  // ── 생산 탭 ── 슬롯 판 그리드(전원). 미건설/미해금이면 관리 탭 안내. ──────────────
  if (mode === "produce") {
    return (
      <section className={`${SURFACE_CARD} space-y-2 p-3`}>
        {header}
        {!built ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            아직 마을이 없어요. 관리 탭에서 마을을 건설하세요.
          </p>
        ) : (
          <>
            {resourcePool}
            {donateBox}
            {village!.unlockedSlots === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                아직 해금된 칸이 없어요. 관리 탭에서 칸을 해금할 수 있어요(추후
                영지 건물용 자리).
              </p>
            ) : (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                해금한 칸은 추후 영지 건물용 자리입니다(현재 비어 있음). 통나무·철광석은
                사냥에서 얻어 위 풀에 기부하세요.
              </p>
            )}
            {renderGrid()}
          </>
        )}
        {errBox}
      </section>
    );
  }

  // ── 관리 탭 ── 건설(이름)·이름 변경·칸 해금(골드+종류)·단계 업그레이드. ──────────
  const next = village ? nextTier(village.tier) : null;
  // 리베라(중앙) 거리 비용 배수 — 타일이면 거리 스케일, 카탈로그 거점이면 기본(불변). 서버 과금과 일치.
  const tilePos = parseTileOutpostId(outpostId);
  const upgradeCost =
    village && tilePos
      ? scaledTileResourceCost(
          UPGRADE_COST[village.tier] ?? {},
          tilePos.col,
          tilePos.row,
        )
      : village
        ? (UPGRADE_COST[village.tier] ?? {})
        : {};
  const atMaxSlots = !!village && village.unlockedSlots >= village.maxSlots;
  const needSlots = !!village && !atMaxSlots; // 단계 업그레이드 전 판을 다 채워야
  const canAffordUpgrade =
    !!next &&
    !needSlots &&
    PRODUCTION_KINDS.every((k) => (resources[k] ?? 0) >= (upgradeCost[k] ?? 0));
  // 칸 해금비 — 타일은 고정 누진(거리 무관·5천만/1억/2억/3억), 카탈로그 거점은 옛 누진.
  const unlockGold = village
    ? tilePos
      ? tileSlotUnlockGoldCost(village.unlockedSlots)
      : slotUnlockGoldCost(village.unlockedSlots)
    : 0;
  const canAffordUnlock = !atMaxSlots && gold >= unlockGold;
  const buildGold = tilePos
    ? scaledTileGoldCost(VILLAGE_BUILD_GOLD_COST, tilePos.col, tilePos.row)
    : VILLAGE_BUILD_GOLD_COST;

  return (
    <section className={`${SURFACE_CARD} space-y-2 p-3`}>
      {header}
      {/* 개명 — 카탈로그 거점만(타일 개척마을은 이름 불변·개척 때 한 번만). */}
      {built && village && !isTile && (
        <button
          type="button"
          onClick={() => {
            setRenameName(village.name ?? "");
            setErr(null);
            setRenaming((v) => !v);
          }}
          className="rounded px-1 text-[11px] font-normal text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          이름 변경
        </button>
      )}

      {/* 이름 변경 폼 — 카탈로그 거점만. */}
      {built && village && !isTile && renaming && (
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
            className="shrink-0 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
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

      {!built ? (
        // 빈 공터 — 마을을 세운다(종류는 칸 해금 때 고른다). 건설에 길드 골드 1천만.
        //   타일 개척마을: 이름은 개척 때 정한 이름을 그대로 쓴다(재입력 없음). 카탈로그: 이름 입력.
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {isTile
              ? "점령한 빈 공터예요. 마을을 세우세요(이름은 개척 때 정한 이름을 씁니다)."
              : "점령한 빈 공터예요. 이름을 정해 마을을 세우세요."}
          </p>
          <div className="text-xs text-zinc-600 dark:text-zinc-300">
            {goldNoun}{" "}
            <span className="font-medium tabular-nums">{fmtGold(gold)}</span> 골드
          </div>
          {!isTile && (
            <input
              type="text"
              value={buildName}
              onChange={(e) => setBuildName(e.target.value)}
              maxLength={VILLAGE_NAME_MAX}
              placeholder="마을 이름"
              disabled={busy}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          )}
          <button
            type="button"
            disabled={
              busy ||
              (!isTile && buildName.trim().length === 0) ||
              gold < buildGold
            }
            onClick={() =>
              void act(
                "build",
                isTile ? {} : { name: buildName.trim() },
                true,
              )
            }
            className="w-full rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            마을 건설 · {fmtGold(buildGold)} 골드
          </button>
          {gold < buildGold && (
            <p className="text-[11px] text-rose-500 dark:text-rose-400">
              {goldNoun} 골드가 부족해요 (보유 {fmtGold(gold)}).
            </p>
          )}
        </div>
      ) : (
        <>
          {resourcePool}
          <div className="text-xs text-zinc-600 dark:text-zinc-300">
            {goldNoun}{" "}
            <span className="font-medium tabular-nums">{fmtGold(gold)}</span> 골드
          </div>
          {/* 슬롯 판 미리보기(읽기 전용) — 잠김/해금/자리표시. */}
          {renderGrid()}

          {/* 칸 해금 — 길드 골드(자리표시 칸·추후 영지 건물용) */}
          <div className="space-y-1.5">
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
              <>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  칸을 열어 두면 추후 영지 건물용 자리로 쓰입니다(현재 비어 있음).
                </div>
                <button
                  type="button"
                  disabled={busy || !canAffordUnlock}
                  onClick={() => void act("unlock-slot", {})}
                  className="w-full rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  칸 해금 · {fmtGold(unlockGold)} 골드
                </button>
                {!canAffordUnlock && (
                  <p className="text-[11px] text-rose-500 dark:text-rose-400">
                    {goldNoun} 골드가 부족해요 (보유 {fmtGold(gold)}).
                  </p>
                )}
              </>
            )}
          </div>

          {/* 단계 업그레이드 */}
          {next && (
            <div className="space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
              <button
                type="button"
                disabled={busy || !canAffordUpgrade}
                onClick={() => void act("upgrade", {})}
                className="w-full rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
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
  insufficient: "재화가 부족해요.",
  insufficient_gold: "길드 금고 골드가 부족해요.",
  insufficient_material: "보유한 재료가 부족해요.",
  bad_request: "잘못된 요청이에요.",
  not_owner: "이 거점의 점령 길드만 관리할 수 있어요.",
  not_authorized: "길드 마스터·부마스터만 관리할 수 있어요.",
  not_built: "먼저 마을을 건설해야 해요.",
  already_built: "이미 세워진 마을이에요.",
  invalid_name: "이름은 1~16자로 지어주세요.",
  need_slots: "먼저 이 단계의 칸을 모두 해금해야 해요.",
  at_max: "판이 가득 찼어요 — 다음 단계로 업그레이드하세요.",
  max_tier: "이미 최고 단계예요.",
};
