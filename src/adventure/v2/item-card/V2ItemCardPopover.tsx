"use client";

import { useEffect, type CSSProperties } from "react";
import { Lock, LockOpen, X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { Button } from "@/components/ui/Button";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  V2_EQUIP_SETS,
  V2_EQUIP_TAG_SETS,
  V2_EQUIPMENT,
  V2_SLOT_LABEL,
  signatureLabel,
  v2EquipPowerLabel,
  v2EquipStatRows,
  type V2CraftQualityState,
  type V2CraftedBy,
  type V2Equipment,
  type V2EquipmentId,
  type V2EquipRoll,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import type { V2EnhanceState } from "@/adventure/data/v2/v2Enhance";
import {
  CraftOnlyBadge,
  CraftQualityBadge,
  EquipmentTierBadge,
  EnhanceLevelBadge,
  GAP,
  MARGIN,
  MasterworkBadge,
  QualityPctText,
  StatRow,
  WIDTH,
  formatSetBonus,
  powerNameClass,
  statRowWithRollRange,
  type ItemCardAnchor,
  type ItemCardCompareAction,
  type ItemCardEquipAction,
  type ItemCardLockAction,
} from "./shared";

export function V2ItemCard({
  item,
  anchor,
  onClose,
  roll,
  enhance,
  craftQuality,
  craftedBy,
  equip,
  compare,
  lock,
  equippedIds,
}: {
  item: V2Equipment;
  anchor: ItemCardAnchor;
  onClose: () => void;
  // 보유템의 개체 굴림(편차). 주면 굴림값 표시, 없으면 카탈로그(상점·제작 미리보기).
  roll?: V2EquipRoll;
  // 강화 상태 — 주면 제목 +N + 위력 강화 반영(v2EquipStatRows).
  enhance?: V2EnhanceState;
  // 제작 품질 — 별 표시 + 위력 보너스 반영.
  craftQuality?: V2CraftQualityState;
  // 제작자 표식 — 길드 대장간 제작품에만 표시.
  craftedBy?: V2CraftedBy;
  // 인벤토리에서만 주입 — 카드 하단에 장착/해제 버튼. 상점·제작·캐릭터 팝오버는 미주입(읽기전용).
  equip?: ItemCardEquipAction;
  // 인벤토리에서만 주입 — 같은 슬롯 장착 장비가 있을 때 사용자가 원할 때 비교 모달로 전환.
  compare?: ItemCardCompareAction;
  // 인벤토리에서만 주입 — 헤더의 즐겨찾기 잠금 토글.
  lock?: ItemCardLockAction;
  // 현재 착용 중인 장비 id 집합 — 세트 발동(전 부위 착용) 판정 + 부위별 착용 하이라이트.
  //   미지정이면 착용 정보 없음으로 간주(전부 미착용·세트 미발동 표시).
  equippedIds?: ReadonlySet<V2EquipmentId>;
}) {
  useEscapeKey(onClose);

  // 좌표는 클릭 시점 고정값이라, 스크롤·리사이즈로 앵커와 어긋나면 닫는다.
  // (window scroll 은 뷰포트 스크롤에만 발동 — 팝오버 내부 overflow 스크롤은 무관.)
  useEffect(() => {
    window.addEventListener("scroll", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // 기본 스탯(공격력/방어력 계열·무게)과 옵션(치명/MP 등)을 나눠 사이에 구분선을 긋는다.
  //   강화 수치는 이름 옆 "+N" 으로만 표기.
  const statRows = v2EquipStatRows(item, roll, enhance, craftQuality).map((row) =>
    statRowWithRollRange(item, row, roll, enhance, craftQuality),
  );
  const powerLabel = v2EquipPowerLabel(item);
  const baseRows = statRows.filter(
    (r) => r.label === powerLabel || r.label === "무게",
  );
  const optionRows = statRows.filter(
    (r) => r.label !== powerLabel && r.label !== "무게",
  );
  const pct = rollQualityPct(item, roll);
  const set = item.setId
    ? V2_EQUIP_SETS.find((s) => s.id === item.setId)
    : undefined;
  const tagSets = (item.setTags ?? [])
    .map((tag) => V2_EQUIP_TAG_SETS.find((s) => s.id === tag))
    .filter((s): s is (typeof V2_EQUIP_TAG_SETS)[number] => Boolean(s));
  const equippedTagCounts = new Map<string, number>();
  if (equippedIds) {
    for (const id of equippedIds) {
      for (const tag of V2_EQUIPMENT[id]?.setTags ?? []) {
        equippedTagCounts.set(tag, (equippedTagCounts.get(tag) ?? 0) + 1);
      }
    }
  }
  // 세트 발동 = 세트의 전 조각을 현재 착용 중(서버 aggregateV2Equipment 와 동일 기준).
  const equippedSetCount = set
    ? set.pieces.filter((p) => equippedIds?.has(p)).length
    : 0;
  const setActive = set != null && equippedSetCount === set.pieces.length;

  // 앵커 기준 위치 계산 — 좌측은 뷰포트 안으로 clamp, 화면 하단에 가까우면 위로 띄움.
  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  // 초협소 뷰포트(vw < WIDTH + 여백)에서도 화면 안에 들어오도록 폭을 줄인다.
  const width = Math.min(WIDTH, vw - MARGIN * 2);
  const left = Math.min(Math.max(MARGIN, anchor.left), vw - width - MARGIN);
  const placeAbove = anchor.bottom > vh * 0.6;
  const pos: CSSProperties = placeAbove
    ? { bottom: vh - anchor.top + GAP, maxHeight: anchor.top - GAP - MARGIN }
    : { top: anchor.bottom + GAP, maxHeight: vh - anchor.bottom - GAP - MARGIN };

  return (
    <>
      {/* 바깥 클릭 캐처 — 투명(딤 없음). */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={`${item.name} 정보`}
        style={{ position: "fixed", width, left, ...pos }}
        className="z-50 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              className={`truncate text-base font-semibold leading-tight ${powerNameClass(item, roll, enhance, craftQuality)}`}
            >
              {item.name}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <EquipmentTierBadge tier={item.tier} />
              <ItemTypeChip item={item} />
              <EnhanceLevelBadge enhance={enhance} />
              <CraftQualityBadge craftQuality={craftQuality} />
              {craftedBy?.masterwork ? <MasterworkBadge /> : null}
              {item.craftOnly ? <CraftOnlyBadge /> : null}
              {pct != null && (
                <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                  <span className="text-zinc-500 dark:text-zinc-400">품질</span>
                  <QualityPctText pct={pct} className="font-semibold" />
                </span>
              )}
            </div>
            {craftedBy ? (
              <div className="text-xs text-emerald-700 dark:text-emerald-300">
                제작자{" "}
                <PlayerNameLink
                  name={craftedBy.name}
                  className="font-medium"
                  fallback="모험가"
                />{" "}
                · 대장장이 Lv{" "}
                {craftedBy.level.toLocaleString()}
              </div>
            ) : null}
            {item.craftOnly ? (
              <div className="text-xs text-emerald-700 dark:text-emerald-300">
                획득: 길드 영지 → 대장간 → 레시피 제작
              </div>
            ) : null}
          </div>
          <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">
            {lock && (
              <button
                type="button"
                onClick={lock.onToggle}
                disabled={lock.busy}
                aria-label={lock.locked ? "잠금 해제" : "잠금"}
                aria-pressed={lock.locked}
                title={lock.locked ? "잠금됨 — 일괄 판매 보호" : "잠그기"}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
                  lock.locked
                    ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                    : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {lock.locked ? (
                  <Lock size={16} weight="fill" />
                ) : (
                  <LockOpen size={16} weight="bold" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        {statRows.length === 0 ? (
          <div className="mt-2">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              옵션 없음
            </span>
          </div>
        ) : (
          <>
            {baseRows.length > 0 && (
              <div className={`${SURFACE_INSET} mt-3 space-y-0.5 p-2`}>
                {baseRows.map((s) => (
                  <StatRow key={s.label} row={s} />
                ))}
              </div>
            )}
            {/* 옵션 — 기본 스탯과 구분선으로 분리(품질 아래 선과 동일). */}
            {optionRows.length > 0 && (
              <div
                className={`${SURFACE_INSET} mt-2 space-y-0.5 p-2`}
              >
                {optionRows.map((s) => (
                  <StatRow key={s.label} row={s} />
                ))}
              </div>
            )}
          </>
        )}

        {/* 단품 마퀴 시그니처(세트 아닌 고유 아이템의 발동형 효과) — 장착만 하면 발동. */}
        {item.signature && (
          <div className="mt-2 border-t border-zinc-200 pt-2 text-[11px] font-medium text-amber-600 dark:border-zinc-700 dark:text-amber-400">
            ★ {signatureLabel(item.signature)}
          </div>
        )}

        {set && (
          <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              {/* 세트명·보너스 — 발동(전 부위 착용) 시 amber, 미발동 시 회색으로 상태 인지. */}
              <span
                className={`font-medium ${
                  setActive
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {set.name} ({set.pieces.length}종)
              </span>
              <span
                className={`tabular-nums ${
                  setActive
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {formatSetBonus(set.bonus)}
              </span>
            </div>
            {/* 세트 발동형 시그니처 효과(전 부위 착용 시) — 스탯 보너스와 별개로 명시. */}
            {set.signature && (
              <p
                className={`mt-1 text-[11px] ${
                  setActive
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                ★ {signatureLabel(set.signature)}
              </p>
            )}
            {/* 세트 구성 — 착용 중인 부위는 밝게(흰색) 하이라이트로 몇 부위 모았는지 한눈에. */}
            <ul className="mt-1 space-y-px">
              {set.pieces.map((pid) => {
                const piece = V2_EQUIPMENT[pid];
                const isWorn = equippedIds?.has(pid) ?? false;
                return (
                  <li
                    key={pid}
                    className={`flex items-baseline gap-1 text-[11px] ${
                      isWorn
                        ? "font-medium text-zinc-800 dark:text-zinc-100"
                        : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    <span
                      className={`shrink-0 ${
                        isWorn
                          ? "text-emerald-500"
                          : "text-zinc-300 dark:text-zinc-600"
                      }`}
                    >
                      {isWorn ? "✓" : "·"}
                    </span>
                    <span className="truncate">{piece?.name ?? pid}</span>
                    {piece && (
                      <span className="ml-auto shrink-0 text-zinc-400 dark:text-zinc-500">
                        {V2_SLOT_LABEL[piece.slot]}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {/* 발동 상태 + 진행도(N/M 착용) 텍스트 보강. */}
            {setActive ? (
              <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                세트 발동 중 ({set.pieces.length}/{set.pieces.length} 착용)
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                {equippedSetCount}/{set.pieces.length} 착용 중 — 모두 착용하면 발동
              </p>
            )}
          </div>
        )}

        {tagSets.map((tagSet) => {
          const count = equippedTagCounts.get(tagSet.id) ?? 0;
          return (
            <div
              key={tagSet.id}
              className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700"
            >
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {tagSet.name} 세트
              </div>
              <div className="mt-1 space-y-px">
                {tagSet.thresholds.map((threshold) => {
                  const active = count >= threshold.count;
                  return (
                    <div
                      key={threshold.count}
                      className={`flex items-baseline justify-between gap-2 text-[11px] ${
                        active
                          ? "font-medium text-amber-600 dark:text-amber-400"
                          : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      <span>{threshold.count}세트</span>
                      <span className="tabular-nums">
                        {formatSetBonus(threshold.bonus)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {item.description && (
          <p className="mt-2 border-t border-zinc-200 pt-2 text-xs italic leading-relaxed text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            {item.description}
          </p>
        )}

        {(compare || equip) && (
          <div
            className={`mt-3 grid gap-2 ${
              compare && equip ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {compare && (
              <Button
                onClick={compare.onCompare}
                variant="secondary"
                size="md"
              >
                비교
              </Button>
            )}
            {equip && (
              <Button
                onClick={equip.isEquipped ? equip.onUnequip : equip.onEquip}
                disabled={equip.busy}
                variant={equip.isEquipped ? "secondary" : "success"}
                size="md"
              >
                {equip.busy
                  ? "처리 중…"
                  : equip.isEquipped
                    ? "해제"
                    : "장착하기"}
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
