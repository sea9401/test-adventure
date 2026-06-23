"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameState } from "./GameStateProvider";
import { Tooltip } from "@/components/ui/Tooltip";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { terrainTraitOf } from "@/adventure/data/v2/outposts";
import { isTileOutpostId } from "@/adventure/data/v2/tileWarfare";
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

// 길드 마을 패널 — 점령 거점 상세(OutpostView)에 노출. mode 로 두 화면을 분리:
//   - produce(생산 탭, 길드원 전원): 슬롯 판(2×2 마을 / 3×3 도시) 그리드에서 생산 시작·수확.
//   - manage(관리 탭, 마스터/부마스터): 마을 건설(이름)·이름 변경·칸 해금(골드+종류)·단계 업그레이드.
//   건설 직후엔 빈 판 — 칸을 길드 금고 골드로 한 칸씩 열며 그때 키울 종류를 고른다. 단계 업글이 판 확장.

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
  unlockedSlots: number;
  maxSlots: number; // 이 단계 해금 상한(마을 4·도시 9·대도시 9). 화면 판은 항상 3×3(9).
  slotKinds: Record<string, ProductionKind>; // jsonb 키는 문자열
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
  const [village, setVillage] = useState<Village | null>(null);
  const [resources, setResources] = useState<Resources>({});
  const [gold, setGold] = useState(0); // 길드 금고 골드(칸 해금 비용)
  const [exists, setExists] = useState<boolean | null>(null); // null=로딩
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [buildName, setBuildName] = useState(""); // 건설 폼 이름 입력
  const [unlockKind, setUnlockKind] = useState<ProductionKind | null>(null); // 새 칸 종류
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
  // 골드 출처 표기 — 타일 정착지는 길드 금고(길드 타일) 또는 본인 골드(솔로)라 중립 "보유"로.
  const goldNoun = isTileOutpostId(outpostId) ? "보유" : "길드 금고";
  // 건설됨 = 이름. 종류는 이제 칸별(slotKinds) — 마을 단위 특화 개념 폐기.
  const built = !!village && village.name != null;

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
          gridTemplateColumns: `repeat(${GRID_DISPLAY_COLS}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: GRID_DISPLAY_SLOTS }, (_, slot) => {
          // 판은 항상 4×4. 이 단계 상한(maxSlots) 너머 = 상위 단계 필요(tierLocked, 흐리게).
          //   그 안에서 아직 안 연 칸 = 지금 해금 가능(locked, 🔒).
          const tierLocked = slot >= village.maxSlots;
          const locked = !tierLocked && slot >= village.unlockedSlots;
          const job = jobBySlot.get(slot);
          const slotKind = village.slotKinds[String(slot)];
          const readyAt = job ? loadedAt + job.remainingMs : 0;
          const remaining = job ? Math.max(0, readyAt - now) : 0;
          const ready = job ? remaining <= 0 : false;
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
          if (job) {
            if (ready && interactive) {
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={busy}
                  title={PRODUCTION_KIND_NAME[job.kind]}
                  onClick={() => void act("harvest", { slot })}
                  className={`${base} border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900`}
                >
                  <span className="text-lg leading-none">
                    {PRODUCTION_KIND_ICON[job.kind]}
                  </span>
                  <span className="mt-0.5 text-[10px] font-semibold">수확 ✓</span>
                </button>
              );
            }
            return (
              <div
                key={slot}
                title={PRODUCTION_KIND_NAME[job.kind]}
                className={`${base} border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300`}
              >
                <span className="text-lg leading-none">
                  {PRODUCTION_KIND_ICON[job.kind]}
                </span>
                <span className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {ready ? "수확 가능" : fmtRemaining(remaining)}
                </span>
              </div>
            );
          }
          // 빈 칸(해금됨) — 그 칸의 종류로 생산.
          if (interactive) {
            return (
              <button
                key={slot}
                type="button"
                disabled={busy}
                title={slotKind ? PRODUCTION_KIND_NAME[slotKind] : undefined}
                onClick={() => void act("produce", { slot })}
                className={`${base} border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800`}
              >
                <span className="text-lg leading-none opacity-50">
                  {slotKind ? PRODUCTION_KIND_ICON[slotKind] : "＋"}
                </span>
                <span className="mt-0.5 text-[10px]">생산</span>
              </button>
            );
          }
          return (
            <div
              key={slot}
              title={slotKind ? PRODUCTION_KIND_NAME[slotKind] : undefined}
              className={`${base} border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600`}
            >
              <span className="text-lg leading-none opacity-50">
                {slotKind ? PRODUCTION_KIND_ICON[slotKind] : "·"}
              </span>
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
            아직 마을이 없어요. 관리 탭에서 마을을 건설하면 이곳에서 생산할 수
            있어요.
          </p>
        ) : (
          <>
            {resourcePool}
            {village!.unlockedSlots === 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                아직 해금된 칸이 없어요. 관리 탭에서 칸을 해금하면 생산을 시작할
                수 있어요.
              </p>
            )}
            {renderGrid(true)}
          </>
        )}
        {errBox}
      </section>
    );
  }

  // ── 관리 탭 ── 건설(이름)·이름 변경·칸 해금(골드+종류)·단계 업그레이드. ──────────
  const next = village ? nextTier(village.tier) : null;
  const upgradeCost = village ? (UPGRADE_COST[village.tier] ?? {}) : {};
  const atMaxSlots = !!village && village.unlockedSlots >= village.maxSlots;
  const needSlots = !!village && !atMaxSlots; // 단계 업그레이드 전 판을 다 채워야
  const canAffordUpgrade =
    !!next &&
    !needSlots &&
    PRODUCTION_KINDS.every((k) => (resources[k] ?? 0) >= (upgradeCost[k] ?? 0));
  const unlockGold = village ? slotUnlockGoldCost(village.unlockedSlots) : 0;
  const canAffordUnlock = !atMaxSlots && gold >= unlockGold;

  return (
    <section className={`${SURFACE_CARD} space-y-2 p-3`}>
      {header}
      {built && village && (
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

      {/* 이름 변경 폼 */}
      {built && village && renaming && (
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
        // 빈 공터 — 이름만 정해 마을을 세운다(종류는 칸 해금 때 고른다). 건설에 길드 골드 1천만.
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            점령한 빈 공터예요. 이름을 정해 마을을 세우세요. 첫 칸은 무료로 열리고,
            생산할 것은 칸을 해금할 때 고릅니다.
          </p>
          <div className="text-xs text-zinc-600 dark:text-zinc-300">
            {goldNoun}{" "}
            <span className="font-medium tabular-nums">{fmtGold(gold)}</span> 골드
          </div>
          <input
            type="text"
            value={buildName}
            onChange={(e) => setBuildName(e.target.value)}
            maxLength={VILLAGE_NAME_MAX}
            placeholder="마을 이름"
            disabled={busy}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            disabled={
              busy ||
              buildName.trim().length === 0 ||
              gold < VILLAGE_BUILD_GOLD_COST
            }
            onClick={() => void act("build", { name: buildName.trim() }, true)}
            className="w-full rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            마을 건설 · {fmtGold(VILLAGE_BUILD_GOLD_COST)} 골드
          </button>
          {gold < VILLAGE_BUILD_GOLD_COST && (
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
          {/* 슬롯 판 미리보기(읽기 전용) — 잠김/해금 + 칸별 종류 시각화. */}
          {renderGrid(false)}

          {/* 칸 해금 — 길드 골드 + 새 칸에서 키울 종류 선택 */}
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
                  새 칸에서 키울 것을 고르세요{" "}
                  <span className="text-zinc-400 dark:text-zinc-500">
                    (칸마다 영구)
                  </span>
                </div>
                <KindChoice
                  trait={trait}
                  selected={unlockKind}
                  onSelect={setUnlockKind}
                  disabled={busy}
                />
                <button
                  type="button"
                  disabled={busy || unlockKind == null || !canAffordUnlock}
                  onClick={() => void act("unlock-slot", { kind: unlockKind })}
                  className="w-full rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  칸 해금 ·{" "}
                  {unlockGold === 0 ? "무료 (기본 제공)" : `${fmtGold(unlockGold)} 골드`}
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
  slot_busy: "이미 작업 중인 칸이에요.",
  slot_out_of_range: "아직 해금되지 않은 칸이에요.",
  not_ready: "아직 수확할 수 없어요.",
  insufficient: "재화가 부족해요.",
  insufficient_gold: "길드 금고 골드가 부족해요.",
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

// 칸에서 키울 생산 종류 선택 — 나무/광물/식량 토글. 지형 일치 종류엔 +보너스 표시(좋은 선택 유도).
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
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800")
            }
          >
            {PRODUCTION_KIND_ICON[k]} {PRODUCTION_KIND_NAME[k]}
            {bonus ? (
              <span
                className={
                  sel
                    ? "text-emerald-100"
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
