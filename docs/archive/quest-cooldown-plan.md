# 반복 의뢰 쿨다운 기획

> 상태: ✅ **구현 완료** — 반복 의뢰 쿨다운 출고. 이 문서는 설계 기록.

> 길드 반복 의뢰의 보상 수령 후 일정 시간(기본 12h) 동안 재수주를 막아 의뢰의 가치를 유지하고, 무한 파밍 루프를 끊는다.

---

## 목표

- 반복 의뢰(`repeatable: true`) 는 **보상 수령 직후 바로 다시 받을 수 없다**.
- 쿨다운 동안 의뢰 카드에 **남은 시간을 표시** (분 단위 정밀도면 충분).
- 쿨다운이 끝나면 별도 입력 없이 자동으로 다시 수주 가능 상태가 된다.
- 쿨다운 기본값은 **12시간**, 추후 의뢰별 차등 가능하도록 설계.
- 비반복 의뢰 / NPC 전속 의뢰(`giverNpcId`) 는 영향 없음.

## 비목표

- 의뢰별 개별 쿨다운 값 부여 — 1차에선 모든 반복 의뢰에 12h 동일 적용 (override 자리만 마련).
- 쿨다운 종료 알림 — 후속 검토 (현재 알림 시스템에 노이즈 늘리지 않기 위해 보류).
- 시간 단축 아이템/스킬 — 후속.
- 게시판 정렬 변경(쿨다운 짧은 순 정렬 등) — 후속.

---

## 사용자 시나리오

**케이스 A — 반복 의뢰 완료 직후**
1. "마을의 거지들" 의뢰를 끝내고 길드에서 보상을 받는다.
2. 같은 카드 버튼이 즉시 "수주하기" 가 아닌 **"재의뢰 11:59:42"** 같은 카운트다운으로 바뀐다.
3. 12시간이 지나면 자동으로 "수주하기" 로 전환되고 다시 받을 수 있다.

**케이스 B — 페이지를 끄고 다시 켰을 때**
1. 보상 수령 시각이 `lastCompletedAt` 으로 영속.
2. 다음 방문 시 (예: 8시간 후) 카드는 "재의뢰 03:59:53" 으로 시작.
3. 4시간 더 지나면 활성화.

**케이스 C — 비반복 의뢰**
1. "훈련 — 슬라임 5마리" 같은 NPC 전속 비반복 의뢰는 보상 수령 후 `completed` 상태 유지.
2. 쿨다운 표기 없음 (기존 동작과 동일).

---

## 데이터 모델 변경

### `Quest` 타입에 옵션 필드 추가 (`src/adventure/data/quests.ts`)

```ts
export type Quest = {
  // ... 기존 필드
  repeatable: boolean;
  // 반복 의뢰의 재수주 쿨다운(ms). 미지정 시 REPEAT_COOLDOWN_MS_DEFAULT 사용.
  // repeatable=false 인 경우 의미 없음 — 무시.
  cooldownMs?: number;
};

export const REPEAT_COOLDOWN_MS_DEFAULT = 12 * 60 * 60 * 1000;
```

상수는 quests.ts 에 같이 두는 게 자연스러움 (퀘스트 도메인 상수). 추후 밸런싱 파일이 따로 생기면 옮김.

### `QuestProgressEntry` 변경 — **없음**

- `lastCompletedAt: number | undefined` 가 이미 `claim()` 에서 갱신됨.
- 새 상태를 storage 에 저장하지 않음 — **쿨다운은 derived state**.
- 따라서 마이그레이션 불필요, `quest-progress.v1` 스토리지 키 그대로 유지.

### 새 helper — `src/adventure/quests/cooldown.ts`

