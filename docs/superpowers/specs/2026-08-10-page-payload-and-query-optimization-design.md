# Page Payload and Query Optimization Design

## Goal

페이지가 실제로 표시하는 정보만 서버에서 조회·전송해 운영 서버의 JSON 직렬화, 네트워크 전송량, PostgreSQL 쿼리 수를 줄인다. 기존 상세 화면과 API 기본 응답은 호환성을 유지한다.

## Evidence and priorities

- `/api/v2/me/state`는 최근 2시간에 5,376회 호출되어 압축 전 약 415MB와 DB 쿼리 104,335회를 만들었다. 전역 `GameStateProvider`는 전체 직업·스킬·도감·칭호 응답 중 일부 요약만 사용한다.
- 모험 홈은 공지 제목 3개와 작성 시각만 표시하지만 `/api/bulletin`의 최대 50개 전체 게시글과 활동·반응 정보를 조회한다.
- 생활 현장 카드는 30초마다 세 활동의 모든 지역 환경과 전체 도감 진행도를 다시 조회한다.
- `combat`은 같은 구간에 DB 쿼리 155,228회로 가장 크지만 현재 프로파일러에는 기능 합계만 있어 개별 전투 작업을 근거 있게 고를 수 없다.

## Chosen approach

기존 Route Handler에 용도가 명확한 축약 조회를 추가한다. 기본 파라미터가 없는 기존 응답은 그대로 유지한다.

클라이언트가 전체 응답을 받은 뒤 필드를 버리는 방식은 서버 비용을 줄이지 못해 제외한다. 별도 API를 대량으로 복제하는 방식은 인증·권한·응답 계산이 중복되므로 제외한다. 기존 라우트의 명시적 조회 모드는 호환성과 유지보수 비용 사이의 균형이 가장 좋다.

## Bulletin preview

`GET /api/bulletin?preview=notice`는 인증된 사용자에게 공개 공지 최신 3개의 `id`, `title`, `createdAt`만 반환한다. 이 분기는 길드, 차단 목록, 본문, 프로필, 좋아요, 댓글, 조회수, 코스메틱, 활동 점수를 읽지 않는다. 일반 게시판 조회는 기존 `BulletinFeed` 응답을 유지한다.

모험 홈은 새 `fetchNoticePreview()` 클라이언트 헬퍼만 사용한다. 공지 행을 누르면 기존 공지 화면으로 이동하므로 상세 데이터는 그 화면에서만 불러온다.

## Core game state

`GET /api/v2/me/state?view=core`는 `GameStateProvider`가 소비하는 필드만 반환한다. 다음 데이터는 요약하거나 제외한다.

- `jobsV2`: 현재 직업 ID·이름·티어만 반환한다.
- `proficiency`: 현재 직업군과 누적 숙련도, 직업군 티어만 반환한다.
- 전체 직업 목록, 스킬 라이브러리, 학습 가능 스킬, 전체 칭호·재료·요리 도감, 프로필 진열 정보, 상세 능력치 원본은 반환하지 않는다.
- 전역 화면에 필요한 캐릭터 자원, 전투 요약, 위치, 발견 지역, 타일 정착지, 장비·낚시 도감 ID는 유지한다.

core 조회는 필요한 save key만 읽고 전체 직업 해금 문맥과 대형 응답 섹션을 계산하지 않는다. 기존 기본 조회는 상세 화면 호환을 위해 같은 응답을 유지한다. 캐릭터 보정과 칭호 지급처럼 기존 GET에 묶인 부수효과는 이번 단계에서 의미를 바꾸지 않도록 유지하되, core 응답에는 관련 대형 데이터를 넣지 않는다.

## Life field views and refresh policy

`GET /api/v2/life-fields?view=environment&activity=<activity>&spotId=<spot>`는 해당 활동·지역의 현재/다음 환경, 해당 활동의 흔적, 기능 설정만 반환한다. 전체 도감 요약은 계산하지 않는다.

`GET /api/v2/life-fields?view=codex`는 전체 기록 요약·일일 상태·흔적만 반환하고 모든 지역의 환경 표는 만들지 않는다. 파라미터가 없으면 기존 전체 응답을 유지한다.

환경 카드는 30초 네트워크 폴링을 제거한다. 창 포커스와 `life-field:refresh` 이벤트에는 다시 조회하고, 환경이 끝나는 시각에 한 번 예약 조회한다. 남은 시간 문구는 로컬 타이머로 갱신한다. 도감 화면은 mount, 포커스, 명시적 새로고침만 사용한다.

## Combat profiler detail

프로파일러에 원본 경로나 query string 대신 정규화된 `operation`을 추가한다. 예시는 `POST /api/v2/dungeon/hunt`, `POST /api/v2/coop/:id/attacks`, `GET /api/v2/battle-replays/:id`이다. UUID, 사용자 ID, 방 ID, 검색어는 고정 토큰으로 치환하며 기록하지 않는다.

각 1분 구간은 기능 합계와 함께 작업별 요청 수, 오류, 응답 바이트, 시간, DB 쿼리 수·시간을 집계한다. 느린 요청 표본에도 안전한 operation만 추가한다. 이 데이터가 운영에 쌓인 뒤 쿼리 상위 전투 작업을 별도 변경으로 최적화한다. 근거 없이 전투 트랜잭션을 바꾸는 것은 이번 범위에서 제외한다.

## Error handling and compatibility

- 잘못된 `view`, `activity`, `spotId`는 `400 bad_request`를 반환한다.
- 인증과 기존 rate limit은 축약 조회에도 동일하게 적용한다.
- 축약 조회 실패는 각 UI의 기존 실패 처리 방식을 유지한다.
- 모든 사용자별 응답은 `no-store` 동작을 유지하며 공유 캐시에 저장하지 않는다.
- 배포와 점검 모드 변경은 수행하지 않는다.

## Testing

- 공지 preview가 정확히 3개의 요약 필드만 반환하고 일반 게시판 경로를 호출하지 않는지 Route Handler 테스트로 검증한다.
- core state의 섹션 선택과 요약 shape를 순수 함수 및 소비 클라이언트 테스트로 검증한다.
- 생활 조회 파라미터 검증, 환경 단일 지역 응답, codex 응답 분리를 테스트한다.
- 정규화 operation이 동적 ID와 query string을 보존하지 않으며 작업별 집계 합계가 정확한지 테스트한다.
- focused Vitest, 전체 Vitest, TypeScript, lint, production build를 완료 조건으로 삼는다.
