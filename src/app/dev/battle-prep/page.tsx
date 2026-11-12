"use client";

import { useEffect, useState } from "react";

import { battlePrepCraftRows, craftBattlePrep } from "@/adventure/data/v2/battlePrep";
import { ActiveBattlePrepBadges } from "@/adventure/v2/BattlePrepBadges";
import { BattlePrepCraftPanel } from "@/adventure/v2/BattlePrepCraftPanel";
import { CompactCharacterSummary } from "@/adventure/v2/CompactCharacterSummary";
import { BattlePrepSection } from "@/adventure/v2/inventory/BattlePrepSection";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";

// 전투 준비물 미리보기 — 공방 제작 패널·인벤토리 사용 줄·캐릭터 요약 표시를 예시 데이터로 렌더.
const CONTEXT = {
  levels: { mining: 100, woodcutting: 25 },
  masterCraft: { mining: true, woodcutting: false },
};
const START_MATERIALS: Record<string, number> = {
  v2_basic_ingot: 1_345,
  v2_precious_ingot: 864,
  v2_arcane_alloy: 1_541,
  v2_master_alloy: 3,
  v2_mining_stone: 72_170,
  v2_coal: 15_679,
  v2_rough_gem: 11_359,
  v2_processed_softwood: 95,
  v2_processed_hardwood: 12,
  v2_prep_whetstone_3: 4,
  v2_prep_brace_1: 2,
};
const ENDPOINT = "/api/v2/life-workshop/battle-prep";

export default function BattlePrepPreviewPage() {
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const original = window.fetch;
    let materials = { ...START_MATERIALS };
    window.fetch = async (input, init) => {
      if (typeof input !== "string" || input !== ENDPOINT) return original(input, init);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { itemId: string; quantity: number };
        const result = craftBattlePrep({ materials, ...body, ...CONTEXT });
        if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 409 });
        materials = result.materials;
        return Response.json({
          ok: true,
          itemId: result.item.id,
          crafted: result.quantity,
          rows: battlePrepCraftRows({ materials, ...CONTEXT }),
        });
      }
      return Response.json({ ok: true, rows: battlePrepCraftRows({ materials, ...CONTEXT }) });
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 예시 응답을 연결한 뒤에 패널을 그린다.
    setReady(true);
    return () => {
      window.fetch = original;
    };
  }, []);

  const active = {
    weapon: { itemId: "v2_prep_whetstone_master", expiresAt: now + 20 * 3_600_000 },
    armor: { itemId: "v2_prep_brace_3", expiresAt: now + 5 * 3_600_000 + 12 * 60_000 },
  };

  return (
    <PageShell spacing="tight" className="py-3 sm:py-6">
      <CompactCharacterSummary
        character={{ name: "젠피", gender: "female1", level: 87, exp: 462, expToNext: 1_000, hp: 80, maxHp: 100, mp: 20, maxMp: 40, gold: 12_340_000 }}
        guild={{ id: 7, name: "은하수호대" }}
        levelCap={100}
        activeFoodBuff={{ recipeId: "fried_egg", recipeName: "계란 프라이", quality: "careful", effect: { combatFlat: { atk: 25 } }, expiresAt: now + 3_600_000 }}
        activeBattlePreps={active}
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        <div className="space-y-1.5 p-4">
          <ActiveBattlePrepBadges active={active} />
        </div>
      </CompactCharacterSummary>
      {notice ? <Card padding="sm"><p className="text-sm">{notice}</p></Card> : null}
      {ready ? <BattlePrepCraftPanel busy={false} onNotice={setNotice} /> : null}
      <Card padding="md">
        <BattlePrepSection
          materials={START_MATERIALS}
          busy={null}
          onUse={(itemId) => setNotice(`${itemId} 사용 요청`)}
        />
      </Card>
    </PageShell>
  );
}
