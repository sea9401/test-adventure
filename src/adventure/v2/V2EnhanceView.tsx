"use client";

// 대장간 — 장비 강화 화면 (docs/v2-equipment-enhance-plan.md PR-3).
// 제작 콘텐츠 삭제(#621) 후 반쯤 죽어 있던 대장간을 강화 허브로 부활.
// 보유 장비 선택 → 돌(붉은/푸른) 선택 → 성공률·비용·미리보기 → 강화.
// 데이터: /api/v2/me/equipment(owned/equipped) + /api/v2/me/inventory(materials).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Hammer } from "@phosphor-icons/react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import {
  effectiveStats,
  isUnique,
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  ENHANCE_DEMOTE_FROM_LEVEL,
  ENHANCE_MAX_LEVEL,
  ENHANCE_STONE_MATERIAL_ID,
  ENHANCE_UNIQUE_COST_MULT,
  enhanceChoiceProfile,
  enhancedPower,
  enhanceGoldCost,
  enhanceStoneCost,
  enhanceSuccessPct,
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
  success?: boolean;
  demoted?: boolean;
  enhance?: V2EnhanceState | null;
  stones?: { red: number; blue: number };
  gold?: number;
  stoneCost?: number;
  goldCost?: number;
};

export function V2EnhanceView({ onBack }: { onBack: () => void }) {
  const [owned, setOwned] = useState<V2EquipInstance[]>([]);
  const [equipped, setEquipped] = useState<
    Partial<Record<V2EquipSlot, string>>
  >({});
  const [stones, setStones] = useState({ red: 0, blue: 0 });
  const [tab, setTab] = useState<V2EquipSlot>("weapon");
  const [selectedIid, setSelectedIid] = useState<string | null>(null);
  const [stone, setStone] = useState<EnhanceChoice>("none");
  const [feedIid, setFeedIid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{
    kind: "success" | "fail" | "error";
    text: string;
  } | null>(null);

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
  const bonusPct = selected?.enhance?.bonusPct ?? 0;
  const maxed = level >= ENHANCE_MAX_LEVEL;
  const uniqueMult = item && isUnique(item) ? ENHANCE_UNIQUE_COST_MULT : 1;
  const basePower =
    selected && item ? effectiveStats(item, selected.roll).power : 0;
  const curPower = enhancedPower(basePower, selected?.enhance);
  const nextPower = enhancedPower(basePower, {
    level: level + 1,
    bonusPct: bonusPct + enhanceChoiceProfile(stone).bonusPct,
  });
  const successPct = enhanceSuccessPct(level, stone);
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
                : `실패: ${json.error ?? "unknown"}`,
        });
        return;
      }
      if (json.stones) setStones(json.stones);
      setFeedIid(null);
      if (json.success) {
        setMsg({
          kind: "success",
          text: `✨ 강화 성공! +${json.enhance?.level} (위력 +${json.enhance?.bonusPct}%)`,
        });
      } else if (json.demoted) {
        setMsg({
          kind: "fail",
          text: `💥 강화 실패 — 한 단계 하락… +${json.enhance?.level ?? 0}`,
        });
      } else {
        setMsg({ kind: "fail", text: "강화 실패 — 재료가 사라졌습니다" });
      }
      await refresh();
    } catch {
      setMsg({ kind: "error", text: "네트워크 오류 — 다시 시도해주세요" });
    } finally {
      setBusy(false);
    }
  }, [selected, stone, feedIid, busy, refresh]);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <BackButton onClick={onBack} />
        <div className="flex items-baseline justify-between">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Hammer size={18} weight="duotone" />
            대장간
          </h1>
          <div className="flex items-center gap-3 text-sm tabular-nums">
            <span className="text-rose-500">🔴 {stones.red}</span>
            <span className="text-sky-500">🔵 {stones.blue}</span>
          </div>
        </div>
      </header>

      {/* 강화 패널 — 장비 선택 시 */}
      {selected && item && (
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
                {/* 강화 방식 — 골드만(기본) / 돌 부스터 선택 */}
                <div className="flex gap-2">
                  {(["none", "blue", "red"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setStone(s);
                        if (s === "none") setFeedIid(null);
                      }}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition ${
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
                          ? "💰 골드만"
                          : s === "red"
                            ? "🔴 붉은 강화석"
                            : "🔵 푸른 강화석"}
                      </div>
                      <div className="mt-0.5 tabular-nums text-zinc-500 dark:text-zinc-400">
                        성공 {enhanceSuccessPct(level, s)}% · +
                        {enhanceChoiceProfile(s).bonusPct}%p
                      </div>
                    </button>
                  ))}
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
                  {level + 1 > ENHANCE_DEMOTE_FROM_LEVEL && (
                    <span className="text-rose-500">실패 시 −1 하락</span>
                  )}
                  {level === ENHANCE_DEMOTE_FROM_LEVEL && (
                    <span className="text-rose-500">실패 시 −1 하락</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void doEnhance()}
                  disabled={busy || stoneShort}
                  className="w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  {busy
                    ? "강화 중…"
                    : stoneShort
                      ? "강화석 부족"
                      : `강화 (${successPct}%)`}
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
