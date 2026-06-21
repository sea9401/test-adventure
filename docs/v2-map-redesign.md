# v2 지도 전면 재설계 (B안: 급진 단순화)

상태: **설계 확정 · 미구현** (2026-06-21)
오너 위임: "지도 싹 갈아엎어도 된다 — 가시성·거점 위치·이름·왕국 5개 전부 바뀌어도 됨."

## 0. 한 줄 요약

40거점 좌표 대륙(Gabriel 그래프 인접 + 안개 + 워프 + 5왕국 색/귀속/수비력거리)을
**~20노드 영토 보드(자유이동 · 안개 폐기 · 왕국 메커닉 폐기 · 전쟁 단일전장 유지 · 정착지 보존)** 로 단순화한다.
좌표는 렌더링 레이아웃으로만 쓰고, 더는 게임 규칙(인접/귀속/수비력)을 결정하지 않는다.

## 1. 왜

- **규모 불일치**: 활성 유저 ~12-18명인데 40거점 · Gabriel 그래프 · 안개 · 워프 · 5왕국 · 수비력 거리계산까지 깔려 있다. 실제 전쟁은 카스트라 1곳(`WAR_ACTIVE_OUTPOST_COUNT=1`)에서만 일어난다.
- **5왕국이 장식**: 색 · NPC 라벨 · 수비력 게이트 기준으로만 쓰이고, 플레이어가 왕국을 선택·경쟁하지 않는다.
- **좌표가 규칙을 결정**: 거점 위치(`position{x,y}`)가 Gabriel 인접 그래프 · 최근접 왕국 귀속 · 수비력 선형감소를 전부 파생한다. 디자인 의도가 기하 알고리즘 뒤에 숨는다.
- **안개의 장기 가치 부재**: 신규 온보딩 속도조절 외엔 탐험 콘텐츠가 아니다. PvP 영토 게임은 판이 보여야 참여가 산다.

## 2. 확정 결정 (오너 승인)

| 항목 | 결정 |
| --- | --- |
| 노드 수 | 40 → **~20** (허브 1 + 전장 1 + 영토 ~18) |
| 좌표 | 렌더링 레이아웃 전용. 규칙 결정 금지 ("좌표는 그림, 규칙 아님") |
| 이동 | **자유이동** — 아무 노드 클릭 + 골드. 인접/워프/길찾기 폐기 |
| 안개 | **완전 폐기** — 처음부터 전 노드 보임 |
| 왕국 | **메커닉 폐기** — 색/귀속/수비력거리 제거. 지역 테마 플레이버만 |
| 수비력 게이트 | 왕국거리 기반 → **티어별 정적값** |
| 전쟁 | 카스트라 단일전장 유지 (`WAR_ACTIVE_OUTPOST_COUNT=1`) |
| 정착지 | 보존 (`outpost_villages` · 생산/수확/업글 그대로) |
| 거점 ID | **유지** (DB가 `outpost_id` 문자열 참조). 표시 이름만 자유 변경 |

## 3. 라이브 데이터 현황 (운영 DB, 2026-06-21 조회)

> 운영 = `~/adventure-rpg` (msmsge.com:3000). 이 repo `main` push → deploy.yml → 운영 배포.
> `~/adventure-rpg-test`(test.msmsge.com)는 폐기된 옛 staging.

**점령 (`outpost_occupations`, 9행)** — 활성 영토 길드 2곳(길드1·길드4):

| outpost_id | 길드 | 현재 데이터에 존재? |
| --- | --- | --- |
| war_central_fort | 1 | ✅ (전장) |
| war_central_tower | 1 | ✅ |
| war_central_mine | 1 | ✅ |
| outpost_plain_square | 1 | ✅ |
| war_south_mine | 4 | ✅ |
| outpost_central_post | 4 | ✅ |
| village_crossroads_s | 4 | ✅ |
| outpost_south_tower_2 | 4 | ⚠️ **고아** (현 40노드에 없음) |
| village_orchard | 4 | ⚠️ **고아** |

**정착지 (`outpost_villages`, 3행)** — 전부 길드1, 중앙 클러스터:
outpost_plain_square(노원역) · war_central_fort(건대입구역) · war_central_tower(먹골역).

**금고 (`outpost_treasury`, gold>0, 18행)** — 살아있는 ID 중 유의미한 잔액:
neutral_haven_central(**19.0M**, 허브) · city_river_haven(1.14M) · kingdom_blackforge(636k) · city_ironpeak(208k) · city_silverleaf(186k) · outpost(여러) · …
⚠️ **고아 금고**: village_meadow_edge(**4.13M**) · village_river_bend(363k) · outpost_west_mine(136k) · village_forest_clearing · village_north_pass · village_north_pathway · village_reedside — 현 40노드에 없는 ID에 골드가 묶여 있음(옛 96→40 축소의 잔재, 기존 이슈).

### 핵심 시사점

