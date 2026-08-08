"use client";

// 대장간 — 장비 강화 화면 (docs/v2-equipment-enhance-plan.md PR-3).
// 제작 콘텐츠 삭제(#621) 후 반쯤 죽어 있던 대장간을 강화 허브로 부활.
// 재련은 V2_REFORGE_ENABLED 플래그로 임시 비활성화하고, 강화·기타 조합만 노출한다.
//  · 강화 — 장비 선택 → 돌(붉은/푸른) 선택 → 성공률·비용·미리보기 → 강화.
// 데이터: /api/v2/me/equipment(owned/equipped) + /api/v2/me/inventory(materials).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hammer } from "@phosphor-icons/react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChoiceButton } from "@/components/ui/ChoiceButton";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { TabBar } from "@/components/ui/TabBar";
import { useGameState } from "@/adventure/v2/GameStateProvider";
import { GameIcon } from "@/adventure/v2/GameIcon";
import { Pagination } from "@/components/ui/Pagination";
import { SURFACE_ACCENT, SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { usePagination } from "@/lib/usePagination";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  effectiveStats,
  enhanceGoldCostForEquipment,
  isUnique,
  powerWithBonuses,
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipRoll,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  canReforge,
  catalogItemStats,
  reforgeGoldCost,
  COMBINE_GOLD_COST,
  REFORGE_COMBINE_COST,
  REFORGE_STONE_MATERIAL_ID,
  REFORGE_STONES,
  V2_REFORGE_ENABLED,
  rollQualityPct,
  type ReforgeStoneId,
} from "@/adventure/data/v2/v2EquipVariance";
import {
  STAMINA_SHARD_COMBINE_COST,
  STAMINA_SHARD_MATERIAL_ID,
} from "@/adventure/data/v2/staminaPotionCrafting";
import {
  ENHANCE_EMBER_BLUE_COST,
  ENHANCE_EMBER_MATERIAL_ID,
  ENHANCE_EMBER_RED_COST,
  TORN_MAP_FRAGMENT_COMBINE_COST,
  TORN_MAP_FRAGMENT_MATERIAL_ID,
  craftedRareMapDepthOptions,
  defaultCraftedRareMapDepth,
  type ScavengedCraftRecipeId,
} from "@/adventure/data/v2/scavengedCrafting";
import { huntStageName } from "@/adventure/data/v2/dungeon";
import {
  ENHANCE_STONE_MATERIAL_ID,
  ENHANCE_STONE_REQUIRED_FROM,
  ENHANCE_UNIQUE_COST_MULT,
  enhanceBonusPct,
  enhanceOutcomeRow,
  enhanceStoneCost,
  type EnhanceChoice,
  type V2EnhanceState,
} from "@/adventure/data/v2/v2Enhance";
import {
  canStormRefine,
  isStormRefinementCandidate,
  STORM_REFINEMENT_GOLD_COST,
  STORM_REFINEMENT_HEART_COST,
  STORM_REFINEMENT_ROUTE_MATERIAL_COST,
  stormRefinementPreview,
} from "@/adventure/data/v2/stormEquipmentRefinement";
import {
  STORM_EXPEDITION_ROUTE_MATERIAL_ID,
  STORM_HEART_FRAGMENT_MATERIAL_ID,
} from "@/adventure/data/v2/stormExpeditionRewards";
import {
  EquipmentCardGrid,
  type EquipmentCard,
} from "@/adventure/v2/V2InventoryView";
import {
  QualityPctText,
  CraftQualityStars,
  powerNameClass,
} from "@/adventure/v2/V2ItemCard";
import { sortEnhanceCandidates } from "@/adventure/v2/v2EnhanceList";
import { EnhancePowerPreview } from "@/adventure/v2/EnhancePowerPreview";
import { useSystemToast } from "./RewardToastProvider";

const SLOT_TABS: { key: V2EquipSlot; label: string }[] = [
  { key: "weapon", label: "무기" },
  { key: "armor", label: "갑옷" },
  { key: "gloves", label: "장갑" },
  { key: "boots", label: "신발" },
  { key: "ring", label: "반지" },
  { key: "necklace", label: "목걸이" },
];

function statusToneOf(
  kind: "success" | "fail" | "error",
): "success" | "error" | "warning" {
  return kind === "success" ? "success" : kind === "fail" ? "error" : "warning";
}

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

type StormRefineResponse = {
  ok?: boolean;
  error?: string;
  oldPower?: number;
  newPower?: number;
};

type StormRefinementConfirmMaterial = {
  label: string;
  have: number;
  need: number;
};

