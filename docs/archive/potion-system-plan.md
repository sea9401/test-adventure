# 물약 시스템 (Potion System) 기획

> 상태: ✅ **구현 완료** — 물약 시스템 출고. 이 문서는 설계 기록.

> 소비 아이템(물약)을 도입하고, **자동 전투 중에도 규칙에 따라 자동 사용**되도록 하는 기능.

---

## 범위

### 포함 (단일 PR)
- 물약 데이터/타입 + **인벤토리 시스템** 신규 도입
- 1차 물약 1종: **작은 회복약** (HP +20, 12 G)
- 캐릭터 탭에 **가방(인벤토리)** 서브뷰 추가 — `내 정보`와 `스킬` 사이
- 마을 상점(현재 placeholder)에 작은 회복약 판매 진열
- 전투 엔진에 `PlayerAction` 추상화 — 공격 vs 물약 사용 분기
- **수동 전투 입력 대기 모드** — 자동 전투 OFF일 때 player phase에서 사용자 입력 대기
- **자동 전투 자동 사용 규칙** + 가방 안에서 설정

### 제외 (후속)
- 다른 물약(MP, 회복량 큰 물약, 버프 등)
- 연금술/제작
- 도감 아이템 탭 연동
- 잡화상 보로 NPC와 상점 연결(현재 상점은 NPC 분리 운영)

---

## 데이터 모델

### 물약 정의 (정적)

```ts
// src/adventure/data/potions.ts
export type PotionId = "potion_heal_s";

export type PotionEffect =
  | { kind: "heal_hp"; flat?: number; pct?: number };
  // 추후 heal_mp 등 확장

export type Potion = {
  id: PotionId;
  name: string;
  description: string;
  effect: PotionEffect;
  price: number;     // 상점 판매가
  icon?: string;     // /images/items/*.png (이번에는 생략)
};

export const POTIONS: Record<PotionId, Potion> = {
  potion_heal_s: {
    id: "potion_heal_s",
    name: "작은 회복약",
    description: "마시면 약간의 활력이 돌아온다.",
    effect: { kind: "heal_hp", flat: 20 },
    price: 12,
  },
};
```

### 인벤토리 (보유 수량)

```ts
// localStorage key: "inventory.v1"
type InventoryState = {
  potions: Partial<Record<PotionId, number>>;
};

// hook: useInventory()
// - log: InventoryState
// - add(id, n=1)
// - consume(id, n=1) → boolean (보유 0이면 false)
// - count(id) → number
```

— 기존 `useAdventureLog`/`useQuests` 패턴 그대로(load/save effect, useCallback).

### 자동 사용 규칙

```ts
// localStorage key: "auto-potion-rules.v1"
type AutoUseTrigger =
  | { kind: "hp_below_pct"; pct: number }; // ex) 30

type AutoPotionRule = {
  enabled: boolean;
  potionId: PotionId;
  trigger: AutoUseTrigger;
};

type AutoPotionConfig = { rules: AutoPotionRule[] };
```

— 1차에는 룰 1개 슬롯으로 시작해도 무방. 데이터 모델은 배열로 둬서 확장 여지.
— 우선순위는 배열 순서(첫 매칭 발동).

---

## 전투 엔진 통합

### PlayerAction 추상화

```ts
// engine.ts
type PlayerAction =
  | { kind: "attack" }
  | { kind: "use_potion"; potionId: PotionId };
```

- `advanceTurn(state, player, name, action?: PlayerAction)` — `action` 기본 `{ kind: "attack" }`
- `use_potion`: 그 턴에는 공격 대신 효과 적용 → phase = `enemy`
- 효과 적용 헬퍼: `applyPotionEffect(state, player, potion)` → 새 `BattleState`
- 엔진은 순수 — 인벤토리 차감은 호출 측(`useBattle`)이 담당

### useBattle — 두 갈래 분기

기존: setTimeout 루프로 player/enemy 자동 진행.

변경:
- `phase === "player"` 일 때:
  - `autoBattle === true` → 셀렉터 결과를 advanceTurn에 주입 후 자동 진행 (기존 인터벌 유지)
  - `autoBattle === false` → **타이머 일시정지**, 사용자 호출 대기. `act(action)` API 노출.
- `phase === "enemy"` 일 때는 기존과 동일하게 자동 진행.

```ts
// hook 시그니처 추가/변경
const { state, start, stop, act } = useBattle({
  player, playerName,
  autoBattle,           // 신규
  pickAutoAction,       // 신규: (state) => PlayerAction
});
```

### 자동 사용 셀렉터