- **고아 점령/금고 행은 이미 라이브에 존재하고 무해**(렌더 안 됨 · `OUTPOST_BY_ID` 미스 · 노드는 정적데이터라 FK 없음). → 노드 삭제 안전성 입증. 삭제 노드의 점령행은 inert가 되고 그 길드는 조용히 영토를 잃을 뿐, 크래시 없음.
- **단, 삭제 노드의 금고 골드는 묶인다**(village_meadow_edge 4.13M처럼). 이건 기존에도 발생한 현상이며 본 작업의 회귀가 아니다. 묶인 골드 복구는 오너가 관리자 지급으로 처리(예방 패치 범위 외).

## 4. 목표 노드 집합 (~20 제안)

**강제 생존 (라이브 데이터 보존 — 삭제 금지):**

- 허브: `neutral_haven_central` (리베라, 19M 금고)
- 전쟁 쟁탈 풀 8 (warOutposts.ts, "제거 금지"): `war_central_fort` · `war_central_tower` · `war_central_mine` · `war_south_mine` · `outpost_central_post` · `outpost_plain_square` · `outpost_plain_fort` · `outpost_plain_tower`
- 풀 밖 라이브 점령: `village_crossroads_s` (길드4)

→ **강제 10개.** (정착지 3곳은 위에 포함됨.)

**선택 생존 (금고 골드 claimable 유지 + 테마 다양성) — ~10개:**

- 금고 보유 도시/수도: `city_river_haven`(1.14M) · `kingdom_blackforge`(636k) · `city_ironpeak`(208k) · `city_silverleaf`(186k) · `village_oremouth`(21k) · `kingdom_sunderhold` · `village_wheatfield`
- 테마/지역 앵커: `kingdom_tatiholm`(빙원) · `kingdom_silverbance`(숲) · `neutral_north_outpost`(북항)

→ **PR-1 확정 = 23**: 왕국5(tier4 전부) + 절대중립4 + 쟁탈풀8 + 도시3(city_silverleaf/city_river_haven/city_ironpeak) + 마을3(village_oremouth/village_wheatfield/village_crossroads_s). 삭제 17개는 라이브 점령/금고/정착지 전무(교집합 0).
> 왕국5·중립4 를 PR-1 에서 유지한 이유: 왕국거리 수비·그래프·outposts.test 의 "왕국5·중립4" 단언을 안 건드리려는 최소-churn 선택. 왕국 메커닉 제거(→ 노드 추가 정리 가능)는 PR-2.

> 이름: ID는 고정, 표시명은 자유. 5왕국 메커닉 폐기에 맞춰 `kingdom_*` 노드는 "왕국"이 아니라 일반 영토(지역 테마 플레이버) 노드로 표기 변경 가능. 지역 테마(빙원/숲/광산/사막/화산)는 노드 플레이버로만 잔존.

## 5. 왜 안전한가 (코드 탐색 확인)

- **사냥은 거점과 완전 독립**: 깊이 1~42 · 7테마는 `dungeon.ts` 하드코딩. `dungeon/hunt` 라우트에서 `outpostId`는 **세금 계산용 선택 파라미터**일 뿐, 없으면 세금 0으로 정상 진행.
- **상점/거래소/신전/대장간은 글로벌** (위치 무관).
- **위치가 게이트하는 것은 3가지뿐**: ① 사냥 세금(서 있는 거점 점령자 징수) ② 은행 안전(적 점령지 입출금 불가, `bank/route.ts`) ③ 전쟁 참여(카스트라).
- 따라서 40→20 = `OUTPOSTS` 배열 축소 + 그래프/안개 은퇴 + 유저 위치 1회 폴백. 사냥·상점 불변.

## 6. 마이그레이션 정책 (비파괴)

- **보존**: 길드 골드(`v2_guild_resources`) · 정착지(`outpost_villages`) · 시즌 점수(`war_score_events`). 전부 손대지 않음.
- **생존 집합에 §4 강제 10개 포함** → 라이브 점령/정착지 손실 0.
- **유저 위치**: `lastVisitedOutpost`가 삭제 노드를 가리키면 `resolveCurrentOutpostId`가 이미 허브로 폴백(기존 동작) → 별도 마이그 쿼리 불필요.
- **고아 행 정리(선택)**: 삭제 노드의 점령행은 inert지만, 깔끔하게 하려면 1회 `DELETE FROM outpost_occupations WHERE outpost_id NOT IN (<생존 20>)` 가능. 금고는 묶인 골드라 함부로 삭제 금지(오너 판단).
- DB 스키마 변경 0. `discoveredOutpostIds`는 세이브 키로 남아도 inert(읽지 않음).

## 7. 시스템 변경 상세

