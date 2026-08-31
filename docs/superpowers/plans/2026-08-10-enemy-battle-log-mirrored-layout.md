# Enemy Battle Log Mirrored Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Mirror the internal header layout of right-side enemy action cards so results appear before the enemy identity and action name.

**Architecture:** Keep the existing action parsing and card component. Build the identity and result header nodes once, then choose their render order and grid template from the existing side value. Tests use server-rendered real cards to verify text order and side-specific alignment classes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, React DOM server rendering

## Global Constraints

- Player cards keep identity/action first and result second.
- Enemy cards render result first and identity/action second.
- Enemy result labels and result text align left.
- Enemy identity and action align right while keeping name before action in reading order.
- Card position, accent border, width, calculations, effects, parsing, and combat behavior do not change.
- Do not deploy.

---

### Task 1: Mirror The Enemy Action Header

**Files:**
- Modify: src/adventure/battle/BattleLogList.test.tsx
- Modify: src/adventure/battle/BattleLogList.tsx

**Interfaces:**
- Consumes: ActionCard side value left or right and the existing actionHeadline output.
- Produces: side-specific header DOM order, grid columns, text alignment, and label justification.

- [x] **Step 1: Write the failing server-rendered layout test**

Add one test in the BattleLogList action grouping describe block. Render one player action and one enemy action separately, then assert the literal text order and the enemy-only mirror classes.

~~~tsx
it("상대 행동은 결과를 먼저, 행동 주체와 행동명을 오른쪽에 배치한다", () => {
  const playerHtml = renderToStaticMarkup(
    <BattleLogList
      entries={[
        {
          kind: "player_attack",
          text: "기본 공격! 12 피해를 입혔다.",
          turn: "player",
        },
      ]}
      playerName="플루디아"
      enemyName="풍력핵 골렘"
    />,
  );
  const enemyHtml = renderToStaticMarkup(
    <BattleLogList
      entries={[
        {
          kind: "enemy_attack",
          text: "기본 공격! 12 피해를 입혔다.",
          turn: "enemy",
        },
      ]}
      playerName="플루디아"
      enemyName="풍력핵 골렘"
    />,
  );

  expect(playerHtml.indexOf("기본 공격")).toBeLessThan(
    playerHtml.indexOf("12 피해"),
  );
  expect(enemyHtml.indexOf("12 피해")).toBeLessThan(
    enemyHtml.indexOf("기본 공격"),
  );
  expect(enemyHtml).toContain("grid-cols-[auto_minmax(0,1fr)]");
  expect(enemyHtml).toContain("justify-start");
  expect(enemyHtml).toContain("justify-end text-right");
});
~~~

- [x] **Step 2: Run the focused test and verify RED**

Run: npm test -- src/adventure/battle/BattleLogList.test.tsx

Expected: FAIL because the enemy HTML still places 기본 공격 before 12 피해 and uses the player grid/alignment.

- [x] **Step 3: Implement the minimal mirrored header**

Inside ActionCard, create identityContent and resultContent JSX nodes from the existing two header children. Apply these side-dependent classes:

~~~tsx
const headerGrid =
  side === "left"
    ? "grid-cols-[minmax(0,1fr)_auto]"
    : "grid-cols-[auto_minmax(0,1fr)]";
const identityAlign =
  side === "left" ? "" : "justify-end text-right";
const resultAlign = side === "left" ? "text-right" : "text-left";
const labelAlign = side === "left" ? "justify-end" : "justify-start";
~~~

Render identityContent followed by resultContent for left-side cards. Render resultContent followed by identityContent for right-side cards. Keep the existing actor name then title order within identityContent and preserve all responsive spacing classes.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: npm test -- src/adventure/battle/BattleLogList.test.tsx

Expected: all BattleLogList tests PASS.

- [x] **Step 5: Run related and static verification**

Run: npm test -- src/adventure/battle/BattleLogList.test.tsx src/adventure/battle/engine.test.ts src/adventure/battle/engine-pvp.test.ts

Run: npx tsc --noEmit

Run: npx eslint src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx

Run: git diff --check

Expected: every command exits 0 with no failures or lint errors.

- [x] **Step 6: Commit the implementation**

Run:

~~~bash
git add docs/superpowers/plans/2026-08-10-enemy-battle-log-mirrored-layout.md src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx
git commit -m "style: mirror enemy battle log headers"
~~~
