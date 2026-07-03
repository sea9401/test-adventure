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
  SETTLEMENT_RESOURCE_NAME,
  PRODUCTION_KIND_ICON,
  PRODUCTION_KINDS,
  UPGRADE_COST,
  VILLAGE_NAME_MAX,
  VILLAGE_BUILD_GOLD_COST,
  nextTier,
  slotUnlockGoldCost,
  terrainTraitDesc,
  SETTLEMENT_BUILDINGS,
  PLACEABLE_SETTLEMENT_BUILDING_IDS,
  nextSettlementBuildingUpgrade,
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
  settlementBuildingUpgradeSummary,
  settlementBuildingUpgradeCostText,
  type SettlementBuildingId,
  type SettlementBuildingSlot,
  type VillageTier,
  type ProductionKind,
  type TerrainTrait,
} from "@/adventure/data/v2/settlement";
import {
  SETTLEMENT_MATERIAL_ID,
  SETTLEMENT_MATERIALS,
} from "@/adventure/data/v2/settlementMaterials";

// 길드 마을 관리 패널 — 점령 거점 상세(OutpostView)에 노출.
//   마스터/부마스터: 마을 건설(이름)·이름 변경·건축물 슬롯 해금·배치·단계 업그레이드.
//   [PR-3] 슬롯 생산 폐지 — 슬롯은 영지 건축물 자리. crop/ore 는 사냥 드랍→기부+업글로만.

type Village = {
  outpostId: string;
  name: string | null;
  tier: VillageTier;
  trait: TerrainTrait;
  unlockedSlots: number;
  maxSlots: number; // 이 단계 해금 상한. 현재 정책은 마을별 1칸.
  buildings?: Record<string, SettlementBuildingId | SettlementBuildingSlot>;
};
type Resources = Partial<Record<ProductionKind, number>>;

// 큰 골드는 억/만 단위로 — 5,000만 → "5,000만", 1억 → "1억", 1억 5,000만 → "1억 5,000만".
function fmtGold(n: number): string {
  const EOK = 100_000_000;
  const MAN = 10_000;
  if (n >= EOK) {
    const eok = Math.floor(n / EOK);
    const man = Math.floor((n % EOK) / MAN);
    return man > 0
      ? `${eok.toLocaleString()}억 ${man.toLocaleString()}만`
      : `${eok.toLocaleString()}억`;
  }
  if (n >= MAN) return `${Math.floor(n / MAN).toLocaleString()}만`;
  return n.toLocaleString();
}

function costLabel(cost: Resources): string {
  return PRODUCTION_KINDS.filter((k) => (cost[k] ?? 0) > 0)
    .map(
      (k) =>
        `${PRODUCTION_KIND_ICON[k]} ${SETTLEMENT_RESOURCE_NAME[k]} ${cost[k]}`,
    )
    .join(" · ");
}

function buildingAt(village: Village, slot: number): SettlementBuildingSlot | null {
  const raw = village.buildings?.[String(slot)] ?? village.buildings?.[slot];
  const id = settlementBuildingIdOf(raw);
  if (!id) return null;
  return { id, level: settlementBuildingLevelOf(raw) };
}

