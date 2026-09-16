"use client";

import { useState } from "react";
import { V2_EQUIPMENT, type V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import {
  anchorOf,
  V2ItemCard,
  V2ItemCompareCard,
  type ItemCardAnchor,
} from "../V2ItemCard";

export function WarehouseEquipmentInspectButton({
  equipment,
  equippedEquipment,
}: {
  equipment: V2EquipInstance;
  equippedEquipment: V2EquipInstance[];
}) {
  const [card, setCard] = useState<{ anchor: ItemCardAnchor; compare: boolean } | null>(null);
  const item = V2_EQUIPMENT[equipment.id];
  const equipped = equippedEquipment.find((entry) => V2_EQUIPMENT[entry.id].slot === item.slot);
  const equippedIds = new Set(equippedEquipment.map((entry) => entry.id));
  const onClose = () => setCard(null);

  return (
    <>
      <button
        type="button"
        aria-label={`${item.name} 상세·비교`}
        aria-haspopup="dialog"
        className="min-h-9 rounded-md px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-zinc-800"
        onClick={(event) => setCard({ anchor: anchorOf(event.currentTarget), compare: false })}
      >
        상세·비교
      </button>
      {card && (card.compare && equipped ? (
        <V2ItemCompareCard
          candidate={{
            item,
            roll: equipment.roll,
            enhance: equipment.enhance,
            craftQuality: equipment.craftQuality,
            craftedBy: equipment.craftedBy,
          }}
          equipped={{ ...equipped, item: V2_EQUIPMENT[equipped.id] }}
          equippedIds={equippedIds}
          onClose={onClose}
        />
      ) : (
        <V2ItemCard
          item={item}
          roll={equipment.roll}
          enhance={equipment.enhance}
          craftQuality={equipment.craftQuality}
          craftedBy={equipment.craftedBy}
          liberation={equipment.liberation}
          anchor={card.anchor}
          equippedIds={equippedIds}
          compare={equipped ? { onCompare: () => setCard({ ...card, compare: true }) } : undefined}
          onClose={onClose}
        />
      ))}
    </>
  );
}
