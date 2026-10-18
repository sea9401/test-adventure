"use client";

import { useMemo, useState } from "react";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { rollItemStats } from "@/adventure/data/v2/v2EquipVariance";
import { V2ItemMultiCompareCard } from "@/adventure/v2/item-card/V2ItemMultiCompareCard";

// 여러 장비 비교 창 프리뷰(건의 #792) — 정적 카탈로그의 같은 부위 무기 표본을 굴림과 함께
//   비교 창에 넣는다. 위 버튼으로 장착 장비 없이(최고값 강조) 그린 모습과 바꿔 본다.
//   장착 시 스탯 합계는 로그인 API 라 로그인 없이는 "계산 불가"로 보인다.
export default function ItemComparePreview() {
  const [withBase, setWithBase] = useState(true);
  const sides = useMemo(() => {
    const weapons = Object.values(V2_EQUIPMENT)
      .filter((item) => item.slot === "weapon" && item.rarity !== "unique")
      .slice(0, 5);
    const rngs = [() => 0.5, () => 0.999, () => 0, () => 0.7, () => 0.3];
    return weapons.map((item, i) => ({
      iid: `dev-${item.id}`,
      item,
      roll: rollItemStats(item, rngs[i]),
    }));
  }, []);
  const [base, ...rest] = sides;
  const candidates = (withBase ? rest : sides.slice(0, 4)).map((side, i) => ({
    ...side,
    equip: {
      busy: false,
      disabledReason: i === 2 ? "들판 6구간 돌파" : undefined,
      onEquip: () => {},
    },
  }));

  return (
    <div className="p-4 text-sm text-zinc-600 dark:text-zinc-300">
      DEV · 여러 장비 비교 창 ({withBase ? "장착 장비 기준" : "장착 장비 없음"})
      <button
        type="button"
        className="relative z-[110] ml-2 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-800"
        onClick={() => setWithBase((v) => !v)}
      >
        기준 바꾸기
      </button>
      <V2ItemMultiCompareCard
        equipped={withBase ? base : undefined}
        candidates={candidates}
        onClose={() => {}}
      />
    </div>
  );
}
