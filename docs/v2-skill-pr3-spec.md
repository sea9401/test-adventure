## SECTION 1 — Tier 2 Catalog

Source grounding: `src/adventure/data/v2/v2Skills.ts` currently defines Tier 1 starter skills only, with `V2SkillId` as a string union and `V2SkillEffect` as one of `{ kind: "damage"; statCoef; baseFlat? }`, `{ kind: "heal"; pctMaxHp?; flat? }`, `{ kind: "selfBuff"; stat; pct; turns }`, `{ kind: "enemyDebuff"; stat; pct; turns }`. PR-3 must extend the `V2SkillId` union and `V2_SKILLS` record with the following Tier 2 entries.

```ts
[
  {
    id: "str_cleave_t2",
    name: "횡베기",
    stat: "str",
    category: "attack",
    tier: 2,
    description: "무거운 일격을 넓게 휘둘러 적의 전열을 무너뜨린다. 광역 공격의 첫 단계로, 단일 전투에서는 강한 추가 피해로 처리한다.",
    mpCost: 70,
    cooldown: 4,
    effects: [{ kind: "damage", statCoef: 1.45 }],
    learn: { goldCost: 1800, stat: { key: "str", min: 45 }, level: 18, prereqSkillIds: ["v2_skill_strike"] },
  },
  {
    id: "str_crushing_blow_t2",
    name: "분쇄 강타",
    stat: "str",
    category: "attack",
    tier: 2,
    description: "강타의 흐름을 끝까지 밀어붙여 방어 자세를 깨뜨린다. 피해와 함께 적의 활력을 잠시 낮춘다.",
    mpCost: 85,
    cooldown: 5,
    effects: [
      { kind: "damage", statCoef: 1.65 },
      { kind: "enemyDebuff", stat: "vit", pct: 14, turns: 3 },
    ],
    learn: { goldCost: 2400, stat: { key: "str", min: 60 }, level: 24, prereqSkillIds: ["v2_skill_strike"] },
  },
  {
    id: "str_intimidating_roar_t2",
    name: "위압의 함성",
    stat: "str",
    category: "debuff",
    tier: 2,
    description: "힘으로 전장을 짓눌러 적의 공격 의지를 꺾는다. 다음 몇 턴 동안 적의 힘이 감소한다.",
    mpCost: 60,
    cooldown: 4,
    effects: [{ kind: "enemyDebuff", stat: "str", pct: 16, turns: 3 }],
    learn: { goldCost: 2000, stat: { key: "str", min: 50 }, level: 20, prereqSkillIds: ["v2_skill_strike"] },
  },
  {
    id: "dex_needle_flurry_t2",
    name: "바늘 연격",
    stat: "dex",
    category: "attack",
    tier: 2,
    description: "짧고 정확한 찌르기를 여러 번 이어 빈틈을 넓힌다. 연격의 상위 단계로 안정적인 추가 피해를 준다.",
    mpCost: 65,
    cooldown: 3,
    effects: [{ kind: "damage", statCoef: 1.35, baseFlat: 8 }],
    learn: { goldCost: 1800, stat: { key: "dex", min: 45 }, level: 18, prereqSkillIds: ["v2_skill_flurry"] },
  },
  {
    id: "dex_true_thrust_t2",
    name: "정밀 관통",
    stat: "dex",
    category: "attack",
    tier: 2,
    description: "호흡을 멈추고 정확한 한 점을 꿰뚫는다. 다단 공격보다 낮은 변동성으로 큰 피해를 노린다.",
    mpCost: 80,
    cooldown: 4,
    effects: [{ kind: "damage", statCoef: 1.55, baseFlat: 10 }],
    learn: { goldCost: 2300, stat: { key: "dex", min: 58 }, level: 23, prereqSkillIds: ["v2_skill_flurry"] },
  },
  {
    id: "dex_mirage_step_t2",
    name: "잔영 보법",
    stat: "dex",
    category: "buff",
    tier: 2,
    description: "몸의 축을 낮추고 잔상을 남기는 보법으로 공격을 흘린다. 잠시 민첩이 상승한다.",
    mpCost: 75,
    cooldown: 5,
    effects: [{ kind: "selfBuff", stat: "dex", pct: 16, turns: 3 }],
    learn: { goldCost: 2100, stat: { key: "dex", min: 52 }, level: 21, prereqSkillIds: ["v2_skill_flurry"] },
  },
  {
    id: "vit_greater_recover_t2",
    name: "강화 회복",
    stat: "vit",
    category: "heal",
    tier: 2,
    description: "깊게 숨을 들이켜 흐트러진 몸을 크게 회복한다. 회복의 상위 단계로 최대 HP 비례 회복량이 높다.",
    mpCost: 75,
    cooldown: 4,
    effects: [{ kind: "heal", pctMaxHp: 16 }],
    learn: { goldCost: 1900, stat: { key: "vit", min: 45 }, level: 18, prereqSkillIds: ["v2_skill_recover"] },
  },
  {
    id: "vit_guard_shell_t2",
    name: "철벽 호흡",
    stat: "vit",
    category: "buff",
    tier: 2,
    description: "몸을 단단히 고정해 충격을 받아낼 자세를 만든다. 잠시 활력이 상승해 생존력이 오른다.",
    mpCost: 70,
    cooldown: 5,
    effects: [{ kind: "selfBuff", stat: "vit", pct: 17, turns: 3 }],
    learn: { goldCost: 2200, stat: { key: "vit", min: 55 }, level: 22, prereqSkillIds: ["v2_skill_recover"] },
  },
  {
    id: "vit_provoking_shout_t2",
    name: "도발의 외침",
    stat: "vit",
    category: "debuff",
    tier: 2,
    description: "적의 호흡을 흐트러뜨리는 거친 외침으로 공격 리듬을 끊는다. 적의 힘을 낮춰 받는 피해를 줄인다.",
    mpCost: 60,
    cooldown: 4,
    effects: [{ kind: "enemyDebuff", stat: "str", pct: 14, turns: 3 }],
    learn: { goldCost: 2000, stat: { key: "vit", min: 50 }, level: 20, prereqSkillIds: ["v2_skill_recover"] },
  },
  {
    id: "spd_first_wind_t2",
    name: "선풍",
    stat: "spd",
    category: "buff",
    tier: 2,
    description: "전투 시작의 한 박자를 앞당기는 움직임을 익힌다. 잠시 속도가 크게 오른다.",
    mpCost: 65,
    cooldown: 4,
    effects: [{ kind: "selfBuff", stat: "spd", pct: 16, turns: 3 }],
    learn: { goldCost: 1800, stat: { key: "spd", min: 45 }, level: 18, prereqSkillIds: ["v2_skill_dash"] },
  },
  {
    id: "spd_afterimage_counter_t2",
    name: "역풍 자세",
    stat: "spd",
    category: "debuff",
    tier: 2,
    description: "상대의 반격 타이밍을 비틀어 다음 움직임을 늦춘다. 적의 속도를 낮춰 선공권을 흔든다.",
    mpCost: 70,
    cooldown: 4,
    effects: [{ kind: "enemyDebuff", stat: "spd", pct: 16, turns: 3 }],
    learn: { goldCost: 2100, stat: { key: "spd", min: 52 }, level: 21, prereqSkillIds: ["v2_skill_dash"] },
  },
  {
    id: "spd_gale_cut_t2",
    name: "질풍 베기",
    stat: "spd",
    category: "attack",
    tier: 2,
    description: "속도를 실어 짧은 궤적으로 베어낸다. 빠른 빌드가 공격 스킬을 선택할 수 있게 하는 중급 기술이다.",
    mpCost: 80,
    cooldown: 3,
    effects: [{ kind: "damage", statCoef: 1.5, baseFlat: 6 }],
    learn: { goldCost: 2300, stat: { key: "spd", min: 58 }, level: 23, prereqSkillIds: ["v2_skill_dash"] },
  },
  {
    id: "luk_critical_omen_t2",
    name: "치명 예감",
    stat: "luk",
    category: "buff",
    tier: 2,
    description: "승부가 기우는 순간을 읽어 행운을 끌어올린다. 잠시 행운이 상승해 치명 흐름을 강화한다.",
    mpCost: 65,
    cooldown: 5,
    effects: [{ kind: "selfBuff", stat: "luk", pct: 17, turns: 3 }],
    learn: { goldCost: 1900, stat: { key: "luk", min: 45 }, level: 18, prereqSkillIds: ["v2_skill_fortune"] },
  },
  {
    id: "luk_curse_mark_t2",
    name: "불길한 표식",
    stat: "luk",
    category: "debuff",
    tier: 2,
    description: "적에게 불운의 흐름을 새겨 균형을 무너뜨린다. 적의 행운을 낮춰 치명적 반전을 노린다.",
    mpCost: 70,
    cooldown: 4,
    effects: [{ kind: "enemyDebuff", stat: "luk", pct: 16, turns: 3 }],
    learn: { goldCost: 2100, stat: { key: "luk", min: 52 }, level: 21, prereqSkillIds: ["v2_skill_fortune"] },
  },
  {
    id: "luk_death_lottery_t2",
    name: "사신의 제비",
    stat: "luk",
    category: "attack",
    tier: 2,
    description: "낮은 확률의 즉사 감각을 피해량으로 압축해 찌른다. 현재 효과 union 에 즉사 타입이 없으므로 PR-3에서는 높은 LUK 계수 피해로 표현한다.",
    mpCost: 95,
    cooldown: 5,
    effects: [{ kind: "damage", statCoef: 1.75, baseFlat: 12 }],
    learn: { goldCost: 2600, stat: { key: "luk", min: 62 }, level: 25, prereqSkillIds: ["v2_skill_fortune"] },
  },
  {
    id: "int_arcane_bolt_t2",
    name: "비전 화살",
    stat: "int",
    category: "attack",
    tier: 2,
    description: "응축한 마력을 한 점에 쏘아 단일 대상을 꿰뚫는다. 명상의 상위 공격 선택지로 지능 계수 피해를 준다.",
    mpCost: 70,
    cooldown: 3,
    effects: [{ kind: "damage", statCoef: 1.5, baseFlat: 10 }],
    learn: { goldCost: 1800, stat: { key: "int", min: 45 }, level: 18, prereqSkillIds: ["v2_skill_meditate"] },
  },
  {
    id: "int_mana_burst_t2",
    name: "마력 폭발",
    stat: "int",
    category: "attack",
    tier: 2,
    description: "마력을 넓게 터뜨려 전장을 흔든다. 광역 마법의 첫 단계로, 단일 전투에서는 높은 추가 피해로 처리한다.",
    mpCost: 90,
    cooldown: 5,
    effects: [{ kind: "damage", statCoef: 1.7, baseFlat: 14 }],
    learn: { goldCost: 2500, stat: { key: "int", min: 60 }, level: 24, prereqSkillIds: ["v2_skill_meditate"] },
  },
  {
    id: "int_mind_fog_t2",
    name: "정신 안개",
    stat: "int",
    category: "debuff",
    tier: 2,
    description: "적의 판단을 흐리는 안개를 펼쳐 마력의 흐름을 끊는다. 적의 지능을 낮춰 마법 대응력을 약화한다.",
    mpCost: 65,
    cooldown: 4,
    effects: [{ kind: "enemyDebuff", stat: "int", pct: 16, turns: 3 }],
    learn: { goldCost: 2100, stat: { key: "int", min: 52 }, level: 21, prereqSkillIds: ["v2_skill_meditate"] },
  },
]
```

