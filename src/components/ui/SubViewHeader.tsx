import type { ReactNode } from "react";
import { BackButton } from "./BackButton";

export function SubViewHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  // 헤더 오른쪽에 정렬되는 액션 슬롯 (예: "전체 의뢰 수락" 버튼).
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <BackButton onClick={onBack} />
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
