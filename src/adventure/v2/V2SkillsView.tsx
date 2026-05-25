"use client";

// v2 스킬 화면 — 마법 시스템 도입 (docs/v2-item-skill-design.md) 결정에 따라
// 라이브 스킬 시스템이 전부 폐기됨. 후속 PR (PR-4/5) 에서 v2 전용 마법 액티브
// 풀과 슬롯이 들어오면 이 화면이 마법 액티브 관리 UI 로 재작성된다.
//
// 1차 derive 분리(PR-1) 이후 v2 derive 가 라이브 스킬 효과를 차단하므로
// 슬롯 0/0 가 노출됨. 임시로 안내 카드만 표시.

export function V2SkillsView({ onBack }: { onBack: () => void }) {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 캐릭터로
        </button>
        <h1 className="text-lg font-bold">스킬</h1>
      </header>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-6 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          마법 시스템 준비 중
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          v2 게임은 라이브의 일반 스킬·특기·AP 스킬 시스템을 폐기하고
          마법 액티브 풀 + 길드 주문서 시스템으로 재설계하고 있어요.
          <br />다음 업데이트에서 사용 가능해집니다.
        </p>
      </div>
    </main>
  );
}