Balance notes:

- All Tier 2 MP costs are 60-100 and cooldowns are 3-5.
- Tier 2 direct coefficients sit around Tier 1 ×1.4-1.8 where a comparable Tier 1 exists.
- Current `V2SkillEffect` cannot encode target count, guaranteed taunt, counter prevention, crit chance, or instant death. Those identities are represented through description plus existing `damage`, `selfBuff`, and `enemyDebuff` fields so PR-3 remains compatible with the current union.

## SECTION 2 — Instructor NPC Design

NPCs should follow the `src/adventure/data/npcs.ts` conventions: short portrait filenames under `/images/npc/*.webp`, trainer role semantics, Korean greeting strings with newline-separated lines, and IDs in a stable lower_snake/categorized style. Because `NpcId` is a TypeScript union, PR-3 must add these IDs before adding the data.

```ts
[
  {
    id: "v2_instructor_str_garan",
    name: "힘의 교관 가란",
    stat: "str",
    location: "마을 탭 > 교관 > 힘",
    portrait: "/images/npc/garan.webp",
    lines: {
      skillsAvailable: "검을 크게 휘두르는 법부터 배워라.\n힘의 기술은 망설이지 않을 때 가장 깊게 박힌다.",
      insufficient: "아직 팔과 주머니가 둘 다 가볍군.\n힘 스탯과 골드를 채우고 다시 와라.",
    },
  },
  {
    id: "v2_instructor_dex_serin",
    name: "민첩 교관 세린",
    stat: "dex",
    location: "마을 탭 > 교관 > 민첩",
    portrait: "/images/npc/serin.webp",
    lines: {
      skillsAvailable: "빠른 손보다 중요한 건 정확한 손끝이야.\n민첩 기술을 익히면 빈틈이 먼저 보일 거야.",
      insufficient: "지금은 동작이 반 박자 늦어.\n민첩 스탯과 수업료를 갖추고 다시 찾아와.",
    },
  },
  {
    id: "v2_instructor_vit_boram",
    name: "활력 교관 보람",
    stat: "vit",
    location: "마을 탭 > 교관 > 활력",
    portrait: "/images/npc/boram.webp",
    lines: {
      skillsAvailable: "버티는 법을 아는 모험가만 다음 전투를 고를 수 있어요.\n활력 기술로 몸의 중심을 세워 봅시다.",
      insufficient: "아직 몸이 기술을 받아낼 만큼 단단하지 않아요.\n활력 스탯과 골드를 준비해 오세요.",
    },
  },
  {
    id: "v2_instructor_spd_haneul",
    name: "속도 교관 하늘",
    stat: "spd",
    location: "마을 탭 > 교관 > 속도",
    portrait: "/images/npc/haneul.webp",
    lines: {
      skillsAvailable: "먼저 움직이면 전투의 모양이 달라져.\n속도 기술은 한 걸음 빠른 판단에서 시작해.",
      insufficient: "발은 급한데 준비가 따라오지 못하네.\n속도 스탯과 골드를 채우고 다시 뛰어와.",
    },
  },
  {
    id: "v2_instructor_luk_miru",
    name: "행운 교관 미루",
    stat: "luk",
    location: "마을 탭 > 교관 > 행운",
    portrait: "/images/npc/miru.webp",
    lines: {
      skillsAvailable: "운은 기다리는 게 아니라 끌어당기는 거야.\n행운 기술을 배우면 승부의 틈이 보일 거야.",
      insufficient: "아직 별이 네 쪽으로 기울지 않았어.\n행운 스탯과 골드를 맞춰서 다시 와.",
    },
  },
  {
    id: "v2_instructor_int_ian",
    name: "지능 교관 이안",
    stat: "int",
    location: "마을 탭 > 교관 > 지능",
    portrait: "/images/npc/ian.webp",
    lines: {
      skillsAvailable: "마력은 많이 아는 자보다 정확히 이해한 자에게 따른다.\n지능 기술의 구조를 차근차근 익혀 보자.",
      insufficient: "지금은 식을 끝까지 붙잡기 어렵겠군.\n지능 스탯과 골드를 갖춘 뒤 다시 오게.",
    },
  },
]
```

