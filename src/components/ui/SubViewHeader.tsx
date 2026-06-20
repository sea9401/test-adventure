import type { ReactNode } from "react";
import { BackButton } from "./BackButton";

// 모든 v2 화면 공용 헤더 — 박스(패널) 없이 배경 위에. 백버튼 왼쪽 고정 · 제목 정중앙 ·
//   액션(골드 등) 오른쪽. 🔑 화면마다 따로 제목 헤더를 짜지 말고 이 컴포넌트를 쓴다(룩 단일화).
//   액션이 없으면 백버튼 폭만큼 스페이서를 둬 제목이 화면 정중앙에 오게 한다.
export function SubViewHeader({
  title,
  onBack,
  right,
}: {
  // 보통 문자열 제목. 아이콘+제목이면 ReactNode(예: <><Hammer/> 대장간</>).
  title: ReactNode;
  onBack: () => void;
  // 헤더 오른쪽 액션 슬롯(예: 보유 골드, "전체 수락" 버튼). 없으면 스페이서(제목 정중앙용).
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="shrink-0">
        <BackButton onClick={onBack} />
      </div>
      <h1 className="flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap text-center text-lg font-bold text-zinc-900 dark:text-zinc-100">
        {title}
      </h1>
      <div className="flex shrink-0 justify-end">
        {right ?? <span aria-hidden className="inline-block w-[4.25rem]" />}
      </div>
    </div>
  );
}
