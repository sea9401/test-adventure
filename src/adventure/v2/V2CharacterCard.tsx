"use client";

import { useMemo, useState } from "react";
import {
  Circle,
  Diamond,
  HandFist,
  Shield,
  Sneaker,
  Sword,
  User as UserIcon,
  type Icon,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatBar } from "@/components/ui/StatBar";
import { avatarImageSrc, type Gender } from "@/adventure/profile/avatars";
import {
  V2_EQUIPMENT,
  type V2Equipment,
  type V2EquipInstance,
  type V2EquipmentId,
  type V2EquipRoll,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { V2_CLASS_DEFS, parseV2Class } from "@/adventure/data/v2/classes";
import {
  V2ItemCard,
  anchorOf,
  powerNameClass,
  type ItemCardAnchor,
} from "./V2ItemCard";

// v2 캐릭터 간략 카드. equipped 가 있으면 카드 하단에 6슬롯 인라인 표시.
// 장착 슬롯 클릭 시 옵션 카드(V2ItemCard) 팝업 — 장착/해제는 인벤토리에서.

export type V2CharacterCardData = {
  name: string;
  gender?: string;
  level: number;
  exp: number;
  expToNext: number | null;
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  gold: number;
  /** 직업 id (raw V2Class). 없으면 "무직"으로 표시. */
  class?: string;
};

const EQUIP_SLOTS: { slot: V2EquipSlot; label: string; Icon: Icon; color: string }[] = [
  { slot: "weapon", label: "무기", Icon: Sword, color: "text-rose-500" },
  { slot: "armor", label: "갑옷", Icon: Shield, color: "text-sky-500" },
  { slot: "gloves", label: "장갑", Icon: HandFist, color: "text-amber-500" },
  { slot: "boots", label: "신발", Icon: Sneaker, color: "text-emerald-500" },
  { slot: "ring", label: "반지", Icon: Circle, color: "text-violet-500" },
  { slot: "necklace", label: "목걸이", Icon: Diamond, color: "text-pink-500" },
];

function CharacterPortrait({ gender }: { gender: Gender }) {
  const [errored, setErrored] = useState(false);
  return (
    <div
      aria-label="캐릭터 이미지"
      className="flex aspect-square w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600"
    >
      {errored ? (
        <UserIcon size={56} weight="duotone" />
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

export function V2CharacterCard({
  character,
  guild,
  levelCap = null,
  // 칭호 — v2 시스템 없음. 있을 때만 노출.
  titleName = null,
  // 카드 하단에 골드 한 줄 노출 여부.
  showGold = true,
  // 있으면 카드 하단에 6슬롯 인라인 표시 (display only — 장착/해제는 인벤토리에서).
  // equipped 는 슬롯→iid(개체 식별자), owned 는 그 iid 를 카탈로그 아이템·굴림으로 푸는 개체 목록.
  equipped,
  owned,
}: {
  character: V2CharacterCardData;
  guild?: { name: string } | null;
  levelCap?: number | null;
  titleName?: string | null;
  showGold?: boolean;
  equipped?: Partial<Record<V2EquipSlot, string>>;
  owned?: V2EquipInstance[];
}) {
  // v2 마법 풀 — 현재 mp 사용. PR-potion-auto-restore: 단판 풀충전 모델 폐기 후 mp 가
  // 사냥 사이 보존. me/state 가 mp 동봉 — undefined fallback 은 maxMp (옛 캐릭).
  const maxMp = character.maxMp ?? 0;
  const mp = Math.min(maxMp, Math.max(0, character.mp ?? maxMp));
  // 직업명 — class 없거나 미선택이면 "무직".
  const jobName = V2_CLASS_DEFS[parseV2Class(character.class)].name;
  const cappedLevel =
    typeof levelCap === "number" && Number.isFinite(levelCap)
      ? Math.max(1, Math.floor(levelCap))
      : null;
  const isAtCap = cappedLevel != null && character.level >= cappedLevel;

  // 장착 슬롯의 iid → 개체 해석용 맵. equipped 가 슬롯→iid 라 owned 로 카탈로그/굴림을 푼다.
  const byIid = useMemo(
    () => new Map((owned ?? []).map((i) => [i.iid, i] as const)),
    [owned],
  );
  // 착용 중인 장비 id 집합 — 카드 세트 발동/착용 하이라이트용(슬롯→iid → id).
  const equippedItemIds = useMemo(() => {
    const ids = new Set<V2EquipmentId>();
    for (const iid of Object.values(equipped ?? {})) {
      const inst = byIid.get(iid);
      if (inst) ids.add(inst.id);
    }
    return ids;
  }, [equipped, byIid]);

  // 장착 슬롯 클릭 시 띄울 아이템 + 개체 굴림 + 그 슬롯의 화면 좌표(팝오버 앵커) — null 이면 닫힘.
  const [selected, setSelected] = useState<{
    item: V2Equipment;
    roll?: V2EquipRoll;
    anchor: ItemCardAnchor;
  } | null>(null);

  return (
    <Card padding="md">
      <div className="flex items-stretch gap-4">
        <CharacterPortrait gender={(character.gender ?? "male1") as Gender} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-2">
            {titleName && (
              <span className="rounded bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                {titleName}
              </span>
            )}
            <span className="text-base font-semibold">{character.name}</span>
            <span className="text-sm text-zinc-400 dark:text-zinc-500">
              {cappedLevel ? `Lv ${character.level} / ${cappedLevel}` : `Lv.${character.level}`}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              · {jobName}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              · {guild ? guild.name : "무소속"}
            </span>
          </div>
          {isAtCap && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              현재 차수 레벨 한계입니다. 성장의 신전에서 전직/환생을 진행하세요.
            </p>
          )}
          <div className="space-y-1.5">
            <StatBar
              label="HP"
              value={character.hp}
              max={character.maxHp}
              color="bg-red-500"
            />
            <StatBar label="MP" value={mp} max={maxMp} color="bg-blue-500" />
            {character.expToNext != null && (
              <StatBar
                label="EXP"
                value={character.exp}
                max={character.expToNext}
                color="bg-amber-400"
              />
            )}
          </div>
        </div>
      </div>
      {showGold && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">골드</span>
          <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
            {character.gold.toLocaleString()}
          </span>
        </div>
      )}
      {equipped && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          {EQUIP_SLOTS.map(({ slot, label, Icon, color }) => {
            const iid = equipped?.[slot];
            const inst = iid ? byIid.get(iid) : undefined;
            const item = inst ? V2_EQUIPMENT[inst.id] : null;
            const slotClass =
              "flex flex-col items-center gap-1 rounded-md bg-zinc-50 px-2 py-2 text-center dark:bg-zinc-900";
            const inner = (
              <>
                <Icon size={18} weight="duotone" className={color} />
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {label}
                </div>
                <div
                  className={`truncate text-xs font-medium ${
                    item
                      ? powerNameClass(item, inst?.roll)
                      : "text-zinc-400 dark:text-zinc-600"
                  }`}
                >
                  {item?.name ?? "—"}
                </div>
              </>
            );
            // 아이템이 있으면 클릭 가능한 버튼 → 옵션 카드 팝업. 빈 슬롯은 정적 표시.
            return item ? (
              <button
                key={slot}
                type="button"
                onClick={(e) =>
                  setSelected({
                    item,
                    roll: inst?.roll,
                    anchor: anchorOf(e.currentTarget),
                  })
                }
                className={`${slotClass} transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800`}
              >
                {inner}
              </button>
            ) : (
              <div key={slot} className={slotClass}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
      {selected && (
        <V2ItemCard
          item={selected.item}
          roll={selected.roll}
          anchor={selected.anchor}
          onClose={() => setSelected(null)}
          equippedIds={equippedItemIds}
        />
      )}
    </Card>
  );
}