Implementation note: if these are added directly to `NPCS`, map each entry to the existing `Npc` fields as `region: "village"`, `role: "trainer"`, `description` as a one-sentence instructor description, and `greeting` as `lines.skillsAvailable`. The insufficient line belongs in the instructor modal/API error display, not the base `Npc.greeting`, unless a new v2 instructor data type is introduced.

## SECTION 3 — Learn API

Endpoint: `POST /api/v2/me/skills/learn`

Route file: `src/app/api/v2/me/skills/learn/route.ts`

Request body:

```ts
{ skillId: V2SkillId }
```

Response:

```ts
{ ok: true, skills: V2SkillsState, gold: number } | { ok: false, error: string }
```

Validation and error order:

1. Catalog lookup: if `skillId` is not a string key in `V2_SKILLS`, return `{ ok: false, error: "알 수 없는 스킬" }`.
2. Already learned: after locking and parsing `skills.v2`, if `skills.learned.includes(skillId)`, return `{ ok: false, error: "이미 학습한 스킬" }`.
3. Gold sufficient: read locked `character.v2.gold`; if below `def.learn.goldCost`, return `{ ok: false, error: "골드 부족" }`.
4. Stat requirement: use `derivePlayerCombatV2(userId, tx)` inside the same transaction and check `combat.totalStats[learn.stat.key] >= learn.stat.min`; on failure return `{ ok: false, error: "스탯 부족 (필요 {stat} {value})" }`, for example `스탯 부족 (필요 str 45)`.
5. Level requirement: check locked `character.v2.level ?? 1`; on failure return `{ ok: false, error: "레벨 부족 (필요 Lv{n})" }`.
6. Prereq skills owned: for each `learn.prereqSkillIds`, require it in `skills.learned`; on first missing prereq, return `{ ok: false, error: "선행 스킬 미보유: {name}" }` where `{name}` is `V2_SKILLS[missingId].name`.

