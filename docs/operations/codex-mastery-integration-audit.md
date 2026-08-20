# 도감 숙련도 재통합 감사

작성일: 2026-08-21

## 기준과 출처

- 기준 `origin/main`: `1af429ee9e5e2e07694973f9b6dc92786518be36`
- 출처 Phase A: `fea3aa2eef6b2b5543559a691978faa9228fe0dc`
- 출처 전체 구현: `ad43a86b20c99bff85a981706016da26fa4e5399`
- 출시 후보 브랜치: `codex-mastery-release-20260821`
- 적용 방식: 도감 전용 선형 커밋 선별 재적용
- 전체 출처 브랜치 병합·리베이스: 수행하지 않음

공통 기준점 뒤 출처 전체 브랜치에는 다른 미배포 작업이 함께 있었으므로 전체 브랜치를 합치지
않았다. Phase A 도감 전용 20개 커밋과 그 후속 도감 전용 98개 커밋을 의존 순서대로 적용했다.
엔드게임 설계 커밋 `0d1e66f55`는 별도로 포함했다. 공용 코스메틱 테스트 커밋
`898c8afe0`은 최신 `main`과 내용이 완전히 같아 빈 커밋으로 확인한 뒤 제외했다.

## 범위 감사

- 출처 도감 변경 경로 합집합: 224개
- 출시 후보 변경 경로: 225개
- 설명되지 않은 출처 누락: 0개
- 도감 범위로 설명되지 않는 후보 유입: 0개

출처에만 보이는 경로는 구번호 마이그레이션 SQL 5개, 구번호 스냅샷 2개와 이미 `main`에 동일하게
반영된 `src/adventure/data/v2/museunCosmetics.test.ts`다. 후보에만 보이는 경로는 승인된 재통합
설계·계획 문서 2개와 새 번호 마이그레이션 SQL·스냅샷이다.

모험의 서 충돌에서는 최신 `main`의 사냥터 장비 등록·미등록 테스트와 새 숙련 탭 테스트를 모두
보존했다. 그 밖의 게임플레이, 프로필, 숙소, 랭킹, 관리자, 알림과 전광판 공용 경로는 출처의 도감
변경만 적용됐다.

## 마이그레이션

최신 `main`이 `0169`와 `0170`을 이미 사용하므로 출처의 도감 마이그레이션을 다음과 같이
재번호화했다.

| 출처 | 출시 후보 |
|---|---|
| `0169_codex_mastery_foundation.sql` | `0171_codex_mastery_foundation.sql` |
| `0170_codex_mastery_trophy_history.sql` | `0172_codex_mastery_trophy_history.sql` |
| `0171_wandering_scrambler.sql` | `0173_wandering_scrambler.sql` |
| `0172_codex_research_settlement.sql` | `0174_codex_research_settlement.sql` |
| `0173_codex_research_publication.sql` | `0175_codex_research_publication.sql` |

트로피, 월간 진행, 월간 결산과 공개 SQL은 출처와 SHA-256이 동일하다. 기반 SQL은 최신 `main`
스키마에서 다시 생성해 기존 `0170`까지의 스키마를 포함한 스냅샷과 정합성을 맞췄다. 도감 테이블,
제약과 인덱스 의미는 스키마 테스트와 실제 PostgreSQL 마이그레이션으로 검증했다.

- 정적 마이그레이션 검사: 176개 통과
- 일회용 PostgreSQL 16 전체 마이그레이션: 통과
- PostgreSQL 도감 통합 테스트: 2개 파일, 8개 테스트, 스킵 0개
- 일회용 PostgreSQL 서버: 검증 후 정상 종료

## 비활성 출시 경계

다음 아홉 기본 플래그가 모두 `false`임을 `npm run check:codex-mastery-release`와 단위 테스트로
확인했다.

```text
recordingEnabled, overviewVisible, rankingVisible, sealsEnabled,
trophiesEnabled, monthlyProgressEnabled, monthlyRankingVisible,
settlementEnabled, feedEnabled
```

도감 전용 운영 cron, 자동 결산, 자동 발급과 실운영 시즌 정의는 없다. 시즌 예약·결산·발급·공개는
정확한 확인 문자열을 요구하는 수동 관리자 작업으로 남아 있다.

## 검증 결과

- 통합 전 기준선 전체 테스트: 823개 파일 통과, 2개 스킵 / 6,551개 테스트 통과, 14개 스킵
- 통합 후 전체 테스트: 877개 파일 통과, 4개 스킵 / 6,968개 테스트 통과, 22개 스킵
- 도감 비활성 출시 검사: 통과
- 마이그레이션 검사: 통과
- 이미지 검사: 참조 401장·템플릿 6패턴·디스크 451장, 누락 없음
- TypeScript `--noEmit`: 통과
- 전체 `src`와 도감 운영 스크립트 ESLint: 통과
- 프로덕션 빌드: Next.js 16.2.11, 432개 정적 페이지 생성, postbuild 통과
- `git diff --check`: 통과

첫 빌드는 작업공간 밖을 가리키는 `node_modules` 심볼릭 링크를 Turbopack이 거부해 중단됐다. 동일
의존성을 작업공간 내부 하드링크 디렉터리로 바꾼 뒤 소스 변경 없이 빌드가 통과했다. 이는 코드
결함이 아닌 격리 작업공간 구성 문제였으며 구현 계획의 준비 명령도 함께 수정했다.

## 수행하지 않은 작업

- 원격 푸시 또는 PR 생성
- 운영 배포 또는 롤백
- 운영 DB 마이그레이션·백필·요약 복구·트로피 재구축
- 운영 기능 플래그 변경
- 월간 시즌 예약·결산·발급·공개
- 점검 모드 변경

