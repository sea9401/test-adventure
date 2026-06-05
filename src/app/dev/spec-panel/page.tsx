"use client";

import { useState } from "react";
import { V2SpecPanel, type V2SpecState } from "@/adventure/v2/V2SpecPanel";

// 계파(spec) 패널 프리뷰 — 로그인 없이 선택/픽 UI + 직업 특성 표기 확인.
// (prod 404 은 /dev layout 가드.) 차수 3 기준 특성 effectText 환산값 노출.

// 전사 3계파 mock — 시그니처 + 직업 특성(차수 3 = 차수당 ×2). API 응답 모양과 동일.
const WARRIOR_SPECS: V2SpecState["specs"] = [
  {
    id: "gwang",
    name: "광검",
    requiredWeaponType: "greatsword",
    passives: [
      { id: "gwang_cut", name: "전투태세", desc: "물리 공격력 증가" },
      { id: "gwang_pierce", name: "갑옷 가르기", desc: "적 방어 일부 관통" },
      { id: "gwang_crit", name: "광폭", desc: "방어를 버려 가하는 피해 증가" },
    ],
    trait: { name: "광기", desc: "공격력 증가(차수 성장)", effectText: "공격력 +8%" },
  },
  {
    id: "knight",
    name: "기사",
    requiredWeaponType: "sword_shield",
    passives: [
      { id: "knight_guard", name: "방패 숙련", desc: "받는 피해 감소" },
      { id: "knight_counter", name: "방패치기", desc: "공격력에 방어력의 일부를 더함" },
      { id: "knight_reflect", name: "흘려막기", desc: "낮은 확률로 피해를 완전히 무시" },
    ],
    trait: { name: "강철", desc: "받는 피해 감소(차수 성장)", effectText: "받는 피해 -8%" },
  },
  {
    id: "gladiator",
    name: "검투사",
    requiredWeaponType: "rapier",
    passives: [
      { id: "gladiator_combo", name: "찌르기 연계", desc: "추가타 확률" },
      { id: "gladiator_bleed", name: "유혈", desc: "적중 시 출혈" },
      { id: "gladiator_swift", name: "혈광", desc: "적이 출혈 중이면 추가 공격 확률 증가" },
    ],
    trait: { name: "출혈숙련", desc: "출혈 피해 증가(차수 성장)", effectText: "출혈 피해 +6" },
  },
];

const SELECTING: V2SpecState = {
  tier: 3,
  available: true,
  choice: null,
  unlocked: [],
  picksMax: 2,
  picksUsed: 0,
  specs: WARRIOR_SPECS,
};

const CHOSEN: V2SpecState = {
  tier: 3,
  available: true,
  choice: "gladiator",
  unlocked: ["gladiator_combo"],
  picksMax: 2,
  picksUsed: 1,
  specs: WARRIOR_SPECS,
};

export default function SpecPanelPreview() {
  const [mode, setMode] = useState<"selecting" | "chosen">("selecting");
  const spec = mode === "selecting" ? SELECTING : CHOSEN;
  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV</strong> · V2SpecPanel (차수 3) — 직업 특성 표기 확인.
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("selecting")}
            className={`rounded-md border px-2 py-1 text-xs ${mode === "selecting" ? "border-amber-500 bg-amber-200/60 font-semibold dark:bg-amber-900/60" : "border-amber-300"}`}
          >
            선택 전
          </button>
          <button
            type="button"
            onClick={() => setMode("chosen")}
            className={`rounded-md border px-2 py-1 text-xs ${mode === "chosen" ? "border-amber-500 bg-amber-200/60 font-semibold dark:bg-amber-900/60" : "border-amber-300"}`}
          >
            선택 후(검투사)
          </button>
        </div>
      </div>
      <V2SpecPanel spec={spec} onChanged={() => {}} />
    </div>
  );
}