```ts
import { REPEAT_COOLDOWN_MS_DEFAULT, type Quest } from "../data/quests";
import type { QuestProgressEntry } from "./storage";

// 반복 의뢰의 재수주 가능 시각(ms). 비반복/한 번도 안 끝낸 경우 null.
export function cooldownReadyAt(
  quest: Quest,
  entry: QuestProgressEntry,
): number | null {
  if (!quest.repeatable) return null;
  if (entry.lastCompletedAt == null) return null;
  const dur = quest.cooldownMs ?? REPEAT_COOLDOWN_MS_DEFAULT;
  return entry.lastCompletedAt + dur;
}

// 현재 시각 기준으로 쿨다운 중인지 + 남은 시간(ms).
export function cooldownStatus(
  quest: Quest,
  entry: QuestProgressEntry,
  now: number,
): { onCooldown: boolean; remaining: number } {
  const ready = cooldownReadyAt(quest, entry);
  if (ready == null) return { onCooldown: false, remaining: 0 };
  const remaining = ready - now;
  return remaining > 0
    ? { onCooldown: true, remaining }
    : { onCooldown: false, remaining: 0 };
}
```

---

## 상태 전환 로직

### `useQuests.accept()`

`accept` 는 현재 `state === "available"` 만 통과시킴. 쿨다운 중인 의뢰도 `state === "available"` 로 남으므로, **여기서 추가로 쿨다운 검사**를 추가:

```ts
const accept = useCallback((id: string) => {
  const cur = progressRef.current;
  const entry = cur[id] ?? defaultQuestEntry();
  if (entry.state !== "available") return;
  const quest = getQuestById(id);
  if (!quest) return;
  if (cooldownStatus(quest, entry, Date.now()).onCooldown) return;
  // ... 기존 active 전환 로직
}, []);
```

UI 가 게이트하지만 **이중 안전망**으로 hook 단에서도 거부.

### `useQuests.claim()`

변경 없음. `lastCompletedAt = Date.now()` 갱신은 이미 됨. `state` 는 그대로 `repeatable ? "available" : "completed"`.

### state 의미 정리

| 저장된 state | UI 가 표시할 effective 상태 |
|---|---|
| `available`, `lastCompletedAt` 없음 | "수주하기" |
| `available`, `lastCompletedAt` 있음, 쿨다운 중 | "재의뢰 HH:MM:SS" (비활성) |
| `available`, `lastCompletedAt` 있음, 쿨다운 끝 | "수주하기" |
| `active` | "진행 중 N/M" |
| `ready` | "보상 받기" |
| `completed` | "완료" (비반복만 도달) |

---

## UI 변경 (`GuildView.tsx`)

### 카드 액션 라벨 분기 추가

`QuestCard` 의 `entry.state === "available"` 분기를 쿨다운 검사로 분할:

```tsx
if (entry.state === "available") {
  const cd = cooldownStatus(quest, entry, now);
  if (cd.onCooldown) {
    actionLabel = `재의뢰 ${formatDuration(cd.remaining)}`;
    actionDisabled = true;
    actionVariant = "default";
  } else if (!meetsLevel) {
    actionLabel = `Lv.${quest.requiredLevel} 필요`;
    actionDisabled = true;
  } else {
    actionLabel = "수주하기";
    actionHandler = onAccept;
  }
}
```

### 카운트다운 tick

`GuildView` 내부에서 `now` state + 60초 interval. 쿨다운 중인 카드가 하나라도 있을 때만 interval 가동 (training 의 패턴과 동일).

```tsx
const [now, setNow] = useState(() => Date.now());
const anyOnCooldown = quests.some((q) => {
  const e = getEntry(q.id);
  return cooldownStatus(q, e, now).onCooldown;
});
useEffect(() => {
  if (!anyOnCooldown) return;
  const id = setInterval(() => setNow(Date.now()), 60_000);
  return () => clearInterval(id);
}, [anyOnCooldown]);
```

- **분 단위(60s) tick** 으로 충분 — HH:MM 까지만 표시. 초 단위 표시는 시각적 노이즈만 늘림.
- 쿨다운이 0 에 도달하는 순간 다음 tick 에서 라벨이 자동 갱신됨 (최대 60초 지연 허용).

### "반복" 뱃지 옆 보조 라벨 (선택)

쿨다운 중일 때 "반복" 뱃지 옆에 `🕒 12h` 같은 작은 텍스트 추가. 의뢰 카드가 "왜 비활성인지" 한눈에 보이게. — **v1 에서는 버튼 라벨로 충분히 전달되므로 생략, 후속 검토.**

