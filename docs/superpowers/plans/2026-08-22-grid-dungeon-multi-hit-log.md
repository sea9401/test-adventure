# Grid Dungeon Multi-hit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 격자 던전의 문자열 전투 로그에서 월식 같은 한 번의 다단타 시전을 한 줄로 표시한다.

**Architecture:** 서버가 구조화된 `BattleLogEntry[]`를 문자열로 버리기 전에 순수 요약 함수로 같은 시전의 연속 타격을 묶는다. 응답과 저장 스키마는 기존 `string[]`을 유지하고, 파티 전투 및 공용 전투 로그 렌더러는 변경하지 않는다.

**Tech Stack:** TypeScript, Vitest, Next.js App Router Route Handler

## Global Constraints

- 같은 공격자·기술명·틱에 연속된 직접 피해만 합친다.
- 기본 공격과 서로 다른 틱의 동일 기술은 합치지 않는다.
- 출력은 `월식! 2타 · 총 N 피해 (1타 A / 2타 B)` 형식이다.
- 일반 전투, PvP, 협동 보스 및 피해 계산은 변경하지 않는다.
- 격자 던전의 기존 `log: string[]` 저장·응답 형식을 유지한다.

---

### Task 1: 구조화된 솔로 전투 로그를 행동 단위 문자열로 요약

**Files:**
- Create: `src/adventure/data/v2/gridDungeonCombatLog.ts`
- Create: `src/adventure/data/v2/gridDungeonCombatLog.test.ts`
- Modify: `src/app/api/v2/grid-dungeon/route.ts:749-756`

**Interfaces:**
- Consumes: `BattleLogEntry[]` from the solo battle engine.
- Produces: `gridDungeonSoloCombatLog(entries: BattleLogEntry[], limit?: number): string[]`.

- [ ] **Step 1: Write the failing tests**

```ts
expect(gridDungeonSoloCombatLog([
  { kind: "player_attack", text: "월식! 700 피해를 입혔다.", turn: "player", t: 80 },
  { kind: "player_attack", text: "월식! 300 피해를 입혔다.", turn: "player", t: 80 },
])).toEqual(["월식! 2타 · 총 1,000 피해 (1타 700 / 2타 300)"]);

expect(gridDungeonSoloCombatLog([
  { kind: "player_attack", text: "월식! 700 피해를 입혔다.", turn: "player", t: 80 },
  { kind: "player_attack", text: "월식! 300 피해를 입혔다.", turn: "player", t: 120 },
])).toEqual([
  "월식! 700 피해를 입혔다.",
  "월식! 300 피해를 입혔다.",
]);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `npm test -- src/adventure/data/v2/gridDungeonCombatLog.test.ts`

Expected: FAIL because `gridDungeonSoloCombatLog` does not exist.

- [ ] **Step 3: Implement the minimal pure formatter**

```ts
import type { BattleLogEntry } from "@/adventure/v2/combat/engine";

type ParsedHit = {
  entry: Extract<BattleLogEntry, { kind: "player_attack" | "enemy_attack" }>;
  title: string;
  labels: string;
  damage: number;
};

const HIT_PATTERN =
  /^([^!]+)!\s*((?:\[[^\]]+\]\s*)*)([\d,]+)\s*피해를 입혔다\.?$/;

function parsedHit(entry: BattleLogEntry): ParsedHit | null {
  if (entry.kind !== "player_attack" && entry.kind !== "enemy_attack") {
    return null;
  }
  const match = entry.text.match(HIT_PATTERN);
  if (!match || match[1].trim() === "공격") return null;
  return {
    entry,
    title: match[1].trim(),
    labels: match[2].trim(),
    damage: Number(match[3].replaceAll(",", "")),
  };
}

function sameCast(previous: ParsedHit, next: ParsedHit): boolean {
  return (
    previous.title === next.title &&
    previous.entry.kind === next.entry.kind &&
    previous.entry.turn === next.entry.turn &&
    previous.entry.side === next.entry.side &&
    previous.entry.t === next.entry.t
  );
}

export function gridDungeonSoloCombatLog(
  entries: BattleLogEntry[],
  limit = 4,
): string[] {
  const lines: string[] = [];
  let hits: ParsedHit[] = [];
  const flushHits = () => {
    if (hits.length === 1) lines.push(hits[0].entry.text);
    if (hits.length > 1) {
      const total = hits.reduce((sum, hit) => sum + hit.damage, 0);
      const detail = hits
        .map(
          (hit, index) =>
            `${index + 1}타${hit.labels ? ` ${hit.labels}` : ""} ${hit.damage.toLocaleString("ko-KR")}`,
        )
        .join(" / ");
      lines.push(
        `${hits[0].title}! ${hits.length}타 · 총 ${total.toLocaleString("ko-KR")} 피해 (${detail})`,
      );
    }
    hits = [];
  };

  for (const entry of entries) {
    const hit = parsedHit(entry);
    if (hit) {
      if (hits.length > 0 && !sameCast(hits[hits.length - 1], hit)) {
        flushHits();
      }
      hits.push(hit);
      continue;
    }
    flushHits();
    if (entry.kind !== "hp_bar" && entry.text) lines.push(entry.text);
  }
  flushHits();
  return lines.slice(-Math.max(0, Math.floor(limit)));
}
```

- [ ] **Step 4: Verify GREEN and edge cases**

Run: `npm test -- src/adventure/data/v2/gridDungeonCombatLog.test.ts`

Expected: all tests PASS, including same-cast grouping, separate-cast preservation, basic attacks, inline labels, zero damage, and the four-action limit.

- [ ] **Step 5: Wire the route to the formatter**

Replace the solo branch's `filter → map → slice(-4)` conversion with:

```ts
gridDungeonSoloCombatLog(soloResult?.finalState.log ?? [], 4)
```

Keep the party branch unchanged.

- [ ] **Step 6: Run focused and project verification**

Run:

```bash
npm test -- src/adventure/data/v2/gridDungeonCombatLog.test.ts src/adventure/data/v2/gridDungeon.test.ts src/adventure/data/v2/gridDungeonCombat.test.ts
npm run lint
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npm test
git diff --check
```

Expected: all commands PASS. If the pre-existing module budget check is run, `src/app/api/v2/dungeon/hunt/route.ts: 1745 > 1730` remains unrelated and unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/adventure/data/v2/gridDungeonCombatLog.ts src/adventure/data/v2/gridDungeonCombatLog.test.ts src/app/api/v2/grid-dungeon/route.ts docs/superpowers/plans/2026-08-22-grid-dungeon-multi-hit-log.md
git commit -m "fix: group grid dungeon multi-hit logs"
```
