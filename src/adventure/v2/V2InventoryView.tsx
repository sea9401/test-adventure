"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { TabBar } from "@/components/ui/TabBar";
import { confirmGameAction } from "@/components/ui/gameDialog";
import { type RareMapInstance } from "@/adventure/data/v2/rareMaps";
import {
  LEVEL_100_ELIXIR_ITEM_ID,
  type MuseunCashItemCounts,
  type MuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import { COOP_MASTERY_TOME_GAIN } from "@/adventure/data/v2/coopRewards";
import { type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";
import { SP_FRUIT, type SpFruitTier } from "@/adventure/data/v2/spFruit";
import { canLiberateEquipment } from "@/adventure/data/v2/equipmentLiberation";
import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  MAX_EXPLICIT_SELL_COUNT,
  selectBulkSell,
  selectExplicitSell,
  type BulkSellOpts,
} from "@/adventure/data/v2/v2EquipVariance";
import { equipmentProgressionLock } from "@/adventure/data/v2/equipmentProgression";
import {
  V2ItemCard,
  V2ItemCompareCard,
  type ItemCardAnchor,
} from "./V2ItemCard";
import {
  useEquipmentCodexContext,
  useGameState,
} from "@/adventure/v2/GameStateProvider";
import {
  groupEquipInstancesBySlot,
  V2_ITEM_TABS,
  type V2ItemTabKey,
  type SortMode,
} from "./v2ItemListShared";
import { EquipmentTab } from "./inventory/EquipmentTab";
import { MaterialsTab } from "./inventory/MaterialsTab";
import { RareMapsTab } from "./inventory/RareMapsTab";
import { useSystemToast } from "./RewardToastProvider";
import type { ActiveCookingBuff, CookingFoodDefinitionMap, CookingFoodId, CookingFoodInventory } from "./cooking/foodShared";
import { shopSaleBalancePatch, shopSaleBankNotice } from "./shopSaleBalance";
import { MasteryCertificateUseModal } from "./MasteryCertificateUseModal";
import type { FishId } from "@/adventure/data/v2/fish";
import type { FishSpecimenInventory } from "@/adventure/v2/fishSpecimens";
import {
  EquipmentCodexBulkDialog,
  type EquipmentCodexBulkCandidate,
} from "./EquipmentCodexBulkDialog";
import { selectEquipmentCodexBulkCandidates } from "./equipmentCodexBulk";
import { EquippedItemSummaryGrid } from "./inventory/EquippedItemSummaryGrid";
import { V2_EQUIPMENT_LIBERATION } from "@/adventure/data/v2/coreLoopConfig";
import { boundEquipmentDisposalConfirmation } from "./item-card/shared";

// 강화/재련 등 다른 화면도 같은 장비 카드 그리드를 쓴다 — 기존 import 경로 유지를 위해
// 분리한 컴포넌트를 여기서 재노출(re-export).
export {
  EquipmentCardGrid,
  type EquipmentCard,
} from "./inventory/EquipmentCardGrid";

// v2 인벤토리 — 위쪽 장착 슬롯 + 무기/갑옷/장갑/신발/반지/목걸이/재료 sub-tab.
// 개체(instance) 모델: 같은 종류라도 굴림이 다르면 별도 카드. 행 우측 버튼으로 장착/해제
// (POST /api/v2/me/equipment/equip, iid 기준).

const EQUIP_SLOTS: V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];

// 한 페이지에 보여줄 아이템 수 — 목록이 길어지면 < 1 2 3 … > 로 나눈다.
const INVENTORY_PAGE_SIZE = 20;

// 일괄 판매 임계값(%) — 한 번 정하면 새로고침 후에도 유지되도록 localStorage 에 저장.
const SELL_PCT_STORAGE_KEY = "v2-inventory-sell-pct";

export function equipmentLiberationSmithyHref(
  instance: V2EquipInstance,
  enabled: boolean = V2_EQUIPMENT_LIBERATION,
): string | undefined {
  const item = V2_EQUIPMENT[instance.id];
  if (!enabled || !item || !canLiberateEquipment(item, instance)) {
    return undefined;
  }
  return `/town/smithy?mode=liberation&item=${encodeURIComponent(instance.iid)}`;
}

export function bulkEquipmentSaleNotice(
  soldLabel: string,
  soldGold: number,
  skippedBoundCount: number,
): string {
  const sold = shopSaleBankNotice(soldLabel, soldGold);
  return skippedBoundCount > 0
    ? `${sold} · 귀속 장비 ${skippedBoundCount.toLocaleString()}개 제외`
    : sold;
}

type EquipmentSaleSelectionState = {
  slot: V2EquipSlot;
  iids: Set<string>;
};

type EquipmentCodexBulkState = {
  slot: V2EquipSlot;
  candidates: EquipmentCodexBulkCandidate[];
  selectedIids: Set<string>;
};

function itemTabFromParam(value: string | null): V2ItemTabKey {
  return V2_ITEM_TABS.some((tab) => tab.key === value)
    ? (value as V2ItemTabKey)
    : "weapon";
}

