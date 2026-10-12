import type { ReactNode } from "react";

const STICKY_BELOW_HEADER =
  "lg:sticky lg:top-[calc(var(--game-header-height,4rem)+1rem)]";

// PC(1024px 이상) 목록·상세 2단. 왼쪽은 고정 폭 목록·요약(스크롤해도 머리 아래 붙어 있음),
//   오른쪽은 나머지 폭의 본문. 1024px 미만에서는 위아래로 쌓여 휴대폰 화면과 같다.
export function TwoPane({
  aside,
  children,
  className,
  sticky = true,
  stickyMain = false,
}: {
  aside: ReactNode;
  children: ReactNode;
  className?: string;
  // 왼쪽 칸이 화면보다 길어질 수 있으면 false — 고정하면 아래쪽이 가려진다.
  sticky?: boolean;
  // 왼쪽 목록은 길고 오른쪽 상세가 짧으면 true — 목록을 내려도 상세가 화면에 남는다.
  stickyMain?: boolean;
}) {
  return (
    <div
      className={[
        "space-y-3 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <aside className={`min-w-0 space-y-3 ${sticky ? STICKY_BELOW_HEADER : ""}`}>
        {aside}
      </aside>
      <div className={`min-w-0 space-y-3 ${stickyMain ? STICKY_BELOW_HEADER : ""}`}>
        {children}
      </div>
    </div>
  );
}