---

## 엣지 케이스

| 케이스 | 처리 |
|---|---|
| 시계가 뒤로 간 경우 (`now < lastCompletedAt`) | `remaining > 0` 으로 평가됨 → 비활성 유지. 결과적으로 "곧 가능" 까지 시간이 더 걸리는 것으로 보임. 별도 처리 안 함. |
| 사용자가 시계를 앞으로 돌리는 경우 | 자연스럽게 `remaining ≤ 0` → 즉시 활성화. 클라이언트 게임이라 허용. |
| `cooldownMs: 0` 명시적 지정 | `remaining = lastCompletedAt - now ≤ 0` → 즉시 가능. 쿨다운 끄는 escape hatch. |
| 길드 화면이 닫혀 있는 동안 쿨다운 종료 | 다시 열 때 첫 렌더에서 `now = Date.now()` 로 초기화 → 자연 활성화. |
| 페이지 첫 로드 시 (`now` 가 SSR 0 일 가능성) | `useState(() => Date.now())` 로 클라이언트 마운트 시 초기화. SSR 차이는 hydration 직후 한 틱이라 무시 가능. |

---

## 마이그레이션

- 스토리지 스키마 변경 없음. 기존 세이브에 영향 없음.
- 기존 사용자가 보상을 받은 직후 게임을 다시 켜면, `lastCompletedAt` 이 이미 있어 **소급 적용**됨. 보상 직후라면 12h 대기, 한참 전이라면 즉시 가능 — 자연스러운 동작.
- 만약 출시 시 "초기 1회는 쿨다운 없음" 으로 가고 싶다면, 마이그레이션에서 모든 entry 의 `lastCompletedAt` 을 지우는 옵션 — **현재 계획에선 채택 안 함** (불필요한 복잡도).

---

## 테스트 시나리오

1. 반복 의뢰 받기 → 진행 → 보상 받기 → 카드가 "재의뢰 11:59" 로 바뀌는지.
2. 시스템 시계를 12시간 앞으로 → 새로고침 → "수주하기" 로 활성화 확인.
3. 쿨다운 중 다른 반복 의뢰는 영향 없는지 (독립 카운트).
4. 비반복 의뢰("훈련 — 슬라임 5마리") 는 쿨다운 표기 없이 기존대로 `completed` 표시.
5. NPC 다이얼로그 의뢰 (`giverNpcId` 있는 의뢰) 는 길드 게시판에 안 뜨므로 영향 없음 — 회귀 없는지 확인.
6. 길드를 빠져나갔다가 다시 들어와도 쿨다운 표시 정상 (새 마운트에서 `now` 재계산).
7. 길드 화면이 열려 있는 채 60초 이상 대기 → 카운트다운 1분 줄어드는지.

---

## 후속 (이번 PR 범위 밖)

- **차등 쿨다운**: 보스급/명성 보상 큰 의뢰는 24h, 잡몹은 6h 식.
- **쿨다운 종료 알림**: notification 으로 "재의뢰 가능: 마을의 거지들" — 알림 다발 회피용 설정 토글 같이.
- **단축 아이템**: 길드 토큰으로 쿨다운 즉시 해제.
- **게시판 정렬**: 쿨다운 짧은 순 / 곧 가능한 순 정렬 옵션.
- **NPC 전속 반복 의뢰**: 현재 데이터엔 없지만, 구조상 같은 helper 로 처리 가능 (대화 측에서 cooldownStatus 호출).

---

## 작업 순서 (PR 기준)

1. `quests.ts` — `cooldownMs?` 필드, `REPEAT_COOLDOWN_MS_DEFAULT` 추가.
2. `quests/cooldown.ts` — helper 함수.
3. `useQuests.accept()` — 쿨다운 가드 추가.
4. `GuildView.tsx` — `now` tick + 라벨 분기.
5. `docs/features.md` — 길드 항목에 한 줄 추가 ("반복 의뢰는 12h 쿨다운").
6. 회귀 확인 (위 테스트 시나리오 1~7).
