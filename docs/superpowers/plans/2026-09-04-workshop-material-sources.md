# Workshop Material Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 제작소의 부족한 각 재료 바로 아래에 실제 최소 입수처와 콘텐츠 이동 링크를 표시한다.

**Architecture:** 재료 ID를 기존 카탈로그에 대조하는 순수 `workshopMaterialSource` 해석기를 제작소 폴더에 추가한다. 제작 패널은 보유량이 필요량보다 작은 재료만 골라 이 해석 결과를 불투명한 인셋 영역에 렌더링한다.

**Tech Stack:** TypeScript, React 19, Next.js App Router `Link`, Vitest, Testing Library server rendering

## Global Constraints

- 벌목·채광, 필드 사냥, 특정 몬스터, 협동 보스, 폭풍 원정 재료를 모두 지원한다.
- 충분히 보유한 재료에는 입수처를 표시하지 않는다.
- 알 수 없는 재료는 거래소 확인으로 안전하게 대체한다.
- 기존 재료·드랍·지역 카탈로그를 재사용하며 드랍률과 제작 비용은 변경하지 않는다.
- 신규 UI 표면에는 `SURFACE_INSET`을 사용해 라이트·다크 모드 모두 불투명하게 유지한다.
- 배포하지 않는다.

---

### Task 1: 재료 입수처 해석기

**Files:**
- Create: `src/adventure/v2/guild/workshopMaterialSources.ts`
- Create: `src/adventure/v2/guild/workshopMaterialSources.test.ts`

**Interfaces:**
- Consumes: 벌목·채광 지점, 제작소 공용 재료, 몬스터 재료, 협동 보스, 폭풍 원정 카탈로그
- Produces: `workshopMaterialSource(materialId: string): WorkshopMaterialSource`

- [ ] **Step 1: Write the failing resolver tests**

```ts
expect(workshopMaterialSource(WOODCUTTING_MATERIAL_ID.pine)).toMatchObject({
  known: true,
  label: "벌목 · 솔바람 소나무숲",
  href: "/character/life",
});
expect(workshopMaterialSource(MINING_MATERIAL_ID.iron)).toMatchObject({
  known: true,
  label: "채광 · 회색바위 철 채석장",
  href: "/character/life",
});
expect(workshopMaterialSource(GUILD_WORKSHOP_MATERIAL_ID.refinedIron)).toMatchObject({
  known: true,
  label: "필드 사냥 · 마른 협곡~얼음 호수",
  href: "/battle",
});
expect(workshopMaterialSource(MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland)).toMatchObject({
  known: true,
  label: "심층 동굴 · 동굴 거미",
  href: "/battle",
});
expect(workshopMaterialSource(COOP_BOSS_MATERIAL_ID.canyon_predator)).toMatchObject({
  known: true,
  label: "협동 보스 · 스콜피온 킹",
  href: "/battle/coop",
});
expect(workshopMaterialSource(STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale)).toMatchObject({
  known: true,
  label: "폭풍 원정 · 칼바람 항로",
  href: "/battle/storm-expedition",
});
expect(workshopMaterialSource("unknown-material")).toEqual({
  known: false,
  label: "거래소 또는 관련 콘텐츠 보상 확인",
  href: "/plaza/market",
});
```

- [ ] **Step 2: Add an exhaustive recipe-source test**

```ts
for (const recipe of Object.values(GUILD_WORKSHOP_RECIPES)) {
  for (const id of Object.keys(guildWorkshopRecipeMaterialCost(recipe))) {
    expect(workshopMaterialSource(id), `${recipe.id}: ${id}`).toMatchObject({
      known: true,
    });
  }
}
```

- [ ] **Step 3: Run the tests and verify RED**

Run: `npx vitest run src/adventure/v2/guild/workshopMaterialSources.test.ts`

Expected: FAIL because `workshopMaterialSources.ts` does not exist.

- [ ] **Step 4: Implement the catalog-backed resolver**

```ts
export type WorkshopMaterialSource = {
  known: boolean;
  label: string;
  href: string;
};

export function workshopMaterialSource(materialId: string): WorkshopMaterialSource {
  const woodSpot = WOODCUTTING_SPOT_IDS
    .map((id) => WOODCUTTING_SPOTS[id])
    .find((spot) => woodcuttingTreeForSpot(spot).materialId === materialId);
  if (woodSpot) {
    return { known: true, label: `벌목 · ${woodSpot.name}`, href: "/character/life" };
  }

  const miningSpot = MINING_SPOT_IDS
    .map((id) => MINING_SPOTS[id])
    .find((spot) => miningNodeForSpot(spot).materialId === materialId);
  if (miningSpot) {
    return { known: true, label: `채광 · ${miningSpot.name}`, href: "/character/life" };
  }

  if (materialId in GUILD_WORKSHOP_MATERIAL_SOURCES) {
    const source = GUILD_WORKSHOP_MATERIAL_SOURCES[materialId as GuildWorkshopMaterialId];
    return { known: true, label: `${source.source} · ${source.depthText}`, href: "/battle" };
  }

  const monsterRule = MONSTER_CRAFT_MATERIAL_DROP_RULES.find(
    (rule) => rule.materialId === materialId,
  );
  if (monsterRule) {
    return {
      known: true,
      label: `${monsterRule.sourceArea} · ${monsterRule.monsterKey}`,
      href: "/battle",
    };
  }

  const coopBossId = (Object.keys(COOP_BOSS_MATERIAL_ID) as CoopBossKindId[])
    .find((id) => COOP_BOSS_MATERIAL_ID[id] === materialId);
  if (coopBossId) {
    return {
      known: true,
      label: `협동 보스 · ${COOP_BOSSES[coopBossId].name}`,
      href: "/battle/coop",
    };
  }

  const stormRoute = STORM_EXPEDITION_ROUTES.find(
    (route) => STORM_EXPEDITION_ROUTE_MATERIAL_ID[route.id] === materialId,
  );
  if (stormRoute) {
    return {
      known: true,
      label: `폭풍 원정 · ${stormRoute.name}`,
      href: "/battle/storm-expedition",
    };
  }

  return {
    known: false,
    label: "거래소 또는 관련 콘텐츠 보상 확인",
    href: "/plaza/market",
  };
}
```

