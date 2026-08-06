import {
  V2_EQUIPMENT,
  effectiveStats,
  powerWithBonuses,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";

export type EquipmentBuyOrderView = {
  id: number;
  isMine: boolean;
  itemId: string;
  itemName: string;
  unitPrice: number;
  minPower: number;
  minQualityPct: number;
  createdAt: string;
  expiresAt: string;
};

export type EquipmentOrderSnapshot = {
  power: number;
  qualityPct: number;
};

export function equipmentOrderSnapshot(
  instance: V2EquipInstance,
): EquipmentOrderSnapshot | null {
  const item = V2_EQUIPMENT[instance.id];
  if (!item) return null;
  return {
    power: powerWithBonuses(
      effectiveStats(item, instance.roll).power,
      instance.enhance,
      instance.craftQuality,
    ),
    // 굴림이 없는 정가 장비는 조건 0인 "품질 무관" 주문에만 맞는다.
    qualityPct: rollQualityPct(item, instance.roll) ?? 0,
  };
}

export function equipmentBuyOrderMatches(
  order: Pick<
    EquipmentBuyOrderView,
    "itemId" | "minPower" | "minQualityPct"
  >,
  instance: V2EquipInstance,
): boolean {
  if (order.itemId !== instance.id) return false;
  const snapshot = equipmentOrderSnapshot(instance);
  return (
    snapshot != null &&
    snapshot.power >= order.minPower &&
    snapshot.qualityPct >= order.minQualityPct
  );
}

/** 판매자는 구매자를 고르지 못한다. 조건을 만족하는 최고가, 동가에서는 오래된 주문이 우선이다. */
export function bestEquipmentBuyOrder(
  orders: readonly EquipmentBuyOrderView[],
  instance: V2EquipInstance,
): EquipmentBuyOrderView | null {
  return (
    orders
      .filter((order) => !order.isMine && equipmentBuyOrderMatches(order, instance))
      .slice()
      .sort(
        (a, b) =>
          b.unitPrice - a.unitPrice ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id - b.id,
      )[0] ?? null
  );
}

/** 일괄 판매 미리보기. 주문 하나를 두 장비에 중복 계산하지 않고 서버와 같은 iid 고정 순서를 쓴다. */
export function equipmentBatchSaleCandidates(
  orders: readonly EquipmentBuyOrderView[],
  instances: readonly V2EquipInstance[],
  limit = 10,
): Array<{ instance: V2EquipInstance; order: EquipmentBuyOrderView }> {
  let availableOrders = orders.slice();
  const candidates: Array<{
    instance: V2EquipInstance;
    order: EquipmentBuyOrderView;
  }> = [];
  for (const instance of instances.slice().sort((a, b) => a.iid.localeCompare(b.iid))) {
    const order = bestEquipmentBuyOrder(availableOrders, instance);
    if (!order) continue;
    candidates.push({ instance, order });
    availableOrders = availableOrders.filter((row) => row.id !== order.id);
    if (candidates.length >= limit) break;
  }
  return candidates;
}
