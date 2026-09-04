# Adventure RPG

Next.js 기반의 웹 RPG 프로젝트다. 일상 개발은 `staging`과 `test.msmsge.com`에서
검증하고, 운영 `msmsge.com`은 검증된 `main` SHA를 명시적으로 승인해 배포한다.

## 로컬 개발

의존성을 설치하고 개발 서버를 실행한다.

```bash
npm ci
npm run dev
```

로컬 PostgreSQL과 `.env.development.local` 설정이 준비된 개발 PC에서는 마이그레이션과
개발 서버를 함께 실행할 수 있다.

```bash
npm run dev:local
```

`http://localhost:3000`을 열면 지정된 로컬 계정으로 자동 로그인한다. 이 환경은 loopback
전용 `adventure_e2e` 데이터베이스를 사용하며 운영 데이터베이스에 연결하지 않는다.
종료할 때는 실행한 터미널에서 `Ctrl+C`를 누른다.

## 검증

변경 범위에 맞는 검사를 먼저 실행하고, 전체 CI는 다음 영역을 병렬로 검증한다.

- 비밀값·Action pin·이미지·자산 권리·라이선스·마이그레이션·모듈 크기 검사
- TypeScript와 ESLint
- Vitest 단위 테스트와 결정적 레벨 디자인 시뮬레이션
- Next.js 운영 빌드
- Playwright 브라우저 E2E와 접근성 검사

대표 로컬 명령은 다음과 같다.

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## 작업·출시 문서

- [개발·스테이징·운영 출시 흐름](docs/staging-release-flow.md): 로컬 작업, 테스트 서버
  배포, 운영 승격과 롤백의 공통 절차
- [운영 런북](docs/ops-runbook.md): 인프라, 운영 배포, DB 백업·복구와 장애 대응
- [운영 변경 체크리스트](docs/templates/operations-change-checklist.md): 운영 변경 전·중·후 확인
- [정식 공개 준비 점검](docs/release-readiness.md): 공개 상태와 출시 게이트 기록
- [AGENTS.md](AGENTS.md): 작업 권한, 배포·점검 모드와 저장소별 안전 원칙

실제 자동화 동작의 기준은 [CI](.github/workflows/ci.yml),
[테스트 서버 배포](.github/workflows/deploy-staging.yml),
[운영 배포](.github/workflows/deploy.yml) workflow다. 기능별
`docs/superpowers/specs/`와 `docs/superpowers/plans/`는 해당 작업 당시의 설계·실행
기록이므로 현재 공통 절차보다 우선하지 않는다.

## 배포 원칙 요약

- 명시적인 요청 없이는 테스트와 운영 어느 환경에도 배포하지 않는다.
- `staging` CI를 통과한 정확한 SHA는 테스트 서버에 자동 배포된다.
- `main` push는 운영을 자동 변경하지 않는다. 정확한 SHA의 전체 CI와
  `production-next-<SHA>` 아티팩트가 준비된 뒤 **Deploy to EC2**를 수동 실행한다.
- 운영 배포와 롤백은 성공해도 점검 모드를 유지한다. 사용자가 별도로 해제를 지시한
  경우에만 `bash deploy/maintenance.sh off`를 실행한다.
