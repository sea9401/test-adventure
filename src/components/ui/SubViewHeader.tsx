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
  // 없으면 백버튼 숨김(스페이서 대체) — dev 하니스 등 뒤로갈 곳 없는 경우. 제목은 그대로 정중앙.
  onBack?: () => void;
  // 헤더 오른쪽 액션 슬롯(예: 보유 골드, "전체 수락" 버튼). 없으면 스페이서(제목 정중앙용).
  right?: ReactNode;
}) {
  // 제목은 absolute 로 컨테이너 정중앙에 띄우고, 백버튼(왼쪽)·액션(오른쪽)은 그 위에 흐름배치.
  //   → 양옆 폭이 달라도 제목이 화면 진짜 가운데. 짧은 제목은 px 여백으로 겹침 방지, 길면 잘림.
  return (
    <div className="relative flex min-h-[2.25rem] items-center py-1">
      {onBack && (
        <div className="relative z-10 shrink-0">
          <BackButton onClick={onBack} />
        </div>
      )}
      <h1 className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap px-16 text-center text-lg font-bold text-zinc-900 dark:text-zinc-100">
        {title}
      </h1>
      {right && (
        <div className="relative z-10 ml-auto shrink-0">{right}</div>
      )}
    </div>
  );
}
