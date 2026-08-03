"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CaretRight,
  CookingPot,
  HandFist,
  Shield,
  Sneaker,
  Sword,
  Ticket,
  User as UserIcon,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { NecklaceIcon, RingIcon } from "./EquipmentSlotIcons";
import { Card } from "@/components/ui/Card";
import { StatBar } from "@/components/ui/StatBar";
import {
  avatarImageSrc,
  type Gender,
  type ProfileImageMotion,
} from "@/adventure/profile/avatars";
import {
  V2_EQUIPMENT,
  type V2Equipment,
  type V2EquipInstance,
  type V2EquipmentId,
  type V2EquipRoll,
  type V2EquipSlot,
  type V2CraftedBy,
  type V2CraftQualityState,
} from "@/adventure/data/v2/v2Equipment";
import { V2_CLASS_DEFS, parseV2Class } from "@/adventure/data/v2/classes";
import {
  V2ItemCard,
  anchorOf,
  powerNameClass,
  type ItemCardAnchor,
} from "./V2ItemCard";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import { ADVENTURE_SUPPORT_PASS } from "@/adventure/data/v2/adventureSupport";
import { MAX_STAMINA } from "@/adventure/v2/stamina";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { ProfileDecorationMotion } from "@/components/ui/ProfileDecorationMotion";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  formatAdventureSupportExpiry,
  formatAdventureSupportRemaining,
} from "./adventureSupportDisplay";
import {
  getProfileBorderVariant,
  type MuseunCosmeticAppearance,
} from "@/adventure/data/v2/museunCosmetics";
import {
  ArenaChampionshipBadge,
  chatNameClass,
} from "@/components/chat/ChatCosmetics";
import {
  cookingQualityName,
  type ActiveCookingBuff,
} from "@/adventure/v2/cooking";
import type {
  ProfileShowcaseSelection,
  ProfileShowcaseSlots,
} from "@/adventure/profile/profileShowcase";
import { ProfileBadgeRack } from "./ProfileBadgeRack";

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
  /** 직업 id (raw V2Class). 없으면 "모험가"로 표시. */
  class?: string;
  /**
   * 서버가 산출한 직업 표시명 — 직업 시스템 on 이면 직업 카탈로그 이름(견습 병사·방패병 등),
   * off 면 옛 직군명. 있으면 이걸 우선 표기(class 직접 환산보다 정확 — 상위 직업 반영). 미동봉
   * (옛 응답·dev mock)이면 class 직군명 폴백.
   */
  classDisplayName?: string | null;
};

const EQUIP_SLOTS: { slot: V2EquipSlot; label: string; Icon: Icon; color: string }[] = [
  { slot: "weapon", label: "무기", Icon: Sword, color: "text-rose-500" },
  { slot: "armor", label: "갑옷", Icon: Shield, color: "text-sky-500" },
  { slot: "gloves", label: "장갑", Icon: HandFist, color: "text-amber-500" },
  { slot: "boots", label: "신발", Icon: Sneaker, color: "text-emerald-500" },
  { slot: "ring", label: "반지", Icon: RingIcon, color: "text-violet-500" },
  {
    slot: "necklace",
    label: "목걸이",
    Icon: NecklaceIcon,
    color: "text-pink-500",
  },
];

function CharacterPortrait({
  gender,
  motion,
}: {
  gender: Gender;
  motion: ProfileImageMotion;
}) {
  const [errored, setErrored] = useState(false);
  const staticSrc = avatarImageSrc(gender, "static");
  const src = avatarImageSrc(gender, motion);
  return (
    <div
      aria-label="캐릭터 이미지"
      className="flex aspect-square w-28 shrink-0 items-center justify-center overflow-hidden rounded-md text-zinc-400 dark:text-zinc-600"
    >
      {errored ? (
        <UserIcon size={56} weight="duotone" />
      ) : (
        <picture className="h-full w-full">
          {motion === "animated" ? (
            <source
              media="(prefers-reduced-motion: reduce)"
              srcSet={staticSrc}
            />
          ) : null}
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setErrored(true)}
            className="h-full w-full object-contain"
          />
        </picture>
      )}
    </div>
  );
}

