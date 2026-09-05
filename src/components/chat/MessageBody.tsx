"use client";

import { useState } from "react";
import { Sword } from "@phosphor-icons/react";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import {
  V2ItemCard,
  anchorOf,
  powerNameClass,
  type ItemCardAnchor,
} from "@/adventure/v2/V2ItemCard";
import {
  chatEquipmentLinkLabel,
  type ChatEquipmentLink,
} from "@/lib/chat-item-link";

// 메시지 본문 + 서버 검증 장비 링크. 링크를 누르면 전송 당시 옵션 스냅샷을 보여준다.
export function MessageBody({
  content,
  itemLink,
}: {
  content: string;
  itemLink?: ChatEquipmentLink | null;
}) {
  const [cardAnchor, setCardAnchor] = useState<ItemCardAnchor | null>(null);
  const item = itemLink ? V2_EQUIPMENT[itemLink.itemId] : null;

  return (
    <>
      {content}
      {itemLink && item ? (
        <>
          {content ? "\n" : null}
          <button
            type="button"
            onClick={(event) => setCardAnchor(anchorOf(event.currentTarget))}
            className={`inline-flex max-w-full items-center gap-1 rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-left text-xs font-semibold hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:hover:bg-sky-900 ${powerNameClass(
              item,
              itemLink.roll,
              itemLink.enhance,
              itemLink.craftQuality,
            )}`}
            aria-label={`${chatEquipmentLinkLabel(itemLink)} 아이템 옵션 보기`}
          >
            <Sword size={13} weight="duotone" className="shrink-0 text-sky-600 dark:text-sky-300" />
            <span className="truncate">[{chatEquipmentLinkLabel(itemLink)}]</span>
          </button>
          {cardAnchor ? (
            <V2ItemCard
              item={item}
              anchor={cardAnchor}
              onClose={() => setCardAnchor(null)}
              roll={itemLink.roll}
              enhance={itemLink.enhance}
              craftQuality={itemLink.craftQuality}
              craftedBy={itemLink.craftedBy}
              liberation={itemLink.liberation}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
