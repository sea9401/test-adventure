# 전투 자동 단일화 계획 (수동 모드 제거)

> 상태: ✅ **구현 완료** — 전투 자동 단일화(수동 모드 제거) 적용 완료. 이 문서는 설계 기록.

> 자동/수동 토글을 없애고 **모든 전투를 자동으로 진행**한다.
> 수동 모드는 본질적으로 매크로화되기 쉬워 의도된 게임 경험이 아님 —
> "관전 + 자동 포션 룰"로 통일.

## 동기

- 수동 사냥은 결국 단순 반복(공격 버튼 연타)으로 귀결. 매크로 사용 유인을
  코드 차원에서 제거.
- 자동/수동 분기 유지 비용 — `BattleScene`의 `ManualAction`, `BattleView`의
  ON/OFF 버튼, `useAutoBattle` 훅, 패배 시 자동 OFF 강제, "자동 전투 ON일 때만"
  자동 확인/체인 — 모든 분기가 토글에 묶여 있어 의도한 단일 흐름을 흐림.
- 자동포션 룰 시스템(이미 도입됨)이 자동 전투 전제 위에서만 의미 있음.
  토글이 OFF인 동안엔 룰이 무의미하게 노출되는 모순.

## 비목표

- "도망" 액션 도입 — 별개 기능. 이번에 추가하지 않음.
- 턴 간격 조절 UI — 별개.
- 자동포션 룰 자체의 변경 — 유지(설정 위치만 자연스러워짐).

---

## 결정된 동작

전투 입장부터 종료까지 한 가지 흐름:

1. 적 풀(`region.enemies`)에서 랜덤 1마리 선택 → 전투 시작.
2. 매 턴 0.5초 간격 자동 진행 — 플레이어는 관전.
3. 플레이어 턴엔 자동포션 룰 평가 후 액션 결정(`pickAutoAction`):
   - 룰이 트리거되고 해당 카테고리 포션이 있으면 사용.
   - 그 외엔 공격.
4. 어느 한 쪽 HP ≤ 0 → 종료.
5. **승리** — 결과 1.2s 자동 표시 → 같은 지역에서 다음 적과 새 전투 자동 시작
   (체이닝). HP는 직전 finalHp 그대로 이어받음.
6. **패배** — 시작 마을로 복귀 + HP 풀 회복. 다음 전투는 사용자가 다시
   진입할 때까지 시작되지 않음.

전투 진입 액션:
- `[전투 시작]` 단일 버튼. ON/OFF 토글 없음.
- 누르면 위 흐름이 알아서 굴러감. 종료/이탈은 서브뷰 뒤로 가기로.

---

## 영향 받는 코드 (정리)

### 삭제

- `src/adventure/battle/useAutoBattle.ts` — 훅 통째로 제거.
- `src/lib/storage-keys.ts:9` — `BATTLE_SETTINGS_KEY` 상수 제거.
- `localStorage` 키 `battle-settings.v1` — 더이상 쓰지 않음.
  - 어드민 `storage-bundle.ts` 의 `battleSettings` 항목·매핑 제거.
  - 기존 사용자 키는 자연 사장 — 별도 마이그레이션 코드는 두지 않음
    (값이 무엇이든 동작 동일).
- `BattleScene.tsx`
  - `ManualAction` 타입 export 제거.
  - `ManualActionBar` 컴포넌트 제거.
  - `manual?: ManualAction` prop 제거 — `state`/`playerName` 만 받음.
  - `showActions` 분기 제거 (항상 행동바 없음).
- `BattleView.tsx`
  - props 에서 `autoBattle`, `onAutoBattleChange` 제거.
  - 진입 화면의 "자동 전투 ON/OFF" 토글 버튼 제거. "전투 시작" 1개만.
  - "전투 시작" 버튼 색상 분기(autoBattle ON일 때 emerald) 제거 — 단일 스타일.
  - 진입 화면 안내 문구 단순화 ("자동 전투 시작" → "전투 시작").
  - 전투 중 manual prop 생성 블록 제거.
  - `BattleResult.autoConfirm` 호출은 `state.outcome === "win"` 조건만으로 단순화
    (autoBattle 항상 true 가정).
- `BattleResult.tsx`
  - `autoConfirm` prop 제거 — 승리 시엔 항상 자동 진행.
  - "확인" 버튼 라벨도 승리 시엔 표시 자체를 숨길지(조용히 진행) 결정.
    잠정안: 패배 시에만 "확인" 버튼 노출, 승리 시엔 "다음 적 준비..." 정도.

### 수정

- `BattleView.tsx` — 자동 행동 결정 effect, 종료 시 체이닝 effect, 자동 확인
  타이머 effect 모두 `if (!autoBattle) return;` 가드 제거.
- `app/page.tsx`
  - `useAutoBattle` import 제거.
  - `const { autoBattle, setAutoBattle } = useAutoBattle(...)` 제거.
  - 패배 처리(`handleBattleEnd` 안의 `setAutoBattle(false)`) 제거.
  - `<BattleView .../>` 에 `autoBattle`/`onAutoBattleChange` 안 넘김.