Transaction requirements:

- Use `db.transaction` with an async callback matching `src/app/api/v2/me/training/commit/route.ts`.
- Lock `skills.v2` with `lockSaveForUpdate(tx, userId, "skills.v2", emptyV2SkillsState())`.
- Lock `character.v2` with `lockSaveForUpdate(tx, userId, "character.v2", {})` before deducting gold.
- Deduct `learn.goldCost` from `character.v2.gold` and grant the skill in one transaction.
- Persist `skills.v2` with `upsertSave(tx, userId, "skills.v2", nextSkills)`.
- Persist `character.v2` with the existing character blob fields preserved and `gold` overwritten with `nextGold`.
- Keep `equipped` unchanged when learning; learning never auto-equips Tier 2 skills.
- Return `{ ok: true, skills: nextSkills, gold: nextGold }` after both writes succeed.

HTTP status convention should follow nearby v2 routes: `401` for unauthorized, `400` for invalid JSON/body/validation failures, and `200` for success. The user-facing Korean error string must be in `error` exactly as listed above.

## SECTION 4 — Equip API

Endpoint: `POST /api/v2/me/skills/equip`

Route file: `src/app/api/v2/me/skills/equip/route.ts`

Request body:

```ts
{ equipped: V2SkillId[] }
```

Response:

