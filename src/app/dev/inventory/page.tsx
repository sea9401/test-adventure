"use client";

import { useMemo, useState } from "react";
import {
  EquipmentCardGrid,
  type EquipmentCard,
} from "@/adventure/v2/V2InventoryView";
import { V2ItemCard, type ItemCardAnchor } from "@/adventure/v2/V2ItemCard";
import {
  V2_EQUIPMENT,
  type V2Equipment,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";

// 인벤토리 카드 그리드 프리뷰 — 보유 데이터(/api/v2/me/*)는 로그인 필요라, 정적 카탈로그
// (V2_EQUIPMENT)에서 표본을 뽑아 EquipmentCardGrid 를 그대로 렌더한다(로그인/DB 없이 QA).
// 장착 토글은 로컬 상태(서버 무관) — 카드 배지/테두리·팝오버 장착 버튼 동작 확인용.
export default function InventoryPreview() {
  const sample = useMemo<V2Equipment[]>(() => {
    const all = Object.values(V2_EQUIPMENT);
    const unique = all.find((i) => i.rarity === "unique");
    const base = all.filter((i) => i.id !== unique?.id).slice(0, unique ? 7 : 8);
    return unique ? [unique, ...base] : base;
  }, []);

  const [equipped, setEquipped] = useState<Set<V2EquipmentId>>(
    () => new Set(sample.length > 1 ? [sample[1].id] : []),
  );
  const [card, setCard] = useState<{
    item: V2Equipment;
    anchor: ItemCardAnchor;
  } | null>(null);

  const cards: EquipmentCard[] = sample.map((it, i) => ({
    id: it.id,
    count: i % 3 === 0 ? 2 : 1,
    isEquipped: equipped.has(it.id),
  }));

  const toggle = (id: V2EquipmentId) =>
    setEquipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-[720px] p-2">
      <div className="m-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV</strong> · 인벤토리 — 보유 장비 2열 카드 그리드 QA. 카드 탭 →
        상세·장착 팝오버. 표본(유니크·다티어 혼합)이라 실보유와 무관.
      </div>
      <div className="p-4">
        <EquipmentCardGrid
          cards={cards}
          onOpenCard={(item, anchor) => setCard({ item, anchor })}
        />
      </div>
      {card && (
        <V2ItemCard
          item={card.item}
          anchor={card.anchor}
          onClose={() => setCard(null)}
          equip={{
            isEquipped: equipped.has(card.item.id),
            busy: false,
            onEquip: () => toggle(card.item.id),
            onUnequip: () => toggle(card.item.id),
          }}
        />
      )}
    </div>
  );
}
