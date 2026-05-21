"use client";

import { useCallback, useState } from "react";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { ITEMS, type ItemId } from "@/adventure/data/items";
import { MATERIALS, type MaterialId } from "@/adventure/data/materials";
import { useGame } from "@/adventure/GameContext";
import { ListingsView } from "./ListingsView";
import { ListingCreateModal } from "./ListingCreateModal";
import { BuyConfirmModal } from "./BuyConfirmModal";
import { buyListing, cancelListing } from "./api";
import type { Listing } from "./types";

type SubTab = "all" | "mine";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "all", label: "전체 매물" },
  { key: "mine", label: "내 등록" },
];

export function MarketplaceTab() {
  const {
    inventory,
    characterStateHook,
    character,
    crafting,
    remote,
    inbox,
    addNotification,
  } = useGame();
  const consumeEquipment = inventory.consumeEquipment;
  const consumeCraftedEquipment = inventory.consumeCraftedEquipment;
  const consumeDroppedEquipment = inventory.consumeDroppedEquipment;
  const consumeMaterial = inventory.consumeMaterial;
  const consumeSkillBook = inventory.consumeSkillBook;
  const consumeEquipmentInstance = inventory.consumeEquipmentInstance;
  const addEquipment = inventory.addEquipment;
  const addCraftedEquipment = inventory.addCraftedEquipment;
  const addDroppedEquipment = inventory.addDroppedEquipment;
  const addMaterial = inventory.addMaterial;
  const addSkillBook = inventory.addSkillBook;
  const addEquipmentInstance = inventory.addEquipmentInstance;
  const addGold = characterStateHook.addGold;
  const currentGold = character.gold;
  const inboxCount = inbox.count;
  const refreshInbox = inbox.refresh;
  const knownRecipes = crafting.state.known;
  const shareableRecipes = crafting.state.shareable;
  const consumeShare = crafting.consumeShare;
  const learnRecipe = crafting.learnRecipe;
  const pushToast = useCallback(
    (msg: string) => addNotification("info", msg),
    [addNotification],
  );

  const [sub, setSub] = useState<SubTab>("all");
  const [modal, setModal] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingBuy, setPendingBuy] = useState<Listing | null>(null);

  // 구매 버튼 클릭 → 확인 모달만 띄우고 실제 호출은 모달의 confirm 에서.
  const onBuy = useCallback(async (listing: Listing) => {
    setError(null);
    setPendingBuy(listing);
  }, []);

  const performBuy = useCallback(
    async (listing: Listing) => {
      try {
        const r = await buyListing(remote, listing.id);
        addGold(-listing.price);
        pushToast(
          `${r.itemName}${r.quantity > 1 ? ` ×${r.quantity}` : ""} 구매 완료 — 마을 우편함에서 수령하세요.`,
        );
        setRefresh((v) => v + 1);
        refreshInbox();
        setPendingBuy(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "구매 실패";
        setError(msg);
        pushToast(msg);
        // 모달은 닫지 않음 — 사용자가 닫고 다시 시도할 수 있게.
      }
    },
    [remote, addGold, pushToast, refreshInbox],
  );

  const onCancel = useCallback(
    async (listing: Listing) => {
      setError(null);
      try {
        await cancelListing(remote, listing.id);
        // 서버가 인벤토리/공유토큰에 환불했으므로 클라 로컬 상태도 동일 변경 —
        // 그래야 useRemotePatch 가 보낼 다음 PATCH 가 일관된 값을 보낸다.
        if (listing.itemKind === "equip" && listing.instance) {
          // 인스턴스 매물 취소 — 로컬 풀에 복구(서버는 새 instanceId 로 복구, 다음 save
          // 동기화 때 서버 진실로 수렴). 표시 즉시성용.
          addEquipmentInstance(listing.instance);
        } else if (listing.itemKind === "equip") {
          if (Object.prototype.hasOwnProperty.call(ITEMS, listing.itemId)) {
            // 변형 키 ('base'|'c±N'|'dN') 별로 알맞은 storage 로 환불.
            // 미지정/잘못된 키 → base 로 fallback (구 데이터 호환).
            const g = listing.variantKey;
            const id = listing.itemId as ItemId;
            if (g === "c-2" || g === "c-1" || g === "c1" || g === "c2") {
              addCraftedEquipment(id, Number(g.slice(1)) as -2 | -1 | 1 | 2, listing.quantity);
            } else if (g === "d1" || g === "d2") {
              addDroppedEquipment(id, Number(g.slice(1)) as 1 | 2, listing.quantity);
            } else {
              addEquipment(id, listing.quantity);
            }
          }
        } else if (listing.itemKind === "material") {
          if (Object.prototype.hasOwnProperty.call(MATERIALS, listing.itemId)) {
            addMaterial(listing.itemId as MaterialId, listing.quantity);
          }
        } else if (listing.itemKind === "recipe") {
          // learnRecipe 는 known no-op + shareable 충전 효과.
          learnRecipe(listing.itemId);
        } else if (listing.itemKind === "skill_book") {
          addSkillBook(listing.itemId as never, 1);
        }
        pushToast(`${listing.itemName} 매물을 취소했습니다.`);
        setRefresh((v) => v + 1);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "취소 실패";
        setError(msg);
        pushToast(msg);
      }
    },
    [
      remote,
      pushToast,
      addEquipment,
      addCraftedEquipment,
      addDroppedEquipment,
      addMaterial,
      learnRecipe,
      addSkillBook,
      addEquipmentInstance,
    ],
  );

  return (
    <div className="space-y-3">
      <Card padding="sm">
        <div className="flex items-center justify-between gap-2">
          <TabBar
            tabs={SUB_TABS}
            active={sub}
            onChange={setSub}
            ariaLabel="거래소 하위 탭"
            size="sm"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => setModal(true)}
            className="shrink-0 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            매물 등록
          </button>
        </div>
        {inboxCount !== null && inboxCount > 0 ? (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            📬 마을 우편함에 수령 대기 {inboxCount}건이 있습니다.
          </div>
        ) : null}
      </Card>

      {error ? (
        <Card padding="sm">
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        </Card>
      ) : null}

      <ListingsView
        refreshKey={refresh}
        onCancelListing={onCancel}
        onBuyListing={onBuy}
        mineOnly={sub === "mine"}
        currentGold={currentGold}
        knownRecipes={knownRecipes}
      />

      {pendingBuy ? (
        <BuyConfirmModal
          listing={pendingBuy}
          currentGold={currentGold}
          alreadyKnown={
            pendingBuy.itemKind === "recipe" &&
            knownRecipes.includes(pendingBuy.itemId)
          }
          onConfirm={() => performBuy(pendingBuy)}
          onClose={() => setPendingBuy(null)}
        />
      ) : null}

      {modal ? (
        <ListingCreateModal
          inventory={inventory.state}
          shareableRecipes={shareableRecipes}
          remote={remote}
          onClose={() => setModal(false)}
          onSuccess={() => {
            setModal(false);
            setRefresh((v) => v + 1);
            pushToast("매물을 등록했습니다.");
          }}
          onLocalDeduct={(s, qty) => {
            if (s.kind === "equip") {
              // grade 별로 차감 storage 분기. base = equipment[], c±N = crafted, dN = dropped.
              if (s.craftTier != null) {
                consumeCraftedEquipment(s.itemId as ItemId, s.craftTier, 1);
              } else if (s.dropQuality != null) {
                consumeDroppedEquipment(s.itemId as ItemId, s.dropQuality, 1);
              } else {
                consumeEquipment(s.itemId as ItemId, 1);
              }
            } else if (s.kind === "equip_instance") {
              // 인스턴스 매물 등록 — 로컬 풀에서도 제거(서버 에스크로 미러).
              consumeEquipmentInstance(s.instanceId);
            } else if (s.kind === "material") {
              consumeMaterial(s.itemId as MaterialId, qty);
            } else if (s.kind === "recipe") {
              // 지식 자체는 보유, 공유 토큰만 1 소비 (서버와 동기화).
              consumeShare(s.itemId);
            } else if (s.kind === "skill_book") {
              consumeSkillBook(s.itemId, 1);
            }
          }}
          showError={(msg) => {
            setError(msg);
            pushToast(msg);
          }}
        />
      ) : null}

    </div>
  );
}

