# v2 전쟁 가시성·접근성 재설계

> 2026-06-11. 진단: 전쟁 시스템(거점 점령/공성·정책/세율·침입자 토벌·3:3 토너먼트·NPC 정기공격)은
> 이미 구현돼 있으나, 전부 **비동기로 아무도 안 보는 곳에서** 일어난다. 기능 추가가 아니라
> "이미 일어나는 일을 보이게" 만드는 것이 본 작업의 전부다. 신규 전투 메커니즘 0.

## 목표

전쟁을 게임의 주축으로 끌어올리기 위한 선결 조건 = **인지**.

1. 모든 유저가 매 사냥마다 점령 시스템의 존재를 체감한다 (세금 가시화).
2. 전쟁 사건이 **모든 화면에서** 흘러간다 (전광판 티커 — navbar 아래 전역).
3. "지금 어디서 전쟁이 벌어지는가" 상세를 한 화면에서 본다 (전황 페이지 + 지도).
4. 전쟁 사건이 서버의 공적 기록으로 남는다 (피드).
5. 당사자(피격 길드·토벌당한 침입자)는 개인 알림을 받는다 (전용 알림 + 종).

확정된 설계 결정 (2026-06-11):
- 전쟁 피드 이벤트는 `shareFeed` opt-out **무시** (공적 행위).
- 알림은 우편함 재사용이 아닌 **전용 알림 시스템** 신설.
- 전쟁 가시성의 1급 표면 = **전광판 티커**: 상단 탭바(모험/전투/마을…) 바로 아래,
  글자가 지나가는 형식, 전 화면 노출.

비목표 (이번 사이클 제외):
- 현상금·길드금고 유지비 sink — 거점 재설계 Part B. 노출이 생긴 뒤 별도 사이클.
- 전쟁 윈도우(시간대 집중) — 라이브 유저 패턴 실측 후 판단.
- 선전포고/전쟁 선언 시스템 — 인지 단계에서 불필요한 복잡도.

## 현황 (코드 기준)