export function V2VillagePanel({
  outpostId,
  canManageActions = true,
}: {
  outpostId: string;
  canManageActions?: boolean;
}) {
  // 거점 표시 이름(헤더·지도)은 GameState occupations.villageName 에서 옴 — 건설/개명 후
  //   동기화해야 같은 화면 헤더가 즉시 새 이름으로 갱신된다.
  const { refreshOccupations } = useGameState();
  // 타일 개척마을 — 이름은 개척(found) 때 한 번만 정한다. 건설 시 이름 재입력 없음·개명 없음(불변).
  //   카탈로그 거점은 종전대로 건설 시 이름 입력 + 개명 가능.
  const isTile = isTileOutpostId(outpostId);
  const [village, setVillage] = useState<Village | null>(null);
  const [resources, setResources] = useState<Resources>({});
  const [gold, setGold] = useState(0); // 길드 금고 골드(건축물 슬롯 해금 비용)
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
    setErr(null);
    try {
      const r = await fetch(
        `/api/v2/outpost/village?outpostId=${encodeURIComponent(outpostId)}`,
      );
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        villages?: Village[];
        resources?: Resources;
        gold?: number;
        error?: string;
      } | null;
      if (!r.ok || !j?.ok) {
        setErr(j?.error ? `load_failed:${j.error}` : `load_failed:${r.status}`);
        setVillage(null);
        setExists(false);
        return;
      }
      const v = (j.villages ?? []).find((x) => x.outpostId === outpostId);
      setVillage(v ?? null);
      setExists(!!v);
      setResources(j.resources ?? {});
      setGold(j.gold ?? 0);
    } catch {
      setErr("load_failed:network");
      setVillage(null);
      setExists(false);
    }
  }, [outpostId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트/거점 변경 시 마을 정보 fetch
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 재료 보유량 fetch
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
  const manageDisabledText = "마스터·부마스터만 변경할 수 있어요.";

  if (exists === null) {
    return (
      <section className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        마을 정보 불러오는 중…
      </section>
    );
  }

  // 건축물 슬롯 그리드 — 잠김(🔒)·빈 부지·배치된 건축물.
  function renderGrid() {
    if (!village || !built) return null;
    const displaySlots = Math.max(1, village.maxSlots);
    return (
      <div
        className="grid w-fit gap-1.5"
        style={{
          // 슬롯은 작게 고정 — 서버가 내려준 현 단계 슬롯 상한만큼만 표시한다.
          gridTemplateColumns: `repeat(${displaySlots}, minmax(0, 5rem))`,
        }}
      >
        {Array.from({ length: displaySlots }, (_, slot) => {
          // 아직 안 연 슬롯 = 지금 해금 가능(locked, 🔒). 해금된 슬롯 = 빈 부지 또는 건축물.
          const tierLocked = slot >= village.maxSlots;
          const locked = !tierLocked && slot >= village.unlockedSlots;
          const buildingSlot = buildingAt(village, slot);
          const building = buildingSlot
            ? SETTLEMENT_BUILDINGS[buildingSlot.id]
            : null;
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
          if (building) {
            return (
              <div
                key={slot}
                title={building.desc}
                className={`${base} border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200`}
              >
                <span className="text-base leading-none">{building.icon}</span>
                <span className="mt-0.5 text-[10px]">{building.name}</span>
                <span className="mt-0.5 text-[10px] font-semibold">
                  Lv {buildingSlot?.level ?? 1}
                </span>
              </div>
            );
          }
          // 해금된 슬롯 — 건축물 배치 가능.
          return (
            <div
              key={slot}
              title="비어 있는 건축물 슬롯"
              className={`${base} border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500`}
            >
              <span className="text-base leading-none opacity-60">🏗️</span>
              <span className="mt-0.5 text-[10px]">빈 부지</span>
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
      </Tooltip>
    </div>
  );

  const resourcePool = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
      <span className="font-medium text-zinc-700 dark:text-zinc-200">
        길드 자원
      </span>
      {PRODUCTION_KINDS.map((k) => (
        <span key={k} className="war-resource-pill tabular-nums">
          {PRODUCTION_KIND_ICON[k]} {SETTLEMENT_RESOURCE_NAME[k]}{" "}
          {resources[k] ?? 0}
        </span>
      ))}
    </div>
  );

  // ── 재료 전환 ── 개인 인벤(통나무/철광석)을 정착지 풀(crop/ore)에 적립. 길드원 전원. ──────
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
      target: SETTLEMENT_RESOURCE_NAME.crop,
      icon: PRODUCTION_KIND_ICON.crop,
      own: ownTimber,
      val: donateTimber,
      set: setDonateTimber,
    },
    {
      id: SETTLEMENT_MATERIAL_ID.ironOre,
      label: SETTLEMENT_MATERIALS[SETTLEMENT_MATERIAL_ID.ironOre].name,
      target: SETTLEMENT_RESOURCE_NAME.ore,
      icon: PRODUCTION_KIND_ICON.ore,
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
          길드 자원 전환
        </button>
      ) : (
        <div className="space-y-1.5 rounded border border-zinc-200 p-2 dark:border-zinc-700">
          <p className="text-zinc-500 dark:text-zinc-400">
            개인 인벤의 재료를 길드 자원으로 전환합니다. 전환한 재료는
            개인 제작 재료로 되돌릴 수 없습니다.
          </p>
          {donateRows.map((row) => (
            <label key={row.id} className="flex flex-wrap items-center gap-2">
              <span className="w-12 shrink-0">{row.label}</span>
              <span className="shrink-0 text-zinc-400">→</span>
              <span className="w-20 shrink-0 text-zinc-600 dark:text-zinc-300">
                {row.icon} {row.target}
              </span>
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
              전환하기
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

  // ── 관리 ── 건설(이름)·이름 변경·재료 기부·건축물 슬롯 해금·건물 배치·단계 업그레이드.
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
  const needSlots = !!village && !atMaxSlots; // 단계 업그레이드 전 슬롯을 다 열어야
  const canAffordUpgrade =
    !!next &&
    !needSlots &&
    PRODUCTION_KINDS.every((k) => (resources[k] ?? 0) >= (upgradeCost[k] ?? 0));
  // 건축물 슬롯 해금비 — 타일은 고정 누진(거리 무관), 카탈로그 거점은 옛 누진.
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
          disabled={!canManageActions}
          onClick={() => {
            setRenameName(village.name ?? "");
            setErr(null);
            setRenaming((v) => !v);
          }}
          className="rounded px-1 text-[11px] font-normal text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
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
            disabled={busy || !canManageActions || renameName.trim().length === 0}
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
        // 빈 공터 — 마을을 세운다. 건설에 길드 골드 1천만.
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
          {!canManageActions && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {manageDisabledText}
            </p>
          )}
          {!isTile && (
            <input
              type="text"
              value={buildName}
              onChange={(e) => setBuildName(e.target.value)}
              maxLength={VILLAGE_NAME_MAX}
              placeholder="마을 이름"
              disabled={busy || !canManageActions}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          )}
          <button
            type="button"
            disabled={
              busy ||
              !canManageActions ||
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
          {donateBox}
          <div className="text-xs text-zinc-600 dark:text-zinc-300">
            {goldNoun}{" "}
            <span className="font-medium tabular-nums">{fmtGold(gold)}</span> 골드
          </div>
          {/* 건축물 슬롯 미리보기(읽기 전용) — 잠김/빈 부지/배치됨. */}
          {renderGrid()}

          {/* 건축물 슬롯 해금 — 길드 골드 */}
          <div className="space-y-1.5">
            <div className="text-xs text-zinc-600 dark:text-zinc-300">
              해금된 건축물 슬롯{" "}
              <span className="font-medium tabular-nums">
                {village!.unlockedSlots} / {village!.maxSlots}
              </span>
            </div>
            {atMaxSlots ? (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                이 마을에서 사용할 수 있는 건축물 슬롯을 모두 열었어요.
              </p>
            ) : (
              <>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  슬롯을 열면 영지 건축물을 배치할 수 있습니다.
                </div>
                <button
                  type="button"
                  disabled={busy || !canManageActions || !canAffordUnlock}
                  onClick={() => void act("unlock-slot", {})}
                  className="w-full rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  건축물 슬롯 해금 · {fmtGold(unlockGold)} 골드
                </button>
                {!canAffordUnlock && (
                  <p className="text-[11px] text-rose-500 dark:text-rose-400">
                    {goldNoun} 골드가 부족해요 (보유 {fmtGold(gold)}).
                  </p>
                )}
                {!canManageActions && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {manageDisabledText}
                  </p>
                )}
              </>
            )}
          </div>

          {village!.unlockedSlots > 0 && (
            <div className="space-y-1.5 border-t border-zinc-200 pt-2 dark:border-zinc-800">
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                건축물 배치
              </div>
              {PLACEABLE_SETTLEMENT_BUILDING_IDS.map((id) => {
                const def = SETTLEMENT_BUILDINGS[id];
                const placed = buildingAt(village!, 0);
                const occupied = placed != null;
                const nextUpgrade =
                  placed?.id === id
                    ? nextSettlementBuildingUpgrade(placed.id, placed.level)
                    : null;
                const canAffordBuildingUpgrade =
                  nextUpgrade != null &&
                  PRODUCTION_KINDS.every(
                    (kind) =>
                      (resources[kind] ?? 0) >= (nextUpgrade.cost[kind] ?? 0),
                  );
                return (
                  <div
                    key={id}
                    className="rounded-md border border-zinc-200 bg-white p-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    <button
                      type="button"
                      disabled={busy || !canManageActions || occupied}
                      onClick={() =>
                        void act("building/place", { slot: 0, buildingId: id })
                      }
                      className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="text-base leading-none">{def.icon}</span>
                        <span className="min-w-0">
                          <span className="block font-medium">
                            {def.name}
                            {placed?.id === id ? ` Lv ${placed.level}` : ""}
                          </span>
                          <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                            {def.desc}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-500">
                        {occupied ? "배치됨" : "배치"}
                      </span>
                    </button>
                    {placed?.id === id ? (
                      <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                        {nextUpgrade ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">
                                다음: Lv {nextUpgrade.level} · {nextUpgrade.label}
                              </span>
                              <span className="text-[11px] text-emerald-600 dark:text-emerald-300">
                                {settlementBuildingUpgradeSummary(id, nextUpgrade)}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                              비용 {settlementBuildingUpgradeCostText(nextUpgrade.cost)}
                            </div>
                            <button
                              type="button"
                              disabled={
                                busy ||
                                !canManageActions ||
                                !canAffordBuildingUpgrade
                              }
                              onClick={() =>
                                void act("building/upgrade", { slot: 0 })
                              }
                              className="mt-2 w-full rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {def.name} 업그레이드
                            </button>
                          </>
                        ) : (
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {def.name} 최고 레벨입니다.
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={busy || !canManageActions}
                          onClick={() => {
                            if (
                              window.confirm(
                                `${def.name}을 폐기할까요? 같은 길드가 다시 배치하면 현재 레벨이 복구됩니다.`,
                              )
                            ) {
                              void act("building/discard", { slot: 0 });
                            }
                          }}
                          className="mt-2 w-full rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900 dark:bg-zinc-950 dark:text-rose-300 dark:hover:bg-rose-950/30"
                        >
                          {def.name} 폐기
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* 단계 업그레이드 */}
          {next && (
            <div className="space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
              <button
                type="button"
                disabled={busy || !canManageActions || !canAffordUpgrade}
                onClick={() => void act("upgrade", {})}
                className="w-full rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {VILLAGE_TIER_NAME[next]}(으)로 업그레이드 ·{" "}
                {costLabel(upgradeCost)}
              </button>
              {needSlots && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  먼저 이 단계의 건축물 슬롯을 모두 해금해야 업그레이드할 수 있어요.
                </p>
              )}
              {!canManageActions && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {manageDisabledText}
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
  need_slots: "먼저 이 단계의 건축물 슬롯을 모두 해금해야 해요.",
  at_max: "건축물 슬롯이 모두 열려 있어요.",
  max_tier: "이미 최고 단계예요.",
  slot_locked: "먼저 건축물 슬롯을 해금해야 해요.",
  already_occupied: "이미 건축물이 배치된 슬롯이에요.",
  building_unavailable: "아직 배치할 수 없는 건축물이에요.",
  building_required: "건축물이 필요해요.",
  smithy_required: "길드 대장간이 필요해요.",
  max_level: "이미 최고 레벨이에요.",
  insufficient_resources: "정착지 재화가 부족해요.",
  "load_failed:401": "로그인이 필요해요. 새로고침 후 다시 시도해주세요.",
  "load_failed:500": "마을 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
  "load_failed:network": "네트워크 오류로 마을 정보를 불러오지 못했어요.",
};
