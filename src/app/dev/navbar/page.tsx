"use client";

import { useState } from "react";
import { TabBar } from "@/components/ui/TabBar";

// 메인 nav 가장자리 페이드 QA — GameChrome 와 동일한 6탭·크기·variant 를 좁은 폭 박스에
// 넣어 스크롤 시 우측(또는 좌측) 페이드가 "더 있음"을 알리는지 확인. 로그인/DB 불필요.
const TABS = [
  { key: "adventure", label: "모험" },
  { key: "battle", label: "전투" },
  { key: "town", label: "마을" },
  { key: "character", label: "캐릭터" },
  { key: "guild", label: "길드" },
  { key: "plaza", label: "광장" },
] as const;

const WIDTHS = [320, 360, 390, 720];

export default function NavbarPreview() {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("adventure");
  return (
    <div className="mx-auto max-w-[760px] space-y-6 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV</strong> · 메인 nav 가장자리 페이드. 폭별 박스에서 6번째 탭(광장)이
        넘칠 때 우측 페이드로 「더 있음」이 보이는지 확인. 좌우로 스크롤하면 닿은 쪽
        페이드가 사라진다(720px 는 다 들어와 페이드 없음).
      </div>
      {WIDTHS.map((w) => (
        <div key={w} className="space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {w}px
          </div>
          <div
            style={{ width: w, maxWidth: "100%" }}
            className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
          >
            <TabBar
              tabs={TABS}
              active={active}
              onChange={setActive}
              ariaLabel={`메인 탭 (${w}px)`}
              size="lg"
              variant="highlight"
              scrollable
              className="w-full px-4 [&_button]:text-[1.0625rem]"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