export function V2InventoryView({ onBack }: { onBack: () => void }) {
  const tabParam = useSearchParams().get("tab");
  const itemParam = useSearchParams().get("item");
  const [tab, setTab] = useState<V2ItemTabKey>(() =>
    itemTabFromParam(tabParam),
  );
  const [saleSelection, setSaleSelection] =
    useState<EquipmentSaleSelectionState | null>(null);
  const [codexBulk, setCodexBulk] =
    useState<EquipmentCodexBulkState | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL tab 파라미터 변경 시 로컬 탭 재시드
    setTab(itemTabFromParam(tabParam));
  }, [tabParam]);
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [lockedOnly, setLockedOnly] = useState(false);
  // 소모품 탭 — 보유 레어맵. 탭 진입 시 lazy 조회(판수 소모/30분 만료는 서버 권위).
  const [rareMaps, setRareMaps] = useState<RareMapInstance[] | null>(null);
  const [cashItems, setCashItems] = useState<MuseunCashItemCounts>({});
  const [cookingFoods, setCookingFoods] = useState<CookingFoodInventory>({});
  const [cookingFoodDefinitions, setCookingFoodDefinitions] = useState<CookingFoodDefinitionMap>({});
  const [fishSpecimens, setFishSpecimens] = useState<FishSpecimenInventory["items"]>({});
  const [registeredFishIds, setRegisteredFishIds] = useState<string[]>([]);
  const [masteryCertificates, setMasteryCertificates] = useState(0);
  const [certificateModalOpen, setCertificateModalOpen] = useState(false);
  useEffect(() => {
    if (tab !== "consumable") return;
    let alive = true;
    Promise.all([
      fetch("/api/v2/me/rare-maps").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/v2/me/fishing-specimens").then((r) =>
        r.ok ? r.json() : null,
      ),
    ])
      .then(([j, specimenJson]: [
        {
          ok?: boolean;
          rareMaps?: RareMapInstance[];
          cashItems?: MuseunCashItemCounts;
        } | null,
        {
          ok?: boolean;
          specimens?: FishSpecimenInventory["items"];
          registeredIds?: string[];
        } | null,
      ]) => {
        if (!alive) return;
        setRareMaps(j?.ok ? (j.rareMaps ?? []) : []);
        setCashItems(j?.ok ? (j.cashItems ?? {}) : {});
        setFishSpecimens(specimenJson?.ok ? (specimenJson.specimens ?? {}) : {});
        setRegisteredFishIds(
          specimenJson?.ok ? (specimenJson.registeredIds ?? []) : [],
        );
      })
      .catch(() => {
        if (alive) setRareMaps([]);
      });
    return () => {
      alive = false;
    };
  }, [tab]);
  // 일괄 판매 품질 임계값(%) — 이 값 이하 품질 장비를 정리. 사용자가 직접 조정(0~100).
  // 기본 40 으로 시작하고, 마운트 후 localStorage 값으로 복원(SSR hydration mismatch 회피).
  const [sellQualityPct, setSellQualityPct] = useState(40);
  const [sellPctHydrated, setSellPctHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SELL_PCT_STORAGE_KEY);
      if (raw != null) {
        const n = Math.floor(Number(raw));
        if (Number.isFinite(n)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSellQualityPct(Math.max(0, Math.min(100, n)));
        }
      }
    } catch {}
    setSellPctHydrated(true);
  }, []);
  useEffect(() => {
    if (!sellPctHydrated) return; // 복원 전 초기값(40)으로 덮어쓰는 것 방지.
    try {
      localStorage.setItem(SELL_PCT_STORAGE_KEY, String(sellQualityPct));
    } catch {}
  }, [sellPctHydrated, sellQualityPct]);
  const [owned, setOwned] = useState<V2EquipInstance[]>([]);
  const [equipped, setEquipped] = useState<
    Partial<Record<V2EquipSlot, string>>
  >({});
  const [materials, setMaterials] = useState<
    Partial<Record<V2MaterialId, number>>
  >({});
  // SP 열매 등급별 사용 횟수(캐릭터당 캡 표시·캡 도달 시 사용 차단). /me/inventory 동봉.
  const [spFruitUsed, setSpFruitUsed] = useState<Record<SpFruitTier, number>>({
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // busy key = 처리 중인 개체 iid 또는 슬롯(해제). null 이면 유휴.
  const [busy, setBusy] = useState<string | null>(null);
  // 클릭 시 뜨는 옵션 카드 팝오버 — null 이면 닫힘. 개체(iid+roll) 단위.
  const [card, setCard] = useState<{
    inst: V2EquipInstance;
    anchor: ItemCardAnchor;
    compare?: boolean;
  } | null>(null);

  // 장비 변경 후 전역 상태(전투력 등) 갱신 — 사냥터 "내 전투력" 표기가 바로 정확해지도록.
  const { frontierDepth, refreshGameState, setGold, setBankedGold } =
    useGameState();
  const equipmentCodex = useEquipmentCodexContext();
  const { notifySystem } = useSystemToast();

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setLoadError(false);
    try {
      const [invRes, equipRes] = await Promise.all([
        fetch("/api/v2/me/inventory"),
        fetch("/api/v2/me/equipment"),
      ]);
      if (invRes.ok) {
        const j = (await invRes.json()) as {
          materials?: Partial<Record<V2MaterialId, number>>;
          spFruitUsed?: Partial<Record<SpFruitTier, number>>;
          cookingFoods?: CookingFoodInventory;
          cookingFoodDefinitions?: CookingFoodDefinitionMap;
          masteryCertificates?: number;
        };
        setMaterials(j.materials ?? {});
        setCookingFoods(j.cookingFoods ?? {});
        setCookingFoodDefinitions(j.cookingFoodDefinitions ?? {});
        setMasteryCertificates(
          Math.max(0, Math.floor(Number(j.masteryCertificates) || 0)),
        );
        setSpFruitUsed({
          1: j.spFruitUsed?.[1] ?? 0,
          2: j.spFruitUsed?.[2] ?? 0,
          3: j.spFruitUsed?.[3] ?? 0,
          4: j.spFruitUsed?.[4] ?? 0,
          5: j.spFruitUsed?.[5] ?? 0,
        });
      }
      if (equipRes.ok) {
        const j = (await equipRes.json()) as {
          owned?: V2EquipInstance[];
          equipped?: Partial<Record<V2EquipSlot, string>>;
        };
        setOwned(j.owned ?? []);
        setEquipped(j.equipped ?? {});
      }
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 setLoading)
    refresh(true);
  }, [refresh]);

  // 성공 시 true 반환 — 비교 카드가 실패 시엔 닫히지 않고 에러 메시지를 보여주도록.
  const applyEquip = useCallback(
    async (
      slot: V2EquipSlot,
      iid: string | null,
      busyKey: string,
    ): Promise<boolean> => {
      setBusy(busyKey);
      try {
        const res = await fetch("/api/v2/me/equipment/equip", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slot, iid }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          requirementLabel?: string;
          equipped?: Partial<Record<V2EquipSlot, string>>;
        } | null;
        if (!j?.ok) {
          const errorLabel =
            j?.error === "progression_locked"
              ? `착용 조건: ${j.requirementLabel ?? "사냥터 진행도 부족"}`
              : (j?.error ?? `http ${res.status}`);
          notifySystem(`✗ ${errorLabel}`);
          return false;
        }
        setEquipped(j.equipped ?? {});
        // 전역 갱신(전투력 등) — 즉시 응답(local equipped)은 유지, 파생 스탯은 백그라운드 반영.
        void refreshGameState();
        notifySystem(iid == null ? "✓ 해제 완료" : "✓ 장착 완료");
        return true;
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [notifySystem, refreshGameState],
  );

  // SP 열매 사용 — SP 최대치 +1(영구·캐릭터당 캡). 성공 시 인벤 새로고침으로 보유/사용수 갱신.
  const useSpFruit = useCallback(
    async (tier: SpFruitTier) => {
      setBusy(`sp_fruit_${tier}`);
      try {
        const res = await fetch("/api/v2/me/use-sp-fruit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tier }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          spBudget?: number;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "use_cap_reached"
              ? "사용 한도에 도달했습니다 (보유·거래만 가능)"
              : j?.error === "no_fruit"
                ? "보유한 열매가 없습니다"
                : (j?.error ?? `http ${res.status}`);
          notifySystem(`✗ ${label}`);
          return;
        }
        await refresh();
        await refreshGameState();
        notifySystem(
          `✓ ${SP_FRUIT[tier].name} 사용 — SP 최대치 +${SP_FRUIT[tier].spPerUse}` +
            (typeof j.spBudget === "number" ? ` (현재 ${j.spBudget})` : ""),
        );
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifySystem, refresh, refreshGameState],
  );

  // 협동 보스 장비 상자 사용 — 상자 1개 소모 후 장비 인스턴스 1개 획득.
  const useCoopEquipmentBox = useCallback(
    async (boxId: string) => {
      setBusy(boxId);
      try {
        const res = await fetch("/api/v2/me/use-coop-equipment-box", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ boxId }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          equipment?: { name?: string };
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "no_box"
              ? "보유한 상자가 없습니다"
              : (j?.error ?? `http ${res.status}`);
          notifySystem(`✗ ${label}`);
          return;
        }
        await refresh();
        notifySystem(`✓ ${j.equipment?.name ?? "장비"} 획득`);
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifySystem, refresh],
  );

  // 상급 숙련 교본 사용 — 거래 가능한 협동 보스 소모품. 현재 직업 숙련도만 서버 권위로 올린다.
  const useCoopMasteryTome = useCallback(async () => {
    setBusy("coop_mastery_tome");
    try {
      const res = await fetch("/api/v2/me/use-coop-mastery-tome", {
        method: "POST",
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        gained?: number;
        jobMastery?: number;
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "no_tome"
            ? "보유한 교본이 없습니다"
            : j?.error === "no_current_job"
              ? "현재 직업에는 사용할 수 없습니다"
              : j?.error === "fishing_job"
                ? "낚시 계열 직업에는 사용할 수 없습니다"
              : (j?.error ?? `http ${res.status}`);
        notifySystem(`✗ ${label}`);
        return;
      }
      await refresh();
      void refreshGameState();
      notifySystem(
        `✓ 현재 직업 숙련도 +${j.gained ?? COOP_MASTERY_TOME_GAIN}` +
          (typeof j.jobMastery === "number" ? ` (현재 ${j.jobMastery})` : ""),
      );
    } catch (err) {
      notifySystem(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [notifySystem, refresh, refreshGameState]);

  // 경험치의 비약 — 사용 결과를 현재 화면과 전역 캐릭터 상태에 반영한다.
  // 페이지 전체 새로고침은 하지 않아 탭·스크롤·열린 UI 상태를 유지한다.
  const useExpTome = useCallback(
    async (map: RareMapInstance) => {
      if (map.kind !== "exp_tome") return;
      setBusy(`exp_tome_${map.iid}`);
      try {
        const res = await fetch("/api/v2/me/use-exp-tome", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ map: map.iid }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          level?: number;
          levelsGained?: number;
          grantedExp?: number;
          runsLeft?: number;
        } | null;
        if (!res.ok || !data?.ok) {
          notifySystem(
            `✗ ${
              data?.error === "no_map"
                ? "보유한 경험치의 비약이 없습니다"
                : (data?.error ?? `http ${res.status}`)
            }`,
          );
          return;
        }
        const runsLeft = Math.max(0, data.runsLeft ?? map.runsLeft - 1);
        setRareMaps((current) =>
          current?.flatMap((item) => {
            if (item.iid !== map.iid) return [item];
            return runsLeft > 0 ? [{ ...item, runsLeft }] : [];
          }) ?? current,
        );
        await refreshGameState();
        notifySystem(
          `✓ 경험치 ${(data.grantedExp ?? 0).toLocaleString()} 획득` +
            (typeof data.level === "number" ? ` (Lv.${data.level})` : ""),
        );
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifySystem, refreshGameState],
  );

  const useCashItem = useCallback(
    async (itemId: MuseunCashItemId) => {
      setBusy(`cash_${itemId}`);
      try {
        const res = await fetch("/api/v2/me/use-cash-item", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          cashItems?: MuseunCashItemCounts;
          daysAdded?: number;
          refundedPoints?: number;
          level?: number;
          levelsGained?: number;
        } | null;
        if (!res.ok || !data?.ok) {
          notifySystem(
            `✗ ${
              data?.error === "not_owned"
                ? "보유한 아이템이 없습니다"
                : data?.error === "already_max_level"
                  ? "이미 100레벨입니다 · 비약은 소모되지 않았습니다"
                : data?.error === "nothing_to_reset"
                  ? "초기화할 수행 한계치가 없습니다"
                : (data?.error ?? `http ${res.status}`)
            }`,
          );
          return;
        }
        setCashItems(data.cashItems ?? {});
        await refreshGameState();
        notifySystem(
          itemId === LEVEL_100_ELIXIR_ITEM_ID
            ? `✓ 100레벨 달성 · ${data.levelsGained ?? 0}레벨 상승`
            : itemId === "cultivation_reset_potion"
            ? `✓ 수행 초기화 완료 · Lv.1로 초기화 · 숙달 포인트 +${(data.refundedPoints ?? 0).toLocaleString()}`
            : `✓ 월간 모험 지원권 ${data.daysAdded ?? 30}일 적용`,
        );
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifySystem, refreshGameState],
  );

  const useCookingFood = useCallback(
    async (itemId: CookingFoodId) => {
      setBusy(`cooking_food_${itemId}`);
      try {
        const res = await fetch("/api/v2/me/use-cooking-food", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          cookingFoods?: CookingFoodInventory;
          activeBuff?: ActiveCookingBuff;
        } | null;
        if (!res.ok || !data?.ok) {
          notifySystem(
            `✗ ${
              data?.error === "not_owned"
                ? "보유한 음식이 없습니다"
                : (data?.error ?? `http ${res.status}`)
            }`,
          );
          return;
        }
        setCookingFoods(data.cookingFoods ?? {});
        await refreshGameState();
        notifySystem(
          `✓ ${data.activeBuff?.recipeName ?? "음식"} 효과가 적용됐습니다`,
        );
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifySystem, refreshGameState],
  );

  const useFishSpecimen = useCallback(
    async (fishId: FishId) => {
      setBusy(`fish_specimen_${fishId}`);
      try {
        const response = await fetch("/api/v2/me/fishing-specimens/use", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fishId }),
        });
        const data = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          specimenBalance?: number;
          registeredIds?: string[];
          fishSpBefore?: number;
          fishSpAfter?: number;
        } | null;
        if (!response.ok || !data?.ok) {
          notifySystem(
            `✗ ${
              data?.error === "already_registered"
                ? "이미 등록된 어종입니다"
                : data?.error === "not_owned"
                  ? "보유한 표본이 없습니다"
                  : (data?.error ?? `http ${response.status}`)
            }`,
          );
          return;
        }
        setFishSpecimens((current) => {
          const next = { ...current };
          if ((data.specimenBalance ?? 0) > 0) next[fishId] = data.specimenBalance;
          else delete next[fishId];
          return next;
        });
        setRegisteredFishIds(data.registeredIds ?? []);
        await refreshGameState();
        const gained = Math.max(0, (data.fishSpAfter ?? 0) - (data.fishSpBefore ?? 0));
        notifySystem(
          gained > 0
            ? `✓ 도감 등록 완료 · 어보 SP +${gained}`
            : "✓ 도감 등록 완료",
        );
      } catch (error) {
        notifySystem(`✗ ${(error as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifySystem, refreshGameState],
  );

  // 즐겨찾기 잠금 토글 — 일괄/실수 판매 보호. 응답의 owned 로 갱신.
  const applyLock = useCallback(
    async (iid: string, locked: boolean) => {
      setBusy(iid);
      try {
        const res = await fetch("/api/v2/me/equipment/lock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ iid, locked }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          owned?: V2EquipInstance[];
        } | null;
        if (!j?.ok) {
          notifySystem(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        setOwned(j.owned ?? []);
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifySystem],
  );

  const submitEquipmentCodexRegistration = useCallback(
    async (inst: V2EquipInstance) => {
      const res = await fetch("/api/v2/me/equipment-codex", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iid: inst.iid }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        registeredIds?: string[];
        owned?: V2EquipInstance[];
        equipped?: Partial<Record<V2EquipSlot, string>>;
        materials?: Partial<Record<V2MaterialId, number>>;
      } | null;
      if (!res.ok || !data?.ok) {
        const reason =
          data?.error === "locked"
            ? "잠긴 장비는 등록할 수 없습니다"
            : data?.error === "equipped"
              ? "장착 중인 장비는 등록할 수 없습니다"
              : data?.error === "already_registered"
                ? "이미 도감에 등록된 장비입니다"
                : data?.error === "not_owned"
                  ? "보유 장비를 찾을 수 없습니다"
                  : "장비를 도감에 등록할 수 없습니다";
        throw new Error(reason);
      }

      setOwned((current) =>
        Array.isArray(data.owned)
          ? data.owned
          : current.filter((entry) => entry.iid !== inst.iid),
      );
      if (data.equipped && typeof data.equipped === "object") {
        setEquipped(data.equipped);
      }
      if (data.materials && typeof data.materials === "object") {
        setMaterials(data.materials);
      }
      if (Array.isArray(data.registeredIds)) {
        equipmentCodex?.replaceRegisteredIds(data.registeredIds);
      }
      setCard((current) => (current?.inst.iid === inst.iid ? null : current));
      return data;
    },
    [equipmentCodex],
  );

  // 인벤토리의 "도감 미등록" 배지에서 바로 등록한다. 서버 규칙과 동일하게 장착·잠금
  // 개체는 차단하고, 영구 소모 작업이라 최종 확인은 유지한다.
  const registerEquipmentCodex = useCallback(
    async (inst: V2EquipInstance) => {
      if (busy !== null) return;
      const liveInst = owned.find((entry) => entry.iid === inst.iid);
      const item = liveInst ? V2_EQUIPMENT[liveInst.id] : undefined;
      if (!liveInst || !item) {
        notifySystem("✗ 보유 장비를 찾을 수 없습니다");
        return;
      }
      if (equipmentCodex?.registeredIds.has(liveInst.id)) {
        notifySystem("✗ 이미 도감에 등록된 장비입니다");
        return;
      }
      if (liveInst.locked) {
        notifySystem("✗ 잠긴 장비는 등록할 수 없습니다. 먼저 잠금을 해제해 주세요");
        return;
      }
      if (Object.values(equipped).includes(liveInst.iid)) {
        notifySystem("✗ 장착 중인 장비는 등록할 수 없습니다. 먼저 해제해 주세요");
        return;
      }
      if (
        !(await confirmGameAction(
          `${item.name} 1개를 장비 도감에 등록할까요?\n등록한 장비는 영구적으로 소모됩니다.`,
        ))
      ) {
        return;
      }

      setBusy(liveInst.iid);
      try {
        await submitEquipmentCodexRegistration(liveInst);
        void refreshGameState();
        notifySystem(`✓ ${item.name} 도감 등록 완료`);
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [
      busy,
      equipmentCodex,
      equipped,
      notifySystem,
      owned,
      refreshGameState,
      submitEquipmentCodexRegistration,
    ],
  );

  const openEquipmentCodexBulk = useCallback(
    (slot: V2EquipSlot) => {
      if (busy !== null) return;
      if (!equipmentCodex?.loaded) {
        notifySystem("✗ 장비 도감 정보를 불러오는 중입니다");
        return;
      }
      const candidates = selectEquipmentCodexBulkCandidates({
        owned,
        equipped,
        registeredIds: equipmentCodex.registeredIds,
        slot,
      });
      if (candidates.length === 0) {
        notifySystem("✗ 이 부위에 등록 가능한 장비가 없습니다");
        return;
      }
      setCard(null);
      setCodexBulk({
        slot,
        candidates,
        selectedIids: new Set(candidates.map(({ inst }) => inst.iid)),
      });
    },
    [busy, equipmentCodex, equipped, notifySystem, owned],
  );

  const confirmEquipmentCodexBulk = useCallback(async () => {
    if (!codexBulk || busy !== null) return;
    const selected = codexBulk.candidates.filter(({ inst }) =>
      codexBulk.selectedIids.has(inst.iid),
    );
    if (selected.length === 0) return;

    setBusy(`codex-bulk:${codexBulk.slot}`);
    let registered = 0;
    let failed = 0;
    try {
      for (const { inst } of selected) {
        try {
          await submitEquipmentCodexRegistration(inst);
          registered += 1;
        } catch {
          failed += 1;
        }
      }
      void refreshGameState();
      notifySystem(
        registered === 0
          ? `✗ 장비 도감 일괄등록 실패 · ${failed}종을 다시 확인해 주세요`
          : failed > 0
          ? `✓ 장비 도감 ${registered}종 등록 완료 · ${failed}종 실패`
          : `✓ 장비 도감 ${registered}종 일괄등록 완료`,
      );
    } finally {
      setBusy(null);
      setCodexBulk(null);
    }
  }, [
    busy,
    codexBulk,
    notifySystem,
    refreshGameState,
    submitEquipmentCodexRegistration,
  ]);

  // 일괄 판매 — 클라에서 selectBulkSell 로 미리보기(개수·골드) 후 확인, 서버가 권위 판매.
  // 장착·잠금 개체만 자동 제외(전 장비 판매 가능 — 유니크 등도 포함). 응답의 owned 로 갱신.
  const applyBulkSell = useCallback(
    async (opts: BulkSellOpts, label: string) => {
      const plan = selectBulkSell(owned, equipped, opts);
      if (plan.count === 0) {
        notifySystem(
          plan.skippedBoundCount > 0
            ? `✗ ${label}: 판매할 장비가 없습니다 · 귀속 장비 ${plan.skippedBoundCount.toLocaleString()}개 제외`
            : `✗ ${label}: 판매할 장비가 없습니다`,
        );
        return;
      }
      if (
        !(await confirmGameAction(
          `${label}\n${plan.count}개 판매 → +${plan.gold.toLocaleString()}골드\n(장착·잠금·귀속 제외) 진행할까요?`,
        ))
      ) {
        return;
      }
      setBusy("bulk");
      try {
        const res = await fetch("/api/v2/shop/equipment/sell-bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(opts),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          owned?: V2EquipInstance[];
          soldCount?: number;
          soldGold?: number;
          gold?: number;
          bankedGold?: number;
          skippedBoundCount?: number;
        } | null;
        if (!j?.ok) {
          notifySystem(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        setOwned(j.owned ?? []);
        const balancePatch = shopSaleBalancePatch(j);
        if (balancePatch.gold != null) setGold(balancePatch.gold);
        if (balancePatch.bankedGold != null) {
          setBankedGold(balancePatch.bankedGold);
        }
        notifySystem(
          bulkEquipmentSaleNotice(
            `${j.soldCount ?? 0}개`,
            j.soldGold ?? 0,
            j.skippedBoundCount ?? plan.skippedBoundCount,
          ),
        );
      } catch (err) {
        notifySystem(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [notifySystem, owned, equipped, setBankedGold, setGold],
  );

  const startSelectedSale = useCallback((slot: V2EquipSlot) => {
    setCard(null);
    setSaleSelection({ slot, iids: new Set() });
  }, []);

  const cancelSelectedSale = useCallback(() => {
    setSaleSelection(null);
  }, []);

  const toggleSelectedSale = useCallback(
    (slot: V2EquipSlot, inst: V2EquipInstance) => {
      const equippedIids = new Set(Object.values(equipped));
      if (inst.locked || equippedIids.has(inst.iid)) return;

      const currentIids =
        saleSelection?.slot === slot ? saleSelection.iids : new Set<string>();
      if (
        !currentIids.has(inst.iid) &&
        currentIids.size >= MAX_EXPLICIT_SELL_COUNT
      ) {
        notifySystem(`✗ 한 번에 최대 ${MAX_EXPLICIT_SELL_COUNT}개까지 선택할 수 있습니다`);
        return;
      }

      setSaleSelection((current) => {
        if (!current || current.slot !== slot) return current;
        const nextIids = new Set(current.iids);
        if (nextIids.has(inst.iid)) nextIids.delete(inst.iid);
        else nextIids.add(inst.iid);
        return { ...current, iids: nextIids };
      });
    },
    [equipped, notifySystem, saleSelection],
  );

  const selectedSaleResult = useMemo(() => {
    if (!saleSelection) return null;
    return selectExplicitSell(owned, equipped, [...saleSelection.iids]);
  }, [equipped, owned, saleSelection]);

  const applySelectedSale = useCallback(async () => {
    if (!saleSelection || !selectedSaleResult?.ok) {
      notifySystem("✗ 판매할 장비를 다시 선택해 주세요");
      setSaleSelection(null);
      return;
    }
    const plan = selectedSaleResult.plan;
    if (
      !(await confirmGameAction(
        `선택한 장비 ${plan.count}개를 판매할까요?\n판매 대금 +${plan.gold.toLocaleString()}골드는 은행에 입금됩니다.`,
      ))
    ) {
      return;
    }

    setBusy("selected-sell");
    let confirmedBound = false;
    try {
      const requestSale = async (confirmBound: boolean) => {
        const res = await fetch("/api/v2/shop/equipment/sell-bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            iids: plan.iids,
            ...(confirmBound ? { confirmBound: true } : {}),
          }),
        });
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          items?: Array<{
            iid: string;
            itemName: string;
            liberation?: V2EquipInstance["liberation"];
          }>;
          owned?: V2EquipInstance[];
          equipped?: Partial<Record<V2EquipSlot, string>>;
          soldCount?: number;
          soldGold?: number;
          gold?: number;
          bankedGold?: number;
        } | null;
        return { res, body };
      };

      let { res, body: j } = await requestSale(false);
      if (j?.error === "bound_confirmation_required" && j.items?.length) {
        confirmedBound = await confirmGameAction(
          boundEquipmentDisposalConfirmation(j.items, "판매"),
        );
        if (!confirmedBound) return;
        ({ res, body: j } = await requestSale(true));
        if (!j?.ok) await refresh();
      }

      if (!j?.ok) {
        if (j?.error === "selection_changed") {
          if (Array.isArray(j.owned)) setOwned(j.owned);
          if (j.equipped && typeof j.equipped === "object") {
            setEquipped(j.equipped);
          }
          setSaleSelection(null);
          notifySystem("✗ 장비 상태가 바뀌어 판매하지 않았습니다. 다시 선택해 주세요");
        } else {
          notifySystem(`✗ ${j?.error ?? `http ${res.status}`}`);
        }
        return;
      }

      setOwned(j.owned ?? []);
      if (j.equipped && typeof j.equipped === "object") {
        setEquipped(j.equipped);
      }
      const soldIids = new Set(plan.iids);
      setCard((current) =>
        current && soldIids.has(current.inst.iid) ? null : current,
      );
      const balancePatch = shopSaleBalancePatch(j);
      if (balancePatch.gold != null) setGold(balancePatch.gold);
      if (balancePatch.bankedGold != null) {
        setBankedGold(balancePatch.bankedGold);
      }
      setSaleSelection(null);
      notifySystem(
        shopSaleBankNotice(`${j.soldCount ?? 0}개`, j.soldGold ?? 0),
      );
    } catch (err) {
      if (confirmedBound) await refresh();
      notifySystem(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, [
    notifySystem,
    saleSelection,
    selectedSaleResult,
    refresh,
    setBankedGold,
    setGold,
  ]);

  // 착용 중인 장비 id 집합 — 카드 세트 발동/착용 하이라이트용(슬롯→iid → id).
  const equippedItemIds = useMemo(() => {
    const iids = new Set(Object.values(equipped));
    return new Set(owned.filter((i) => iids.has(i.iid)).map((i) => i.id));
  }, [owned, equipped]);

  // 슬롯별로만 나누고 저장 배열의 획득 순서를 보존한다. 각 정렬 기준은 EquipmentTab이
  // 원본 순서를 바탕으로 적용하므로 `획득순`도 실제 최신 장비를 찾을 수 있다.
  const ownedBySlot = useMemo(
    () => groupEquipInstancesBySlot(owned),
    [owned],
  );

  const equipmentCodexBulkCounts = useMemo(() => {
    const counts: Record<V2EquipSlot, number> = {
      weapon: 0,
      armor: 0,
      gloves: 0,
      boots: 0,
      ring: 0,
      necklace: 0,
    };
    if (!equipmentCodex?.loaded) return counts;
    for (const slot of EQUIP_SLOTS) {
      counts[slot] = selectEquipmentCodexBulkCandidates({
        owned,
        equipped,
        registeredIds: equipmentCodex.registeredIds,
        slot,
      }).length;
    }
    return counts;
  }, [equipmentCodex, equipped, owned]);

  useEffect(() => {
    if (!itemParam || loading) return;
    const inst = owned.find((item) => item.iid === itemParam);
    if (!inst) return;
    const item = V2_EQUIPMENT[inst.id];
    if (!item) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL item 파라미터로 상세 카드 초기 표시
    setTab(item.slot);
    setCard({
      inst,
      anchor: {
        top: Math.max(80, Math.floor(window.innerHeight * 0.28)),
        bottom: Math.max(120, Math.floor(window.innerHeight * 0.28) + 32),
        left: Math.max(24, Math.floor(window.innerWidth * 0.5) - 128),
      },
    });
  }, [itemParam, loading, owned]);

  return (
    <PageShell>
      <SubViewHeader title="인벤토리" onBack={onBack} />

      {/* 위쪽 — 모바일 3×2, PC 6×1 장착 요약. 해제는 상세 카드에서만 수행한다. */}
      <Card padding="md">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          장착 중
        </h2>
        <div className="mt-2">
          <EquippedItemSummaryGrid
            equipped={equipped}
            owned={owned}
            onOpen={(inst, anchor) => setCard({ inst, anchor })}
          />
        </div>
      </Card>

      <Card padding="md" className="space-y-3">
        <TabBar
          tabs={V2_ITEM_TABS}
          active={tab}
          onChange={(nextTab) => {
            setSaleSelection(null);
            setTab(nextTab);
          }}
          ariaLabel="인벤토리 카테고리"
          size="sm"
          variant="highlight"
          scrollable
        />

        {loadError && <LoadErrorBanner onRetry={() => void refresh(true)} />}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton rows={3} />
          </div>
        ) : tab === "consumable" ? (
          <RareMapsTab
            materials={materials}
            spFruitUsed={spFruitUsed}
            busy={busy}
            onUseSpFruit={useSpFruit}
            onUseEquipmentBox={useCoopEquipmentBox}
            onUseMasteryTome={useCoopMasteryTome}
            masteryCertificates={masteryCertificates}
            onUseMasteryCertificate={() => setCertificateModalOpen(true)}
            rareMaps={rareMaps}
            cashItems={cashItems}
            onUseCashItem={useCashItem}
            cookingFoods={cookingFoods}
            cookingFoodDefinitions={cookingFoodDefinitions}
            onUseCookingFood={useCookingFood}
            onUseExpTome={useExpTome}
            fishSpecimens={fishSpecimens}
            registeredFishIds={registeredFishIds}
            onUseFishSpecimen={useFishSpecimen}
          />
        ) : tab === "material" ? (
          <MaterialsTab materials={materials} pageSize={INVENTORY_PAGE_SIZE} />
        ) : (
          <EquipmentTab
            slot={tab}
            instances={ownedBySlot[tab]}
            equippedIid={equipped[tab] ?? null}
            busy={busy}
            sortMode={sortMode}
            setSortMode={setSortMode}
            lockedOnly={lockedOnly}
            setLockedOnly={setLockedOnly}
            sellQualityPct={sellQualityPct}
            setSellQualityPct={setSellQualityPct}
            pageSize={INVENTORY_PAGE_SIZE}
            frontierDepth={frontierDepth}
            onBulkSell={applyBulkSell}
            onOpenCard={(inst, anchor) => setCard({ inst, anchor })}
            onRegisterCodex={registerEquipmentCodex}
            codexBulk={{
              registerableCount: equipmentCodexBulkCounts[tab],
              onStart: () => openEquipmentCodexBulk(tab),
            }}
            selection={{
              active: saleSelection?.slot === tab,
              selectedIids:
                saleSelection?.slot === tab
                  ? saleSelection.iids
                  : new Set<string>(),
              selectedCount:
                saleSelection?.slot === tab && selectedSaleResult?.ok
                  ? selectedSaleResult.plan.count
                  : 0,
              selectedGold:
                saleSelection?.slot === tab && selectedSaleResult?.ok
                  ? selectedSaleResult.plan.gold
                  : 0,
              onStart: () => startSelectedSale(tab),
              onCancel: cancelSelectedSale,
              onToggle: (inst) => toggleSelectedSale(tab, inst),
              onConfirm: applySelectedSale,
            }}
          />
        )}
      </Card>
      {codexBulk ? (
        <EquipmentCodexBulkDialog
          slot={codexBulk.slot}
          candidates={codexBulk.candidates}
          selectedIids={codexBulk.selectedIids}
          busy={busy === `codex-bulk:${codexBulk.slot}`}
          onToggle={(iid) =>
            setCodexBulk((current) => {
              if (!current) return current;
              const selectedIids = new Set(current.selectedIids);
              if (selectedIids.has(iid)) selectedIids.delete(iid);
              else selectedIids.add(iid);
              return { ...current, selectedIids };
            })
          }
          onSelectAll={() =>
            setCodexBulk((current) =>
              current
                ? {
                    ...current,
                    selectedIids: new Set(
                      current.candidates.map(({ inst }) => inst.iid),
                    ),
                  }
                : current,
            )
          }
          onClearAll={() =>
            setCodexBulk((current) =>
              current ? { ...current, selectedIids: new Set() } : current,
            )
          }
          onCancel={() => setCodexBulk(null)}
          onConfirm={() => void confirmEquipmentCodexBulk()}
        />
      ) : null}
      {card &&
        (() => {
          const candItem = V2_EQUIPMENT[card.inst.id];
          const slot = candItem.slot;
          const equippedIid = equipped[slot] ?? null;
          const isCandidateEquipped = equippedIid === card.inst.iid;
          const progressionLock = equipmentProgressionLock(
            candItem,
            frontierDepth,
          );
          // 같은 슬롯에 다른 장비가 장착돼 있으면 상세 카드에 비교 버튼을 띄우고,
          // 사용자가 비교를 누른 경우에만 비교 카드를 연다.
          const equippedInst =
            equippedIid && !isCandidateEquipped
              ? owned.find((i) => i.iid === equippedIid)
              : undefined;
          // 토글 후 owned 갱신되므로 라이브 잠금 상태를 owned 에서 조회(card.inst 는 stale 가능).
          const liveLocked =
            owned.find((i) => i.iid === card.inst.iid)?.locked ?? false;
          const lockAction = {
            locked: liveLocked,
            busy: busy === card.inst.iid,
            onToggle: () => applyLock(card.inst.iid, !liveLocked),
          };

          if (equippedInst && card.compare) {
            const equippedItem = V2_EQUIPMENT[equippedInst.id];
            return (
              <V2ItemCompareCard
                candidate={{
                  iid: card.inst.iid,
                  item: candItem,
                  roll: card.inst.roll,
                  enhance: card.inst.enhance,
                  craftQuality: card.inst.craftQuality,
                  craftedBy: card.inst.craftedBy,
                }}
                equipped={{
                  item: equippedItem,
                  roll: equippedInst.roll,
                  enhance: equippedInst.enhance,
                  craftQuality: equippedInst.craftQuality,
                  craftedBy: equippedInst.craftedBy,
                }}
                onClose={() => setCard(null)}
                equip={{
                  busy: busy === card.inst.iid,
                  disabledReason: progressionLock?.label,
                  onEquip: async () => {
                    // 실패 시 모달 유지(에러 확인) — 성공해야 닫는다.
                    if (await applyEquip(slot, card.inst.iid, card.inst.iid)) {
                      setCard(null);
                    }
                  },
                }}
                unequip={{
                  busy: busy === slot,
                  onUnequip: async () => {
                    if (await applyEquip(slot, null, slot)) setCard(null);
                  },
                }}
                lock={lockAction}
                equippedIds={equippedItemIds}
              />
            );
          }

          // 후보가 이미 장착 중이거나 슬롯이 비었으면 기존 단일 카드.
          return (
            <V2ItemCard
              item={candItem}
              roll={card.inst.roll}
              enhance={card.inst.enhance}
              craftQuality={card.inst.craftQuality}
              craftedBy={card.inst.craftedBy}
              liberation={
                V2_EQUIPMENT_LIBERATION ? card.inst.liberation : undefined
              }
              liberationHref={equipmentLiberationSmithyHref(card.inst)}
              anchor={card.anchor}
              onClose={() => setCard(null)}
              equippedIds={equippedItemIds}
              equip={{
                isEquipped: isCandidateEquipped,
                busy: busy === card.inst.iid,
                disabledReason: isCandidateEquipped
                  ? undefined
                  : progressionLock?.label,
                onEquip: () => applyEquip(slot, card.inst.iid, card.inst.iid),
                onUnequip: () => applyEquip(slot, null, card.inst.iid),
              }}
              compare={
                equippedInst
                  ? {
                      onCompare: () =>
                        setCard((prev) =>
                          prev?.inst.iid === card.inst.iid
                            ? { ...prev, compare: true }
                            : prev,
                        ),
                    }
                  : undefined
              }
              lock={lockAction}
              codexRegister={{
                busy: busy === card.inst.iid,
                onRegister: () => registerEquipmentCodex(card.inst),
              }}
            />
          );
        })()}
      <MasteryCertificateUseModal
        open={certificateModalOpen}
        onClose={() => setCertificateModalOpen(false)}
        onUsed={async () => {
          await refresh();
          await refreshGameState();
        }}
      />
    </PageShell>
  );
}
