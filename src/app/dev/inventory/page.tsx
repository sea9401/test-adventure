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
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";
import { rollItemStats } from "@/adventure/data/v2/v2EquipVariance";

// 인벤토리 카드 그리드 프리뷰 — 보유 데이터(/api/v2/me/*)는 로그인 필요라, 정적 카탈로그
// (V2_EQUIPMENT)에서 표본을 뽑아 개체(instance)로 감싸 EquipmentCardGrid 를 그대로 렌더한다
// (로그인/DB 없이 QA). 장착 토글은 로컬 상태(서버 무관) — 카드 배지/팝오버 장착 동작 확인용.
// 일부 표본에 굴림(고/중/저)을 입혀 굴림% 배지·색·정렬 QA. 굴림 없는 것도 섞어(상점템 = 배지 X).
export default function InventoryPreview() {
  const sample = useMemo<V2EquipInstance[]>(() => {
    const all = Object.values(V2_EQUIPMENT);
    const unique = all.find((i) => i.rarity === "unique");
    const base = all
      .filter((i) => i.id !== unique?.id)
      .slice(0, unique ? 7 : 8);
    const items: V2Equipment[] = unique ? [unique, ...base] : base;
    // rng 고정으로 다양한 굴림 — god(0.999)/저(0)/중(0.5)/없음 순환.
    const rngs = [() => 0.999, () => 0, () => 0.5, null];
    return items.map((it, i) => {
      const rng = rngs[i % rngs.length];
      return {
        iid: `dev-${it.id}-${i}`,
        id: it.id,
        roll: rng ? rollItemStats(it, rng) : undefined,
      };
    });
  }, []);

  const [equipped, setEquipped] = useState<Set<string>>(
    () => new Set(sample.length > 1 ? [sample[1].iid] : []),
  );
  const [card, setCard] = useState<{
    inst: V2EquipInstance;
    anchor: ItemCardAnchor;
  } | null>(null);

  const cards: EquipmentCard[] = sample.map((inst) => ({
    inst,
    isEquipped: equipped.has(inst.iid),
  }));

  const toggle = (iid: string) =>
    setEquipped((prev) => {
      const next = new Set(prev);
      if (next.has(iid)) next.delete(iid);
      else next.add(iid);
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
          onOpenCard={(inst, anchor) => setCard({ inst, anchor })}
        />
      </div>
      {card && (
        <V2ItemCard
          item={V2_EQUIPMENT[card.inst.id]}
          roll={card.inst.roll}
          anchor={card.anchor}
          onClose={() => setCard(null)}
          equip={{
            isEquipped: equipped.has(card.inst.iid),
            busy: false,
            onEquip: () => toggle(card.inst.iid),
            onUnequip: () => toggle(card.inst.iid),
          }}
        />
      )}
    </div>
  );
}
