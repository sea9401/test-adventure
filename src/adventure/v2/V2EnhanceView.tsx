"use client";

// 대장간 — 장비 강화 + 재련 화면 (docs/v2-equipment-enhance-plan.md PR-3).
// 제작 콘텐츠 삭제(#621) 후 반쯤 죽어 있던 대장간을 강화 허브로 부활.
// 모드 2종(상단 토글):
//  · 강화 — 장비 선택 → 돌(붉은/푸른) 선택 → 성공률·비용·미리보기 → 강화(레벨 +0~10).
//  · 재련 — 장비 선택 → 골드로 옵션 굴림 재시도(항상 적용 = 도박). 엔드게임 골드 sink.
// 데이터: /api/v2/me/equipment(owned/equipped) + /api/v2/me/inventory(materials).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Hammer } from "@phosphor-icons/react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import {
  effectiveStats,
  isUnique,
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipRoll,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  canReforge,
  reforgeGoldCost,
  REFORGE_STONE_MATERIAL_ID,
  REFORGE_STONES,
  rollQualityPct,
  type ReforgeStoneId,
} from "@/adventure/data/v2/v2EquipVariance";
import {
  ENHANCE_MAX_LEVEL,
  ENHANCE_STONE_MATERIAL_ID,
  ENHANCE_STONE_REQUIRED_FROM,
  ENHANCE_UNIQUE_COST_MULT,
  enhanceBonusPct,
  enhancedPower,
  enhanceGoldCost,
  enhanceOutcomeRow,
  enhanceStoneCost,
  type EnhanceChoice,
  type V2EnhanceState,
} from "@/adventure/data/v2/v2Enhance";
import {
  EquipmentCardGrid,
  type EquipmentCard,
} from "@/adventure/v2/V2InventoryView";

const SLOT_TABS: { key: V2EquipSlot; label: string }[] = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "갑옷" },
  { key: "gloves", label: "장갑" },
  { key: "boots", label: "신발" },
  { key: "ring", label: "반지" },
  { key: "necklace", label: "목걸이" },
];

type EnhanceResponse = {
  ok?: boolean;
  error?: string;
  outcome?: "success" | "keep" | "demote" | "destroy";
  enhance?: V2EnhanceState | null;
  stones?: { red: number; blue: number };
  gold?: number;
  stoneCost?: number;
  goldCost?: number;
};

type ReforgeResponse = {
  ok?: boolean;
  error?: string;
  itemId?: string;
  stone?: ReforgeStoneId;
  stoneLeft?: number;
  goldCost?: number;
  gold?: number;
  oldRoll?: V2EquipRoll;
  newRoll?: V2EquipRoll;
  oldQuality?: number | null;
  newQuality?: number | null;
  improved?: boolean;
};

type ForgeMode = "enhance" | "reforge";

