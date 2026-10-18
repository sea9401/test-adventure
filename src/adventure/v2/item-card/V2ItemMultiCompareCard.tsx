"use client";

import { X } from "@phosphor-icons/react";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { Button } from "@/components/ui/Button";
import { ItemTypeChip } from "@/components/ui/ItemTypeChip";
import {
  signatureLabel,
  v2EquipMultiCompareRows,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import { CompareSetLine, type V2CompareSide } from "./V2ItemCompareCard";
import {
  CraftQualityBadge,
  EnhanceLevelBadge,
  EquipmentTierBadge,
  QualityPctText,
  powerNameClass,
} from "./shared";
import { useEquipmentPowerPreview } from "./useEquipmentPowerPreview";

// ── 여러 장비 비교 표(건의 #792) ─────────────────────────────────────────────
// 같은 부위 장비를 2개 이상 골라 한 표로 비교한다. 행=스탯, 열=장비.
//   장착 장비가 있으면 첫 열(기준)로 두고 후보 칸에 기준 대비 증감을 붙인다.
//   장착 장비가 없으면 줄마다 가장 좋은 값을 강조한다.
//   휴대폰에서는 열 너비를 고정하고 가로로 넘기며, 스탯 이름 열은 고정한다.

export type V2MultiCompareCandidate = V2CompareSide & {
  iid: string;
  equip?: { busy: boolean; disabledReason?: string; onEquip: () => void };
};

function deltaClass(better: number): string {
  if (better > 0) return "text-emerald-600 dark:text-emerald-400";
  if (better < 0) return "text-rose-600 dark:text-rose-400";
  return "text-zinc-400 dark:text-zinc-500";
}

const LABEL_CELL =
  "sticky left-0 z-10 w-20 min-w-20 bg-white py-1.5 pr-2 text-left align-top text-xs font-normal text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400";
const VALUE_CELL =
  "min-w-36 border-l border-zinc-100 px-2 py-1.5 text-right align-top text-xs tabular-nums dark:border-zinc-700";

function ColumnHeader({ tag, side }: { tag?: string; side: V2CompareSide }) {
  const pct = rollQualityPct(side.item, side.roll);
  return (
    <div className="space-y-1 text-left">
      {tag ? (
        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{tag}</div>
      ) : null}
      <h3
        className={`truncate text-sm font-semibold ${powerNameClass(side.item, side.roll, side.enhance, side.craftQuality)}`}
        title={side.item.name}
      >
        {side.item.name}
      </h3>
      <div className="flex flex-wrap items-center gap-1">
        <EquipmentTierBadge tier={side.item.tier} compact />
        <ItemTypeChip item={side.item} />
        <EnhanceLevelBadge enhance={side.enhance} />
        <CraftQualityBadge craftQuality={side.craftQuality} />
      </div>
      {pct != null ? (
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          품질 <QualityPctText pct={pct} className="font-semibold tabular-nums" />
        </div>
      ) : null}
    </div>
  );
}

// 후보 열마다 서버에 장착 시 스탯 합계를 따로 묻는다.
function PowerPreviewCell({ side }: { side: V2MultiCompareCandidate }) {
  const preview = useEquipmentPowerPreview(side);
  if (preview.status === "loading") {
    return <span className="text-zinc-400 dark:text-zinc-500">계산 중…</span>;
  }
  if (preview.status === "error") {
    return <span className="text-zinc-400 dark:text-zinc-500">계산 불가</span>;
  }
  const { candidatePower, delta } = preview;
  return (
    <span className="font-semibold text-zinc-800 dark:text-zinc-100">
      {candidatePower.toLocaleString("ko-KR")}
      <span className={`ml-1 ${deltaClass(delta)}`}>
        ({delta > 0 ? "▲" : delta < 0 ? "▼" : "±"}
        {Math.abs(delta).toLocaleString("ko-KR")})
      </span>
    </span>
  );
}

export function V2ItemMultiCompareCard({
  equipped,
  candidates,
  onClose,
  equippedIds,
}: {
  // 같은 부위 장착 장비. 있으면 기준 열이 된다.
  equipped?: V2CompareSide;
  candidates: V2MultiCompareCandidate[];
  onClose: () => void;
  // 착용 중 장비 id 집합. 세트 발동 판정용.
  equippedIds?: ReadonlySet<V2EquipmentId>;
}) {
  useEscapeKey(onClose);
  const sides: V2CompareSide[] = equipped ? [equipped, ...candidates] : candidates;
  const baseIndex = equipped ? 0 : null;
  const rows = v2EquipMultiCompareRows(sides, baseIndex);
  const showSet = sides.some((side) => side.item.setId);
  const showSignature = sides.some((side) => side.item.signature);
  const anyBusy = candidates.some((c) => c.equip?.busy);
  // 기준 열 칸은 candidates 와 인덱스가 1 어긋난다.
  const candidateAt = (index: number) =>
    equipped ? (index === 0 ? null : candidates[index - 1]) : candidates[index];

  return (
    <>
      {/* 딤 배경과 비교창은 공지가 포함된 GameChrome 헤더(z-60)보다 위에 둔다. */}
      <div className="fixed inset-0 z-[90] bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={`장비 ${sides.length}개 비교`}
        className="fixed left-1/2 top-1/2 z-[100] max-h-[85vh] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-2xl sm:max-w-2xl lg:max-w-4xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            아이템 비교 ({sides.length}개)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1.5 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th scope="col" className={LABEL_CELL}>
                  <span className="sr-only">항목</span>
                </th>
                {sides.map((side, index) => (
                  <th
                    key={candidateAt(index)?.iid ?? "equipped"}
                    scope="col"
                    className={`${VALUE_CELL} max-w-48 pb-2 font-normal`}
                  >
                    <ColumnHeader
                      tag={index === baseIndex ? "장착 중" : undefined}
                      side={side}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th scope="row" className={LABEL_CELL}>
                  장착 시 스탯 합계
                </th>
                {sides.map((side, index) => {
                  const candidate = candidateAt(index);
                  return (
                    <td key={candidate?.iid ?? "equipped"} className={VALUE_CELL}>
                      {candidate ? (
                        <PowerPreviewCell side={candidate} />
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">기준</span>
                      )}
                    </td>
                  );
                })}
              </tr>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className={LABEL_CELL}>
                    {row.label}
                  </th>
                  {row.cells.map((cell, index) => {
                    const best = baseIndex == null && cell.best;
                    return (
                      <td
                        key={candidateAt(index)?.iid ?? "equipped"}
                        className={VALUE_CELL}
                        data-best={best ? "true" : undefined}
                      >
                        <span
                          className={
                            best
                              ? "font-semibold text-emerald-700 dark:text-emerald-300"
                              : "text-zinc-700 dark:text-zinc-200"
                          }
                        >
                          {cell.value}
                        </span>
                        {cell.deltaText ? (
                          <span className={`ml-1 ${deltaClass(cell.better)}`}>
                            {cell.deltaText.startsWith("-") ? "▼" : "▲"}
                            {cell.deltaText}
                          </span>
                        ) : null}
                        {cell.detail ? (
                          <span className="mt-0.5 block text-zinc-500 dark:text-zinc-400">
                            {cell.detail}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {showSet ? (
                <tr className="border-t border-zinc-100 dark:border-zinc-800">
                  <th scope="row" className={LABEL_CELL}>
                    세트
                  </th>
                  {sides.map((side, index) => (
                    <td key={candidateAt(index)?.iid ?? "equipped"} className={VALUE_CELL}>
                      <CompareSetLine item={side.item} equippedIds={equippedIds} />
                    </td>
                  ))}
                </tr>
              ) : null}
              {showSignature ? (
                <tr>
                  <th scope="row" className={LABEL_CELL}>
                    고유 효과
                  </th>
                  {sides.map((side, index) => (
                    <td
                      key={candidateAt(index)?.iid ?? "equipped"}
                      className={`${VALUE_CELL} text-left font-medium text-amber-600 dark:text-amber-400`}
                    >
                      {side.item.signature ? `★ ${signatureLabel(side.item.signature)}` : "—"}
                    </td>
                  ))}
                </tr>
              ) : null}
              {candidates.some((c) => c.equip) ? (
                <tr className="border-t border-zinc-200 dark:border-zinc-700">
                  <th scope="row" className={LABEL_CELL}>
                    <span className="sr-only">장착</span>
                  </th>
                  {sides.map((side, index) => {
                    const candidate = candidateAt(index);
                    const equip = candidate?.equip;
                    return (
                      <td
                        key={candidate?.iid ?? "equipped"}
                        className={`${VALUE_CELL} pt-2 text-left`}
                      >
                        {equip ? (
                          <div className="space-y-1">
                            {equip.disabledReason ? (
                              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                착용 조건: {equip.disabledReason}
                              </p>
                            ) : null}
                            <Button
                              onClick={equip.onEquip}
                              disabled={anyBusy || Boolean(equip.disabledReason)}
                              variant="primary"
                              size="sm"
                              fullWidth
                              aria-label={`${side.item.name} 장착`}
                            >
                              {equip.busy
                                ? "처리 중…"
                                : equip.disabledReason
                                  ? "착용 조건 미달"
                                  : "장착"}
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
