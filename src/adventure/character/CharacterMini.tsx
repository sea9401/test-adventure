import { Diamond, Shield, Sword, User } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { StatBar } from "@/components/ui/StatBar";
import { avatarImageSrc, type Gender } from "@/adventure/profile/avatars";
import { rarityTextClass, type EquipSlot } from "@/adventure/data/items";
import { craftTierSuffix, craftTierTextClass } from "@/adventure/data/craftQuality";
import {
  dropQualityPrefix,
  dropQualityTextClass,
} from "@/adventure/data/dropQuality";
import { enhanceAttemptStatus } from "./enhancement";
import type { Character, EquippedItem, EquippedSlots } from "./types";

export const EQUIP_SLOT_META: {
  slot: EquipSlot;
  icon: ReactNode;
  label: string;
}[] = [
  {
    slot: "weapon",
    icon: <Sword size={18} weight="duotone" className="text-rose-500" />,
    label: "무기",
  },
  {
    slot: "armor",
    icon: <Shield size={18} weight="duotone" className="text-sky-500" />,
    label: "방어구",
  },
  {
    slot: "accessory",
    icon: <Diamond size={18} weight="duotone" className="text-violet-500" />,
    label: "장신구",
  },
];

function CharacterPortrait({ gender }: { gender: Gender }) {
  const [errored, setErrored] = useState(false);
  return (
    <div
      aria-label="캐릭터 이미지"
      className="flex aspect-square w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-600"
    >
      {errored ? (
        <User size={56} weight="duotone" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarImageSrc(gender)}
          alt=""
          onError={() => setErrored(true)}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}

type TooltipAlign = "start" | "center" | "end";

const TOOLTIP_ALIGN: Record<TooltipAlign, string> = {
  // 그리드 모서리 셀에서 화면 밖으로 잘리지 않도록 셀 안쪽 가장자리에 정렬.
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
};

export function MiniEquipCard({
  icon,
  label,
  item,
  tooltipAlign = "center",
}: {
  icon: ReactNode;
  label: string;
  item: EquippedItem | null;
  tooltipAlign?: TooltipAlign;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const showOnHover = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setOpen(true);
  };
  const hideOnLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") setOpen(false);
  };
  const toggleOnTap = () => {
    if (item) setOpen((v) => !v);
  };

  // 별빛 무구(인스턴스) 한정 — 강화 단계 +N + 남은 강화 시도 횟수.
  const enhLevel = item?.enhancementLevel ?? 0;
  const enhSuffix = item?.instanceId && enhLevel > 0 ? `+${enhLevel}` : "";
  const attemptInfo =
    item?.instanceId && typeof item.remainingAttempts === "number"
      ? enhanceAttemptStatus(enhLevel, item.remainingAttempts)
      : null;

  return (
    <div
      ref={ref}
      className={`relative flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50 ${
        item ? "cursor-pointer" : ""
      }`}
      onPointerEnter={item ? showOnHover : undefined}
      onPointerLeave={item ? hideOnLeave : undefined}
      onClick={toggleOnTap}
      aria-expanded={item ? open : undefined}
    >
      <span className="flex shrink-0 items-center text-zinc-700 dark:text-zinc-300">
        {icon}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </div>
        <div className="truncate text-xs">
          {item ? (
            <span
              className={
                item.dropQuality
                  ? dropQualityTextClass(item.dropQuality)
                  : rarityTextClass(item)
              }
            >
              {dropQualityPrefix(item.dropQuality)}
              {item.name}
              {craftTierSuffix(item.craftTier) && (
                <span className={craftTierTextClass(item.craftTier)}>
                  {craftTierSuffix(item.craftTier)}
                </span>
              )}
              {enhSuffix && (
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {" "}
                  {enhSuffix}
                </span>
              )}
            </span>
          ) : (
            <span className="italic text-zinc-400 dark:text-zinc-600">없음</span>
          )}
        </div>
      </div>

      {item && open && (
        <div
          role="tooltip"
          className={`pointer-events-none absolute top-full z-20 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900 ${TOOLTIP_ALIGN[tooltipAlign]}`}
        >
          <div
            className={`font-medium ${
              item.dropQuality
                ? dropQualityTextClass(item.dropQuality)
                : rarityTextClass(item)
            }`}
          >
            {dropQualityPrefix(item.dropQuality)}
            {item.name}
            <span className={craftTierTextClass(item.craftTier)}>
              {craftTierSuffix(item.craftTier)}
            </span>
            {enhSuffix && (
              <span className="text-amber-600 dark:text-amber-400">
                {" "}
                {enhSuffix}
              </span>
            )}
          </div>
          {attemptInfo && attemptInfo.status !== "max" && (
            <div
              className={`mt-0.5 text-xs ${
                attemptInfo.status === "exhausted"
                  ? "text-zinc-400 dark:text-zinc-500"
                  : "text-amber-600/80 dark:text-amber-400/80"
              }`}
            >
              {attemptInfo.label}
            </div>
          )}
          <div className="mt-1.5 space-y-0.5">
            {item.stats.map((s) => (
              <div
                key={s.label}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="text-zinc-500 dark:text-zinc-400">
                  {s.label}
                </span>
                <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                  {s.value}
                </span>
              </div>
            ))}
          </div>
          {item.description && (
            <div className="mt-2 border-t border-zinc-200 pt-2 text-xs italic text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {item.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EquippedGrid({
  equipped,
  onUnequip,
}: {
  equipped: EquippedSlots;
  onUnequip?: (slot: EquipSlot) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {EQUIP_SLOT_META.map(({ slot, icon, label }, i) => {
        const item = equipped[slot];
        return (
          <div key={slot} className="space-y-1.5">
            <MiniEquipCard
              icon={icon}
              label={label}
              item={item}
              tooltipAlign={
                i === 0
                  ? "start"
                  : i === EQUIP_SLOT_META.length - 1
                    ? "end"
                    : "center"
              }
            />
            {onUnequip && (
              <button
                type="button"
                onClick={() => onUnequip(slot)}
                disabled={!item}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                해제
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CharacterMini({ character }: { character: Character }) {
  return (
    <Card as="section" padding="none">
      <div className="space-y-3 p-4">
        <div className="flex items-stretch gap-4">
          <CharacterPortrait gender={character.gender} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-baseline gap-2">
              {character.titleName && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  {character.titleName}
                </span>
              )}
              <span className="text-base font-semibold">{character.name}</span>
              <span className="text-sm text-zinc-400 dark:text-zinc-500">
                Lv.{character.level}
              </span>
            </div>
            <div className="max-w-sm space-y-2">
              <StatBar
                label="HP"
                value={character.hp}
                max={character.maxHp}
                color="bg-red-500"
              />
              <StatBar
                label="MP"
                value={character.mp}
                max={character.maxMp}
                color="bg-sky-500"
              />
              <StatBar
                label="EXP"
                value={character.exp}
                max={character.maxExp}
                color="bg-amber-400"
              />
            </div>
          </div>
        </div>
        <EquippedGrid equipped={character.equipped} />
      </div>
    </Card>
  );
}
