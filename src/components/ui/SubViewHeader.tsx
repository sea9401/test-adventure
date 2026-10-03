"use client";

import { useId, useState, type ReactNode } from "react";
import { Question } from "@phosphor-icons/react";
import { BackButton } from "./BackButton";
import { SURFACE_INSET } from "./surfaces";

// 모든 v2 화면 공용 헤더 — 박스(패널) 없이 배경 위에. 백버튼 왼쪽 고정 · 제목 정중앙 ·
//   액션(골드 등) 오른쪽. 🔑 화면마다 따로 제목 헤더를 짜지 말고 이 컴포넌트를 쓴다(룩 단일화).
//   액션이 없으면 백버튼 폭만큼 스페이서를 둬 제목이 화면 정중앙에 오게 한다.
export function SubViewHeader({
  title,
  onBack,
  right,
  help,
}: {
  // 보통 문자열 제목. 아이콘+제목이면 ReactNode(예: <><Hammer/> 대장간</>).
  title: ReactNode;
  // 없으면 백버튼 숨김(스페이서 대체) — dev 하니스 등 뒤로갈 곳 없는 경우. 제목은 그대로 정중앙.
  onBack?: () => void;
  // 헤더 오른쪽 액션 슬롯(예: 보유 골드, "전체 수락" 버튼). 없으면 스페이서(제목 정중앙용).
  right?: ReactNode;
  // 화면 규칙·설명. 주면 "?" 버튼이 생기고 머리 아래 접힌 패널로 보여 준다.
  //   🔑 규칙 문단을 화면 첫머리에 늘어놓지 말고 여기로 옮긴다(화면 골격 규칙).
  help?: ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
  // 제목은 absolute 로 컨테이너 정중앙에 띄우고, 백버튼(왼쪽)·액션(오른쪽)은 그 위에 흐름배치.
  //   → 양옆 폭이 달라도 제목이 화면 진짜 가운데. 짧은 제목은 px 여백으로 겹침 방지, 길면 잘림.
  return (
    <>
    <div className="relative flex min-h-[2.25rem] items-center py-1">
      {onBack && (
        <div className="relative z-10 shrink-0">
          <BackButton onClick={onBack} />
        </div>
      )}
      <h1 className="ui-heading ui-screen-title pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap px-16 text-center text-lg font-bold text-zinc-900 dark:text-zinc-100">
        {title}
      </h1>
      {(right || help) && (
        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1">
          {right}
          {help && (
            <button
              type="button"
              aria-label="도움말"
              aria-expanded={helpOpen}
              aria-controls={helpId}
              onClick={() => setHelpOpen((open) => !open)}
              className="inline-flex size-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Question size={20} weight={helpOpen ? "fill" : "regular"} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
    {help && helpOpen && (
      <section id={helpId} aria-label="도움말" className={`${SURFACE_INSET} space-y-2 p-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200`}>
        {help}
      </section>
    )}
    </>
  );
}