export function StormRefinementConfirmDialog({
  itemName,
  enhanceLevel,
  currentPower,
  refinedPower,
  goldCost,
  materials,
  busy,
  onConfirm,
  onClose,
}: {
  itemName: string;
  enhanceLevel: number;
  currentPower: number;
  refinedPower: number;
  goldCost: number;
  materials: readonly StormRefinementConfirmMaterial[];
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeIfIdle = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useEscapeKey(closeIfIdle);
  useModalA11y(panelRef);

  return (
    <div
      className="ui-modal-reveal fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeIfIdle();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="storm-refinement-confirm-title"
        aria-describedby="storm-refinement-confirm-description"
        className={`${SURFACE_CARD} ui-modal-panel w-full max-w-md p-5 shadow-2xl`}
      >
        <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
          폭풍 개량 작업 확인
        </p>
        <h2
          id="storm-refinement-confirm-title"
          className="mt-1 text-lg font-bold"
        >
          {enhanceLevel > 0 ? `+${enhanceLevel} ` : ""}
          {itemName} 장비를 개량할까요?
        </h2>
        <p
          id="storm-refinement-confirm-description"
          className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300"
        >
          고유 효과·옵션·강화·제작 품질은 유지하고, 현재 위력 굴림의 품질을
          같은 부위의 6T 기준으로 옮깁니다. 새 세트 효과는 추가되지 않습니다.
        </p>

        <div className={`${SURFACE_INSET} mt-4 space-y-2 p-3 text-sm`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-500 dark:text-zinc-400">위력</span>
            <strong className="tabular-nums text-violet-700 dark:text-violet-300">
              {currentPower.toLocaleString()} → {refinedPower.toLocaleString()}
            </strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-500 dark:text-zinc-400">개량비</span>
            <strong className="tabular-nums text-amber-700 dark:text-amber-300">
              {goldCost.toLocaleString()} G
            </strong>
          </div>
          <div className="border-t border-zinc-200 pt-2 text-xs dark:border-zinc-700">
            {materials.map((material) => (
              <div
                key={material.label}
                className="flex items-center justify-between gap-3 py-0.5"
              >
                <span className="text-zinc-500 dark:text-zinc-400">
                  {material.label}
                </span>
                <span className="font-medium tabular-nums">
                  {material.have.toLocaleString()}/{material.need.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          개량은 한 번만 가능하고 되돌릴 수 없습니다. 개량한 장비는 향후에도
          재련할 수 없으며, 현재 옵션과 품질이 그대로 확정됩니다.
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button size="md" disabled={busy} onClick={onClose}>
            취소
          </Button>
          <Button
            size="md"
            variant="primary"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "개량 중…" : "비용 확인 · 개량 확정"}
          </Button>
        </div>
      </div>
    </div>
  );
}

type ForgeMode = "enhance" | "refine" | "reforge" | "combine";

export function V2EnhanceView({ onBack }: { onBack: () => void }) {
  // 강화·재련·조합은 골드 sink — 보유 골드를 헤더에 노출(사용자 요청). 코어루프면 지갑+은행이
  //   결제 가능액(서버 enhance/reforge 가 spendGold 로 둘 다 차감)이라 그 합을 보여준다.
  const {
    coreLoopOn,
    frontierDepth,
    playerCombat,
    setBankedGold: syncCtxBanked,
    refreshGameState,
  } = useGameState();
  const [owned, setOwned] = useState<V2EquipInstance[]>([]);
  const [equipped, setEquipped] = useState<
    Partial<Record<V2EquipSlot, string>>
  >({});
  const [gold, setGold] = useState<number | null>(null);
  const [bankedGold, setBankedGold] = useState(0);
  const [stones, setStones] = useState({ red: 0, blue: 0 });
  const [reforgeStones, setReforgeStones] = useState({ basic: 0, high: 0 });
  const [staminaShards, setStaminaShards] = useState(0);
  const [scavengedMats, setScavengedMats] = useState({
    enhanceEmbers: 0,
    tornMapFragments: 0,
  });
  const [stormMats, setStormMats] = useState({
    wreckage: 0,
    gale: 0,
    thunder: 0,
    heart: 0,
  });
  const [chosenRareMapDepth, setChosenRareMapDepth] = useState<number | null>(
    null,
  );
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
  const [stormRefineConfirmOpen, setStormRefineConfirmOpen] = useState(false);
  const { notifySystem } = useSystemToast();
  const rareMapDepthOptions = useMemo(
    () => craftedRareMapDepthOptions(frontierDepth),
    [frontierDepth],
  );
  const recommendedRareMapDepth = useMemo(
    () => defaultCraftedRareMapDepth(frontierDepth, playerCombat?.power),
    [frontierDepth, playerCombat?.power],
  );
  const rareMapDepth =
    chosenRareMapDepth != null &&
    rareMapDepthOptions.includes(chosenRareMapDepth)
      ? chosenRareMapDepth
      : recommendedRareMapDepth;

  useEffect(() => {
    if (!msg) return;
    notifySystem(msg.text, msg.kind === "success" ? "success" : "error");
  }, [msg, notifySystem]);

  const refresh = useCallback(async () => {
    try {
      const [eqRes, invRes, stateRes] = await Promise.all([
        fetch("/api/v2/me/equipment"),
        fetch("/api/v2/me/inventory"),
        // 골드 표시용 보조 조회 — 거부(네트워크 끊김)돼도 장비/인벤 로드를 깨지 않게 격리.
        fetch("/api/v2/me/state").catch(() => null),
      ]);
      // 보유 골드 — 매 작업 후 핸들러가 refresh() 를 부르므로 여기서만 읽으면 자동 갱신.
      if (stateRes?.ok) {
        const j = (await stateRes.json().catch(() => null)) as {
          character?: { gold?: number; bankedGold?: number };
        } | null;
        if (j?.character) {
          setGold(j.character.gold ?? 0);
          setBankedGold(j.character.bankedGold ?? 0);
          syncCtxBanked(j.character.bankedGold ?? 0);
        }
      }
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
        setStaminaShards(j.materials?.[STAMINA_SHARD_MATERIAL_ID] ?? 0);
        setScavengedMats({
          enhanceEmbers: j.materials?.[ENHANCE_EMBER_MATERIAL_ID] ?? 0,
          tornMapFragments:
            j.materials?.[TORN_MAP_FRAGMENT_MATERIAL_ID] ?? 0,
        });
        setStormMats({
          wreckage:
            j.materials?.[STORM_EXPEDITION_ROUTE_MATERIAL_ID.wreckage] ?? 0,
          gale: j.materials?.[STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale] ?? 0,
          thunder:
            j.materials?.[STORM_EXPEDITION_ROUTE_MATERIAL_ID.thunder] ?? 0,
          heart: j.materials?.[STORM_HEART_FRAGMENT_MATERIAL_ID] ?? 0,
        });
      }
    } catch {
      /* 폴링 아님 — 조용히 */
    }
  }, [syncCtxBanked]);

  useEffect(() => {
    // 비동기 fetch 후 setState — cascading render 아님(인벤토리와 동일 패턴).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const tabInstances = useMemo(
    () =>
      sortEnhanceCandidates(
        owned.filter(
          (o) =>
            V2_EQUIPMENT[o.id]?.slot === tab &&
            (mode !== "refine" ||
              isStormRefinementCandidate(V2_EQUIPMENT[o.id])),
        ),
        equipped[tab] ?? null,
      ),
    [equipped, mode, owned, tab],
  );
  const pager = usePagination(tabInstances, 8, tab);

  const selected = owned.find((o) => o.iid === selectedIid) ?? null;
  const item = selected ? V2_EQUIPMENT[selected.id] : null;
  const level = selected?.enhance?.level ?? 0;
  const uniqueMult = item && isUnique(item) ? ENHANCE_UNIQUE_COST_MULT : 1;
  const basePower =
    selected && item ? effectiveStats(item, selected.roll).power : 0;
  const curPower = powerWithBonuses(basePower, selected?.enhance, selected?.craftQuality);
  const nextPower = powerWithBonuses(
    basePower,
    {
      level: level + 1,
      bonusPct: enhanceBonusPct(level + 1),
    },
    selected?.craftQuality,
  );
  const stoneRequired = level >= ENHANCE_STONE_REQUIRED_FROM;
  const outcomeRow = enhanceOutcomeRow(level, stone);
  const successPct = outcomeRow[0];
  const stoneCost = enhanceStoneCost(level) * uniqueMult;
  const goldCost = item
    ? enhanceGoldCostForEquipment(item, basePower, level) * uniqueMult
    : 0;
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
  // 결제 가능 골드 — 코어루프면 지갑+은행(서버 spendGold 와 동일 기준), 아니면 지갑만.
  const spendable = coreLoopOn ? (gold ?? 0) + bankedGold : (gold ?? 0);

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
          text: `강화 성공! +${json.enhance?.level} (위력 +${json.enhance?.bonusPct}%)`,
        });
      } else if (json.outcome === "demote") {
        setMsg({
          kind: "fail",
          text: `강화 실패 — 한 단계 하락… +${json.enhance?.level ?? 0}`,
        });
      } else if (json.outcome === "destroy") {
        setMsg({
          kind: "fail",
          text: "장비가 산산조각 났습니다… (파괴)",
        });
        setSelectedIid(null);
      } else {
        setMsg({ kind: "fail", text: "강화 실패 — 수치 유지, 재료만 소모" });
      }
      // 강화는 장착 장비의 위력을 바꾸므로 전역 상태(전투력)도 갱신.
      await Promise.all([refresh(), refreshGameState()]);
    } catch {
      setMsg({ kind: "error", text: "네트워크 오류 — 다시 시도해주세요" });
    } finally {
      setBusy(false);
    }
  }, [selected, stone, feedIid, busy, refresh, refreshGameState]);

  // ── 폭풍 개량 — 특화 유니크의 옵션·강화는 유지하고 위력만 6T 밴드로 확정 이전 ──
  const refineable = !!(
    selected &&
    item &&
    canStormRefine(item, selected)
  );
  const refinePreview =
    selected && item ? stormRefinementPreview(item, selected) : null;
  const refineCurrentPower = refinePreview
    ? powerWithBonuses(
        refinePreview.currentPower,
        selected?.enhance,
        selected?.craftQuality,
      )
    : 0;
  const refinedPower = refinePreview
    ? powerWithBonuses(
        refinePreview.refinedPower,
        selected?.enhance,
        selected?.craftQuality,
      )
    : 0;
  const stormMaterialShort =
    stormMats.wreckage < STORM_REFINEMENT_ROUTE_MATERIAL_COST ||
    stormMats.gale < STORM_REFINEMENT_ROUTE_MATERIAL_COST ||
    stormMats.thunder < STORM_REFINEMENT_ROUTE_MATERIAL_COST ||
    stormMats.heart < STORM_REFINEMENT_HEART_COST;
  const refineActionDisabled =
    busy ||
    !refineable ||
    stormMaterialShort ||
    spendable < STORM_REFINEMENT_GOLD_COST;

  const doStormRefine = useCallback(async () => {
    if (!selected || !item || busy || !refineable) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/storm-refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iid: selected.iid }),
      });
      const json = (await res.json()) as StormRefineResponse;
      if (!json.ok) {
        setMsg({
          kind: "error",
          text:
            json.error === "insufficient_material"
              ? "폭풍 개량 재료가 부족합니다"
              : json.error === "insufficient_gold"
                ? "골드가 부족합니다"
                : json.error === "already_refined"
                  ? "이미 폭풍 개량을 마친 장비입니다"
                  : json.error === "not_refineable"
                    ? "폭풍 개량 대상이 아닌 장비입니다"
                    : `실패: ${json.error ?? "unknown"}`,
        });
        return;
      }
      setMsg({
        kind: "success",
        text: `폭풍 개량 완료 — 위력 ${refineCurrentPower} → ${refinedPower}`,
      });
      await Promise.all([refresh(), refreshGameState()]);
    } catch {
      setMsg({ kind: "error", text: "네트워크 오류 — 다시 시도해주세요" });
    } finally {
      setStormRefineConfirmOpen(false);
      setBusy(false);
    }
  }, [busy, item, refineCurrentPower, refineable, refinedPower, refresh, refreshGameState, selected]);

  // ── 재련(reforge) — 골드로 옵션 굴림 재시도(항상 적용 = 도박) ──
  const reforgeCost = item ? reforgeGoldCost(item) : 0;
  const reforgeable = !!(selected && item && canReforge(item, selected.roll, selected));
  const reforgeRoll =
    selected && item && reforgeable ? (selected.roll ?? catalogItemStats(item)) : undefined;
  const reforgeStoneShort = reforgeStones[reforgeStone] < 1;
  const curQuality = selected && item ? rollQualityPct(item, reforgeRoll) : null;
  const curRollPower =
    selected && item ? effectiveStats(item, reforgeRoll).power : 0;

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
      const resultLabel = json.improved
        ? "상승"
        : (json.newQuality ?? 0) < (json.oldQuality ?? 0)
          ? "하락"
          : "유지";
      setMsg({
        kind: json.improved ? "success" : "fail",
        text: `재련 ${resultLabel} — 품질 ${json.oldQuality ?? "?"}% → ${json.newQuality ?? "?"}% (위력 ${oldP} → ${newP})`,
      });
      // 재련은 장착 장비의 옵션(위력)을 바꾸므로 전역 상태(전투력)도 갱신.
      await Promise.all([refresh(), refreshGameState()]);
    } catch {
      setMsg({ kind: "error", text: "네트워크 오류 — 다시 시도해주세요" });
    } finally {
      setBusy(false);
    }
  }, [selected, item, busy, refresh, reforgeStone, refreshGameState]);

  // ── 조합(combine) — 일반 재련석 3개 → 상급 재련석 1개(결정론·무료) ──
  const doCombine = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/reforge-stone-combine", {
        method: "POST",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setMsg({
          kind: "error",
          text:
            json.error === "insufficient_stone"
              ? "재련석이 부족합니다"
              : json.error === "insufficient_gold"
                ? `골드가 부족합니다 (${COMBINE_GOLD_COST.toLocaleString()} G 필요)`
                : `실패: ${json.error ?? "unknown"}`,
        });
        return;
      }
      setMsg({
        kind: "success",
        text: `재련석 ${REFORGE_COMBINE_COST}개 → 상급 재련석 1개 (−${COMBINE_GOLD_COST.toLocaleString()} G)`,
      });
      await refresh();
    } catch {
      setMsg({ kind: "error", text: "네트워크 오류 — 다시 시도해주세요" });
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  // ── 조합(combine) — 활력의 파편 6개 → 스태미나 회복약 1개 ──
  const doCombineStaminaPotion = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/stamina-potion-combine", {
        method: "POST",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setMsg({
          kind: "error",
          text:
            json.error === "insufficient_material"
              ? `활력의 파편이 부족합니다 (${STAMINA_SHARD_COMBINE_COST}개 필요)`
              : json.error === "insufficient_gold"
                ? `골드가 부족합니다 (${COMBINE_GOLD_COST.toLocaleString()} G 필요)`
                : `실패: ${json.error ?? "unknown"}`,
        });
        return;
      }
      setMsg({
        kind: "success",
        text: `활력의 파편 ${STAMINA_SHARD_COMBINE_COST}개 → 스태미나 회복약 1개 (−${COMBINE_GOLD_COST.toLocaleString()} G)`,
      });
      await Promise.all([refresh(), refreshGameState()]);
    } catch {
      setMsg({ kind: "error", text: "네트워크 오류 — 다시 시도해주세요" });
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, refreshGameState]);

  const doCombineScavenged = useCallback(
    async (
      recipe: ScavengedCraftRecipeId,
      materialLabel: string,
      need: number,
      outputLabel: string,
      mapDepth?: number,
    ) => {
      if (busy) return;
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/scavenged-crafting", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            recipe,
            ...(recipe === "rare_map" ? { depth: mapDepth } : {}),
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          outputName?: string;
          rareMap?: { depth?: number };
        };
        if (!json.ok) {
          setMsg({
            kind: "error",
            text:
              json.error === "insufficient_material"
                ? `${materialLabel}이 부족합니다 (${need}개 필요)`
                : json.error === "insufficient_gold"
                  ? `골드가 부족합니다 (${COMBINE_GOLD_COST.toLocaleString()} G 필요)`
                : json.error === "rare_map_full"
                  ? "희귀 지도 보유 한도(5장)가 가득 찼습니다"
                  : json.error === "invalid_map_depth"
                    ? "지도 단계를 다시 선택해주세요"
                  : `실패: ${json.error ?? "unknown"}`,
          });
          return;
        }
        const craftedLabel =
          recipe === "rare_map" && json.outputName
            ? `${json.outputName} (깊이 ${json.rareMap?.depth ?? "?"})`
            : outputLabel;
        setMsg({
          kind: "success",
          text: `${materialLabel} ${need}개 → ${craftedLabel} (−${COMBINE_GOLD_COST.toLocaleString()} G)`,
        });
        await Promise.all([refresh(), refreshGameState()]);
      } catch {
        setMsg({ kind: "error", text: "네트워크 오류 — 다시 시도해주세요" });
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh, refreshGameState],
  );

  const selectedSlotLabel = item
    ? (SLOT_TABS.find((slot) => slot.key === item.slot)?.label ?? item.slot)
    : "";
  const selectedLevelLabel = level > 0 ? `+${level} ` : "";
  const enhanceCostLabel =
    stone === "none"
      ? `${goldCost.toLocaleString()} G`
      : `${feedIid ? "강화석 면제(먹이)" : `${stone === "red" ? "붉은" : "푸른"} 강화석 ×${stoneCost}`} + ${goldCost.toLocaleString()} G`;
  const enhanceActionDisabled = busy || stoneShort || goldOnlyBlocked;
  const enhanceActionLabel = busy
    ? "강화 중…"
    : goldOnlyBlocked
      ? "+8부터는 강화석 필요"
      : stoneShort
        ? "강화석 부족"
        : `강화 (성공 ${successPct}%)`;
  const reforgeCostLabel = `${reforgeCost.toLocaleString()} G + ${
    REFORGE_STONES[reforgeStone].name
  } 1개${uniqueMult > 1 ? " (유니크 ×2)" : ""}`;
  const reforgeActionDisabled = busy || reforgeStoneShort;
  const reforgeActionLabel = busy
    ? "재련 중…"
    : reforgeStoneShort
      ? `${REFORGE_STONES[reforgeStone].name} 부족`
      : `재련 (${reforgeCost.toLocaleString()} G + 재련석 1)`;
  const mobileAction =
    mode === "enhance" && selected && item
      ? {
          title: `${selectedLevelLabel}${item.name}`,
          subtitle: `위력 ${curPower} → ${nextPower} · ${enhanceCostLabel}`,
          label: enhanceActionLabel,
          disabled: enhanceActionDisabled,
          variant: "warning" as const,
          onClick: () => void doEnhance(),
        }
      : mode === "refine" && selected && item && refinePreview
        ? {
            title: `${selectedLevelLabel}${item.name}`,
            subtitle: `위력 ${refineCurrentPower} → ${refinedPower} · ${STORM_REFINEMENT_GOLD_COST.toLocaleString()} G`,
            label: selected.stormRefined
              ? "개량 완료"
              : !refineable
                ? "이미 6T 기준 위력"
              : stormMaterialShort
                ? "재료 부족"
                : spendable < STORM_REFINEMENT_GOLD_COST
                  ? "골드 부족"
                  : busy
                    ? "개량 중…"
                    : "폭풍 개량",
            disabled: refineActionDisabled,
            variant: "primary" as const,
            onClick: () => setStormRefineConfirmOpen(true),
          }
      : mode === "reforge" && selected && item && reforgeable
        ? {
            title: `${selectedLevelLabel}${item.name}`,
            subtitle: `품질 ${
              curQuality != null ? `${curQuality}%` : "—%"
            } · ${reforgeCostLabel}`,
            label: reforgeActionLabel,
            disabled: reforgeActionDisabled,
            variant: "primary" as const,
            onClick: () => void doReforge(),
          }
        : null;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 pb-28 text-zinc-900 dark:text-zinc-100 sm:pb-6">
      <SubViewHeader
        title={
          <>
            <Hammer size={18} weight="duotone" />
            대장간
          </>
        }
        onBack={onBack}
        right={
          // 강화석/재련석만 — 골드까지 넣으면 우측이 넓어져 가운데 타이틀과 겹쳐(모바일) 아래 줄로 분리.
          <div className="flex items-center gap-3 text-sm tabular-nums">
            {mode === "enhance" ? (
              <>
                <span className="inline-flex items-center gap-1 text-rose-500">
                  <GameIcon name="Circle" size={12} weight="fill" />
                  {stones.red}
                </span>
                <span className="inline-flex items-center gap-1 text-sky-500">
                  <GameIcon name="Circle" size={12} weight="fill" />
                  {stones.blue}
                </span>
              </>
            ) : mode === "refine" ? (
              <span className="inline-flex items-center gap-1 text-violet-500">
                <GameIcon name="Sparkle" size={15} />
                {stormMats.heart}
              </span>
            ) : mode === "reforge" && V2_REFORGE_ENABLED ? (
              <>
                <span className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                  <GameIcon name="Wrench" size={15} />
                  {reforgeStones.basic}
                </span>
                <span className="inline-flex items-center gap-1 text-indigo-500">
                  <GameIcon name="Sparkle" size={15} />
                  {reforgeStones.high}
                </span>
              </>
            ) : null}
          </div>
        }
      />

      {/* 보유 골드 — 강화/재련/조합 결제 통화. 헤더 우측은 타이틀과 겹쳐서 별도 줄로(모바일 겹침 수정). */}
      {gold != null && (
        <div className="-mt-2 flex items-center justify-end gap-1 text-xs font-medium tabular-nums text-amber-600 dark:text-amber-400">
          <GameIcon name="Coins" size={15} />
          보유 골드 {spendable.toLocaleString()} G
        </div>
      )}

      {/* 작업 모드 — 강화 / 재련 / 조합 */}
      <TabBar
        tabs={[
          { key: "enhance" as ForgeMode, label: "강화" },
          { key: "refine" as ForgeMode, label: "폭풍 개량" },
          ...(V2_REFORGE_ENABLED
            ? [{ key: "reforge" as ForgeMode, label: "재련" }]
            : []),
          { key: "combine" as ForgeMode, label: "조합" },
        ]}
        active={mode}
        onChange={(m) => {
          setMode(m);
          setSelectedIid(null);
          setFeedIid(null);
          setMsg(null);
          setStormRefineConfirmOpen(false);
        }}
        ariaLabel="대장간 작업"
        size="sm"
        variant="highlight"
      />

      {/* 강화 패널 — 장비 선택 시 */}
      {mode === "enhance" && selected && item && (
        <Card padding="sm" className="ui-forge-panel">
          <div className="space-y-2">
            <div className={`${SURFACE_ACCENT} px-3 py-2`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    강화 작업대 · {selectedSlotLabel}
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold">
                    {level > 0 && (
                      <span className="text-amber-600 dark:text-amber-300">
                        +{level}
                      </span>
                    )}
                    <CraftQualityStars
                      craftQuality={selected.craftQuality}
                      className="shrink-0"
                    />
                    <span
                      className={`truncate ${powerNameClass(item, selected.roll, selected.enhance, selected.craftQuality)}`}
                    >
                      {item.name}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIid(null);
                    setMsg(null);
                    setFeedIid(null);
                  }}
                  className="shrink-0 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                >
                  선택 해제
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px] tabular-nums">
                <div className={`${SURFACE_CARD} rounded-md px-2 py-1`}>
                  <div className="text-zinc-500 dark:text-zinc-400">현재 위력</div>
                  <div className="font-semibold">{curPower}</div>
                </div>
                <div className={`${SURFACE_CARD} rounded-md px-2 py-1`}>
                  <div className="text-zinc-500 dark:text-zinc-400">다음 위력</div>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {nextPower}
                  </div>
                </div>
                <div className={`${SURFACE_CARD} rounded-md px-2 py-1`}>
                  <div className="text-zinc-500 dark:text-zinc-400">성공률</div>
                  <div className="font-semibold">{successPct}%</div>
                </div>
              </div>
            </div>
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
                <EnhancePowerPreview
                  key={selected.iid}
                  basePower={basePower}
                  craftQuality={selected.craftQuality}
                  currentLevel={level}
                />
                {/* 강화 방식 — 골드(+7까지) / 강화석. 돌 효과: 붉은=성공↑(도박)·푸른=파괴 완화 */}
                <div className="flex gap-2">
                  {(["none", "blue", "red"] as const).map((s) => {
                    const disabled = s === "none" && stoneRequired;
                    const row = enhanceOutcomeRow(level, s);
                    return (
                      <ChoiceButton
                        key={s}
                        disabled={disabled}
                        onClick={() => {
                          setStone(s);
                          if (s === "none") setFeedIid(null);
                        }}
                        selected={stone === s}
                        tone={
                          s === "red" ? "danger" : s === "blue" ? "info" : "warning"
                        }
                        className="ui-forge-choice flex-1"
                      >
                        <div className="inline-flex items-center gap-1 font-medium">
                          {s === "none" ? (
                            <GameIcon name="Coins" size={15} />
                          ) : (
                            <GameIcon
                              name="Circle"
                              size={12}
                              weight="fill"
                              className={s === "red" ? "text-rose-500" : "text-sky-500"}
                            />
                          )}
                          {s === "none"
                            ? disabled
                              ? "골드 (+7까지)"
                              : "골드"
                            : s === "red"
                              ? "붉은 강화석"
                              : "푸른 강화석"}
                        </div>
                        <div className="mt-0.5 tabular-nums text-zinc-500 dark:text-zinc-400">
                          성공 {row[0]}%
                          {row[3] > 0 ? ` · 파괴 ${row[3]}%` : ""}
                        </div>
                      </ChoiceButton>
                    );
                  })}
                </div>
                {/* 결과 확률 — 누적 막대: 파트별 색 꽉 찬 칸 + 칸 내 중앙 라벨.
                    좁은 칸은 %만(7%↑) 또는 생략(7% 미만 — 색으로만 표시). */}
                <div className="ui-forge-outcome flex h-6 overflow-hidden rounded-md text-[10px] font-semibold tabular-nums text-white">
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
                    비용: {enhanceCostLabel}
                    {uniqueMult > 1 && " (유니크 ×2)"}
                  </span>
                  {outcomeRow[3] > 0 && stone !== "blue" && (
                    <span className="ui-quest-card is-claimable inline-flex items-center gap-1 font-semibold text-rose-500">
                      <GameIcon name="Warning" size={14} weight="fill" />
                      파괴 위험
                    </span>
                  )}
                  {outcomeRow[3] > 0 && stone === "blue" && (
                    <span className="ui-quest-card is-claimable inline-flex items-center gap-1 font-semibold text-rose-500">
                      <GameIcon name="Warning" size={14} weight="fill" />
                      푸른 돌: 파괴 완화
                    </span>
                  )}
                </div>
                <Button
                  onClick={() => void doEnhance()}
                  disabled={enhanceActionDisabled}
                  variant="warning"
                  size="md"
                  fullWidth
                >
                  {enhanceActionLabel}
                </Button>
            </>
            {msg && (
              <StatusBanner tone={statusToneOf(msg.kind)}>
                {msg.text}
              </StatusBanner>
            )}
          </div>
        </Card>
      )}

      {/* 폭풍 개량 — 세트가 없는 특화 유니크를 6T 조합용 단품으로 보존한다. */}
      {mode === "refine" && selected && item && refinePreview && (
        <Card padding="sm" className="ui-forge-panel">
          <div className="space-y-3">
            <div className={`${SURFACE_ACCENT} px-3 py-2`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                    폭풍 개량 작업대 · {selectedSlotLabel}
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold">
                    {level > 0 && (
                      <span className="text-amber-600 dark:text-amber-300">
                        +{level}
                      </span>
                    )}
                    <CraftQualityStars
                      craftQuality={selected.craftQuality}
                      className="shrink-0"
                    />
                    <span className="truncate">{item.name}</span>
                    {selected.stormRefined && (
                      <span className="rounded bg-violet-600 px-1.5 py-px text-[10px] font-semibold text-white">
                        개량 완료
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIid(null);
                    setMsg(null);
                    setStormRefineConfirmOpen(false);
                  }}
                  className="shrink-0 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                >
                  선택 해제
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px] tabular-nums">
                <div className={`${SURFACE_CARD} rounded-md px-2 py-1`}>
                  <div className="text-zinc-500 dark:text-zinc-400">현재 위력</div>
                  <div className="font-semibold">{refineCurrentPower}</div>
                </div>
                <div className={`${SURFACE_CARD} rounded-md px-2 py-1`}>
                  <div className="text-zinc-500 dark:text-zinc-400">개량 위력</div>
                  <div className="font-semibold text-violet-600 dark:text-violet-400">
                    {refinedPower}
                  </div>
                </div>
                <div className={`${SURFACE_CARD} rounded-md px-2 py-1`}>
                  <div className="text-zinc-500 dark:text-zinc-400">결과</div>
                  <div className="font-semibold">확정</div>
                </div>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
              이 장비의 고유 효과와 옵션 굴림, 강화 단계, 제작 품질은 그대로
              유지하고 위력만 같은 부위의 6T 기준으로 올립니다. 세트 태그는 붙지
              않아 4세트와 함께 쓰는 특화 단품으로 남습니다.
            </p>

            <div className={`${SURFACE_INSET} grid grid-cols-2 gap-2 px-3 py-2 text-xs tabular-nums sm:grid-cols-4`}>
              {[
                ["부유 합금핵", stormMats.wreckage, STORM_REFINEMENT_ROUTE_MATERIAL_COST],
                ["칼바람 정수", stormMats.gale, STORM_REFINEMENT_ROUTE_MATERIAL_COST],
                ["뇌운 결정", stormMats.thunder, STORM_REFINEMENT_ROUTE_MATERIAL_COST],
                ["폭풍 심장 조각", stormMats.heart, STORM_REFINEMENT_HEART_COST],
              ].map(([label, have, need]) => {
                const enough = Number(have) >= Number(need);
                return (
                  <div
                    key={String(label)}
                    className={
                      enough
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }
                  >
                    <div className="font-medium">{label}</div>
                    <div>
                      {have}/{need}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              개량비: {STORM_REFINEMENT_GOLD_COST.toLocaleString()} G · 실패 및
              파괴 없음
            </div>
            <Button
              onClick={() => setStormRefineConfirmOpen(true)}
              disabled={refineActionDisabled}
              variant="primary"
              size="md"
              fullWidth
            >
              {selected.stormRefined
                ? "폭풍 개량 완료"
                : !refineable
                  ? "이미 6T 기준 위력"
                : stormMaterialShort
                  ? "개량 재료 부족"
                  : spendable < STORM_REFINEMENT_GOLD_COST
                    ? "골드 부족"
                    : busy
                      ? "개량 중…"
                      : "폭풍 개량"}
            </Button>
            {msg && (
              <StatusBanner tone={statusToneOf(msg.kind)}>
                {msg.text}
              </StatusBanner>
            )}
          </div>
        </Card>
      )}

      {/* 재련 패널 — 장비 선택 시 */}
      {mode === "reforge" && selected && item && (
        <Card padding="sm" className="ui-forge-panel">
          <div className="space-y-2">
            <div className={`${SURFACE_INSET} px-3 py-2`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                    재련 작업대 · {selectedSlotLabel}
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold">
                    {level > 0 && (
                      <span className="text-amber-600 dark:text-amber-300">
                        +{level}
                      </span>
                    )}
                    <CraftQualityStars
                      craftQuality={selected.craftQuality}
                      className="shrink-0"
                    />
                    <span
                      className={`truncate ${powerNameClass(item, selected.roll, selected.enhance, selected.craftQuality)}`}
                    >
                      {item.name}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIid(null);
                    setMsg(null);
                  }}
                  className="shrink-0 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                >
                  선택 해제
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px] tabular-nums">
                <div className={`${SURFACE_CARD} rounded-md px-2 py-1`}>
                  <div className="text-zinc-500 dark:text-zinc-400">현재 위력</div>
                  <div className="font-semibold">{curRollPower}</div>
                </div>
                <div className={`${SURFACE_CARD} rounded-md px-2 py-1`}>
                  <div className="text-zinc-500 dark:text-zinc-400">품질</div>
                  <div className="font-semibold">
                    {curQuality != null ? (
                      <QualityPctText pct={curQuality} />
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400">—%</span>
                    )}
                  </div>
                </div>
                <div className={`${SURFACE_CARD} rounded-md px-2 py-1`}>
                  <div className="text-zinc-500 dark:text-zinc-400">강화 단계</div>
                  <div className="font-semibold">+{level}</div>
                </div>
              </div>
            </div>
            {!reforgeable ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                이 장비는 재련할 수 없습니다 (굴림 편차가 없는 장비).
              </p>
            ) : (
              <>
                <div className="text-sm tabular-nums">
                  위력 {curRollPower} · 품질{" "}
                  {curQuality != null ? (
                    <span className="inline-flex items-center gap-1">
                      <QualityPctText pct={curQuality} className="font-semibold" />
                    </span>
                  ) : (
                    <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                      —%
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  골드와 재련석으로 옵션 굴림을 다시 돌립니다. 결과는 무조건
                  적용되며 되돌릴 수 없습니다(도박). 강화 단계는 유지됩니다.
                </p>
                {/* 재련석 선택 — 일반(현 굴림) / 상급(고품질 확률↑) */}
                <div className="flex gap-2">
                  {(["basic", "high"] as const).map((s) => (
                    <ChoiceButton
                      key={s}
                      onClick={() => setReforgeStone(s)}
                      selected={reforgeStone === s}
                      tone={s === "high" ? "primary" : "neutral"}
                      className="ui-forge-choice flex-1"
                    >
                      <div className="inline-flex items-center gap-1 font-medium">
                        <GameIcon
                          name={s === "high" ? "Sparkle" : "Wrench"}
                          size={14}
                        />
                        {s === "high" ? "상급 재련석" : "재련석"}
                      </div>
                      <div className="mt-0.5 tabular-nums text-zinc-500 dark:text-zinc-400">
                        {s === "high" ? "고품질 확률↑" : "기본"} · 보유{" "}
                        {reforgeStones[s]}
                      </div>
                    </ChoiceButton>
                  ))}
                </div>
                <div className="flex items-baseline justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="tabular-nums">
                    비용: {reforgeCostLabel}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-500">
                    <GameIcon name="Warning" size={14} weight="fill" />
                    더 나빠질 수 있음
                  </span>
                </div>
                <Button
                  onClick={() => void doReforge()}
                  disabled={reforgeActionDisabled}
                  variant="primary"
                  size="md"
                  fullWidth
                >
                  {reforgeActionLabel}
                </Button>
              </>
            )}
            {msg && (
              <StatusBanner tone={statusToneOf(msg.kind)}>
                {msg.text}
              </StatusBanner>
            )}
          </div>
        </Card>
      )}

      {/* 조합 — 수집형 재료를 포함한 레시피 목록. 카드마다 산출물·조합비·재료 충족(✓/✗) + 조합 버튼. */}
      {mode === "combine" && (
        <section className="space-y-2">
          {[
            ...(V2_REFORGE_ENABLED
              ? [
                  {
                    key: "reforge-stone",
                    icon: <GameIcon name="Sparkle" size={24} />,
                    output: "상급 재련석",
                    cost: COMBINE_GOLD_COST,
                    mats: [
                      {
                        label: "재련석",
                        iconName: "Wrench" as const,
                        have: reforgeStones.basic,
                        need: REFORGE_COMBINE_COST,
                      },
                    ],
                    onCombine: doCombine,
                  },
                ]
              : []),
            {
              key: "stamina-potion",
              icon: <GameIcon name="Flask" size={24} />,
              output: "스태미나 회복약",
              cost: COMBINE_GOLD_COST,
              mats: [
                {
                  label: "활력의 파편",
                  iconName: "Flask" as const,
                  have: staminaShards,
                  need: STAMINA_SHARD_COMBINE_COST,
                },
              ],
              onCombine: doCombineStaminaPotion,
            },
            {
              key: "blue-enhance-stone",
              icon: <GameIcon name="Diamond" size={24} className="text-blue-500" />,
              output: "푸른 강화석",
              cost: COMBINE_GOLD_COST,
              mats: [
                {
                  label: "강화의 불씨",
                  iconName: "Sparkle" as const,
                  have: scavengedMats.enhanceEmbers,
                  need: ENHANCE_EMBER_BLUE_COST,
                },
              ],
              onCombine: () =>
                doCombineScavenged(
                  "blue_enhance_stone",
                  "강화의 불씨",
                  ENHANCE_EMBER_BLUE_COST,
                  "푸른 강화석 1개",
                ),
            },
            {
              key: "red-enhance-stone",
              icon: <GameIcon name="Diamond" size={24} className="text-red-500" />,
              output: "붉은 강화석",
              cost: COMBINE_GOLD_COST,
              mats: [
                {
                  label: "강화의 불씨",
                  iconName: "Sparkle" as const,
                  have: scavengedMats.enhanceEmbers,
                  need: ENHANCE_EMBER_RED_COST,
                },
              ],
              onCombine: () =>
                doCombineScavenged(
                  "red_enhance_stone",
                  "강화의 불씨",
                  ENHANCE_EMBER_RED_COST,
                  "붉은 강화석 1개",
                ),
            },
            {
              key: "rare-map",
              icon: <GameIcon name="MapTrifold" size={24} />,
              output: "랜덤 희귀 지도",
              cost: COMBINE_GOLD_COST,
              mats: [
                {
                  label: "찢어진 지도 조각",
                  iconName: "MapTrifold" as const,
                  have: scavengedMats.tornMapFragments,
                  need: TORN_MAP_FRAGMENT_COMBINE_COST,
                },
              ],
              onCombine: () =>
                doCombineScavenged(
                  "rare_map",
                  "찢어진 지도 조각",
                  TORN_MAP_FRAGMENT_COMBINE_COST,
                  "랜덤 희귀 지도 1장",
                  rareMapDepth,
                ),
              extra: (
                <label className="mt-2 block border-t border-zinc-200 pt-2 text-xs dark:border-zinc-700">
                  <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-200">
                    지도 단계
                  </span>
                  <select
                    value={rareMapDepth}
                    disabled={busy}
                    onChange={(event) =>
                      setChosenRareMapDepth(Number(event.target.value))
                    }
                    className="min-h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {[...rareMapDepthOptions].reverse().map((depth) => (
                      <option key={depth} value={depth}>
                        {huntStageName(depth)}
                        {depth === recommendedRareMapDepth
                          ? " · 전투력 기준 권장"
                          : ""}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-zinc-500 dark:text-zinc-400">
                    정복한 단계만 선택할 수 있으며, 지도는 선택한 단계로 복원됩니다.
                  </span>
                </label>
              ),
            },
          ].map((r) => {
            const short = r.mats.some((m) => m.have < m.need);
            return (
              <Card key={r.key} padding="sm" className="ui-lift-card">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 text-2xl" aria-hidden>
                    {r.icon}
                  </div>
                  <div className="min-w-0 shrink-0">
                    <div className="text-sm font-semibold">{r.output}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      조합비 {r.cost.toLocaleString()} G
                    </div>
                  </div>
                  <div className="ml-auto space-y-0.5 text-xs tabular-nums">
                    {r.mats.map((m) => {
                      const ok = m.have >= m.need;
                      return (
                        <div
                          key={m.label}
                          className={
                            ok
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-400 dark:text-zinc-500"
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            {ok ? "✓" : "✗"}
                            <GameIcon name={m.iconName} size={13} />
                            {m.label} {m.have}/{m.need}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    onClick={() => void r.onCombine()}
                    disabled={busy || short}
                    variant="primary"
                    size="md"
                    className="shrink-0"
                  >
                    {busy ? "…" : "조합 →"}
                  </Button>
                </div>
                {"extra" in r ? r.extra : null}
              </Card>
            );
          })}
          {msg && (
            <StatusBanner tone={statusToneOf(msg.kind)}>
              {msg.text}
            </StatusBanner>
          )}
        </section>
      )}

      {/* 장비 선택 — 슬롯 탭 + 그리드(착용 우선, 이후 강화 높은 순). 조합 모드는 장비 선택이 불필요해 숨긴다. */}
      {mode !== "combine" && (
        <Card as="section" padding="sm">
          <TabBar
            tabs={SLOT_TABS}
            active={tab}
            onChange={(t) => {
              setTab(t);
              setSelectedIid(null);
              setMsg(null);
              setFeedIid(null);
              setStormRefineConfirmOpen(false);
            }}
            ariaLabel="강화 슬롯"
            size="sm"
            variant="highlight"
            scrollable
          />
          <div className="mt-2">
            <EquipmentCardGrid
              selectedIid={selectedIid}
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
                setStormRefineConfirmOpen(false);
              }}
            />
            <Pagination
              page={pager.page}
              pageCount={pager.pageCount}
              setPage={pager.setPage}
            />
          </div>
        </Card>
      )}
      {mobileAction ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-3 py-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden dark:border-zinc-700 dark:bg-zinc-900/95">
          <div className="mx-auto flex max-w-[720px] items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {mobileAction.title}
              </div>
              <div className="truncate text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                {mobileAction.subtitle}
              </div>
            </div>
            <Button
              onClick={mobileAction.onClick}
              disabled={mobileAction.disabled}
              variant={mobileAction.variant}
              size="sm"
              className="min-w-28 shrink-0"
            >
              {mobileAction.label}
            </Button>
          </div>
        </div>
      ) : null}
      {stormRefineConfirmOpen && selected && item && refinePreview ? (
        <StormRefinementConfirmDialog
          itemName={item.name}
          enhanceLevel={level}
          currentPower={refineCurrentPower}
          refinedPower={refinedPower}
          goldCost={STORM_REFINEMENT_GOLD_COST}
          materials={[
            {
              label: "부유 합금핵",
              have: stormMats.wreckage,
              need: STORM_REFINEMENT_ROUTE_MATERIAL_COST,
            },
            {
              label: "칼바람 정수",
              have: stormMats.gale,
              need: STORM_REFINEMENT_ROUTE_MATERIAL_COST,
            },
            {
              label: "뇌운 결정",
              have: stormMats.thunder,
              need: STORM_REFINEMENT_ROUTE_MATERIAL_COST,
            },
            {
              label: "폭풍 심장 조각",
              have: stormMats.heart,
              need: STORM_REFINEMENT_HEART_COST,
            },
          ]}
          busy={busy}
          onClose={() => setStormRefineConfirmOpen(false)}
          onConfirm={() => void doStormRefine()}
        />
      ) : null}
    </main>
  );
}