export function V2CharacterCard({
  character,
  guild,
  levelCap = null,
  rejobRequiredLevel = null,
  // 칭호 — v2 시스템 없음. 있을 때만 노출.
  titleName = null,
  // 카드 하단에 골드 한 줄 노출 여부.
  showGold = true,
  // 메인 간략 정보에서 현재 장착 스킬과 일치하는 로드아웃 프리셋 이름.
  activePresetName = null,
  adventureSupport,
  profileBorder = null,
  chatNameEffect = null,
  championshipBadge = null,
  activeFoodBuff = null,
  profileShowcase = null,
  profileShowcaseSlots,
  profileBadgeStandOwned = false,
  profileBadgeStandVisible = true,
  showcaseEditable = false,
  profileImageMotion = "static",
  // 있으면 카드 하단에 6슬롯 인라인 표시 (display only — 장착/해제는 인벤토리에서).
  // equipped 는 슬롯→iid(개체 식별자), owned 는 그 iid 를 카탈로그 아이템·굴림으로 푸는 개체 목록.
  equipped,
  owned,
}: {
  character: V2CharacterCardData;
  guild?: { name: string } | null;
  /** 전투 레벨 상한. 생산직의 전직 요구 레벨과는 별개다. */
  levelCap?: number | null;
  /** 현재 직업의 전직 요구 레벨. 1이면 사용자에게는 "레벨 제한 없음"으로 안내한다. */
  rejobRequiredLevel?: number | null;
  titleName?: string | null;
  showGold?: boolean;
  activePresetName?: string | null;
  adventureSupport?: {
    active: boolean;
    activeUntil: number | null;
    regenBonusPct: number;
  };
  profileBorder?: MuseunCosmeticAppearance["profileBorder"];
  chatNameEffect?: MuseunCosmeticAppearance["chatNameEffect"];
  championshipBadge?: MuseunCosmeticAppearance["championshipBadge"];
  activeFoodBuff?: ActiveCookingBuff | null;
  profileShowcase?: ProfileShowcaseSelection | null;
  profileShowcaseSlots?: ProfileShowcaseSlots;
  profileBadgeStandOwned?: boolean;
  profileBadgeStandVisible?: boolean;
  showcaseEditable?: boolean;
  profileImageMotion?: ProfileImageMotion;
  equipped?: Partial<Record<V2EquipSlot, string>>;
  owned?: V2EquipInstance[];
}) {
  // v2 마법 풀 — 현재 mp 사용. PR-potion-auto-restore: 단판 풀충전 모델 폐기 후 mp 가
  // 사냥 사이 보존. me/state 가 mp 동봉 — undefined fallback 은 maxMp (옛 캐릭).
  const maxMp = character.maxMp ?? 0;
  const mp = Math.min(maxMp, Math.max(0, character.mp ?? maxMp));
  // 직업명 — 서버 산출 표시명(직업 시스템이면 견습 병사·방패병 등) 우선, 없으면 class 직군명 폴백.
  const jobName =
    character.classDisplayName ?? V2_CLASS_DEFS[parseV2Class(character.class)].name;
  const cappedLevel =
    typeof levelCap === "number" && Number.isFinite(levelCap)
      ? Math.max(1, Math.floor(levelCap))
      : null;
  const isAtCap = cappedLevel != null && character.level >= cappedLevel;
  const hasNoRejobLevelRequirement =
    typeof rejobRequiredLevel === "number" && rejobRequiredLevel <= 1;
  const supportActiveUntil =
    adventureSupport?.active &&
    typeof adventureSupport.activeUntil === "number" &&
    Number.isFinite(adventureSupport.activeUntil)
      ? adventureSupport.activeUntil
      : null;
  const [supportDetailsOpen, setSupportDetailsOpen] = useState(false);
  const profileDecoration = profileBorder
    ? getProfileBorderVariant(profileBorder)
    : null;
  const hasProfileTheme =
    profileDecoration != null && profileDecoration.interior !== "none";
  const badgeSlots: ProfileShowcaseSlots = profileShowcaseSlots ?? [
    profileShowcase,
    null,
    null,
  ];
  const showBadgeRack =
    profileBadgeStandOwned &&
    (showcaseEditable ||
      (profileBadgeStandVisible && badgeSlots.some((slot) => slot !== null)));

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
    enhance?: V2EnhanceState;
    craftQuality?: V2CraftQualityState;
    craftedBy?: V2CraftedBy;
    anchor: ItemCardAnchor;
  } | null>(null);

  return (
    <>
      <Card
        padding="md"
        className={`ui-character-card ${
          profileBorder
            ? `ui-profile-frame-cosmetic ui-profile-frame-${profileBorder} ${profileDecoration?.motion === "static" ? "ui-profile-frame-static" : ""}`
            : ""
        }`}
      >
        <div
          className={
            hasProfileTheme
              ? "ui-profile-theme-header p-3"
              : `${SURFACE_INSET} p-3`
          }
        >
          <ProfileDecorationMotion profileBorder={profileBorder} />
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(15rem,1fr)] sm:gap-4">
            <CharacterPortrait
              gender={(character.gender ?? "male1") as Gender}
              motion={profileImageMotion}
            />
            <div className="min-w-0">
              {titleName && (
                <span className="mb-1 inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  {titleName}
                </span>
              )}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="inline-flex min-w-0 items-center text-lg font-semibold">
                  <ArenaChampionshipBadge badge={championshipBadge} />
                  <span
                    className={chatNameClass(
                      chatNameEffect,
                      hasProfileTheme
                        ? "truncate text-white"
                        : "truncate text-zinc-900 dark:text-zinc-100",
                    )}
                  >
                    {character.name}
                  </span>
                </span>
                <span
                  className={
                    hasProfileTheme
                      ? "ui-profile-theme-copy text-sm text-zinc-100"
                      : "text-sm text-zinc-700 dark:text-zinc-200"
                  }
                >
                  {cappedLevel
                    ? `전투 Lv ${character.level} / ${cappedLevel}`
                    : `전투 Lv.${character.level}`}
                </span>
              </div>
              <div
                className={
                  hasProfileTheme
                    ? "ui-profile-theme-copy mt-1 flex flex-wrap gap-x-1 text-xs text-zinc-100"
                    : "mt-1 flex flex-wrap gap-x-1 text-xs text-zinc-600 dark:text-zinc-300"
                }
              >
                <span>{jobName}</span>
                {hasNoRejobLevelRequirement ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="font-medium text-sky-700 dark:text-sky-300">
                      전직 레벨 제한 없음
                    </span>
                  </>
                ) : null}
                <span aria-hidden>·</span>
                <span>{guild ? guild.name : "무소속"}</span>
              </div>
            </div>
            {showBadgeRack && (
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <ProfileBadgeRack
                  initialSlots={badgeSlots}
                  standOwned={profileBadgeStandOwned}
                  initialVisible={profileBadgeStandVisible}
                  owned={owned ?? []}
                  editable={showcaseEditable}
                />
              </div>
            )}
          </div>
        </div>

        <div className={`${SURFACE_INSET} mt-3 p-3`}>
          <div className="space-y-2">
            {supportActiveUntil != null && (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setSupportDetailsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300 dark:hover:bg-violet-900"
              >
                <Ticket size={15} weight="duotone" aria-hidden="true" />
                월간 모험 지원권 적용 중
                <CaretRight size={13} weight="bold" aria-hidden="true" />
              </button>
            )}
            {activePresetName && (
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <span className="shrink-0 rounded bg-teal-50 px-1.5 py-0.5 font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                  활성 프리셋
                </span>
                <span className="min-w-0 truncate font-medium text-zinc-700 dark:text-zinc-300">
                  {activePresetName}
                </span>
              </div>
            )}
            {activeFoodBuff ? (
              <ActiveFoodBuffBadge buff={activeFoodBuff} />
            ) : null}
            {isAtCap && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {hasNoRejobLevelRequirement
                  ? "전투 레벨이 한계에 도달했어요. 생산직 전직은 생활 숙련 조건만 충족하면 바로 할 수 있어요."
                  : "전투 레벨이 한계에 도달했어요. 성장의 신전에서 환생하고 사냥으로 직업 숙련도를 쌓으면 새 직업이 열려요."}
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
          {showGold && (
            <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-2 text-xs dark:border-zinc-700">
              <span className="text-zinc-700 dark:text-zinc-200">골드</span>
              <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
                {character.gold.toLocaleString()}
              </span>
            </div>
          )}
        </div>
        {equipped && (
          <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-zinc-200 pt-3 sm:grid-cols-6 dark:border-zinc-800">
          {EQUIP_SLOTS.map(({ slot, label, Icon, color }) => {
            const iid = equipped?.[slot];
            const inst = iid ? byIid.get(iid) : undefined;
            const item = inst ? V2_EQUIPMENT[inst.id] : null;
            const slotClass = `${SURFACE_INSET} ui-character-slot flex min-w-0 flex-col items-center gap-0.5 px-1.5 py-1.5 text-center`;
            const inner = (
              <>
                <Icon size={14} weight="duotone" className={color} />
                <span
                  className={`w-full truncate text-[11px] font-medium leading-tight ${
                    item
                      ? powerNameClass(
                          item,
                          inst?.roll,
                          inst?.enhance,
                          inst?.craftQuality,
                        )
                      : "text-zinc-400 dark:text-zinc-600"
                  }`}
                >
                  {item?.name ?? label}
                </span>
              </>
            );
            // 아이템이 있으면 클릭 가능한 버튼 → 옵션 카드 팝업. 빈 슬롯은 정적 표시.
            return item ? (
              <button
                key={slot}
                type="button"
                aria-label={`${label}: ${item.name}`}
                title={`${label}: ${item.name}`}
                onClick={(e) =>
                  setSelected({
                    item,
                    roll: inst?.roll,
                    enhance: inst?.enhance,
                    craftQuality: inst?.craftQuality,
                    craftedBy: inst?.craftedBy,
                    anchor: anchorOf(e.currentTarget),
                  })
                }
                className={`${slotClass} transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800`}
              >
                {inner}
              </button>
            ) : (
              <div key={slot} className={slotClass} title={`${label}: 비어 있음`}>
                {inner}
              </div>
            );
          })}
          </div>
        )}
      </Card>
      {selected && (
        <V2ItemCard
          item={selected.item}
          roll={selected.roll}
          enhance={selected.enhance}
          craftQuality={selected.craftQuality}
          craftedBy={selected.craftedBy}
          anchor={selected.anchor}
          onClose={() => setSelected(null)}
          equippedIds={equippedItemIds}
        />
      )}
      {supportDetailsOpen && supportActiveUntil != null && (
        <AdventureSupportModal
          activeUntil={supportActiveUntil}
          onClose={() => setSupportDetailsOpen(false)}
        />
      )}
    </>
  );
}