```ts
{ ok: true, skills: V2SkillsState } | { ok: false, error: string }
```

Important current-state note: this route path already exists, but currently updates `character.v2.equippedSpells` for the old spell view. PR-3 must replace that behavior with `skills.v2.equipped` or move the old spell behavior to a different endpoint before merging.

Slot model:

- Slot cap is exactly `3`.
- The three slots represent combat role coverage: attack, recovery, and buff-debuff.
- `equipped` array order is the auto-activation priority and must be preserved exactly after validation.
- PR-3 does not need to enforce one category per role unless product explicitly adds that rule later; the requested validation list only caps total slots, ownership, and duplicates.

Validation and error order:

1. Max 3 slots: if `equipped.length > 3`, return `{ ok: false, error: "장착 슬롯 초과 (최대 3)" }`.
2. All IDs in learned set: after locking/parsing `skills.v2`, for each requested ID require `skills.learned.includes(id)`; on first miss, return `{ ok: false, error: "미학습 스킬: {id}" }`.
3. No duplicates: if `new Set(equipped).size !== equipped.length`, return `{ ok: false, error: "중복 스킬" }`.

Implementation requirements:

- Parse JSON and require `Array.isArray(body.equipped)`.
- Reject non-string or unknown catalog IDs as not learned if absent from the parsed learned set; this keeps the specified `"미학습 스킬: {id}"` user-facing error.
- Use `db.transaction` plus `lockSaveForUpdate(tx, userId, "skills.v2", emptyV2SkillsState())`.
- Save the existing skills state with `learned` preserved and `equipped` overwritten by the requested array.
- Return `{ ok: true, skills: nextSkills }`.

## SECTION 5 — UI Structure

A. Town tab instructor flow:

- Add a `"교관"` entry to `V2TownHome` and a matching `TownAction` such as `{ kind: "open-instructors" }`.
- In `V2GameFlow`, add an instructor view under the town tab and route the action there.
- The instructor view shows 6 NPC cards, one per stat: STR/DEX/VIT/SPD/LUK/INT.
- Clicking a card opens `V2InstructorModal` for that stat.
- The modal shows that stat's Tier 1 starter plus Tier 2 catalog entries, sorted by tier then learn requirement.
- Tier 1 starters are displayed as owned/read-only because PR-2 auto-grants them through `ensureV2StarterSkills`.
- Tier 2 entries show MP, cooldown, effects summary, gold cost, stat requirement, level requirement, prereq skill names, and a `[학습]` button.

B. Skill inventory / equip screen:

- Replace the current spell-oriented `V2SkillsView` behavior with v2 skill inventory/equipment behavior.
- Show learned skills grouped by category or stat.
- Show 3 equip slots backed by `skills.equipped`.
- Drag/drop or up/down controls may reorder, but the saved array order is the combat auto-activation priority.
- A skill can be removed from a slot without forgetting it.

C. `V2SkillState` fields needed:

