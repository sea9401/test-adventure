"use client";

import { useState } from "react";
import {
  CaretDown,
  CookingPot,
  HandFist,
  Shield,
  Sneaker,
  SlidersHorizontal,
  Sparkle,
  Sword,
  UserCircle,
  type Icon,
} from "@phosphor-icons/react";
import { NecklaceIcon, RingIcon } from "./EquipmentSlotIcons";
import { avatarImageSrc, type Gender } from "@/adventure/profile/avatars";
import { parseV2Class, V2_CLASS_DEFS } from "@/adventure/data/v2/classes";
import {
  V2_EQUIPMENT,
  type V2Equipment,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import type { ActiveCookingBuff } from "@/adventure/v2/cooking/food";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";
import type { V2CharacterCardData } from "./V2CharacterCard";
import {
  CompactCharacterEffectCard,
  type CompactCharacterEffectDetail,
} from "./CompactCharacterEffectCard";
import { V2ItemCard, anchorOf, type ItemCardAnchor } from "./V2ItemCard";

const numberFormatter = new Intl.NumberFormat("ko-KR");

const EQUIPMENT_SLOTS: {
  slot: V2EquipSlot;
  label: string;
  Icon: Icon;
  color: string;
}[] = [
  { slot: "weapon", label: "무기", Icon: Sword, color: "text-rose-500" },
  { slot: "armor", label: "갑옷", Icon: Shield, color: "text-sky-500" },
  { slot: "gloves", label: "장갑", Icon: HandFist, color: "text-amber-500" },
  { slot: "boots", label: "신발", Icon: Sneaker, color: "text-emerald-500" },
  { slot: "ring", label: "반지", Icon: RingIcon, color: "text-violet-500" },
  { slot: "necklace", label: "목걸이", Icon: NecklaceIcon, color: "text-pink-500" },
];

function ResourceLine({
  label,
  current,
  max,
  color,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-[0.6875rem]">
      <span className="w-[6.75rem] shrink-0 font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
        {label} {numberFormatter.format(current)} / {numberFormatter.format(max)}
      </span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}

type AdventureSupportSummary = {
  active: boolean;
  activeUntil: number | null;
  regenBonusPct: number;
};

type CompactDetailSelection =
  | {
      kind: CompactCharacterEffectDetail["kind"];
      anchor: ItemCardAnchor;
    }
  | {
      kind: "equipment";
      instance: V2EquipInstance;
      item: V2Equipment;
      anchor: ItemCardAnchor;
    };

export function CompactCharacterSummary({
  character,
  guild,
  levelCap,
  activePresetName,
  adventureSupport,
  activeFoodBuff,
  equipped,
  owned,
  expanded,
  onExpandedChange,
  children,
}: {
  character: V2CharacterCardData;
  guild: { id: number; name: string } | null;
  levelCap?: number | null;
  activePresetName?: string | null;
  adventureSupport?: AdventureSupportSummary;
  activeFoodBuff?: ActiveCookingBuff | null;
  equipped?: Partial<Record<V2EquipSlot, string>>;
  owned?: V2EquipInstance[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: React.ReactNode;
}) {
  const [selectedDetail, setSelectedDetail] =
    useState<CompactDetailSelection | null>(null);
  const [portraitErrored, setPortraitErrored] = useState(false);

  if (expanded) {
    return <>{children}</>;
  }

  const jobName =
    character.classDisplayName ??
    V2_CLASS_DEFS[parseV2Class(character.class)].name;
  const gender = (character.gender ?? "male1") as Gender;
  const mp = Math.max(0, character.mp ?? 0);
  const maxMp = Math.max(0, character.maxMp ?? 0);
  const showExp = character.expToNext != null && character.expToNext > 0;
  const supportActiveUntil =
    adventureSupport?.active &&
    typeof adventureSupport.activeUntil === "number" &&
    Number.isFinite(adventureSupport.activeUntil)
      ? adventureSupport.activeUntil
      : null;
  const equippedBySlot = new Map(
    EQUIPMENT_SLOTS.map(({ slot }) => {
      const iid = equipped?.[slot];
      const instance = iid ? owned?.find((item) => item.iid === iid) : undefined;
      return [slot, instance] as const;
    }),
  );
  const equippedItemIds = new Set(
    Array.from(equippedBySlot.values(), (instance) => instance?.id).filter(
      (id): id is NonNullable<typeof id> => id != null,
    ),
  );

  return (
    <>
      <Card
        as="section"
        padding="none"
        aria-label="캐릭터 요약"
        className="overflow-hidden"
      >
        <div className="relative flex items-start gap-3 p-3 sm:gap-4 sm:p-4">
          <Inset
            padding="none"
            className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden sm:h-28 sm:w-28"
          >
            {portraitErrored ? (
              <UserCircle size={42} className="text-zinc-400" aria-hidden />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={avatarImageSrc(gender, "static")}
                alt=""
                className="h-full w-full object-contain"
                onError={() => setPortraitErrored(true)}
              />
            )}
          </Inset>

        <div className="min-w-0 flex-1 pr-10 sm:pr-16">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate text-base font-bold text-zinc-900 dark:text-zinc-100">
              {character.name}
            </span>
            <span className="shrink-0 text-xs font-semibold text-zinc-500">Lv.{character.level}</span>
          </div>
          <p className="truncate text-xs text-zinc-600 dark:text-zinc-300">
            {jobName} · {guild?.name ?? "무소속"}
          </p>
          <div className="mt-2 space-y-1.5">
            <ResourceLine label="HP" current={character.hp} max={character.maxHp} color="bg-rose-500" />
            <ResourceLine label="MP" current={mp} max={maxMp} color="bg-sky-500" />
            {showExp ? (
              <ResourceLine
                label="EXP"
                current={character.exp}
                max={character.expToNext ?? 0}
                color="bg-amber-500"
              />
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {activeFoodBuff ? (
              <Inset
                as="button"
                type="button"
                padding="none"
                aria-label={`${activeFoodBuff.recipeName} 음식 효과 보기`}
                aria-haspopup="dialog"
                onClick={(event) =>
                  setSelectedDetail({
                    kind: "food",
                    anchor: anchorOf(event.currentTarget),
                  })
                }
                className="inline-flex items-center gap-1 border-0 px-2 py-1 text-[10px] text-zinc-600 shadow-none transition-colors hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-zinc-300 dark:hover:text-white"
              >
                <CookingPot size={13} className="text-orange-500" aria-hidden />
                <span className="max-w-28 truncate">{activeFoodBuff.recipeName}</span>
              </Inset>
            ) : null}
            {adventureSupport?.active ? (
              <Inset
                as="button"
                type="button"
                padding="none"
                aria-label="모험 지원권 상세 보기"
                aria-haspopup="dialog"
                onClick={(event) =>
                  setSelectedDetail({
                    kind: "support",
                    anchor: anchorOf(event.currentTarget),
                  })
                }
                className="inline-flex items-center gap-1 border-0 px-2 py-1 text-[10px] text-zinc-600 shadow-none transition-colors hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-zinc-300 dark:hover:text-white"
              >
                <Sparkle size={13} className="text-amber-500" aria-hidden />
                모험 지원권
              </Inset>
            ) : null}
            {activePresetName ? (
              <Inset as="span" padding="none" className="inline-flex items-center gap-1 border-0 px-2 py-1 text-[10px] text-zinc-600 shadow-none dark:text-zinc-300">
                <SlidersHorizontal size={13} className="text-violet-500" aria-hidden />
                <span className="max-w-28 truncate">{activePresetName}</span>
              </Inset>
            ) : null}
          </div>
        </div>

        <div className="absolute right-2 top-2 flex flex-col items-end gap-1 sm:right-3 sm:top-3">
          {levelCap != null ? (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              전직 Lv.{levelCap}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelectedDetail(null);
              onExpandedChange(true);
            }}
            aria-label="캐릭터 정보 펼치기"
          >
            <CaretDown size={18} aria-hidden />
          </Button>
        </div>
        </div>

        <div className="grid grid-cols-6 gap-1 border-t border-zinc-200 p-2 sm:gap-2 sm:p-3 dark:border-zinc-700">
          {EQUIPMENT_SLOTS.map(({ slot, label, Icon, color }) => {
            const instance = equippedBySlot.get(slot);
            const item = instance ? V2_EQUIPMENT[instance.id] : null;
            const content = (
              <>
                <Icon
                  size={18}
                  weight={item ? "duotone" : "regular"}
                  className={
                    item ? color : "text-zinc-300 dark:text-zinc-600"
                  }
                  aria-hidden
                />
                <span className="truncate text-[9px] text-zinc-500 dark:text-zinc-400">
                  {label}
                </span>
              </>
            );

            return instance && item ? (
              <Inset
                key={slot}
                as="button"
                type="button"
                data-compact-equipment-slot={slot}
                aria-label={`${item.name} 아이템 옵션 보기`}
                aria-haspopup="dialog"
                padding="none"
                title={`${label} · ${item.name}`}
                onClick={(event) =>
                  setSelectedDetail({
                    kind: "equipment",
                    instance,
                    item,
                    anchor: anchorOf(event.currentTarget),
                  })
                }
                className="flex min-h-11 min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 p-1 transition-colors hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:text-white"
              >
                {content}
              </Inset>
            ) : (
              <Inset
                key={slot}
                data-compact-equipment-slot={slot}
                padding="none"
                title={`${label} · 비어 있음`}
                className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 p-1"
              >
                {content}
              </Inset>
            );
          })}
        </div>
      </Card>
      {selectedDetail?.kind === "equipment" ? (
        <V2ItemCard
          item={selectedDetail.item}
          roll={selectedDetail.instance.roll}
          enhance={selectedDetail.instance.enhance}
          craftQuality={selectedDetail.instance.craftQuality}
          craftedBy={selectedDetail.instance.craftedBy}
          equippedIds={equippedItemIds}
          anchor={selectedDetail.anchor}
          onClose={() => setSelectedDetail(null)}
        />
      ) : selectedDetail?.kind === "support" && supportActiveUntil != null ? (
        <CompactCharacterEffectCard
          detail={{
            kind: "support",
            activeUntil: supportActiveUntil,
            regenBonusPct: adventureSupport?.regenBonusPct ?? 0,
          }}
          anchor={selectedDetail.anchor}
          onClose={() => setSelectedDetail(null)}
        />
      ) : selectedDetail?.kind === "food" && activeFoodBuff ? (
        <CompactCharacterEffectCard
          detail={{ kind: "food", buff: activeFoodBuff }}
          anchor={selectedDetail.anchor}
          onClose={() => setSelectedDetail(null)}
        />
      ) : null}
    </>
  );
}