- `docs/battle-system-plan.md` — "자동 반복 토글" 항목을 "체이닝 기본 동작"으로
  표현 갱신. v1 문구가 토글 전제로 쓰여 있어 일관성 정리 필요.
  (계획서 정리, 코드와 무관.)

### 유지

- `engine.ts` — 데미지 공식, 턴 진행 로직은 변경 없음.
- `useBattle.ts` — `start/stop/act` 인터페이스 그대로. 변화 없음.
- `pickAutoAction.ts` — 그대로. 입력으로 받는 룰/포션은 동일.
- `useAutoPotionConfig` — 그대로. 노출 위치(`AutoPotionSection` in
  진입 화면)도 유지. 단지 "전투 중 자동 포션 사용 룰" 이라는 의미는 더 명확해짐.
- 패배 처리(시작 마을 복귀 + HP 풀회복) — 그대로.
- 어드민 `storage-bundle` 의 다른 키들·탭들 — 그대로.

---

## 전후 흐름 비교

| 시점 | 변경 전 | 변경 후 |
|---|---|---|
| 진입 화면 | "자동 전투 ON/OFF" 토글 + "전투 시작/자동 전투 시작" | "전투 시작" 1개 |
| 전투 중 | autoBattle ON: 자동 진행 / OFF: 공격·포션 버튼 표시 | 항상 자동 진행, 행동 버튼 없음 |
| 승리 후 | autoBattle ON: 1.2s 후 다음 적 자동 / OFF: "확인" 클릭 → 종료 | 항상 1.2s 후 다음 적 자동 |
| 패배 후 | autoBattle ON 강제 OFF + 마을 복귀 | 마을 복귀(자동 OFF 처리 사라짐) |
| 지역 이동 | autoBattle 강제 OFF (`useAutoBattle` 내부) | 처리 자체 불필요 (상태 없음) |
| 저장 | `battle-settings.v1` 키에 `{ auto: bool }` | 키 사용 안 함 |

---

## 마이그레이션 / 호환

- 기존 사용자 데이터: `battle-settings.v1` 키는 그대로 남아 있어도 무해.
  코드에서 읽지 않으므로 영향 없음. 어드민 "전체 초기화" 시 일괄 정리됨.
  필요하다면 `useAutoPotionConfig` 류처럼 부팅 시 `localStorage.removeItem`
  한 번 호출하는 정리 코드도 가능하지만 필수는 아님.
- 어드민 `storage-bundle.ts` 의 `STORAGE_KEYS.battleSettings`,
  `BattleSettings` 타입, `loadBundle/applyBundle` 의 해당 항목 제거.
  → 백업 JSON 의 `data.battleSettings` 필드는 schemaVersion 1 의 선택 필드라
  과거 백업 파일을 import 해도 알 수 없는 키로 무시됨(현재 구현이 누락 키 허용).
  스키마는 호환 유지.
- 어드민 데이터 탭에서 노출되던 적/전투 정보는 그대로.

---

## 단계 (단일 PR 권장 — 작업량 1~2시간)

1. **삭제 + 토글 제거** (가장 큰 변경)
   - `BattleView.tsx` 진입 화면 토글 버튼, 전투 중 manual prop, autoConfirm 분기 정리.
   - `BattleScene.tsx` `ManualAction` / `ManualActionBar` 제거.
   - `BattleResult.tsx` `autoConfirm` prop 제거 + 라벨 정리.
2. **외부 사용처 정리**
   - `app/page.tsx` 의 `useAutoBattle` 호출, `setAutoBattle(false)` 패배 처리,
     `<BattleView>` props 제거.
   - `useAutoBattle.ts` 파일 삭제.
3. **저장 키 정리**
   - `lib/storage-keys.ts:9` 의 `BATTLE_SETTINGS_KEY` 제거.
   - `admin/storage-bundle.ts` 에서 `battleSettings` 관련 제거.
4. **검증**
   - `npm run build` / `npx tsc --noEmit` / `npx eslint`.
   - 수기 테스트: 진입 화면 → 전투 시작 → 자동 진행 → 승리 체이닝 →
     패배 시 마을 복귀 → 자동포션 룰 활성화 시 사용 여부.
5. **문서 갱신**
   - `docs/battle-system-plan.md` 의 토글 관련 문구를 "기본 자동, 토글 없음"
     으로 정리 (별도 커밋이어도 무방).

---

## 열린 질문

- **승리 결과 화면 자체를 더 짧게/없앨까?**
  현재 1.2s 자동 → "관전성"의 일부. 그대로 둘 수 있음.
  체감 속도가 너무 굼뜨면 0.6s로 줄이거나, 한 줄 토스트로 대체 검토.
- **전투 도중 "이탈"** — 서브뷰 뒤로 가기로 BattleView unmount 시 전투
  state는 사라지지만, HP 손실은 캐릭터 상태에 반영되지 않음(현재도 동일).
  자동 단일화 후엔 의도적으로 도망가는 유저 경로가 더 부각될 수 있어, 도망
  버튼 도입을 별도 안건으로 제안할 가치가 있음 (이 PR 범위 밖).
- **자동포션 룰 노출 위치** — 진입 화면 하단 그대로 둘지, 캐릭터/인벤토리
  탭으로 옮길지. 현재 위치가 자연스러우므로 잠정 유지.