```ts
type V2SkillsState = {
  learned: V2SkillId[];
  equipped: V2SkillId[];
};
```

The existing source name is `V2SkillsState` in `src/adventure/data/v2/v2Skills.ts`; the spec response shape may call it `V2SkillState`, but implementation should reuse or alias the existing exported type rather than creating a divergent duplicate.

D. Optimistic UI:

- Disable `[학습]` during the learn API call.
- Optimistically mark the skill as learned and reduce displayed gold only after basic client-side requirement checks pass.
- On API error, revert `learned` and `gold` to the previous snapshot and show the returned Korean `error`.
- Disable equip controls during the equip API call.
- Optimistically update `equipped` order immediately.
- On equip API error, restore the previous `equipped` array and show the returned Korean `error`.

E. Component file suggestions:

- `src/adventure/v2/V2InstructorModal.tsx`: stat-specific instructor modal, skill list, learn button, requirement status.
- `src/adventure/v2/V2SkillEquipPanel.tsx`: learned list, 3 equip slots, reorder/remove controls, optimistic equip API call.
- A small static data file such as `src/adventure/data/v2/v2SkillInstructors.ts` can hold the six instructor definitions if adding them to global `NPCS` would overload live-region NPC data.

## SECTION 6 — Pre-identified Traps

1. `saves_kv` schema and field path:

- PR-1 already established `skills.v2` as the dedicated save key in `src/adventure/data/v2/v2Skills.ts`.
- The exact blob shape is `{ learned: V2SkillId[], equipped: V2SkillId[] }`.
- This does not collide with `equipment.v2`, which stores v2 equipment ownership/equipped slots, and does not collide with outpost keys or fields such as `character.v2.lastVisitedOutpost` / `character.v2.lastHuntedOutpost`.
- PR-3 should not store skills under `character.v2.skills`, `equipment.v2`, or any outpost key.

2. PR-2 migration and starter grant format:

- PR-2 uses `ensureV2StarterSkills` in `src/lib/server/v2Skills.ts`.
- It reads/parses `skills.v2`, grants the six starter IDs from `V2_STARTER_SKILL_IDS`, and seeds `equipped` from the first N starter IDs only when `equipped` is empty.
- The stored starter IDs are already the catalog IDs: `"v2_skill_strike"`, `"v2_skill_flurry"`, `"v2_skill_recover"`, `"v2_skill_dash"`, `"v2_skill_fortune"`, `"v2_skill_meditate"`.
- PR-3 should read those IDs as-is. No rename or migration is needed.

3. Race condition on simultaneous learn clicks:

- Client: disable the clicked learn button immediately and keep it disabled until the request resolves.
- Server: wrap character gold deduction and skill grant in one `db.transaction`.
- Server: lock both `skills.v2` and `character.v2` with `lockSaveForUpdate` before validation/write.
- Server: the second simultaneous request will observe the first committed `skills.learned` and return `"이미 학습한 스킬"` instead of deducting gold twice.
- If the deployment database supports stricter transaction isolation, serializable is preferred for this endpoint; row locks are still required because the state lives in JSON blobs.

4. PR-4 combat runtime contract:

- PR-4 must read `skills.v2.equipped` in array order as the auto-activation priority.
- For each equipped ID, PR-4 must resolve `V2_SKILLS[id]` and read `mpCost`, `cooldown`, `category`, `stat`, and `effects`.
- Effect discriminant is currently `kind`, not `type`.
- Damage effect fields: `kind: "damage"`, `statCoef: number`, optional `baseFlat: number`. Runtime should calculate from the skill definition's `stat` and the player's corresponding total stat unless PR-4 explicitly defines another scaling source.
- Heal effect fields: `kind: "heal"`, optional `pctMaxHp: number`, optional `flat: number`. `pctMaxHp` is an integer percent, so `16` means 16%, not `0.16`.
- Self buff fields: `kind: "selfBuff"`, `stat: StatKey`, `pct: number`, `turns: number`. `pct` is an integer percent and `turns` is the duration field.
- Enemy debuff fields: `kind: "enemyDebuff"`, `stat: StatKey`, `pct: number`, `turns: number`. `pct` is an integer percent and `turns` is the duration field.
- PR-4 should ignore unknown future effect kinds defensively or fail fast in tests, but PR-3 should not introduce new effect fields for AoE, taunt, counter, crit, or instant death until the union is intentionally expanded.