```ts
function pickAutoAction(
  state: BattleState,
  player: PlayerCombat,
  inventory: InventoryState,
  config: AutoPotionConfig,
): PlayerAction {
  for (const rule of config.rules) {
    if (!rule.enabled) continue;
    if ((inventory.potions[rule.potionId] ?? 0) <= 0) continue;
    if (state.playerHp >= player.maxHp) continue; // HP 가득이면 회복 스킵
    if (matchesTrigger(state, player, rule.trigger)) {
      return { kind: "use_potion", potionId: rule.potionId };
    }
  }
  return { kind: "attack" };
}
```

---

## UI 변경

### 1. 캐릭터 탭 — 가방 진입 카드

`내 정보` ↔ `스킬` 사이에 진입 카드 추가:

```
[ 가방 — 보유 1 ]   →  /character/inventory 서브뷰
```

진입 카드 컴포넌트는 기존 `EntryCard` 패턴(모험의 서/스킬과 동일).

### 2. 가방 서브뷰 (`subView === "inventory"`)

- **상단**: 보유 물약 목록 (카드 리스트)
  - 이름 / 설명 / 보유 N개 / `사용` 버튼 (필드 사용은 1차 보류 → 회색 비활성, 추후)
- **하단**: 자동 사용 규칙 설정 섹션
  - 토글 + 물약 선택 + `HP [30]% 이하`
  - 1차에는 룰 1줄(작은 회복약)만 노출. 추후 추가 버튼.

### 3. 마을 상점 (`subView === "shop"`)

현재 placeholder를 진열 UI로 교체:
- 상품 리스트: 작은 회복약 / 12 G / 보유 N개 / `[-] [수량] [+] 구매` 또는 `구매` 버튼
- 보유 골드 표시, 부족 시 비활성
- 구매 → `inventory.add(id, n)` + `setCharacterState(gold -= price * n)`

### 4. 전투 화면 (BattleScene)

- **자동 전투 ON**: 자동 사용 발동 시 로그에 `info` 행 추가 (`작은 회복약을 마셨다 — HP +20`).
- **자동 전투 OFF**: 하단 액션 영역
  - `공격` 버튼 (기본)
  - `물약 ▾` 드롭다운 — 보유 물약 노출, 선택 시 `act({ kind: "use_potion", ... })`
  - 보유 0개면 비활성
- 자동 전투 토글은 기존 위치 유지.

---

## 구현 순서 (단일 PR 내)

1. **데이터/저장**: `potions.ts`, `useInventory`
2. **상점**: 상점 placeholder → 진열 UI + 구매 흐름
3. **가방 서브뷰**: 진입 카드 + 물약 목록 (자동 사용 설정 영역은 비워둠)
4. **엔진 추상화**: `PlayerAction`, `advanceTurn` 분기, `applyPotionEffect`
5. **수동 전투 입력 대기**: `useBattle`에 `act()` 추가, BattleScene 액션 버튼
6. **자동 사용 규칙**: `useAutoPotionConfig`, `pickAutoAction`, 가방 설정 UI 채우기
7. **로그/문구**: 사용 시 BattleLog `info` 메시지

각 단계는 파일 단위로 명확히 분리되어 있어 에러 발생 시 좁은 범위에서 수정 가능.

---

## 미해결 / 결정 필요

- **자동 사용 쿨다운**: 1차는 무제한 (보유량으로만 자연 제한). HP < 30%가 지속되면 매 player phase마다 1개씩 소비됨. 의도한 동작인지 확인 필요.
- **HP < 0 직전 발동 타이밍**: enemy phase에서 치명 피해로 사망 → 그 다음 player phase가 오기 전에 이미 `phase === "ended"`. 즉 **죽기 직전 마지막 턴에는 자동 회복 발동 불가**. 회피하려면 enemy phase 결과 적용 직후 `phase === "ended"`로 가기 전에 자동 사용을 한 번 평가하는 분기가 필요. 1차에는 단순화 — "그 직전 player phase에 발동하지 못하면 죽음"으로 두고, 사용자에게 트리거 임계값을 충분히 높게(40~50%) 설정하라고 가방 UI에 힌트만 표기.
- **수동 전투 적 phase 자동 진행**: 사용자 행동 후 enemy phase는 기존처럼 setTimeout으로 자동 흘러감(0.5s). 사용자가 잠시 화면을 응시할 시간 확보용.
- **이미 만피일 때 수동 사용**: 효과 0이라도 소비되도록? → 차단(버튼 비활성).

---

## 도감 / 메모리 동기화

- `docs/items.md`에 **소비 아이템** 섹션 신설 — 코드 추가 시 함께 갱신 (기존 메모리 규칙과 일치).
- 기존 메모리 `feedback_items_doc.md` 의 적용 범위가 소비 아이템에도 포함되는지 확인 후 필요 시 업데이트.
