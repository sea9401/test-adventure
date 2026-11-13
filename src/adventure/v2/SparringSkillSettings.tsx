"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

function SettingsLoading() {
  return (
    <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
      불러오는 중…
    </p>
  );
}

// 캐릭터 → 스킬 화면의 편집기를 그대로 쓴다. 무거운 화면이라 탭을 열 때 불러온다.
const PatternEditor = dynamic(
  () => import("./V2CombatPatternView").then((module) => module.V2CombatPatternView),
  { loading: SettingsLoading },
);
const SkillLoadout = dynamic(
  () => import("./V2SkillLearnView").then((module) => module.V2SkillLearnView),
  { loading: SettingsLoading },
);

type SettingsView = "pattern" | "loadout";

const READABLE = "mx-auto max-w-[720px]";

// 대련장 안에서 스킬 패턴·스킬 장착을 고친다. 두 편집기 모두 고치는 즉시 서버에 저장하고
// 대련은 서버에 저장된 설정으로 치르므로, 탭만 바꿔 다시 대련하면 반영된다.
export function SparringSkillSettings({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<SettingsView>("pattern");
  return (
    <div className="space-y-3">
      <div className={`${READABLE} space-y-2`}>
        <SegmentedControl
          ariaLabel="스킬 설정 종류"
          value={view}
          onChange={setView}
          options={[
            { key: "pattern", label: "스킬 패턴" },
            { key: "loadout", label: "스킬 장착" },
          ]}
        />
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          바꾼 내용은 바로 저장되고 다음 대련부터 적용됩니다.
        </p>
      </div>
      {/* 스킬 장착은 PC에서 능력치 요약이 옆에 붙어 읽기 폭(720px)보다 넓게 쓴다. */}
      {view === "pattern" ? (
        <div className={READABLE}>
          <PatternEditor embedded onBack={onBack} />
        </div>
      ) : (
        <SkillLoadout embedded section="loadout" onBack={onBack} />
      )}
    </div>
  );
}
