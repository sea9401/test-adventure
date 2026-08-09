# Runtime Feature Profiler Design

## Goal

게임 서버의 병목이 채팅, 전투, 장터, 저장, 네트워크, 데이터베이스 중 어디에서 발생하는지 운영 중 낮은 비용으로 확인한다. 프로파일러 자체는 데이터베이스에 기록하지 않으며 게임 요청의 성공 여부에 영향을 주지 않는다.

## Scope

- Node.js가 처리하는 모든 HTTP 요청을 기능별로 자동 분류한다.
- 기능별 요청 수, 오류 수, 처리 시간 분포, 응답 바이트, DB 쿼리 수와 DB 처리 시간 분포를 1분 단위로 집계한다.
- 프로세스 전체 CPU 사용률, RSS/힙, 이벤트 루프 지연과 PostgreSQL 풀 상태를 함께 기록한다.
- 최근 60개 완료 구간과 현재 진행 구간을 프로세스 메모리에 보관한다.
- 완료 구간을 한 줄짜리 구조화 JSON으로 stdout에 출력해 systemd journal에서 검색할 수 있게 한다.
- 관리자 인증이 적용된 읽기 전용 API로 같은 스냅샷을 조회한다.

운영 UI, 외부 APM/관측 서비스, 데이터베이스 테이블, 자동 경보, 부하 테스트 실행은 이번 범위에 포함하지 않는다.

## Architecture

### Startup and HTTP boundary

`src/instrumentation.ts`는 Next.js 16의 공식 instrumentation 규약을 사용한다. Node.js 런타임일 때만 프로파일러 런타임을 동적 import해 시작한다.

런타임은 Node `http.Server`의 request 이벤트 경계를 프로세스당 한 번 감싼다. 요청 시작 시 `AsyncLocalStorage` 컨텍스트를 만들고 응답의 `finish` 또는 조기 `close`에서 한 번만 집계한다. 응답 크기는 소켓의 `bytesWritten` 차이를 사용한 근사치이며, 음수나 동시성 때문에 신뢰할 수 없는 값은 0으로 처리한다.

### Feature classification

분류기는 query string을 제거한 pathname만 입력받아 다음 고정 기능명 중 하나를 반환한다.

- `admin`, `auth`, `chat`, `presence`, `social`, `marketplace`
- `combat`, `progression`, `life`, `save`, `cron`, `health`
- `render`, `static`, `other`

경로 자체는 집계나 느린 요청 표본에 저장하지 않는다. 따라서 캐릭터명, 방 ID, 사용자 ID와 같은 동적 세그먼트가 journal이나 관리자 응답에 노출되지 않는다.

### Database attribution

애플리케이션 Pool이 생성될 때 새 pg client의 `query`를 한 번만 계측한다. Promise, callback, Query 이벤트 방식 모두 완료를 한 번만 기록하며 동기 throw도 실패 쿼리로 기록한다. 현재 HTTP 요청 컨텍스트가 있으면 쿼리 수, 오류 수, 처리 시간을 그 요청에 귀속한다. HTTP 요청 밖의 쿼리는 요청별 수치에는 포함하지 않는다.

Pool의 `totalCount`, `idleCount`, `waitingCount`는 매 구간 종료 시 프로세스 지표에 포함한다.

### Aggregation and retention

원시 요청이나 원시 쿼리 목록을 보관하지 않는다. 지연 시간은 고정 버킷 히스토그램으로 누적하고 p50/p95/p99는 버킷 상한의 근삿값으로 계산한다. 기능별로 다음 값만 유지한다.

- requests, errors, responseBytes
- durationMs: average, maximum, p50, p95, p99
- dbQueries, dbErrors
- dbDurationMs: average, maximum, p50, p95, p99

1초 이상 요청 중 최대 10개는 `feature`, `method`, `durationMs`, `dbQueries`, `dbDurationMs`, `responseBytes`, `statusCode`만 저장한다. 개인정보와 경로는 저장하지 않는다.

### Runtime metrics

각 1분 구간 종료 시 `process.cpuUsage()` 델타를 벽시계 시간으로 나눠 CPU 백분율을 계산한다. `process.memoryUsage()`에서 RSS와 heap used를 기록한다. `monitorEventLoopDelay`로 평균, p95, 최대 이벤트 루프 지연을 기록한다. CPU 수치는 프로세스 전체 기준이라 기능별 지연/DB 수치와 함께 해석한다.

### Configuration and failure isolation

- `RUNTIME_PROFILER_ENABLED=0`이면 비활성화한다.
- 그 외에는 production에서 기본 활성화하고 development/test에서는 기본 비활성화한다.
- `RUNTIME_PROFILER_INTERVAL_MS`는 기본 60000ms이며 1000ms 미만 값은 무시한다.
- 타이머는 `unref()` 처리한다.
- 계측, 집계, 출력 중 발생한 오류는 게임 요청으로 전파하지 않고 `[runtime-profiler]` 오류 로그만 남긴다.

## Read API

`GET /api/admin/runtime-profiler`는 먼저 `requireAdmin()`을 통과해야 한다. 성공 시 enabled, intervalMs, current, history를 반환한다. 데이터베이스를 조회하거나 상태를 변경하지 않는다. 프로파일러가 비활성화된 프로세스에서는 빈 스냅샷과 `enabled: false`를 반환한다.

## Testing

- 분류 우선순위와 대표 경로를 테이블 테스트한다.
- 히스토그램 백분위, 오류/DB/바이트 집계, 느린 요청의 비식별 필드를 실제 집계기로 검증한다.
- HTTP 계측이 finish/close 중 한 번만 기록하고 AsyncLocalStorage 컨텍스트를 전달하는지 fake server boundary로 검증한다.
- pg Promise/callback/throw 완료가 각각 한 번 기록되는지 fake client로 검증한다.
- 관리자 API가 권한 거부 시 스냅샷을 읽지 않고, 허용 시 반환하는지 검증한다.
- 전체 테스트, TypeScript, lint, production build를 완료 조건으로 삼는다.

## Operational interpretation

- `combat` 지연과 DB 시간이 함께 높으면 전투 DB 접근이나 락을 우선 조사한다.
- `combat` 지연은 높고 DB 시간은 낮으며 CPU/이벤트 루프 지연이 높으면 전투 연산을 우선 조사한다.
- `chat` 요청 수와 응답 바이트가 지배적이면 폴링/페이로드/캐시를 우선 조사한다.
- 모든 기능의 지연과 DB pool waiting이 함께 상승하면 DB 포화 또는 풀 문제를 우선 조사한다.
- 모든 기능의 지연과 이벤트 루프 지연/CPU가 함께 상승하면 Node 프로세스 포화를 우선 조사한다.
