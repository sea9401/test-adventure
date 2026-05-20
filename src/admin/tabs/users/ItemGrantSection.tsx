"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Field, NumberInput } from "../../ui/Field";
import type { InventoryState } from "@/adventure/inventory/useInventory";
import { ITEMS, type ItemId } from "@/adventure/data/items";
import { MATERIALS, type MaterialId } from "@/adventure/data/materials";
import { POTIONS, type PotionId } from "@/adventure/data/potions";

type GrantCategory = "potion" | "material" | "equipment";

const CATEGORY_LABEL: Record<GrantCategory, string> = {
  potion: "포션",
  material: "재료",
  equipment: "장비",
};

export function ItemGrantSection({
  inventory,
  readOnly,
  onUpdateInventory,
}: {
  inventory: InventoryState;
  readOnly: boolean;
  onUpdateInventory: (next: InventoryState) => void;
}) {
  const [category, setCategory] = useState<GrantCategory>("material");
  const [itemId, setItemId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);

  const options = useMemo(() => {
    if (category === "potion") {
      return Object.values(POTIONS).map((p) => ({ id: p.id, name: p.name }));
    }
    if (category === "material") {
      return Object.values(MATERIALS).map((m) => ({ id: m.id, name: m.name }));
    }
    return Object.entries(ITEMS).map(([id, it]) => ({ id, name: it.name }));
  }, [category]);

  // 카테고리 변경 시 첫 항목으로 자동 선택. 외부 입력(category) 변화에 맞춰
  // 종속 state(itemId) 를 재정렬하는 동기화 패턴.
  useEffect(() => {
    if (options.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItemId("");
      return;
    }
    if (!options.some((o) => o.id === itemId)) {
      setItemId(options[0].id);
    }
  }, [options, itemId]);

  const currentCount = (() => {
    if (!itemId) return 0;
    if (category === "potion") {
      return inventory.potions[itemId as PotionId] ?? 0;
    }
    if (category === "material") {
      return inventory.materials[itemId as MaterialId] ?? 0;
    }
    return inventory.equipment[itemId as ItemId] ?? 0;
  })();

  const grant = () => {
    if (!itemId || quantity === 0) return;
    // 변경하는 맵 3개만 복사하고 나머지(runes/skillBooks/equipmentInstances 등)는
    // spread 로 보존 — 예전엔 명시 필드만 나열해 룬·스킬북·인스턴스가 날아갔다.
    const next: InventoryState = {
      ...inventory,
      potions: { ...inventory.potions },
      equipment: { ...inventory.equipment },
      materials: { ...inventory.materials },
    };
    if (category === "potion") {
      const id = itemId as PotionId;
      next.potions[id] = Math.max(0, (next.potions[id] ?? 0) + quantity);
    } else if (category === "material") {
      const id = itemId as MaterialId;
      next.materials[id] = Math.max(0, (next.materials[id] ?? 0) + quantity);
    } else {
      const id = itemId as ItemId;
      next.equipment[id] = Math.max(0, (next.equipment[id] ?? 0) + quantity);
    }
    onUpdateInventory(next);
  };

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold">아이템 지급</h2>
      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        수량은 음수도 허용 — 회수 시 사용. 결과는 0 미만으로 떨어지지 않음.
      </p>
      <div className="mt-2 grid gap-3 md:grid-cols-[120px_1fr_120px]">
        <Field label="종류">
          <select
            value={category}
            disabled={readOnly}
            onChange={(e) => setCategory(e.target.value as GrantCategory)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {(Object.keys(CATEGORY_LABEL) as GrantCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="아이템"
          hint={itemId ? `현재 보유 ${currentCount}` : undefined}
        >
          <select
            value={itemId}
            disabled={readOnly}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.id})
              </option>
            ))}
          </select>
        </Field>
        <Field label="수량">
          <NumberInput
            value={quantity}
            disabled={readOnly}
            onChange={(n) => setQuantity(Math.floor(n))}
          />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={readOnly || !itemId || quantity === 0} onClick={grant}>
          {quantity > 0 ? `+${quantity} 지급` : `${quantity} 회수`}
        </Button>
        <Button disabled={readOnly || !itemId} onClick={() => setQuantity(1)}>
          1
        </Button>
        <Button disabled={readOnly || !itemId} onClick={() => setQuantity(10)}>
          10
        </Button>
        <Button disabled={readOnly || !itemId} onClick={() => setQuantity(100)}>
          100
        </Button>
      </div>
    </section>
  );
}