- **outposts.ts**: `OUTPOSTS`를 ~20으로 축소. `KINGDOM_COLORS`·`kingdomIdOf`·`kingdomColorOf`·`kingdomNameOf`·`KINGDOM_ID_BY_OUTPOST` 제거. 지역 테마는 가벼운 상수로 대체(선택).
- **outpostGraph.ts**: Gabriel/MST/`EXTRA_EDGE`/`OUTPOST_EDGES`/`NEIGHBORS`/`shortestOutpostPath`/`canMoveToOutpost`/`canWarpToOutpost`/`seededDiscovery`/`expandDiscovery` 제거. `resolveCurrentOutpostId`는 "생존 집합 멤버십 검사 + 허브 폴백"으로 단순화(좌표/그래프 불요).
- **outpostDefense.ts**: 왕국 거리 기반 → 티어별 정적 맵(예: tier별 고정 수비력). `isInConflictZone`/중립 0 게이트는 유지 가능.
- **visit-outpost/route.ts**: `mode` adjacent/warp 분기 제거 → 생존 노드면 무조건 이동, 골드 비용만. 발견 확장 로직 제거.
- **warOutposts.ts**: 쟁탈 풀 8 전부 생존 집합에 포함(불변). 단일 전장 유지.
- **ContinentMap.tsx**: 안개/`discoveredIds`/`visibleIds`/워프 제거. 전 노드 표시. 마커 1차 의미 = 전쟁/내소유/적소유/중립/정착지(소유 링). 왕국색 → 소유자색 + 테마 악센트. 자유이동 클릭.
- **OutpostView.tsx / map/page.tsx**: 워프 버튼 제거, 이동 단일화.

## 8. PR 슬라이스 (각 PR Codex 검토 후 머지 · worktree 격리)

> 구현 중 슬라이싱 정정: PR-1 은 **순수 데이터 축소만**(왕국 메커닉/그래프/안개/이동 전부 유지)으로 좁혔다.
> 왕국 메커닉 제거를 PR-1 에 넣으면 outposts.test/outpostDefense.test 의 "왕국5·중립4·EDGE 수렴" 단언과
> ContinentMap 색 로직까지 한꺼번에 건드려 리뷰 표면이 커진다. 그래서 별 PR 로 분리.

1. **PR-1 데이터 축소 40→23 (✅구현완료·미머지)**: `OUTPOSTS` 23 (§4) — 왕국5·중립4 유지, 쟁탈풀8·금고도시3·마을3. 그래프 막다른길 1건(코린왕국) MANUAL_ADD 보강. 삭제 ID 픽스처 쓰던 테스트 정정 + `outpostDefense` "최외곽=EDGE" 단언을 ">=EDGE" 하한으로 약화(최외곽 노드 삭제 반영). **그래프·안개·이동·왕국 메커닉 전부 그대로.** 신규 고아 0(운영DB 점령/정착지/금고 행과 삭제 17 ID 교집합 전무). Codex 검토 통과(블로커 없음). vitest 1982 / tsc 0 / check-images 0.
2. **PR-2 왕국 메커닉 제거**: `KINGDOM_COLORS`·`kingdomIdOf`·`kingdomColorOf`·`kingdomNameOf`·`KINGDOM_ID_BY_OUTPOST` 제거, `outpostDefense` 왕국거리→**티어별 정적값**, `ContinentMap` 색을 소유자색+테마 악센트로. `kingdom_*` 노드는 일반 영토로 표기. (이때 outposts.test/outpostDefense.test 의 "왕국5·중립4·EDGE" 단언 갱신.)
3. **PR-3 자유이동 + 안개 폐기**: `visit-outpost` 무조건이동, 그래프/안개/워프 코드 제거(`OUTPOST_EDGES`/`NEIGHBORS`/`canMoveToOutpost`/`canWarpToOutpost`/`seededDiscovery`/`expandDiscovery`), `discoveredOutpostIds` 은퇴, `resolveCurrentOutpostId` 단순화.
4. **PR-4 지도 UI 리워크**: 전장/내영토 하이라이트 · 대시보드감 · 표시명 정리. 시각은 Codex 위임.
5. **PR-5 청소**: 남은 죽은코드 + `outpost/occupations/route.ts` 등에서 고아행 필터(`OUTPOST_BY_ID.has(outpostId)`) — 기존 잠재 이슈 동시 해소.

## 9. 미해결 · 다이얼 · 리스크

- 티어별 정적 수비력 값(밸런스 다이얼, PR-2).
- 자유이동 골드 비용(`OUTPOST_MOVE_GOLD_COST` 단일화 — 워프 비용 폐기, PR-3).
- 테마 플레이버를 노드 데이터에 어떻게 표현할지(필드 vs 상수맵, PR-2/4).
- **고아행 필터 미비(기존 이슈)**: `outpost/occupations/route.ts`·`v2Settlement.ts` 가 `OUTPOST_BY_ID` 검증 없이 DB 행을 반환/처리 → 삭제 ID 행이 노출될 수 있음. **PR-1 은 신규 고아를 만들지 않으므로(교집합 0) 회귀 아님.** PR-5 에서 필터 추가로 해소(Codex 권고).
- 리스크: 고아 금고 골드(village_meadow_edge 4.13M 등)는 본 작업과 무관하게 이미 묶여 있음(옛 96→40 축소 잔재) — 오너 인지 필요. 복구는 관리자 지급.
