"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { TabBar } from "@/components/ui/TabBar";
import { TextInput } from "@/components/ui/TextInput";

const TABS = [
  { key: "adventure", label: "모험" },
  {
    key: "life",
    label: "생활",
    badge: "",
    badgeLabel: "처리 가능한 생활 항목 있음",
  },
] as const;

function PreviewPanel() {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>(
    "adventure",
  );
  return (
    <div className="space-y-4 bg-zinc-100 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <TabBar
        tabs={TABS}
        active={active}
        onChange={setActive}
        ariaLabel="디자인 시스템 예시 탭"
        variant="highlight"
      />
      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">오늘의 모험</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            긴 한국어 설명도 카드 안에서 안정적으로 읽힙니다.
          </p>
        </div>
        <Inset className="grid grid-cols-3 gap-2 text-center text-xs">
          <span>오늘 4/7</span>
          <span>이번 주 2/5</span>
          <span>지금 가능 3</span>
        </Inset>
        <div className="grid grid-cols-3 gap-2">
          {['무기', '갑옷', '장갑', '신발', '반지', '목걸이'].map((slot) => (
            <Inset key={slot} className="min-h-11 text-center text-xs">
              {slot}
            </Inset>
          ))}
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary">주요 행동</Button>
        <Button variant="secondary">보조 행동</Button>
        <Button variant="soft">화면 편집</Button>
        <Button variant="danger">위험 행동</Button>
        <Button disabled>비활성</Button>
      </div>
      <TextInput aria-label="검색 예시" placeholder="장비 이름 검색" />
      <div className="grid gap-2 sm:grid-cols-2">
        <StatusBanner tone="actionable">수확 가능한 작물 5개</StatusBanner>
        <StatusBanner tone="success">오늘 참여 완료</StatusBanner>
        <StatusBanner tone="warning">초기화까지 30분</StatusBanner>
        <StatusBanner tone="error">상태를 불러오지 못했습니다</StatusBanner>
      </div>
    </div>
  );
}

export function UiSystemPreview() {
  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-2">
      <section>
        <h1 className="mb-3 text-xl font-bold">정돈된 게임 UI · 라이트</h1>
        <PreviewPanel />
      </section>
      <section className="dark">
        <h2 className="mb-3 text-xl font-bold text-zinc-900">다크 모드</h2>
        <PreviewPanel />
      </section>
    </main>
  );
}