| 자산 | 위치 | 상태 |
|---|---|---|
| 세금 데이터 | `hunt/route.ts` 응답 `goldGross/goldTaxed/goldNet` | **이미 내려옴**. `HuntResultCard.tsx:35`가 prop 타입만 선언, 렌더 0 |
| 세금 수취자 | hunt 라우트 내부 `taxOwnerId`/`npcTaxOutpostId` | 응답에 미포함 — "누구에게 갔나" 불가 |
| 공성 상태 | `outpost_occupations.fortHp/fortMaxHp/protectedUntil/occupiedAt` | 거점 상세에서만 노출 |
| 공성 로그 | `outpost_claim_attempts` (outpostId+createdAt 인덱스) | **조회 API 없음** — 쓰기만 함 |
| 피드 인프라 | `serverFeed.ts` + `feed-config.ts` + `ServerFeedView.tsx` | 살아있음. `FEED_TYPES = ["unique_drop","masterpiece"]` 2종뿐 |
| 알림 | `V2TopBar.tsx:36` Bell 아이콘 | placeholder no-op (TODO) |
| 우편함 | `V2InboxView` + user_message 백엔드 (#444) | 시스템 쪽지 발송에 재사용 가능 |
| 침입자 | `IntruderPanel` (점령 길드 멤버 전용) | 침입자 본인은 자기 상태를 못 봄 |

## PR 분할 (5개, 순차)

### PR-1 — 세금 가시화 (최소·즉효)

모든 유저의 메인 루프(사냥)에 전쟁 시스템을 노출하는 가장 싼 한 수.

- **서버**: hunt 응답에 세금 수취자 라벨 추가.
  - `taxOwnerLabel: string | null` — 점령 길드명(occRow.occupiedByGuildId → guilds.name,
    이미 occupation 을 FOR UPDATE 로 읽는 지점에서 name 한 번 join/select) 또는
    솔로 점령자 닉네임. NPC 거점이면 `"거점 금고"`.
  - 일괄사냥(N판)도 동일 — 거점은 판 간 불변이므로 라벨은 1회 해석 후 공유.
- **클라**: `HuntResultCard` 골드 줄 아래, `goldTaxed > 0`일 때만:
  - `세금 -{goldTaxed}G → {taxOwnerLabel}` (1줄, 기능성 데이터 — 플레이버 부제 아님)
- **거점 상세**: OutpostView 헤더에 현재 세율 상시 표기 (없으면 추가, 있으면 유지).
- 변경 파일 ~3개. 스키마 변경 0. 테스트: huntRoute.test.ts 에 라벨 케이스 추가.

### PR-2 — 전황 페이지 + 지도 교전 표시

"지금 어디서 전쟁 중인가" 읽기 전용 상세 화면. 전광판(PR-4)이 "사건 스트림"이라면
이쪽은 "상태 스냅샷"(성벽 진행도·내 길드 위협) — 전광판 클릭의 착지점.
**스키마 변경 0** — 전부 기존 테이블 파생.

- **API**: `GET /api/v2/war/overview` (공개, 인증 유저)
  ```
  {
    sieges: [{ outpostId, ownerGuildName|ownerName, fortHp, fortMaxHp,
               recentAttackers: [{ name, guildName?, won, at }] }],  // 최근 48h claim_attempts
    recentCaptures: [{ outpostId, byGuildName|byName, at }],          // occupiedAt 최근 48h
    myGuild?: { outposts: [{ outpostId, fortHp, fortMaxHp, intruderCount,
                             underAttack: boolean }] }                // 길드 소속 시
  }
  ```
  - "공성 중" 판정 = lazy 재생 반영 후 `fortHp < fortMaxHp` (occupations GET 의
    기존 재생 계산 헬퍼 재사용 — 중복 구현 금지).
  - "최근 함락/점령" = `occupiedAt` 48h 이내 (별도 captured 컬럼 불필요).
  - claim_attempts 조회는 기존 `(outpostId, createdAt)` 인덱스로 충분.
- **UI**: `/battle/war` 페이지 신설 + `V2BattleHome` 에 진입 카드 "전황" 추가.
  - 섹션 3개: ① 교전 중인 거점 (성벽 바 + "약 N승으로 함락" — `ceil(fortHp/SIEGE_DAMAGE_PER_WIN)`)
    ② 최근 함락 ③ 내 길드 거점 (위협 중인 곳 상단 정렬). 거점명 클릭 → `/outpost/[id]`.
  - 닉네임은 공통 `PlayerNameLink` 사용.
- **지도**: `ContinentMap` 마커에 교전 오버레이 — occupations 응답의 fortHp < fortMaxHp 인
  거점에 교전 아이콘(검 교차)/펄스. 기존 fetch 재사용, 신규 요청 0.
- **공성 진행 명문화**: OutpostView 성벽 바에 "1승당 -{SIEGE_DAMAGE_PER_WIN} · 약 N승으로 함락"
  + 라인업 미설정 다인 길드에 공성 버튼 옆 경고 1줄.

### PR-3 — 전쟁 피드 (서버 서사)

전쟁 사건을 광장 피드에 흘려 "기록이 남아 다음 접속자가 읽는" 비동기 드라마를 만든다.
저인구 환경에서 실시간 관전 대신 택하는 가시성 전략.

- **타입 확장** (`feed-config.ts`):
  - `outpost_capture` — 함락/점령. payload `{ outpostId, guildName? }`
  - `outpost_siege` — 성벽 타격(승리한 공성만). payload `{ outpostId, fortHp, fortMaxHp }`
  - `outpost_eject` — 침입자 토벌. payload `{ outpostId, targetName }`
- **발화 지점**: `outpost/claim` (성벽 타격·함락), `cron/npc-attacks` (점령 풀림 — NPC 가
  주체라 actorName 은 점령자였던 유저 기준 "○○ 의 △△ 점령이 무너졌다"), `outpost/eject` (토벌).
- **정책 (확정)**: 전쟁 이벤트는 `shareFeed` opt-out **무시** — 점령/공성은 서버 공유
  자원에 대한 공적 행위라 숨길 수 없어야 함 (자랑거리 피드와 성격이 다름).
  `insertFeedEntry` 에 `force?: boolean` 옵션 추가로 처리. 기존 타입엔 영향 0.
  - 도배 방지는 기존 user+type 60s 디바운스가 그대로 커버.
- **클라**: `ServerFeedView` 에 3종 렌더 추가 (거점명은 outposts.ts 정적 데이터로 해석).

### PR-4 — 전광판 티커 (전역, navbar 아래)

전쟁 가시성의 1급 표면. 상단 탭바 바로 아래, 글자가 좌로 흘러가는 한 줄 띠.
**전 화면 노출** — `GameChrome` 이 영속 틀(라우트 전환에 remount 없음)이므로 거기
마운트하면 폴링 1곳·전 화면 커버가 공짜.

- **위치**: `GameChrome.tsx` 의 `<TabBar/>` 직후, `showStamina` 블록 앞.
  높이 ~28px 한 줄 띠. max-w-720 컨테이너 정렬은 본문과 동일.
- **데이터**: `GET /api/feed?types=war` — 기존 /api/feed 에 타입 필터 쿼리 추가
  (war = outpost_capture/siege/eject 묶음 alias). 신규 테이블 0.
  - 클라 필터가 아닌 서버 필터인 이유: FEED_FETCH_LIMIT(20) 안에서 unique_drop 도배에
    전쟁 이벤트가 밀려나는 것 방지.
- **표시 규칙**:
  - 최근 `WAR_TICKER_WINDOW_H`(기본 24h) 안의 전쟁 이벤트를 순환 marquee.
  - 이벤트 0건이면 **띠 자체를 숨김** (죽은 띠 금지 — 저활동 시간대에 빈 전광판이
    "전쟁 없음"을 광고하는 역효과 방지).
  - 항목 예: `⚔ ○○ 길드가 붉은샘마을 성벽을 공격 (60/100)` / `🏴 △△ 길드가 동부광산 함락`
  - 클릭/탭 → 전황 페이지(`/battle/war`).
- **폴링**: FEED_POLL_MS(30s) 공유. 탭 비활성 시 폴링 중단(visibilitychange).
- **구현 주의**: marquee 는 CSS keyframes(transform translateX) — JS 타이머 금지.
  reduced-motion 환경에선 정적 최신 1건 표시. 시각 폴리시는 Codex 위임.

### PR-5 — 전용 알림 시스템 + Bell 실구현

(확정) 우편함 재사용이 아닌 전용 알림 신설 — 우편(아이템·정산 첨부)과 알림(읽고 끝)의
성격 분리. 인프라는 serverFeed 관례(부수효과·try/catch 삼킴·insert 시 trim)를 미러링.

- **스키마**: `v2_notifications`
  ```
  id serial PK / userId FK(cascade) / type text / payload jsonb
  readAt timestamp nullable / createdAt timestamp default now
  index (userId, id desc)
  ```
  - insert 시 유저당 최신 `NOTIF_MAX_PER_USER`(기본 50) 초과분 trim (cron 없음).
- **서버 헬퍼**: `insertNotification(userId, type, payload)` — 실패해도 본 작업 성공
  (serverFeed 동일 패턴).
- **알림 3종** (전쟁 우선, 타입은 범용 — 추후 아레나/길드 가입신청 등 확장 여지):
  - `outpost_attacked` — 성벽 피격 시 점령자(솔로) 또는 길드 전원에게. 같은 거점 기준
    `WAR_NOTIF_DEBOUNCE_H`(기본 6h) 디바운스.
  - `outpost_lost` — 함락/NPC 점령 풀림. 즉시, 디바운스 없음.
  - `ejected` — 토벌당한 침입자 본인에게.
- **API**: `GET /api/v2/notifications` (최근 30 + unreadCount) /
  `POST /api/v2/notifications/read` (전체 읽음 처리).
- **Bell 실구현** (`V2TopBar.tsx:36` placeholder 해소): 미읽음 수 뱃지(60s 폴링),
  클릭 → `/notifications` 페이지 (BackButton 컨벤션). 진입 시 read 처리.
- **침입자 본인 상태**: OutpostView 에 "이 거점에 침입 중 (점령 길드가 토벌할 수 있음)"
  배너 — intruders GET 은 점령 길드 전용이므로, 본인 판정은 자기 save 의
  `lastHuntedOutpost` 로 클라 로컬 판정 (신규 API 0).

## 다이얼

| 이름 | 초기값 | 비고 |
|---|---|---|
| `WAR_OVERVIEW_WINDOW_H` | 48 | 전황 페이지 "최근" 범위 |
| `WAR_TICKER_WINDOW_H` | 24 | 전광판 표시 범위 (0건이면 띠 숨김) |
| `WAR_NOTIF_DEBOUNCE_H` | 6 | 피격 알림 거점당 최소 간격 |
| `NOTIF_MAX_PER_USER` | 50 | 유저당 알림 보존 수 (insert 시 trim) |
| 피드 디바운스 | 기존 60s | user+type 공유 |

## 리스크 / 주의

- `war/overview` 의 공성 중 판정은 occupations 의 **lazy 재생을 반영한 후** 비교해야 함 —
  재생 헬퍼를 공유 모듈로 추출해 거점 상세와 단일 출처 유지.
- 피드 opt-out 무시(force)는 unique_drop 류 기존 타입에 영향 없도록 opt-in 파라미터로만.
- NPC 정기공격으로 점령이 풀리는 경로(`cron/npc-attacks`)는 occupation 행 DELETE — 함락
  피드/알림을 같은 트랜잭션 안이 아닌 부수효과(try/catch 삼킴)로. serverFeed 기존 관례 동일.
- 전광판은 영속 chrome 에 사는 유일한 폴링 컴포넌트 추가 — GameStateProvider 의 기존
  4-fetch 와 별개의 가벼운 단일 GET. 비활성 탭 폴링 중단 필수.
- `outpost_attacked` 길드 전원 알림은 다인 길드에서 N행 insert — 멤버 수 정원 3이라
  현 스케일 무해. 정원 확대 시 재검토.
- UI 레이아웃/시각 폴리시는 구현 단계에서 Codex 위임 (전광판 marquee·전황 카드 레이아웃).

## 순서·검증

PR-1(세금) → PR-2(전황 페이지+지도) → PR-3(피드 발화) → PR-4(전광판, PR-3 의존) →
PR-5(전용 알림). 각각 독립 머지 가능 — 강한 의존은 전광판 ← 피드 타입뿐.
각 PR: tsc + vitest (huntRoute.test.ts 확장, war/overview·notifications 신규 라우트 테스트,
PR-5 는 drizzle 마이그레이션 1건) + /dev 프리뷰.
배포 후 실측: 전광판 노출 대비 전황 페이지 진입률·전쟁 이벤트 발생량 → Part B(현상금·
유지비) 착수 판단 입력.