export function V2EnhanceView({ onBack }: { onBack: () => void }) {
  const [owned, setOwned] = useState<V2EquipInstance[]>([]);
  const [equipped, setEquipped] = useState<
    Partial<Record<V2EquipSlot, string>>
  >({});
  const [stones, setStones] = useState({ red: 0, blue: 0 });
  const [reforgeStones, setReforgeStones] = useState({ basic: 0, high: 0 });
  const [tab, setTab] = useState<V2EquipSlot>("weapon");
  const [selectedIid, setSelectedIid] = useState<string | null>(null);
  const [stone, setStone] = useState<EnhanceChoice>("none");
  const [reforgeStone, setReforgeStone] = useState<ReforgeStoneId>("basic");
  const [feedIid, setFeedIid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{
    kind: "success" | "fail" | "error";
    text: string;
  } | null>(null);
  const [mode, setMode] = useState<ForgeMode>("enhance");

  const refresh = useCallback(async () => {
    try {
      const [eqRes, invRes] = await Promise.all([
        fetch("/api/v2/me/equipment"),
        fetch("/api/v2/me/inventory"),
      ]);
      if (eqRes.ok) {
        const j = (await eqRes.json()) as {
          owned?: V2EquipInstance[];
          equipped?: Partial<Record<V2EquipSlot, string>>;
        };
        setOwned(j.owned ?? []);
        setEquipped(j.equipped ?? {});
      }
      if (invRes.ok) {
        const j = (await invRes.json()) as {
          materials?: Record<string, number>;
        };
        setStones({
          red: j.materials?.[ENHANCE_STONE_MATERIAL_ID.red] ?? 0,
          blue: j.materials?.[ENHANCE_STONE_MATERIAL_ID.blue] ?? 0,
        });
        setReforgeStones({
          basic: j.materials?.[REFORGE_STONE_MATERIAL_ID.basic] ?? 0,
          high: j.materials?.[REFORGE_STONE_MATERIAL_ID.high] ?? 0,
        });
      }
    } catch {
      /* 폴링 아님 — 조용히 */
    }
  }, []);

  useEffect(() => {
    // 비동기 fetch 후 setState — cascading render 아님(인벤토리와 동일 패턴).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const tabInstances = useMemo(
    () =>
      owned
        .filter((o) => V2_EQUIPMENT[o.id]?.slot === tab)
        .sort(
          (a, b) =>
            (b.enhance?.level ?? 0) - (a.enhance?.level ?? 0) ||
            (b.roll?.power ?? V2_EQUIPMENT[b.id].power) -
              (a.roll?.power ?? V2_EQUIPMENT[a.id].power),
        ),
    [owned, tab],
  );
  const pager = usePagination(tabInstances, 8, tab);

  const selected = owned.find((o) => o.iid === selectedIid) ?? null;
  const item = selected ? V2_EQUIPMENT[selected.id] : null;
  const level = selected?.enhance?.level ?? 0;
  const maxed = level >= ENHANCE_MAX_LEVEL;
  const uniqueMult = item && isUnique(item) ? ENHANCE_UNIQUE_COST_MULT : 1;
  const basePower =
    selected && item ? effectiveStats(item, selected.roll).power : 0;
  const curPower = enhancedPower(basePower, selected?.enhance);
  const nextPower = enhancedPower(basePower, {
    level: level + 1,
    bonusPct: enhanceBonusPct(level + 1),
  });
  const stoneRequired = level >= ENHANCE_STONE_REQUIRED_FROM;
  const outcomeRow = enhanceOutcomeRow(level, stone);
  const successPct = outcomeRow[0];
  const stoneCost = enhanceStoneCost(level) * uniqueMult;
  const goldCost = item ? enhanceGoldCost(basePower, level) * uniqueMult : 0;
  // 먹이 후보 — 같은 id·다른 개체·미장착·미잠금.
  const feedCandidates = useMemo(() => {
    if (!selected) return [];
    const equippedIids = new Set(Object.values(equipped));
    return owned.filter(
      (o) =>
        o.id === selected.id &&
        o.iid !== selected.iid &&
        !o.locked &&
        !equippedIids.has(o.iid),
    );
  }, [owned, equipped, selected]);
  const haveStones =
    stone === "red" ? stones.red : stone === "blue" ? stones.blue : 0;
  const stoneShort = stone !== "none" && !feedIid && haveStones < stoneCost;
  const goldOnlyBlocked = stoneRequired && stone === "none";

  const doEnhance = useCallback(async () => {
    if (!selected || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/enhance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          iid: selected.iid,
          stone,
          ...(feedIid && stone !== "none" ? { feedIid } : {}),
        }),
      });
      const json = (await res.json()) as EnhanceResponse;
      if (!json.ok) {
        setMsg({
          kind: "error",
          text:
            json.error === "insufficient_stone"
              ? "강화석이 부족합니다"
              : json.error === "insufficient_gold"
                ? "골드가 부족합니다"
                : json.error === "stone_required"
                  ? "+8부터는 강화석이 필요합니다"
                  : `실패: ${json.error ?? "unknown"}`,
        });
        return;
      }
      if (json.stones) setStones(json.stones);
      setFeedIid(null);
      if (json.outcome === "success") {
        setMsg({
          kind: "success",
          text: `✨ 강화 성공! +${json.enhance?.level} (위력 +${json.enhance?.bonusPct}%)`,
        });
        if (
          (json.enhance?.level ?? 0) >= ENHANCE_STONE_REQUIRED_FROM &&
          stone === "none"
        ) {
          setStone("blue");
        }
      } else if (json.outcome === "demote") {
        setMsg({
          kind: "fail",
          text: `📉 강화 실패 — 한 단계 하락… +${json.enhance?.level ?? 0}`,
        });
      } else if (json.outcome === "destroy") {
        setMsg({
          kind: "fail",
          text: "💥 장비가 산산조각 났습니다… (파괴)",
        });
        setSelectedIid(null);
      } else {
        setMsg({ kind: "fail", text: "강화 실패 — 수치 유지, 재료만 소모" });
      }
      await refresh();
    } catch {
      setMsg({ kind: "error", text: "네트워크 오류 — 다시 시도해주세요" });
    } finally {
      setBusy(false);
    }
  }, [selected, stone, feedIid, busy, refresh]);

  // ── 재련(reforge) — 골드로 옵션 굴림 재시도(항상 적용 = 도박) ──
  const reforgeCost = item ? reforgeGoldCost(item) : 0;
  const reforgeable = !!(selected && item && canReforge(item, selected.roll));
  const reforgeStoneShort = reforgeStones[reforgeStone] < 1;
  const curQuality =
    selected && item ? rollQualityPct(item, selected.roll) : null;
  const curRollPower =
    selected && item ? effectiveStats(item, selected.roll).power : 0;

  const doReforge = useCallback(async () => {
    if (!selected || !item || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/reforge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iid: selected.iid, stone: reforgeStone }),
      });
      const json = (await res.json()) as ReforgeResponse;
      if (!json.ok) {
        setMsg({
          kind: "error",
          text:
            json.error === "insufficient_gold"
              ? "골드가 부족합니다"
              : json.error === "insufficient_stone"
                ? "재련석이 부족합니다"
                : json.error === "not_reforgeable"
                  ? "재련할 수 없는 장비입니다"
                  : `실패: ${json.error ?? "unknown"}`,
        });
        return;
      }
      const oldP = json.oldRoll ? effectiveStats(item, json.oldRoll).power : 0;
      const newP = json.newRoll ? effectiveStats(item, json.newRoll).power : 0;
      const arrow = json.improved
        ? "📈"
        : (json.newQuality ?? 0) < (json.oldQuality ?? 0)
          ? "📉"
          : "➖";
      setMsg({
        kind: json.improved ? "success" : "fail",
        text: `${arrow} 재련 — 품질 ${json.oldQuality ?? "?"}% → ${json.newQuality ?? "?"}% (위력 ${oldP} → ${newP})`,
      });
      await refresh();
    } catch {
      setMsg({ kind: "error", text: "네트워크 오류 — 다시 시도해주세요" });
    } finally {
      setBusy(false);
    }
  }, [selected, item, busy, refresh, reforgeStone]);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={
          <>
            <Hammer size={18} weight="duotone" />
            대장간
          </>
        }
        onBack={onBack}
        right={
          mode === "enhance" ? (
            <div className="flex items-center gap-3 text-sm tabular-nums">
              <span className="text-rose-500">🔴 {stones.red}</span>
              <span className="text-sky-500">🔵 {stones.blue}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm tabular-nums">
              <span className="text-zinc-500 dark:text-zinc-400">
                🔧 {reforgeStones.basic}
              </span>
              <span className="text-indigo-500">✨ {reforgeStones.high}</span>
            </div>
          )
        }
      />

      {/* 작업 모드 — 강화 / 재련 */}
      <TabBar
        tabs={[
          { key: "enhance" as ForgeMode, label: "강화" },
          { key: "reforge" as ForgeMode, label: "재련" },
        ]}
        active={mode}
        onChange={(m) => {
          setMode(m);
          setMsg(null);
        }}
        ariaLabel="대장간 작업"
        size="sm"
        variant="highlight"
      />

      {/* 강화 패널 — 장비 선택 시 */}
      {mode === "enhance" && selected && item && (
        <Card padding="sm">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">
                {item.name}
                {level > 0 && (
                  <span className="ml-1 text-amber-500">+{level}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedIid(null);
                  setMsg(null);
                  setFeedIid(null);
                }}
                className="text-xs text-zinc-500 hover:underline"
              >
                선택 해제
              </button>
            </div>
            {maxed ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                최대 강화(+{ENHANCE_MAX_LEVEL}) 달성!
              </p>
            ) : (
              <>
                <div className="text-sm tabular-nums">
                  위력 {curPower} →{" "}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {nextPower}
                  </span>{" "}
                  <span className="text-xs text-zinc-500">
                    (성공 시 +{level + 1})
                  </span>
                </div>
                {/* 강화 방식 — 골드(+7까지) / 강화석. 돌 효과: 붉은=성공↑(도박)·푸른=파괴 방지 */}
                <div className="flex gap-2">
                  {(["none", "blue", "red"] as const).map((s) => {
                    const disabled = s === "none" && stoneRequired;
                    const row = enhanceOutcomeRow(level, s);
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setStone(s);
                          if (s === "none") setFeedIid(null);
                        }}
                        className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition disabled:opacity-40 ${
                          stone === s
                            ? s === "red"
                              ? "border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950"
                              : s === "blue"
                                ? "border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-950"
                                : "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950"
                            : "border-zinc-200 dark:border-zinc-700"
                        }`}
                      >
                        <div className="font-medium">
                          {s === "none"
                            ? disabled
                              ? "💰 골드 (+7까지)"
                              : "💰 골드"
                            : s === "red"
                              ? "🔴 붉은 강화석"
                              : "🔵 푸른 강화석"}
                        </div>
                        <div className="mt-0.5 tabular-nums text-zinc-500 dark:text-zinc-400">
                          성공 {row[0]}%
                          {row[3] > 0 ? ` · 파괴 ${row[3]}%` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {/* 결과 확률 — 누적 막대: 파트별 색 꽉 찬 칸 + 칸 내 중앙 라벨.
                    좁은 칸은 %만(7%↑) 또는 생략(7% 미만 — 색으로만 표시). */}
                <div className="flex h-6 overflow-hidden rounded-md text-[10px] font-semibold tabular-nums text-white">
                  {[
                    { label: "성공", pct: outcomeRow[0], cls: "bg-emerald-500" },
                    {
                      label: "유지",
                      pct: outcomeRow[1],
                      cls: "bg-zinc-400 dark:bg-zinc-600",
                    },
                    { label: "하락", pct: outcomeRow[2], cls: "bg-amber-500" },
                    { label: "파괴", pct: outcomeRow[3], cls: "bg-rose-600" },
                  ].map(({ label, pct, cls }) =>
                    pct > 0 ? (
                      <div
                        key={label}
                        style={{ width: `${pct}%` }}
                        title={`${label} ${pct}%`}
                        className={`flex items-center justify-center overflow-hidden whitespace-nowrap ${cls}`}
                      >
                        {pct >= 14
                          ? `${label} ${pct}%`
                          : pct >= 7
                            ? `${pct}%`
                            : ""}
                      </div>
                    ) : null,
                  )}
                </div>
                {/* 먹이 — 동일 장비 소모로 강화석 면제 */}
                {stone !== "none" && feedCandidates.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={!!feedIid}
                      onChange={(e) =>
                        setFeedIid(
                          e.target.checked ? feedCandidates[0].iid : null,
                        )
                      }
                    />
                    같은 장비 1개를 재료로 (보유 {feedCandidates.length}개 —
                    강화석 면제)
                  </label>
                )}
                <div className="flex items-baseline justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="tabular-nums">
                    비용:{" "}
                    {stone === "none"
                      ? `${goldCost.toLocaleString()} G`
                      : `${feedIid ? "강화석 면제(먹이)" : `${stone === "red" ? "🔴" : "🔵"} ×${stoneCost}`} + ${goldCost.toLocaleString()} G`}
                    {uniqueMult > 1 && " (유니크 ×2)"}
                  </span>
                  {outcomeRow[3] > 0 && stone !== "blue" && (
                    <span className="font-semibold text-rose-500">
                      ⚠️ 파괴 위험 — 푸른 돌이 막아줍니다
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void doEnhance()}
                  disabled={busy || stoneShort || goldOnlyBlocked}
                  className="w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  {busy
                    ? "강화 중…"
                    : goldOnlyBlocked
                      ? "+8부터는 강화석 필요"
                      : stoneShort
                        ? "강화석 부족"
                        : `강화 (성공 ${successPct}%)`}
                </button>
              </>
            )}
            {msg && (
              <div
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  msg.kind === "success"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : msg.kind === "fail"
                      ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
                      : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {msg.text}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 재련 패널 — 장비 선택 시 */}
      {mode === "reforge" && selected && item && (
        <Card padding="sm">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">
                {item.name}
                {level > 0 && (
                  <span className="ml-1 text-amber-500">+{level}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedIid(null);
                  setMsg(null);
                }}
                className="text-xs text-zinc-500 hover:underline"
              >
                선택 해제
              </button>
            </div>
            {!reforgeable ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                이 장비는 재련할 수 없습니다 (굴림 편차가 없는 장비).
              </p>
            ) : (
              <>
                <div className="text-sm tabular-nums">
                  위력 {curRollPower} · 품질{" "}
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    {curQuality ?? "—"}%
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  골드와 재련석으로 옵션 굴림을 다시 돌립니다. 결과는 무조건
                  적용되며 되돌릴 수 없습니다(도박). 강화 단계는 유지됩니다.
                </p>
                {/* 재련석 선택 — 일반(현 굴림) / 상급(고품질 확률↑) */}
                <div className="flex gap-2">
                  {(["basic", "high"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReforgeStone(s)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition ${
                        reforgeStone === s
                          ? s === "high"
                            ? "border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950"
                            : "border-zinc-400 bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-800"
                          : "border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      <div className="font-medium">
                        {s === "high" ? "✨ 상급 재련석" : "🔧 재련석"}
                      </div>
                      <div className="mt-0.5 tabular-nums text-zinc-500 dark:text-zinc-400">
                        {s === "high" ? "고품질 확률↑" : "기본"} · 보유{" "}
                        {reforgeStones[s]}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex items-baseline justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="tabular-nums">
                    비용: {reforgeCost.toLocaleString()} G +{" "}
                    {REFORGE_STONES[reforgeStone].name} 1개
                    {uniqueMult > 1 && " (유니크 ×2)"}
                  </span>
                  <span className="font-semibold text-amber-500">
                    ⚠️ 더 나빠질 수 있음
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void doReforge()}
                  disabled={busy || reforgeStoneShort}
                  className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy
                    ? "재련 중…"
                    : reforgeStoneShort
                      ? `${REFORGE_STONES[reforgeStone].name} 부족`
                      : `재련 (${reforgeCost.toLocaleString()} G + 재련석 1)`}
                </button>
              </>
            )}
            {msg && (
              <div
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  msg.kind === "success"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : msg.kind === "fail"
                      ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
                      : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {msg.text}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 장비 선택 — 슬롯 탭 + 그리드(강화 높은 순). */}
      <Card as="section" padding="sm">
        <TabBar
          tabs={SLOT_TABS}
          active={tab}
          onChange={(t) => {
            setTab(t);
            setSelectedIid(null);
            setMsg(null);
            setFeedIid(null);
          }}
          ariaLabel="강화 슬롯"
          size="sm"
          variant="highlight"
          scrollable
        />
        <div className="mt-2">
          <EquipmentCardGrid
            cards={pager.pageItems.map(
              (inst: V2EquipInstance): EquipmentCard => ({
                inst,
                isEquipped: (equipped[tab] ?? null) === inst.iid,
              }),
            )}
            onOpenCard={(inst) => {
              setSelectedIid(inst.iid);
              setMsg(null);
              setFeedIid(null);
              // +8부터 돌 필수 — 골드만 선택 상태면 푸른으로 자동 전환.
              if (
                (inst.enhance?.level ?? 0) >= ENHANCE_STONE_REQUIRED_FROM &&
                stone === "none"
              ) {
                setStone("blue");
              }
            }}
          />
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            setPage={pager.setPage}
          />
        </div>
      </Card>
    </main>
  );
}