- [ ] **Step 5: Run the resolver tests and verify GREEN**

Run: `npx vitest run src/adventure/v2/guild/workshopMaterialSources.test.ts`

Expected: all tests PASS, including every current recipe material ID being known.

### Task 2: 제작 행 부족 재료 안내

**Files:**
- Modify: `src/adventure/v2/guild/WorkshopCraftPanel.tsx`
- Modify: `src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`

**Interfaces:**
- Consumes: `workshopMaterialSource(materialId)` from Task 1
- Produces: 일반·명장 제작 비용 아래의 `부족 재료 입수처` UI

- [ ] **Step 1: Write the failing panel rendering tests**

```ts
expect(html).toContain("부족 재료 입수처");
expect(html).toContain("미스릴 조각");
expect(html).toContain("필드 사냥 · 심층 동굴~잊힌 성소");
expect(html).toContain('href="/battle"');
```

Add a second state whose inventory satisfies the masterwork costs and assert:

```ts
const completeMaterials = Object.fromEntries(
  Object.entries(guildWorkshopRecipeMaterialCost(shortageRecipe, "masterwork"))
    .map(([id, amount]) => [id, amount ?? 0]),
);
const completeHtml = renderWorkshop(new Set(), "ready", {
  ...state,
  materials: completeMaterials,
  recipes: [guildWorkshopRecipeView(
    shortageRecipe,
    {},
    { blacksmith: { xp: 999_999, crafts: 999 } },
    0,
    5,
    completeMaterials,
  )],
});
expect(completeHtml).not.toContain("부족 재료 입수처");
```

- [ ] **Step 2: Run the panel test and verify RED**

Run: `npx vitest run src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`

Expected: FAIL because the shortage source heading and inline source are absent.

- [ ] **Step 3: Render source rows only for shortages**

In `WorkshopMaterialCostText`, derive `shortages` from entries where `owned < required`. Keep the existing quantity text, then append:

```tsx
{shortages.length > 0 ? (
  <div className={`${SURFACE_INSET} mt-1.5 space-y-1 p-2`}>
    <div className="font-semibold text-zinc-700 dark:text-zinc-200">
      부족 재료 입수처
    </div>
    {shortages.map(({ id }) => {
      const source = workshopMaterialSource(id);
      return (
        <div key={id} className="flex flex-wrap items-center justify-between gap-1">
          <span><strong>{guildWorkshopMaterialName(id)}</strong> · {source.label}</span>
          <Link href={source.href}>이동</Link>
        </div>
      );
    })}
  </div>
) : null}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/adventure/v2/guild/workshopMaterialSources.test.ts src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`

Expected: all tests PASS.

### Task 3: 회귀 검증과 커밋

**Files:**
- Test: `src/adventure/data/v2/guildWorkshop.test.ts`
- Test: `src/adventure/v2/guild/guildWorkshopPanelModel.test.ts`
- Test: `src/adventure/v2/guild/workshopBasicMaterials.test.ts`

**Interfaces:**
- Consumes: completed resolver and panel UI
- Produces: verified implementation commit

- [ ] **Step 1: Run workshop regression tests**

Run: `npx vitest run src/adventure/data/v2/guildWorkshop.test.ts src/adventure/v2/guild/guildWorkshopPanelModel.test.ts src/adventure/v2/guild/workshopBasicMaterials.test.ts src/adventure/v2/guild/workshopMaterialSources.test.ts src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`

Expected: all tests PASS.

- [ ] **Step 2: Run static checks**

Run: `npx eslint src/adventure/v2/guild/workshopMaterialSources.ts src/adventure/v2/guild/workshopMaterialSources.test.ts src/adventure/v2/guild/WorkshopCraftPanel.tsx src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`

Expected: exit 0 with no warnings or errors.

Run: `git diff --check`

Expected: exit 0 with no output.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: exit 0 with no test failures.

- [ ] **Step 4: Commit the implementation**

```bash
git add src/adventure/v2/guild/workshopMaterialSources.ts src/adventure/v2/guild/workshopMaterialSources.test.ts src/adventure/v2/guild/WorkshopCraftPanel.tsx src/adventure/v2/guild/WorkshopCraftPanel.test.tsx docs/superpowers/plans/2026-09-04-workshop-material-sources.md
git commit -m "feat: show sources for missing workshop materials"
```
