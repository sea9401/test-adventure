# 모듈화 개선 계획

> 상태: ✅ **구현 완료** — 데이터 파일 모듈화(#485~#488). `<TabbedPaginatedView>` 래퍼 1건만 보류.

코드베이스가 커지면서 단일 파일에 책임이 누적된 곳이 보인다. 이 문서는 **어떤 파일을 어떻게 쪼갤지**, **공통 패턴을 어디로 추출할지** 정리한 우선순위 작업 목록이다. 기능 변경 없이 구조만 개선하는 리팩터링이며, 한 번에 다 하지 말고 우선순위대로 PR을 분리한다.

> 측정 기준: 2026-05-11 기준 `wc -l` 라인 수. 전체 38,729 lines.

---

## 1. 큰 파일 (Top 10)

| # | 파일 | 라인 | 핵심 문제 | 우선순위 |
|---|------|------|----------|---------|
| 1 | `src/app/page.tsx` | 1,271 | 게임 셸 + 사냥 + 시련 + 오프라인 시뮬 + 스탯 파이프라인이 한 파일 | **HIGH** |
| 2 | `src/adventure/AdventureLogView.tsx` | 1,177 | 6+ 탭 패널 (몬스터/아이템/NPC/마을/칭호/etc) + 중첩 서브탭 | **HIGH** |
| 3 | `src/adventure/guild/GuildHallView.tsx` | 809 | 멤버/퀘스트/생성/역할이양/설명편집/추방을 한 컴포넌트가 다 처리 | MEDIUM |
| 4 | `src/admin/tabs/UsersTab.tsx` | 714 | 유저 검색 + 상세 편집기 + 저장 데이터 편집이 단일 파일 | MEDIUM |
| 5 | `src/adventure/battle/engine.ts` | 598 | 도메인 로직, 잘 격리되어 있음 — **유지** | — |
| 6 | `src/adventure/ShopView.tsx` | 518 | Buy/Sell 탭 × 3+ 서브 카테고리 | MEDIUM |
| 7 | `src/adventure/AdventureScreen.tsx` | 513 | 지역 선택 + 적 인카운터 + 오토배틀 | MEDIUM |
| 8 | `src/app/api/marketplace/listings/route.ts` | 498 | 마켓 API 핸들러, GET/POST/PUT/DELETE 한 파일 | LOW |
| 9 | `src/adventure/character/skills.ts` | 453 | 순수 함수만, 잘 짜여 있음 — **유지** | — |
| 10 | `src/adventure/marketplace/InboxView.tsx` | 439 | 받은편지/보낸편지/거래내역 탭 | LOW |

---

## 2. 우선순위 작업

### 2.1 `app/page.tsx` 분해 (HIGH)

**현 상태**: 1,271 lines. `page.tsx` 가 라우팅 + 게임 상태 오케스트레이션 + 사냥/시련 상태머신 + 오프라인 시뮬 코디네이션 + 파생 스탯 계산을 모두 인라인으로 처리.

**제안**:
- `src/adventure/hunting/useHuntingState.ts` — 사냥 모드 상태머신 (현재 page.tsx 내부 useState 묶음).
- `src/adventure/trial/useTrialState.ts` — 시련 진행/보상/완료 상태.
- `src/adventure/character/useDerivedStats.ts` — 장비/스킬/물약 보너스 합산 파이프라인.
- `src/adventure/battle/useOfflineSimCoordinator.ts` — page.tsx 에 남은 오프라인 시뮬 부착 로직 (이미 `useOfflineSimulation` 이 있다면 그 위 얇은 코디네이터).
- `page.tsx` 는 라우팅 + 위 훅들 조합만 담당 (~300 lines 목표).

**검증**: 기능 변화 없음을 보이려면 page.tsx 의 props/effect 의존성 그래프를 그대로 유지. 게임 로딩 → 사냥 1회 → 시련 1회 → 오프라인 30분 시뮬을 수동 회귀.

### 2.2 `AdventureLogView.tsx` 분해 (HIGH)

**현 상태**: 1,177 lines. 모험 로그 탭이 6개 (몬스터/아이템/NPC/마을/칭호/etc) + 일부는 서브탭까지. 각 탭이 각자의 reveal threshold, diff 계산, 페이지네이션을 가지고 있음.

**제안**: `src/adventure/log/` 하위로 옮기고 탭별 파일 분리.
```
src/adventure/log/
  AdventureLogView.tsx       # 탭 라우터만 (~150 lines)
  tabs/MonstersTab.tsx
  tabs/ItemsTab.tsx
  tabs/NpcsTab.tsx
  tabs/TownsTab.tsx
  tabs/TitlesTab.tsx
  tabs/EtcTab.tsx
  shared/revealThresholds.ts # reveal 로직 공용 추출
```

> 메모리에서 — sub-view navigation 패턴은 이미 합의됨. 풀다운 대신 EntryCard → 화면 전환 유지.

### 2.3 `GuildHallView.tsx` 분해 (MEDIUM)

**현 상태**: 809 lines. 길드 멤버 패널 + 퀘스트 패널 + 길드 생성 폼 + 역할 이양 모달 + 설명 편집 + 추방 로직.

**제안**:
- `guild/GuildHallView.tsx` — 라우팅/탭만.
- `guild/GuildCreateForm.tsx` — 길드 없을 때의 생성 UI.
- `guild/GuildMembersPanel.tsx` — 멤버 리스트 + 초대/추방/역할이양.
- `guild/GuildSettingsPanel.tsx` — 설명/공지 편집.
- `guild/GuildQuestsPanel.tsx` (존재한다면 거기로 흡수, 없으면 신규).

### 2.4 `admin/tabs/UsersTab.tsx` 분해 (MEDIUM)

**현 상태**: 714 lines. 유저 검색 + 상세 패널 + 캐릭터/인벤토리/세이브/훈련 데이터 폼이 모두 같이.

**제안**:
- `admin/tabs/users/UsersTab.tsx` — 검색 + 선택 라우팅.
- `admin/tabs/users/UserSearchPanel.tsx`
- `admin/tabs/users/UserDetailPanel.tsx` (선택된 유저 컨테이너)
- `admin/tabs/users/forms/{CharacterForm,InventoryForm,SaveForm,TrainingForm}.tsx`

### 2.5 `ShopView.tsx` / `InventoryView.tsx` / `AdventureScreen.tsx` (MEDIUM)

세 파일 모두 동일한 패턴: **탭 + 페이지네이션 + 카테고리 필터**. 2.6 의 공통 추출과 함께 진행.

- `shop/ShopView.tsx` (라우팅) + `shop/tabs/BuyTab.tsx` + `shop/tabs/SellTab.tsx`.
- `inventory/InventoryView.tsx` + `inventory/tabs/{Equipment,Materials,Potions,Consumables}Tab.tsx`.
- `AdventureScreen.tsx` 에서 `EnemySelector`, `RegionBrowser` 분리.

---

## 3. 공통 패턴 추출 (Cross-cutting)

### 3.1 `useAsyncData<T>` 훅

**중복 위치**: `GuildHallView`, `marketplace/InboxView`, `marketplace/ListingsView`, `BulletinBoardView`, `admin/tabs/UsersTab` 등 5+ 곳.

**현재 반복되는 코드**:
```ts
const [data, setData] = useState<T | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const refetch = useCallback(async () => { try { ... } catch { ... } }, [...]);
useEffect(() => { refetch(); }, [refetch]);
```

**제안**: `src/lib/hooks/useAsyncData.ts` 한 곳에서 처리. 컴포넌트당 ~30 lines 절감.

### 3.2 `<TabbedPaginatedView>` 래퍼 (선택)

**중복 위치**: `ShopView`, `InventoryView`, `AdventureLogView`, `marketplace/ListingsView`, `BulletinBoardView`, `marketplace/InboxView`.

각자 `TabBar` 선택 상태 + `usePagination` 호출 + 빈 리스트 처리를 재구현. 공통 wrapper 로 묶을 수 있으나 — **주의**: 탭별 UI 가 충분히 달라서 추상화가 누수되기 쉽다. 먼저 `useAsyncData` 추출만 해보고, 그 다음에 진짜 형태가 같은지 다시 판단.

### 3.3 모달 폼 패턴 (관망)

`ListingCreateModal`, `NameSetupModal`, `NotificationPrefsModal` 모두 비슷한 validation/onSubmit/error 패턴. 단, 현재 3개뿐 — **추상화 비용 > 이득**. 다섯 번째 모달이 나오면 다시 보기.

---

## 4. 손대지 말 것 (이미 잘 모듈화됨)

- `src/adventure/battle/` — engine/scene/result/useOfflineSimulation 깔끔히 분리됨.
- `src/adventure/data/` — items.ts, monsters.ts, quests.ts, recipes.ts, world.ts 모두 정적 데이터 export. 400 lines 넘으면 카테고리별 분할 고려.
- `src/adventure/character/skills.ts` — 순수 함수 모음, 카테고리별로 잘 묶여 있음.
- `src/db/` + `src/lib/storage/` — 스키마와 동기화 로직 격리.
- `src/components/ui/` — atomic.

---

## 5. 실행 순서 제안

리팩터링 PR 은 한 주제씩 분리한다 (커밋 분리 원칙).

1. **PR 1** — `useAsyncData` 훅 추출 + 5개 컴포넌트 마이그레이션. (라인 감소 +400, 위험 낮음)
2. **PR 2** — `AdventureLogView` 탭별 파일 분리. (가장 큰 윈, 라우터/탭 패턴 확립)
3. **PR 3** — `app/page.tsx` 의 `useHuntingState` / `useTrialState` / `useDerivedStats` 훅 추출.
4. **PR 4** — `GuildHallView` 분해.
5. **PR 5** — `ShopView` / `InventoryView` 탭별 파일 분리.
6. **PR 6** — `UsersTab` 분해.
7. **(보류)** `<TabbedPaginatedView>` 래퍼는 PR 2/5 이후 진짜 같은 모양인지 보고 결정.

각 PR 은 **기능 변화 0** 을 목표로 하고, 회귀 체크리스트(해당 화면의 골든 패스 1회 + 엣지 케이스 1개)를 PR description 에 첨부한다.

---

## 6. 측정 지표

리팩터링 후 기대치:
- `app/page.tsx` 1,271 → ~300 lines
- `AdventureLogView.tsx` 1,177 → ~150 lines (+ 탭당 ~200 lines × 6 파일)
- 600 lines 넘는 컴포넌트 파일 0개 (engine.ts 같은 도메인 모듈 제외)
- 라우트 핸들러 외 단일 파일 800 lines 초과 금지를 ESLint `max-lines` 로 가드 (옵션, 점진 도입)
