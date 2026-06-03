"use client";

import { V2CharacterBasics } from "@/adventure/v2/V2CharacterBasics";

// 내 정보 "기본 정보" 카드 QA — me/state 주입값 대신 mock 으로 변형(속성·길드 유무·자릿수) 확인.
// 로그인/DB 불필요.
const CASES: {
  title: string;
  element?: string;
  guildName?: string | null;
  points: number;
  battleCount: number;
  power: number;
}[] = [
  {
    title: "별빛 · 길드 소속",
    element: "starlight",
    guildName: "은하수호대",
    points: 1240,
    battleCount: 18342,
    power: 4821,
  },
  {
    title: "불 · 무소속",
    element: "fire",
    guildName: null,
    points: 30,
    battleCount: 5,
    power: 112,
  },
  {
    title: "무속성 · 큰 수치",
    element: "neutral",
    guildName: "",
    points: 99999,
    battleCount: 1203456,
    power: 88210,
  },
  {
    title: "속성 미지정",
    element: undefined,
    guildName: "초심자 모임",
    points: 0,
    battleCount: 0,
    power: 0,
  },
];

export default function CharacterBasicsPreview() {
  return (
    <div className="mx-auto max-w-[720px] space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV</strong> · 내 정보 「기본 정보」 카드 — 옛 직업 숙달 대체. 전투력
        헤드라인 + 속성·소속 길드·전투 횟수·숙달 포인트. mock 변형.
      </div>
      {CASES.map((c) => (
        <div key={c.title} className="space-y-1">
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {c.title}
          </div>
          <V2CharacterBasics
            element={c.element}
            guildName={c.guildName}
            points={c.points}
            battleCount={c.battleCount}
            power={c.power}
          />
        </div>
      ))}
    </div>
  );
}