function ActiveFoodBuffBadge({ buff }: { buff: ActiveCookingBuff }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = buff.expiresAt - now;
  if (remaining <= 0) return null;
  const stats = Object.entries(buff.statPct)
    .map(([key, value]) => `${key.toUpperCase()} +${value}%`)
    .join(" · ");
  return (
    <div
      title={`${buff.recipeName} · ${cookingQualityName(buff.quality)} · ${stats}`}
      className="flex min-w-0 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <CookingPot size={15} weight="duotone" className="shrink-0" aria-hidden />
      <span className="min-w-0 truncate text-[11px]">
        <span className="font-semibold">{buff.recipeName}</span> · {stats}
      </span>
      <span className="shrink-0 text-[11px] text-amber-700 dark:text-amber-300">
        {formatCookingBuffRemaining(remaining)}
      </span>
    </div>
  );
}

function formatCookingBuffRemaining(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${remainder}분`;
  return remainder > 0 ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

function AdventureSupportModal({
  activeUntil,
  onClose,
}: {
  activeUntil: number;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEscapeKey(onClose);
  useModalA11y(contentRef);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const benefits = [
    `에너지 회복량 ${ADVENTURE_SUPPORT_PASS.staminaRegenBonusPct}% 증가`,
    `최대 에너지 ${ADVENTURE_SUPPORT_PASS.staminaMaxBonus.toLocaleString()} 증가 (기본 ${MAX_STAMINA.toLocaleString()} → ${(MAX_STAMINA + ADVENTURE_SUPPORT_PASS.staminaMaxBonus).toLocaleString()})`,
    `거래소 등록 ${ADVENTURE_SUPPORT_PASS.marketplaceSlotBonus}개 추가`,
    `거래소 수수료 ${ADVENTURE_SUPPORT_PASS.marketplaceTaxRate * 100}%로 감소`,
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="adventure-support-title"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        ref={contentRef}
        onClick={(event) => event.stopPropagation()}
        className={`${SURFACE_CARD} w-full max-w-sm p-5 shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
              <Ticket size={24} weight="duotone" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-violet-600 dark:text-violet-300">
                혜택 적용 중
              </p>
              <h2
                id="adventure-support-title"
                className="truncate text-lg font-bold text-zinc-900 dark:text-zinc-100"
              >
                월간 모험 지원권
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <ul className={`${SURFACE_INSET} mt-4 space-y-2.5 p-3 text-sm`}>
          {benefits.map((benefit) => (
            <li
              key={benefit}
              className="flex items-start gap-2 text-zinc-700 dark:text-zinc-200"
            >
              <span
                aria-hidden="true"
                className="font-bold text-violet-500 dark:text-violet-400"
              >
                •
              </span>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <div className={`${SURFACE_INSET} mt-3 px-3 py-3 text-center`}>
          <p className="text-base font-bold tabular-nums text-violet-700 dark:text-violet-300">
            {formatAdventureSupportRemaining(activeUntil, now)}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {formatAdventureSupportExpiry(activeUntil)}까지
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          확인
        </button>
      </div>
    </div>,
    document.body,
  );
}
