"use client";

import { BookOpen, CheckCircle } from "@phosphor-icons/react";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { useEquipmentCodexContext } from "./GameStateProvider";

// 장비가 보이는 화면에서 동일한 문구와 색으로 모험의 서 등록 여부를 표시한다.
// 전역 상태를 아직 읽지 못한 순간에는 오판을 피하려고 배지를 숨긴다.
export function EquipmentCodexBadge({
  itemId,
  registered,
  className = "",
}: {
  itemId: V2EquipmentId;
  /** 테스트나 독립 렌더링에서 전역 상태 대신 명시할 수 있다. */
  registered?: boolean;
  className?: string;
}) {
  const codex = useEquipmentCodexContext();
  const resolved =
    registered ??
    (codex?.loaded ? codex.registeredIds.has(itemId) : undefined);
  if (resolved == null) return null;

  const Icon = resolved ? CheckCircle : BookOpen;
  const label = resolved ? "도감 등록" : "도감 미등록";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-px text-[10px] font-semibold ${
        resolved
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      } ${className}`}
      title={`모험의 서 장비 도감에 ${resolved ? "등록됨" : "등록되지 않음"}`}
    >
      <Icon size={11} weight={resolved ? "fill" : "duotone"} aria-hidden="true" />
      {label}
    </span>
  );
}
