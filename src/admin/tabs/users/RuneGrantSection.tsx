"use client";

import { useState } from "react";
import { Button, Field, NumberInput } from "../../ui/Field";
import type { InventoryState } from "@/adventure/inventory/useInventory";
import {
  RUNES,
  RUNE_GRADES,
  RUNE_IDS,
  type RuneGrade,
  type RuneId,
} from "@/adventure/data/runes";

export function RuneGrantSection({
  inventory,
  readOnly,
  onUpdateInventory,
}: {
  inventory: InventoryState;
  readOnly: boolean;
  onUpdateInventory: (next: InventoryState) => void;
}) {
  const [runeId, setRuneId] = useState<RuneId>(RUNE_IDS[0]);
  const [grade, setGrade] = useState<RuneGrade>(1);
  const [quantity, setQuantity] = useState<number>(1);

  const currentCount = inventory.runes?.[runeId]?.[grade] ?? 0;

  // 룬 보유는 runes[id][grade] = count 중첩맵. 다른 인벤토리 필드는 spread 로 보존.
  const grant = () => {
    if (quantity === 0) return;
    const runes = { ...(inventory.runes ?? {}) };
    const idMap = { ...(runes[runeId] ?? {}) };
    const nextVal = Math.max(0, (idMap[grade] ?? 0) + quantity);
    if (nextVal > 0) idMap[grade] = nextVal;
    else delete idMap[grade];
    if (Object.keys(idMap).length > 0) runes[runeId] = idMap;
    else delete runes[runeId];
    onUpdateInventory({ ...inventory, runes });
  };

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold">룬 지급</h2>
      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        가방(미장착) 룬을 추가/회수. 수량은 음수도 허용 — 회수 시 사용. 결과는 0
        미만으로 떨어지지 않음. 6등급은 원래 별빛 조각 흡수로만 얻는 등급.
      </p>
      <div className="mt-2 grid gap-3 md:grid-cols-[1fr_120px_120px]">
        <Field label="룬" hint={`현재 보유 ${currentCount}`}>
          <select
            value={runeId}
            disabled={readOnly}
            onChange={(e) => setRuneId(e.target.value as RuneId)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {RUNE_IDS.map((id) => (
              <option key={id} value={id}>
                {RUNES[id].name} ({id})
              </option>
            ))}
          </select>
        </Field>
        <Field label="등급">
          <select
            value={grade}
            disabled={readOnly}
            onChange={(e) => setGrade(Number(e.target.value) as RuneGrade)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {RUNE_GRADES.map((g) => (
              <option key={g} value={g}>
                {g}등급
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
        <Button disabled={readOnly || quantity === 0} onClick={grant}>
          {quantity > 0 ? `+${quantity} 지급` : `${quantity} 회수`}
        </Button>
        <Button disabled={readOnly} onClick={() => setQuantity(1)}>
          1
        </Button>
        <Button disabled={readOnly} onClick={() => setQuantity(5)}>
          5
        </Button>
        <Button disabled={readOnly} onClick={() => setQuantity(10)}>
          10
        </Button>
      </div>
    </section>
  );
}
